import pachiUrl from '@/assets/pachi.png';
import { CircleKind } from '@/render/CircleBatch';
import { hex } from '@/render/color';
import { loadImage } from '@/render/gl/Texture';
import { Renderer } from '@/render/Renderer';
import { createLayout, type Layout } from '@/ui/layout';

/** アプリ全体。Phase 1 では盤面画像とテスト用の図形を描く */
export class App {
  readonly layout: Layout;
  readonly renderer: Renderer;
  private rafId = 0;
  private readonly startTime = performance.now();

  constructor(root: HTMLElement) {
    this.layout = createLayout(root);
    this.renderer = new Renderer(this.layout.canvas, this.layout.stage);
  }

  async start(): Promise<void> {
    const image = await loadImage(pachiUrl);
    this.renderer.setBoardImage(image);
    this.drawTestShapes();
    const frame = (now: number) => {
      this.renderer.render((now - this.startTime) / 1000);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
  }

  private drawTestShapes(): void {
    const r = this.renderer;
    const nail = hex('#d8c9a0');
    for (let i = 0; i < 12; i++) {
      const x = 300 + i * 30;
      r.nailShadows.push(x + 2, 402, 5, CircleKind.Shadow, [0, 0, 0, 0.5]);
      r.nails.push(x, 400, 3.2, CircleKind.Nail, nail);
    }
    for (let i = 0; i < 5; i++) {
      r.balls.push(360 + i * 40, 450, 11.9, CircleKind.Ball, hex('#dfe3ea'));
    }
    r.walls.polyline(
      [
        { x: 120, y: 1100 },
        { x: 120, y: 500 },
        { x: 300, y: 260 },
        { x: 560, y: 235 },
      ],
      false,
      3,
      hex('#5fe0ff', 0.9),
    );
  }
}
