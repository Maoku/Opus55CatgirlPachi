import type { SpinState } from './GameStateMachine';
import { SYMBOL_COUNT } from './Lottery';

/** 図柄がスクロールする速さ (図柄/秒) */
export const REEL_SPEED = 14;
/** リーチになってから (右リールが止まってから) 中リールが止まるまでの秒数 */
export const REACH_TIME = 4;

export interface ReelFrame {
  /** 中央から offset だけ下にずれた位置にある図柄 */
  symbol: number;
  /** symbol の 1 つ上にある図柄 (上から流れてくる) */
  next: number;
  /** 0..1 のスクロール位置 (リールの高さに対する割合。0 で symbol がちょうど中央) */
  offset: number;
  stopped: boolean;
}

/** 左・中・右のリールが止まる時刻 (変動開始からの秒数) */
export function reelStopTimes(
  spin: Pick<SpinState, 'duration' | 'reach'>,
): [number, number, number] {
  const d = spin.duration;
  if (spin.reach) {
    // リーチは左右を先に止め、中リールだけ REACH_TIME 秒回す (変動が短すぎるときは比率で縮める)
    const right = Math.max(d - REACH_TIME, d * 0.3);
    return [right * 0.65, d, right];
  }
  return [d * 0.5, d, d * 0.75];
}

const wrap = (n: number) => ((((n - 1) % SYMBOL_COUNT) + SYMBOL_COUNT) % SYMBOL_COUNT) + 1;

/**
 * 変動中の各リールの見え方。止まる時刻に向かって図柄が流れ、
 * 止まる時刻でちょうど停止図柄になるように逆算する。
 */
export function reelFrames(
  spin: Pick<SpinState, 'duration' | 'reach' | 'symbols' | 'elapsed'>,
): ReelFrame[] {
  const stops = reelStopTimes(spin);
  return stops.map((stop, i) => {
    const final = spin.symbols[i]!;
    const remain = stop - spin.elapsed;
    if (remain <= 0) return { symbol: final, next: final, offset: 0, stopped: true };
    // 図柄の帯の位置。時間とともに増え、止まる時刻にちょうど final になる (帯は上から下へ流れる)
    const pos = final - remain * REEL_SPEED;
    const base = Math.floor(pos);
    return { symbol: wrap(base), next: wrap(base + 1), offset: pos - base, stopped: false };
  });
}

/** 左右が同じ図柄で止まり、中リールだけが回っている (リーチ演出中) */
export function isReachShowing(
  spin: Pick<SpinState, 'duration' | 'reach' | 'symbols' | 'elapsed'>,
): boolean {
  if (!spin.reach) return false;
  const f = reelFrames(spin);
  return f[0]!.stopped && f[2]!.stopped && !f[1]!.stopped;
}
