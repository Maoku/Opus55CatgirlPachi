import pachiUrl from '@/assets/pachi.png';
import { createSampleBoard } from '@/board/sampleBoard';
import type { BoardData } from '@/board/types';
import { randomSeed } from '@/core/SeededRng';
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
import { GameLoop } from './GameLoop';
import { KeyRouter } from './input';

/** 画像右下のハンドル部 (盤面 px) */
const HANDLE = { x: 925, y: 1250, r: 100 };
const INITIAL_BALLS = 1000;

/** アプリ全体。盤面・物理・ゲーム・描画・UI をつなぐ */
export class App {
  readonly layout: Layout;
  readonly renderer: Renderer;
  readonly keys = new KeyRouter();
  rapier!: Rapier;
  board!: BoardData;
  physics!: PhysicsWorld;
  game!: Game;
  loop!: GameLoop;
  hud!: Hud;
  dial!: HandleDial;
  showColliders = false;

  private readonly startTime = performance.now();
  private hudTimer = 0;

  constructor(root: HTMLElement) {
    this.layout = createLayout(root);
    this.renderer = new Renderer(this.layout.canvas, this.layout.stage);
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
    this.rebuildStatic();
    this.buildUi();
    this.bindPlayInput();

    this.loop = new GameLoop(
      {
        step: (dt) => this.game.step(dt),
        render: (info) => {
          if (info.draw) this.draw(info.realDt);
        },
      },
      this.board.physics.timestep,
    );
    this.loop.start();
  }

  /** 盤面を差し替える (物理ワールドを作り直し、飛んでいる玉は引き継ぐ) */
  setBoard(board: BoardData): void {
    const old = this.physics;
    this.board = board;
    this.physics = new PhysicsWorld(this.rapier, board);
    this.game.setBoard(this.physics, board);
    old.dispose();
    this.rebuildStatic();
  }

  rebuildStatic(): void {
    buildStaticScene(this.renderer, this.board, {
      showColliders: this.showColliders,
      showNailColliders: this.showColliders,
    });
  }

  private draw(realDt: number): void {
    buildDynamicScene(this.renderer, this.physics);
    this.dial.place(this.renderer.camera, HANDLE.x, HANDLE.y, HANDLE.r);
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

    const colliders = h('input', { type: 'checkbox', checked: this.showColliders });
    colliders.addEventListener('change', () => {
      this.showColliders = colliders.checked;
      this.rebuildStatic();
    });
    this.layout.side.append(
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
    this.updateUi();
  }

  private bindPlayInput(): void {
    const launcher = this.game.launcher;
    this.keys.handler = {
      keydown: (e) => {
        switch (e.code) {
          case 'Space':
            launcher.holding = true;
            break;
          case 'KeyF':
            if (!e.repeat) launcher.locked = !launcher.locked;
            break;
          case 'ArrowUp':
          case 'ArrowDown': {
            const step = (e.shiftKey ? 0.05 : 0.01) * (e.code === 'ArrowUp' ? 1 : -1);
            launcher.setStrength(launcher.strength + step);
            break;
          }
          default:
            return false;
        }
        this.updateUi();
        return true;
      },
      keyup: (e) => {
        if (e.code !== 'Space') return false;
        launcher.holding = false;
        this.updateUi();
        return true;
      },
    };

    const canvas = this.layout.canvas;
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        launcher.setStrength(launcher.strength + (e.deltaY < 0 ? 0.01 : -0.01));
        this.updateUi();
      },
      { passive: false },
    );
    canvas.addEventListener('pointerdown', (e) => {
      if (!e.shiftKey) return;
      const rect = canvas.getBoundingClientRect();
      const p = this.renderer.camera.screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
      this.game.dropBall(p.x, p.y);
    });
  }
}
