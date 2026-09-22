import pachiUrl from '@/assets/pachi.png';
import { createSampleBoard } from '@/board/sampleBoard';
import type { BoardData } from '@/board/types';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { loadRapier, type Rapier } from '@/physics/rapier';
import { loadImage } from '@/render/gl/Texture';
import { Renderer } from '@/render/Renderer';
import { buildDynamicScene, buildStaticScene } from '@/render/SceneBuilder';
import { h } from '@/ui/dom';
import { createLayout, type Layout } from '@/ui/layout';
import { GameLoop } from './GameLoop';

/** アプリ全体。盤面・物理・描画・ループをつなぐ */
export class App {
  readonly layout: Layout;
  readonly renderer: Renderer;
  rapier!: Rapier;
  board!: BoardData;
  physics!: PhysicsWorld;
  loop!: GameLoop;
  showColliders = true;
  /** 回収した玉の数 (理由別) */
  readonly collected = { pocket: 0, outside: 0, stall: 0 };

  private readonly startTime = performance.now();
  private readonly statusEl = h('div', { className: 'status' });

  constructor(root: HTMLElement) {
    this.layout = createLayout(root);
    this.renderer = new Renderer(this.layout.canvas, this.layout.stage);
  }

  async start(): Promise<void> {
    const [rapier, image] = await Promise.all([loadRapier(), loadImage(pachiUrl)]);
    this.rapier = rapier;
    this.renderer.setBoardImage(image);
    this.setBoard(createSampleBoard());
    this.buildPanel();
    this.layout.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));

    this.loop = new GameLoop(
      {
        step: () => this.step(),
        render: (info) => {
          if (info.draw) this.draw();
        },
      },
      this.board.physics.timestep,
    );
    this.loop.start();
  }

  setBoard(board: BoardData): void {
    this.physics?.dispose();
    this.board = board;
    this.physics = new PhysicsWorld(this.rapier, board);
    this.rebuildStatic();
  }

  rebuildStatic(): void {
    buildStaticScene(this.renderer, this.board, {
      showColliders: this.showColliders,
      showNailColliders: this.showColliders,
    });
  }

  private step(): void {
    this.physics.step();
    for (const e of this.physics.drainEvents()) {
      if (e.type === 'pocket') this.collected.pocket++;
      else if (e.type === 'lost') this.collected[e.reason]++;
    }
  }

  private draw(): void {
    buildDynamicScene(this.renderer, this.physics);
    this.renderer.render((performance.now() - this.startTime) / 1000);
    this.statusEl.textContent =
      `玉: ${this.physics.ballCount} / 入賞・アウト: ${this.collected.pocket}` +
      ` / 範囲外: ${this.collected.outside} / 滞留: ${this.collected.stall}`;
  }

  private onPointerDown(e: PointerEvent): void {
    const rect = this.layout.canvas.getBoundingClientRect();
    const p = this.renderer.camera.screenToBoard(e.clientX - rect.left, e.clientY - rect.top);
    this.physics.spawnBall(p.x, p.y, 0, 0);
  }

  private buildPanel(): void {
    const toggle = h('input', { type: 'checkbox', checked: this.showColliders });
    toggle.addEventListener('change', () => {
      this.showColliders = toggle.checked;
      this.rebuildStatic();
    });
    this.layout.side.append(
      h('section', { className: 'panel' }, [
        h('h2', { textContent: '物理テスト' }),
        h('p', { className: 'muted', textContent: '盤面をクリックすると玉を落とします。' }),
        h('label', {}, [toggle, ' 当たり判定を表示']),
        this.statusEl,
      ]),
    );
  }
}
