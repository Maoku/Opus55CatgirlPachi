import pachiUrl from '@/assets/pachi.png';
import { createDefaultBoard } from '@/board/defaultBoard';
import { loadBoardLocal, loadJson, saveJson } from '@/board/storage';
import type { BoardData } from '@/board/types';
import { randomSeed } from '@/core/SeededRng';
import { DEFAULT_EDITOR_SETTINGS, Editor } from '@/editor/Editor';
import { drawEditorOverlay, OverlayLabels } from '@/editor/EditorOverlay';
import { EditorPanel } from '@/editor/EditorPanel';
import { FilePanel } from '@/editor/FilePanel';
import { objectBounds } from '@/editor/objectOps';
import { PropertyPanel } from '@/editor/PropertyPanel';
import { NailLineTool } from '@/editor/tools/NailLineTool';
import { NailTool } from '@/editor/tools/NailTool';
import { PocketTool } from '@/editor/tools/PocketTool';
import { SelectTool } from '@/editor/tools/SelectTool';
import { VertexTool } from '@/editor/tools/VertexTool';
import { WallTool } from '@/editor/tools/WallTool';
import { WindmillTool } from '@/editor/tools/WindmillTool';
import { WarningsPanel } from '@/editor/WarningsPanel';
import { Game } from '@/game/Game';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { loadRapier, type Rapier } from '@/physics/rapier';
import { loadImage } from '@/render/gl/Texture';
import { Renderer } from '@/render/Renderer';
import { buildDynamicScene, buildStaticScene } from '@/render/SceneBuilder';
import { h } from '@/ui/dom';
import { GamePanel } from '@/ui/GamePanel';
import { HandleDial } from '@/ui/HandleDial';
import { Hud } from '@/ui/Hud';
import { createLayout, type Layout } from '@/ui/layout';
import { EditController } from './EditController';
import { GameLoop } from './GameLoop';
import { KeyRouter } from './input';
import { PlayController } from './PlayController';

/** 画像右下のハンドル部 (盤面 px) */
const HANDLE = { x: 925, y: 1250, r: 100 };
/** 編集してから物理ワールドを作り直すまでの待ち時間 (ms) */
const PHYSICS_REBUILD_DELAY = 150;
const EDITOR_SETTINGS_KEY = 'pachi.editorSettings';

export type Mode = 'play' | 'edit';

/** アプリ全体。盤面・物理・ゲーム・描画・UI をつなぐ */
export class App {
  readonly layout: Layout;
  readonly renderer: Renderer;
  readonly keys = new KeyRouter();
  readonly labels: OverlayLabels;
  rapier!: Rapier;
  board!: BoardData;
  physics!: PhysicsWorld;
  game!: Game;
  loop!: GameLoop;
  editor!: Editor;
  hud!: Hud;
  dial!: HandleDial;
  gamePanel!: GamePanel;
  editorPanel!: EditorPanel;
  filePanel!: FilePanel;
  playController!: PlayController;
  editController!: EditController;
  mode: Mode = 'play';
  /** プレイ中に当たり判定を表示する */
  showColliders = false;
  /** エディット中のテスト発射 */
  testFire = false;

  private readonly startTime = performance.now();
  private hudTimer = 0;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly playPanel = h('div', { className: 'mode-panel' });
  private readonly editPanel = h('div', { className: 'mode-panel' });
  private readonly testFireButton = h('button', { textContent: 'テスト発射 (T)' });
  private readonly testStrength = h('input', { type: 'range', min: '0', max: '100', step: '1' });
  private readonly modeButtons = {
    play: h('button', { textContent: 'プレイ' }),
    edit: h('button', { textContent: 'エディット (E)' }),
  };

  constructor(root: HTMLElement) {
    this.layout = createLayout(root);
    this.renderer = new Renderer(this.layout.canvas, this.layout.stage);
    this.labels = new OverlayLabels(this.layout.overlay);
  }

  async start(): Promise<void> {
    const [rapier, image] = await Promise.all([loadRapier(), loadImage(pachiUrl)]);
    this.rapier = rapier;
    this.renderer.setBoardImage(image);
    // 前回編集した盤面があればそれを使う
    this.board = loadBoardLocal() ?? createDefaultBoard();
    this.physics = new PhysicsWorld(rapier, this.board);
    this.game = new Game(this.physics, this.board, { seed: randomSeed() });
    this.setupEditor();
    this.buildUi();
    this.rebuildStatic();

    this.loop = new GameLoop(
      {
        step: (dt) => this.step(dt),
        render: (info) => {
          if (info.draw) this.draw(info.realDt);
        },
      },
      this.board.physics.timestep,
    );
    this.setMode('play');
    this.loop.start();
  }

  private setupEditor(): void {
    const editor = new Editor(this.board);
    editor.settings = loadJson(EDITOR_SETTINGS_KEY, DEFAULT_EDITOR_SETTINGS);
    editor.registerTool(new SelectTool(editor));
    editor.registerTool(new NailTool(editor));
    editor.registerTool(new NailLineTool(editor));
    editor.registerTool(new WallTool(editor));
    editor.registerTool(new VertexTool(editor));
    editor.registerTool(new WindmillTool(editor));
    editor.registerTool(new PocketTool(editor));
    editor.setTool('select');
    editor.bus.on('change', () => this.onBoardEdited());
    editor.bus.on('settings', () => {
      saveJson(EDITOR_SETTINGS_KEY, editor.settings);
      this.applyViewSettings();
      this.rebuildStatic();
    });
    this.editor = editor;
    this.editController = new EditController(this.layout.canvas, this.renderer.camera, editor, {
      toggleTestFire: () => this.setTestFire(!this.testFire),
      copy: () => editor.copySelection(),
      paste: () => editor.paste(),
      duplicate: () => editor.duplicate(),
    });
    editor.bus.on('tool', () => this.editController.updateCursor());
  }

  // ---- モード ----

  setMode(mode: Mode): void {
    this.mode = mode;
    const edit = mode === 'edit';
    this.playController.enabled = !edit;
    this.editController.enabled = edit;
    if (edit) {
      this.playController.release();
    } else {
      this.flushPhysicsRebuild();
      this.renderer.camera.fit();
      this.renderer.overlayLines.clear();
      this.renderer.overlayCircles.clear();
      this.labels.clear();
    }
    if (!edit) this.testFire = false;
    // エディット中は物理を止める (テスト発射中を除く)
    this.loop.paused = edit && !this.testFire;
    this.loop.resetClock();
    this.keys.handler = {
      keydown: (e) => {
        if (e.code === 'KeyE' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (!e.repeat) this.setMode(this.mode === 'edit' ? 'play' : 'edit');
          return true;
        }
        return (edit ? this.editController : this.playController).keydown(e);
      },
      keyup: (e) => (edit ? this.editController : this.playController).keyup(e),
    };
    this.playPanel.hidden = edit;
    this.editPanel.hidden = !edit;
    this.dial.visible = !edit;
    this.modeButtons.play.classList.toggle('on', !edit);
    this.modeButtons.edit.classList.toggle('on', edit);
    this.editController.updateCursor();
    this.applyViewSettings();
    this.rebuildStatic();
    this.updateUi();
  }

  setTestFire(on: boolean): void {
    this.testFire = on && this.mode === 'edit';
    this.loop.paused = this.mode === 'edit' && !this.testFire;
    this.loop.resetClock();
    this.testFireButton.classList.toggle('on', this.testFire);
  }

  /** オブジェクトが画面に収まるようにカメラを動かす */
  focusObjects(ids: string[]): void {
    const objs = ids.map((id) => this.editor.get(id)).filter((o) => o !== undefined);
    if (objs.length === 0) return;
    const bs = objs.map(objectBounds);
    const minX = Math.min(...bs.map((b) => b.minX));
    const maxX = Math.max(...bs.map((b) => b.maxX));
    const minY = Math.min(...bs.map((b) => b.minY));
    const maxY = Math.max(...bs.map((b) => b.maxY));
    const cam = this.renderer.camera;
    const size = Math.max(maxX - minX, maxY - minY, 40);
    const fit = Math.min(cam.viewW, cam.viewH) * 0.4;
    cam.zoom = Math.min(8, Math.max(1, fit / (size * cam.fitScale)));
    cam.centerX = (minX + maxX) / 2;
    cam.centerY = (minY + maxY) / 2;
    this.editor.viewScale = cam.scale;
  }

  private applyViewSettings(): void {
    this.renderer.background.opacity = this.mode === 'edit' ? this.editor.settings.bgOpacity : 1;
  }

  // ---- 盤面の変更 ----

  /** 盤面を差し替える (物理ワールドを作り直し、飛んでいる玉は引き継ぐ) */
  rebuildPhysics(): void {
    if (this.rebuildTimer !== null) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
    const old = this.physics;
    this.physics = new PhysicsWorld(this.rapier, this.board);
    this.game.setBoard(this.physics, this.board);
    this.loop.fixedDt = this.board.physics.timestep;
    old.dispose();
  }

  private flushPhysicsRebuild(): void {
    if (this.rebuildTimer !== null) this.rebuildPhysics();
  }

  private onBoardEdited(): void {
    this.rebuildStatic();
    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => this.rebuildPhysics(), PHYSICS_REBUILD_DELAY);
  }

  rebuildStatic(): void {
    const edit = this.mode === 'edit';
    buildStaticScene(this.renderer, this.board, {
      showColliders: edit ? this.editor.settings.showColliders : this.showColliders,
      showNailColliders: edit ? this.editor.settings.showColliders : this.showColliders,
    });
  }

  // ---- ループ ----

  private step(dt: number): void {
    if (this.mode === 'play') this.game.step(dt);
    else this.game.testStep(dt, this.testFire);
  }

  private draw(realDt: number): void {
    buildDynamicScene(this.renderer, this.physics);
    if (this.mode === 'edit') {
      this.editor.viewScale = this.renderer.camera.scale;
      drawEditorOverlay(this.editor, this.renderer, this.labels);
    } else {
      this.dial.place(this.renderer.camera, HANDLE.x, HANDLE.y, HANDLE.r);
    }
    this.renderer.render((performance.now() - this.startTime) / 1000);
    this.hudTimer -= realDt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.updateUi();
    }
  }

  updateUi(): void {
    this.hud.update();
    this.gamePanel.update(this.mode === 'play');
    this.dial.update();
    const s = String(Math.round(this.game.launcher.strength * 100));
    if (this.testStrength.value !== s) this.testStrength.value = s;
  }

  // ---- UI ----

  private buildUi(): void {
    const launcher = this.game.launcher;
    this.hud = new Hud(this.game, {
      onStrength: (v) => {
        launcher.setStrength(v);
        this.updateUi();
      },
      onToggleLock: () => {
        launcher.locked = !launcher.locked;
        this.updateUi();
      },
    });
    this.dial = new HandleDial(this.layout.overlay, launcher, () => this.updateUi());
    this.gamePanel = new GamePanel(this.game, this.layout.overlay, () => this.updateUi());
    this.hud.extra.append(this.gamePanel.el);
    this.playController = new PlayController(
      this.layout.canvas,
      this.renderer.camera,
      () => this.game,
      () => this.updateUi(),
    );

    const colliders = h('input', { type: 'checkbox', checked: this.showColliders });
    colliders.addEventListener('change', () => {
      this.showColliders = colliders.checked;
      this.rebuildStatic();
    });
    this.playPanel.append(
      this.hud.el,
      h('section', { className: 'panel' }, [
        h('h2', { textContent: '表示' }),
        h('label', { className: 'check' }, [colliders, '当たり判定を表示']),
        h('p', {
          className: 'help',
          textContent: 'Shift+クリックで盤面に玉を落とせます (デバッグ用)。',
        }),
      ]),
    );

    this.editorPanel = new EditorPanel(this.editor);
    this.testFireButton.addEventListener('click', () => this.setTestFire(!this.testFire));
    this.testStrength.addEventListener('input', () => {
      launcher.setStrength(Number(this.testStrength.value) / 100);
      this.updateUi();
    });
    this.editorPanel.sections.append(
      new PropertyPanel(this.editor).el,
      h('section', { className: 'panel' }, [
        h('h2', { textContent: 'テスト発射' }),
        h('div', { className: 'row' }, [this.testFireButton, this.testStrength]),
        h('p', {
          className: 'help',
          textContent:
            'その場の盤面で物理だけを動かして玉の流れを確認します (集計には含めません)。',
        }),
      ]),
      new WarningsPanel(this.editor, (ids) => this.focusObjects(ids)).el,
      (this.filePanel = new FilePanel(this.editor)).el,
    );
    window.addEventListener('beforeunload', () => {
      if (this.filePanel.pending) this.filePanel.saveNow();
    });
    this.editPanel.append(this.editorPanel.el);

    this.modeButtons.play.addEventListener('click', () => this.setMode('play'));
    this.modeButtons.edit.addEventListener('click', () => this.setMode('edit'));
    this.layout.side.append(
      h('nav', { className: 'mode-bar' }, [this.modeButtons.play, this.modeButtons.edit]),
      this.playPanel,
      this.editPanel,
    );
    this.updateUi();
  }
}
