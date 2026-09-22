import type { BoardObject, PocketKind } from '@/board/types';
import { boundsOf, rotRectCorners, type Bounds, type RotRect } from '@/core/geometry';
import type { Vec2 } from '@/core/Vec2';

export const POCKET_LABELS: Record<PocketKind, string> = {
  start: 'ヘソ',
  electric: '電チュー',
  attacker: 'アタッカー',
  general: '一般入賞口',
  out: 'アウト口',
  foul: 'ファール口',
};

export function objectLabel(o: BoardObject): string {
  switch (o.type) {
    case 'nail':
      return '釘';
    case 'wall':
      return '壁';
    case 'windmill':
      return '風車';
    case 'pocket':
      return POCKET_LABELS[o.kind];
    case 'gate':
      return '普図ゲート';
    case 'display':
      return '液晶領域';
  }
}

const moveRect = (r: RotRect, dx: number, dy: number): RotRect => ({
  ...r,
  x: r.x + dx,
  y: r.y + dy,
});

/** dx, dy だけ動かした複製を返す */
export function moveObject<T extends BoardObject>(o: T, dx: number, dy: number): T {
  switch (o.type) {
    case 'nail':
    case 'windmill':
      return { ...o, x: o.x + dx, y: o.y + dy };
    case 'wall':
      return { ...o, points: o.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'pocket':
      return {
        ...o,
        rect: moveRect(o.rect, dx, dy),
        ...(o.lid ? { lid: moveRect(o.lid, dx, dy) } : {}),
      };
    case 'gate':
    case 'display':
      return { ...o, rect: moveRect(o.rect, dx, dy) };
  }
}

/** グリッドに合わせる基準点 */
export function objectAnchor(o: BoardObject): Vec2 {
  switch (o.type) {
    case 'nail':
    case 'windmill':
      return { x: o.x, y: o.y };
    case 'wall':
      return { ...o.points[0]! };
    case 'pocket':
    case 'gate':
    case 'display':
      return { x: o.rect.x, y: o.rect.y };
  }
}

export function objectBounds(o: BoardObject): Bounds {
  switch (o.type) {
    case 'nail':
    case 'windmill':
      return { minX: o.x - o.r, minY: o.y - o.r, maxX: o.x + o.r, maxY: o.y + o.r };
    case 'wall':
      return boundsOf(o.points);
    case 'pocket':
      return boundsOf([...rotRectCorners(o.rect), ...(o.lid ? rotRectCorners(o.lid) : [])]);
    case 'gate':
    case 'display':
      return boundsOf(rotRectCorners(o.rect));
  }
}

export function boundsCenter(b: Bounds): Vec2 {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}
