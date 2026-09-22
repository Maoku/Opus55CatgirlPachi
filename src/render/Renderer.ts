import { BackgroundLayer } from './BackgroundLayer';
import { Camera } from './Camera';
import { CircleBatch } from './CircleBatch';
import { createGL } from './gl/context';
import { ProgramCache } from './gl/Shader';
import type { FrameContext, Layer } from './Layer';
import { LineBatch } from './LineBatch';
import { SpriteLayer } from './SpriteLayer';

const MAX_DPR = 2;

/**
 * レイヤを順に合成して描く。描画順は layers 配列の順 (後ろほど手前)。
 * キャンバスの寸法は親要素に追従し、コンテキストの喪失・復帰にも対応する。
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly camera = new Camera();

  readonly background = new BackgroundLayer();
  readonly walls = new LineBatch();
  readonly nailShadows = new CircleBatch();
  readonly nails = new CircleBatch();
  readonly windmills = new CircleBatch();
  readonly ballShadows = new CircleBatch();
  readonly balls = new CircleBatch();
  /** 入賞のパーティクル・枠ランプなど (加算合成の円) */
  readonly effects = new CircleBatch();
  /** 大当りのフラッシュなど (盤面全体に重ねるスプライト) */
  readonly fxSprites = new SpriteLayer();
  readonly overlayLines = new LineBatch();
  readonly overlayCircles = new CircleBatch();

  readonly layers: Layer[];
  contextLost = false;
  /** 描画したフレーム数 (テスト用) */
  frames = 0;
  /** 寸法が変わったときに呼ばれる */
  onResize: (() => void) | null = null;
  /** コンテキストを失ったとき (true) と復帰したとき (false) に呼ばれる */
  onContextLost: ((lost: boolean) => void) | null = null;

  private programs: ProgramCache;
  private readonly observer: ResizeObserver;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly container: HTMLElement,
  ) {
    this.gl = createGL(canvas);
    this.layers = [
      this.background,
      this.walls,
      this.nailShadows,
      this.ballShadows,
      this.nails,
      this.windmills,
      this.balls,
      this.effects,
      this.fxSprites,
      this.overlayLines,
      this.overlayCircles,
    ];
    this.programs = new ProgramCache(this.gl);
    this.initLayers();

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.onContextLost?.(true);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.programs = new ProgramCache(this.gl);
      this.initLayers();
      this.contextLost = false;
      this.onContextLost?.(false);
    });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  /** 描画順の layer の直後に新しいレイヤを差し込む */
  insertLayerAfter(after: Layer, layer: Layer): void {
    const i = this.layers.indexOf(after);
    this.layers.splice(i < 0 ? this.layers.length : i + 1, 0, layer);
    layer.initGL(this.gl, this.programs);
  }

  private initLayers(): void {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const layer of this.layers) layer.initGL(gl, this.programs);
  }

  resize(): void {
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.camera.setViewport(w, h, dpr);
    this.onResize?.();
  }

  setBoardImage(image: HTMLImageElement | ImageBitmap): void {
    this.background.setImage(image);
    this.camera.setBoardSize(image.width, image.height);
  }

  render(time: number): void {
    if (this.contextLost) return;
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.04, 0.02, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const fc: FrameContext = {
      gl,
      camera: this.camera,
      time,
      viewportW: w,
      viewportH: h,
      boardTexture: this.background.texture,
      boardW: this.background.width,
      boardH: this.background.height,
    };
    for (const layer of this.layers) layer.draw(fc);
    this.frames++;
  }

  /** 描画直後のピクセルを読み、黒でない画素の割合を返す (E2E テスト用) */
  sampleCoverage(time = 0): { nonDark: number; total: number } {
    this.render(time);
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let nonDark = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i]! + px[i + 1]! + px[i + 2]! > 60) nonDark++;
    }
    return { nonDark, total: w * h };
  }

  dispose(): void {
    this.observer.disconnect();
    this.programs.dispose();
  }
}
