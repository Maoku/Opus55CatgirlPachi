import type { Vec2 } from './Vec2';

/** 回転付き矩形。(x, y) は中心、angle は度 (y 下向きなので時計回り) */
export interface RotRect {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
}

export const DEG = Math.PI / 180;

/** 4 隅を返す (ローカル座標で左上 → 右上 → 右下 → 左下) */
export function rotRectCorners(r: RotRect): Vec2[] {
  const c = Math.cos(r.angle * DEG);
  const s = Math.sin(r.angle * DEG);
  const hw = r.w / 2;
  const hh = r.h / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([lx, ly]) => ({ x: r.x + lx! * c - ly! * s, y: r.y + lx! * s + ly! * c }));
}

/** 盤面座標の点を矩形のローカル座標に変換する */
export function toRectLocal(p: Vec2, r: RotRect): Vec2 {
  const c = Math.cos(-r.angle * DEG);
  const s = Math.sin(-r.angle * DEG);
  const dx = p.x - r.x;
  const dy = p.y - r.y;
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

export function pointInRotRect(p: Vec2, r: RotRect, margin = 0): boolean {
  const l = toRectLocal(p, r);
  return Math.abs(l.x) <= r.w / 2 + margin && Math.abs(l.y) <= r.h / 2 + margin;
}

/** 偶奇規則による多角形の内外判定 */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function distPointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** 折れ線までの最短距離 */
export function distPointPolyline(p: Vec2, points: readonly Vec2[], closed: boolean): number {
  let best = Infinity;
  const n = points.length;
  if (n === 1) return Math.hypot(p.x - points[0]!.x, p.y - points[0]!.y);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    best = Math.min(best, distPointSegment(p, points[i]!, points[(i + 1) % n]!));
  }
  return best;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(points: readonly Vec2[]): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) {
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  }
  return b;
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** 3 点を通る円 (一直線上なら null) */
export function circleThrough(
  a: Vec2,
  b: Vec2,
  c: Vec2,
): { x: number; y: number; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}
