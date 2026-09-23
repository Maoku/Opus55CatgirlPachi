import type { Game, PocketCounts } from '@/game/Game';
import type { AutoPlayConfig } from './AutoPlayConfig';

export type StopReason = 'shots' | 'time' | 'manual' | 'empty';

export const STOP_REASON_LABELS: Record<StopReason, string> = {
  shots: '指定の発射数に達した',
  time: '指定の時間に達した',
  manual: '手動で停止',
  empty: '持ち玉が切れた (投資上限)',
};

/** 持ち玉推移の 1 点 */
export interface HistoryPoint {
  /** ゲーム内時間 (秒) */
  t: number;
  shots: number;
  held: number;
  net: number;
  spins: number;
  jackpots: number;
  invested: number;
}

export interface AutoPlayReport {
  boardName: string;
  seed: number;
  config: AutoPlayConfig;
  reason: StopReason;
  /** 発射数 (ファールで戻った玉は除く) */
  shots: number;
  simTime: number;
  spins: number;
  jackpots: number;
  firstHits: number;
  payout: number;
  /** 差玉 = 総賞球 − 発射数 */
  net: number;
  /** 出玉率 = 総賞球 ÷ 発射数 */
  payoutRate: number | null;
  /** 回転率 (千円あたりの回転数)。通常時の使用玉 (発射数 − 賞球) を 250 玉 = 1000 円に換算 */
  rotationRate: number | null;
  normalSpins: number;
  normalUsed: number;
  invested: number;
  lent: number;
  finalHeld: number;
  /** 滞留・遊技領域外で回収した玉の数 */
  lost: number;
  pockets: PocketCounts;
  payoutByKind: PocketCounts;
  history: HistoryPoint[];
}

export function rotationRate(
  game: Pick<Game, 'normalSpins' | 'normalLaunched' | 'normalPayout' | 'spec'>,
) {
  const used = game.normalLaunched - game.normalPayout;
  if (used <= 0) return null;
  return (game.normalSpins / used) * game.spec.ballsPer1000Yen;
}

export function snapshot(game: Game): HistoryPoint {
  return {
    t: game.time,
    shots: game.launched,
    held: game.held,
    net: game.net,
    spins: game.spins,
    jackpots: game.jackpots,
    invested: game.invested,
  };
}

/** Game の集計値からレポートを作る (Game は自動プレイの開始時にリセット済みとする) */
export function makeReport(
  game: Game,
  boardName: string,
  config: AutoPlayConfig,
  reason: StopReason,
  history: HistoryPoint[],
): AutoPlayReport {
  return {
    boardName,
    seed: game.seed,
    config: { ...config },
    reason,
    shots: game.launched,
    simTime: game.time,
    spins: game.spins,
    jackpots: game.jackpots,
    firstHits: game.firstHits,
    payout: game.payout,
    net: game.net,
    payoutRate: game.launched > 0 ? game.payout / game.launched : null,
    rotationRate: rotationRate(game),
    normalSpins: game.normalSpins,
    normalUsed: game.normalLaunched - game.normalPayout,
    invested: game.invested,
    lent: game.lent,
    finalHeld: game.held,
    lost: game.lost,
    pockets: { ...game.pockets },
    payoutByKind: { ...game.payoutByKind },
    history: history.map((h) => ({ ...h })),
  };
}

export function reportToJson(report: AutoPlayReport): string {
  return JSON.stringify(report, null, 2);
}

/** 持ち玉推移を CSV にする (1 行目は見出し) */
export function reportToCsv(report: AutoPlayReport): string {
  const head = 'time_s,shots,held,net,spins,jackpots,invested_yen';
  const rows = report.history.map((h) =>
    [h.t.toFixed(2), h.shots, h.held, h.net, h.spins, h.jackpots, h.invested].join(','),
  );
  return [head, ...rows].join('\n') + '\n';
}
