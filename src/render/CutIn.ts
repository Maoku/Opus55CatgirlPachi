import type { RotRect } from '@/core/geometry';
import type { Sprite } from './SpriteLayer';

const SLIDE_IN = 0.35;
const FADE_OUT = 0.45;

/**
 * キャラクター画像の上半身を切り出し、角の丸いカード状にする
 * (元画像は背景が白いので、枠を付けて液晶に重ねる)
 */
export function makeCutInCard(image: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const srcW = image.width;
  const srcH = Math.min(image.height, Math.round(image.width * 1.15));
  const w = 540;
  const h = Math.round((w * srcH) / srcW);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const border = 14;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(border / 2, border / 2, w - border, h - border, 36);
  ctx.clip();
  ctx.drawImage(image, 0, 0, srcW, srcH, 0, 0, w, h);
  // 下の方を少し暗くして、液晶の文字を読みやすくする
  const shade = ctx.createLinearGradient(0, h * 0.55, 0, h);
  shade.addColorStop(0, 'rgba(40, 0, 30, 0)');
  shade.addColorStop(1, 'rgba(40, 0, 30, 0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(border / 2, border / 2, w - border, h - border, 36);
  ctx.lineWidth = border;
  ctx.strokeStyle = '#ff5fa8';
  ctx.shadowColor = '#ff5fa8';
  ctx.shadowBlur = 12;
  ctx.stroke();
  return canvas;
}

/** 大当り時に液晶へキャラクター (character.png) を滑り込ませる演出 */
export class CutIn {
  readonly duration = 3;
  private start = -Infinity;

  constructor(
    private readonly character: Sprite,
    private readonly dim: Sprite,
  ) {
    dim.tint = [0.1, 0, 0.08, 0.55];
    character.visible = false;
    dim.visible = false;
  }

  trigger(time: number): void {
    this.start = time;
  }

  get active(): boolean {
    return Number.isFinite(this.start);
  }

  /** 時刻 time (シミュレーション時間) に合わせてスプライトを置く */
  update(time: number, rect: RotRect): void {
    const t = time - this.start;
    const show = t >= 0 && t <= this.duration;
    this.character.visible = show;
    this.dim.visible = show;
    if (!show) return;
    const slide = 1 - Math.pow(1 - Math.min(1, t / SLIDE_IN), 3);
    const fade = Math.min(1, (this.duration - t) / FADE_OUT);
    const img = this.character.source;
    const h = rect.h * 0.82;
    const w = (h * img.width) / img.height;
    const c = this.character;
    c.h = h;
    c.w = w;
    // 右から左へ滑り込み、液晶の右寄りで止まる
    const endX = rect.x + rect.w * 0.2;
    const startX = rect.x + rect.w / 2 + w;
    c.x = startX + (endX - startX) * slide;
    c.y = rect.y - rect.h * 0.04;
    c.angle = (1 - slide) * 0.25 + 0.05;
    c.alpha = fade;
    const d = this.dim;
    d.x = rect.x;
    d.y = rect.y;
    d.w = rect.w;
    d.h = rect.h;
    d.alpha = fade * slide;
  }
}
