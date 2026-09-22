import pachiUrl from '@/assets/pachi.png';
import { createSampleBoard } from '@/board/sampleBoard';
import type { BoardData } from '@/board/types';
import { randomSeed } from '@/core/SeededRng';
import { Editor } from '@/editor/Editor';
import { drawEditorOverlay, OverlayLabels } from '@/editor/EditorOverlay';
import { EditorPanel } from '@/editor/EditorPanel';
import { SelectTool } from '@/editor/tools/SelectTool';
import { Game } from '@/game/Game';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { loadRapier, type Rapier } from '@/physics/rapier';
import { loadImage } from '@/render/gl/Texture';
import { Renderer } from '@/render/Renderer';
import { buildDynamicScene, buildStaticScene } from '@/render/SceneBuilder';
import { h } from '@/ui/dom';
import { HandleDial } from '@/ui/HandleDial';
import { Hud } from '@/ui/Hud';
import { createLayout, type Layout } from '@/ui/layout';
import { EditController } from './EditController';
import { GameLoop } from './GameLoop';
import { KeyRouter } from './input';
import { PlayController } from './PlayController';

/** 画像右下のハンドル部 (盤面 px) */
const HANDLE = { x: 925, y: 1250, r: 100 };
const INITIAL_BALLS = 1000;
/** 編集してから物理ワールドを作り直すまでの待ち時間 (ms) */
const PHYSICS_REBUILD_DELAY = 150;

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
  editorPanel!: EditorPanel;
  playController!: PlayController;
  editController!: EditController;
  mode: Mode = 'play';
  /** プレイ中に当たり判定を表示する */
  showColliders = false;

  private readonly startTime = performance.now();
  private hudTimer = 0;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly playPanel = h('div', { className: 'mode-panel' });
  private readonly editPanel = h('div', { className: 'mode-panel' });
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
    this.board = createSampleBoard();
    this.physics = new PhysicsWorld(rapier, this.board);
    this.game = new Game(this.physics, this.board, {
      seed: randomSeed(),
      initialBalls: INITIAL_BALLS,
    });
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
    editor.registerTool(new SelectTool(editor));
    editor.setTool('select');
    editor.bus.on('change', () => this.onBoardEdited());
    editor.bus.on('settings', () => {
      this.applyViewSettings();
      this.rebuildStatic();
    });
    this.editor = editor;
    this.editController = new EditController(this.layout.canvas, this.renderer.camera, editor, {
      toggleTestFire: () => {},
      copy: () => {},
      paste: () => {},
      duplicate: () => {},
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
    // エディット中は物理を止める
    this.loop.paused = edit;
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
    this.game.step(dt);
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
    this.dial.update();
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
