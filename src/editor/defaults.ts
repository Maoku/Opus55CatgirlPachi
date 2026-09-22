import type { BoardData, BoardObject, PocketKind, RotRect } from '@/board/types';
import type { Vec2 } from '@/core/Vec2';

/** 入賞口の種類ごとの既定の賞球数 (GameSpec の既定値と同じ) */
export const DEFAULT_PAYOUT: Record<PocketKind, number> = {
  start: 3,
  electric: 1,
  attacker: 15,
  general: 10,
  out: 0,
  foul: 0,
};

export type RectKind = PocketKind | 'gate' | 'display';

/** クリックだけで置いたときの大きさ (盤面 px) */
export const DEFAULT_RECT_SIZE: Record<RectKind, { w: number; h: number }> = {
  start: { w: 30, h: 26 },
  electric: { w: 30, h: 26 },
  attacker: { w: 90, h: 26 },
  general: { w: 28, h: 24 },
  out: { w: 160, h: 30 },
  foul: { w: 30, h: 30 },
  gate: { w: 30, h: 26 },
  display: { w: 300, h: 200 },
};

export const RECT_KIND_LABELS: Record<RectKind, string> = {
  start: 'ヘソ (スタートチャッカー)',
  electric: '電チュー',
  attacker: 'アタッカー (大入賞口)',
  general: '一般入賞口',
  out: 'アウト口',
  foul: 'ファール口',
  gate: '普図ゲート',
  display: '液晶領域',
};

/** 入賞口の上に蓋を置く */
export function defaultLid(rect: RotRect): RotRect {
  return { x: rect.x, y: rect.y - rect.h / 2 - 3, w: rect.w + 8, h: 6, angle: rect.angle };
}

/** 種類に応じたオブジェクトを作る */
export function makeRectObject(kind: RectKind, id: string, rect: RotRect): BoardObject {
  if (kind === 'gate') return { id, type: 'gate', rect };
  if (kind === 'display') return { id, type: 'display', rect };
  const pocket: BoardObject = { id, type: 'pocket', kind, rect, payout: DEFAULT_PAYOUT[kind] };
  if (kind === 'electric' || kind === 'attacker') pocket.lid = defaultLid(rect);
  return pocket;
}

export function makeNail(board: BoardData, id: string, p: Vec2): BoardObject {
  const r = Math.round(board.physics.nailRadius * board.scale.pxPerCm * 100) / 100;
  return { id, type: 'nail', x: round1(p.x), y: round1(p.y), r };
}

export const round1 = (v: number): number => Math.round(v * 10) / 10;
export const roundVec = (p: Vec2): Vec2 => ({ x: round1(p.x), y: round1(p.y) });
