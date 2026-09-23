import type { PocketKind } from '@/board/types';

export type Range = readonly [number, number];

/**
 * 遊技スペック (画像の「1/199」に合わせたライトミドル風の簡易スペック)。
 * 時間はすべてシミュレーション時間 (秒)。
 */
export interface GameSpec {
  /** 大当り確率 (通常時・時短中) */
  jackpotProb: number;
  /** 大当り確率 (ST 中) */
  stJackpotProb: number;
  /** 大当り後に ST へ入る割合 (残りは時短) */
  stRatio: number;
  stSpins: number;
  jitanSpins: number;
  rounds: number;
  /** 1 ラウンドの最大入賞数 */
  roundMaxCount: number;
  /** 1 ラウンドの最大開放時間 */
  roundMaxTime: number;
  /** ラウンド間のインターバル */
  roundInterval: number;
  /** 大当り開始 (オープニング) と終了 (エンディング) の演出時間 */
  openingTime: number;
  endingTime: number;
  /** 入賞口の種類ごとの既定の賞球数 (盤面を作るときに使う) */
  payouts: Record<PocketKind, number>;
  maxHolds: number;
  variation: {
    normalMiss: Range;
    reach: Range;
    /** 保留が shortenHolds 個以上あるときのハズレ変動 */
    shortened: number;
    shortenHolds: number;
    /** 時短・ST 中のハズレ変動 */
    supportMiss: Range;
    /** 時短・ST 中のリーチ変動 */
    supportReach: Range;
    /** 図柄が止まってから次の変動までの時間 */
    stopPause: number;
  };
  /** ハズレのときにリーチになる割合 (通常時 / 電サポ中) */
  reachRate: number;
  supportReachRate: number;
  /** 普図 (普通図柄) */
  fuzu: {
    maxHolds: number;
    normal: { prob: number; time: number; open: number };
    support: { prob: number; time: number; open: number };
  };
  /** 1000 円で借りられる玉数 */
  ballsPer1000Yen: number;
  initialBalls: number;
}

export const DEFAULT_SPEC: GameSpec = {
  jackpotProb: 1 / 199,
  stJackpotProb: 1 / 39.9,
  stRatio: 0.5,
  stSpins: 100,
  jitanSpins: 100,
  rounds: 10,
  roundMaxCount: 10,
  roundMaxTime: 29.5,
  roundInterval: 1.5,
  openingTime: 4,
  endingTime: 3,
  payouts: { start: 3, electric: 1, attacker: 15, general: 10, out: 0, foul: 0 },
  maxHolds: 4,
  variation: {
    normalMiss: [6, 10],
    reach: [7, 9],
    shortened: 3,
    shortenHolds: 3,
    supportMiss: [1.5, 3],
    supportReach: [6, 7.5],
    stopPause: 0.8,
  },
  reachRate: 0.08,
  supportReachRate: 0.05,
  fuzu: {
    maxHolds: 4,
    normal: { prob: 1 / 10, time: 5, open: 0.2 },
    support: { prob: 9 / 10, time: 1, open: 3 },
  },
  ballsPer1000Yen: 250,
  initialBalls: 1000,
};
