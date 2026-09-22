import type { Vec2 } from '@/core/Vec2';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 16;

/**
 * 盤面座標 (画像 px) とスクリーン座標 (CSS px) の変換を受け持つ。
 * zoom = 1 のとき盤面全体がビューに収まる (アスペクト比は保つ)。
 */
export class Camera {
  boardW = 1;
  boardH = 1;
  viewW = 1;
  viewH = 1;
  dpr = 1;
  zoom = 1;
  centerX = 0.5;
  centerY = 0.5;
  /** フィット表示時の余白 (CSS px) */
  padding = 8;

  setBoardSize(w: number, h: number): void {
    this.boardW = w;
    this.boardH = h;
    this.fit();
  }

  setViewport(w: number, h: number, dpr: number): void {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    this.dpr = dpr;
  }

  fit(): void {
    this.zoom = 1;
    this.centerX = this.boardW / 2;
    this.centerY = this.boardH / 2;
  }

  get fitScale(): number {
    const p = this.padding * 2;
    return Math.max(1e-6, Math.min((this.viewW - p) / this.boardW, (this.viewH - p) / this.boardH));
  }

  /** 盤面 px → CSS px の倍率 */
  get scale(): number {
    return this.fitScale * this.zoom;
  }

  get offsetX(): number {
    return this.viewW / 2 - this.centerX * this.scale;
  }

  get offsetY(): number {
    return this.viewH / 2 - this.centerY * this.scale;
  }

  boardToScreen(x: number, y: number): Vec2 {
    const s = this.scale;
    return { x: x * s + this.offsetX, y: y * s + this.offsetY };
  }

  screenToBoard(x: number, y: number): Vec2 {
    const s = this.scale;
    return { x: (x - this.offsetX) / s, y: (y - this.offsetY) / s };
  }

  /** スクリーン上の点 (sx, sy) の位置を保ったまま拡大・縮小する */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToBoard(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const s = this.scale;
    this.centerX = before.x - (sx - this.viewW / 2) / s;
    this.centerY = before.y - (sy - this.viewH / 2) / s;
    this.clampCenter();
  }

  /** スクリーン上で (dx, dy) だけ動かす */
  panBy(dx: number, dy: number): void {
    this.centerX -= dx / this.scale;
    this.centerY -= dy / this.scale;
    this.clampCenter();
  }

  /** 盤面が画面から完全に外れないようにする */
  clampCenter(): void {
    this.centerX = Math.min(this.boardW, Math.max(0, this.centerX));
    this.centerY = Math.min(this.boardH, Math.max(0, this.centerY));
  }

  /** シェーダに渡す値 (デバイス px 単位) */
  get devScale(): number {
    return this.scale * this.dpr;
  }
  get devOffsetX(): number {
    return this.offsetX * this.dpr;
  }
  get devOffsetY(): number {
    return this.offsetY * this.dpr;
  }
}
