import { pointInPolygon } from '@/core/geometry';
import type { BoardData, BoardObject, NailObject, PocketKind } from './types';

export interface BoardWarning {
  ids: string[];
  message: string;
}

export interface NailGap {
  a: NailObject;
  b: NailObject;
  /** 中心間の距離 (px) */
  dist: number;
  /** 当たり判定どうしの隙間 (px) */
  gap: number;
  /** 玉が通れるか */
  passable: boolean;
}

export function ballDiameterPx(board: BoardData): number {
  return board.physics.ballRadius * 2 * board.scale.pxPerCm;
}

export function gapBetween(board: BoardData, a: NailObject, b: NailObject): NailGap {
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  const gap = dist - a.r - b.r;
  return { a, b, dist, gap, passable: gap >= ballDiameterPx(board) };
}

/** 中心間が maxDist 未満の釘の組を列挙する (空間ハッシュで近傍だけを調べる) */
export function nailGaps(board: BoardData, maxDist = ballDiameterPx(board) * 2): NailGap[] {
  const nails = board.objects.filter((o): o is NailObject => o.type === 'nail');
  const cell = maxDist;
  const grid = new Map<string, number[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  nails.forEach((n, i) => {
    const k = key(Math.floor(n.x / cell), Math.floor(n.y / cell));
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  });
  const out: NailGap[] = [];
  nails.forEach((a, i) => {
    const cx = Math.floor(a.x / cell);
    const cy = Math.floor(a.y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(key(cx + dx, cy + dy)) ?? []) {
          if (j <= i) continue;
          const b = nails[j]!;
          if (Math.hypot(a.x - b.x, a.y - b.y) < maxDist) out.push(gapBetween(board, a, b));
        }
      }
    }
  });
  return out;
}

function centerOf(o: BoardObject): { x: number; y: number } | null {
  switch (o.type) {
    case 'nail':
    case 'windmill':
      return { x: o.x, y: o.y };
    case 'pocket':
    case 'gate':
      return { x: o.rect.x, y: o.rect.y };
    default:
      return null;
  }
}

const REQUIRED: [PocketKind, string][] = [
  ['start', 'ヘソ (スタートチャッカー) がありません'],
  ['out', 'アウト口がありません'],
];

/** 盤面の問題を洗い出す */
export function analyzeBoard(board: BoardData): BoardWarning[] {
  const warnings: BoardWarning[] = [];
  const pf = board.playfield;
  for (const o of board.objects) {
    const c = centerOf(o);
    if (c && !pointInPolygon(c, pf)) {
      warnings.push({ ids: [o.id], message: `${o.id}: 遊技領域の外にあります` });
    }
    if (o.type === 'pocket' && o.kind !== 'out') {
      const d = ballDiameterPx(board);
      if (Math.min(o.rect.w, o.rect.h) < d * 0.6) {
        warnings.push({
          ids: [o.id],
          message: `${o.id}: 入賞判定の範囲が玉に比べて小さく、入賞しにくい可能性があります`,
        });
      }
    }
  }
  for (const g of nailGaps(board)) {
    if (g.gap < 0) {
      warnings.push({ ids: [g.a.id, g.b.id], message: `${g.a.id} と ${g.b.id} が重なっています` });
    }
  }
  if (!pointInPolygon(board.launcher, pf)) {
    warnings.push({ ids: [], message: '発射位置が遊技領域の外にあります' });
  }
  for (const [kind, message] of REQUIRED) {
    if (!board.objects.some((o) => o.type === 'pocket' && o.kind === kind)) {
      warnings.push({ ids: [], message });
    }
  }
  return warnings;
}
