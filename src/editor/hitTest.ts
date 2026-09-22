import type { BoardData, BoardObject, BoardObjectType } from '@/board/types';
import { distPointPolyline, pointInRotRect, rotRectCorners, type Bounds } from '@/core/geometry';
import type { Vec2 } from '@/core/Vec2';
import { objectBounds } from './objectOps';

/** 小さいものほど優先して選ぶ */
const PRIORITY: Record<BoardObjectType, number> = {
  nail: 0,
  windmill: 1,
  gate: 2,
  pocket: 3,
  wall: 4,
  display: 5,
};

/** 点 p からオブジェクトまでの距離。内側なら 0 */
export function distanceTo(o: BoardObject, p: Vec2): number {
  switch (o.type) {
    case 'nail':
      return Math.max(0, Math.hypot(p.x - o.x, p.y - o.y) - Math.max(o.r, 3));
    case 'windmill':
      return Math.max(0, Math.hypot(p.x - o.x, p.y - o.y) - o.r);
    case 'wall':
      return distPointPolyline(p, o.points, o.closed);
    case 'pocket':
      if (pointInRotRect(p, o.rect) || (o.lid && pointInRotRect(p, o.lid))) return 0;
      return Math.min(
        distPointPolyline(p, rotRectCorners(o.rect), true),
        o.lid ? distPointPolyline(p, rotRectCorners(o.lid), true) : Infinity,
      );
    case 'gate':
      return pointInRotRect(p, o.rect) ? 0 : distPointPolyline(p, rotRectCorners(o.rect), true);
    case 'display':
      // 液晶領域は大きいので、枠線の近くだけで選ぶ
      return distPointPolyline(p, rotRectCorners(o.rect), true);
  }
}

/** p の位置にあるオブジェクトを 1 つ選ぶ。tol は盤面 px での許容距離 */
export function hitTest(board: BoardData, p: Vec2, tol: number): BoardObject | null {
  let best: BoardObject | null = null;
  let bestKey = Infinity;
  for (const o of board.objects) {
    const d = distanceTo(o, p);
    if (d > tol) continue;
    const key = PRIORITY[o.type] * 1e6 + d;
    if (key < bestKey) {
      bestKey = key;
      best = o;
    }
  }
  return best;
}

/** 矩形に完全に収まるオブジェクト */
export function objectsInRect(board: BoardData, r: Bounds): BoardObject[] {
  return board.objects.filter((o) => {
    const b = objectBounds(o);
    return b.minX >= r.minX && b.maxX <= r.maxX && b.minY >= r.minY && b.maxY <= r.maxY;
  });
}

export function rectFromPoints(a: Vec2, b: Vec2): Bounds {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}
