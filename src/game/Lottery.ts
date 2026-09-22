import type { SeededRng } from '@/core/SeededRng';
import type { GameSpec, Range } from './GameSpec';

export type Mode = 'normal' | 'jackpot' | 'st' | 'jitan';

/** 図柄の数 (1〜9) */
export const SYMBOL_COUNT = 9;

/**
 * 保留 1 個分の乱数。入賞した時点で取得し、変動を始めるときにその時点の状態で判定する
 * (先読みに使えるよう、入賞時に値が決まっている)。
 */
export interface Hold {
  /** 大当り判定用 */
  jackpotRand: number;
  /** リーチ・図柄・変動時間用 */
  effectRand: number;
  /** 大当り後の振り分け (ST / 時短) 用 */
  routeRand: number;
  fromElectric: boolean;
}

export interface SpinResult {
  jackpot: boolean;
  reach: boolean;
  /** 大当りのとき、終了後に ST へ入るか */
  toSt: boolean;
  /** 停止図柄 (左・中・右) */
  symbols: [number, number, number];
  /** 変動時間 (秒) */
  duration: number;
}

export function drawHold(rng: SeededRng, fromElectric: boolean): Hold {
  return {
    jackpotRand: rng.next(),
    effectRand: rng.next(),
    routeRand: rng.next(),
    fromElectric,
  };
}

export function isSupport(mode: Mode): boolean {
  return mode === 'st' || mode === 'jitan';
}

export function jackpotProbFor(spec: GameSpec, mode: Mode): number {
  return mode === 'st' ? spec.stJackpotProb : spec.jackpotProb;
}

function inRange(r: Range, t: number): number {
  return r[0] + (r[1] - r[0]) * t;
}

/**
 * 保留を判定して変動の内容を決める。
 * @param mode 変動を始める時点の遊技状態
 * @param holdsLeft この保留を取り出したあとに残っている保留の数
 */
export function judge(
  spec: GameSpec,
  mode: Mode,
  hold: Hold,
  holdsLeft: number,
  rng: SeededRng,
  forceJackpot = false,
): SpinResult {
  const jackpot = forceJackpot || hold.jackpotRand < jackpotProbFor(spec, mode);
  const support = isSupport(mode);
  const reachRate = support ? spec.supportReachRate : spec.reachRate;
  // 大当りは必ずリーチを経由する
  const reach = jackpot || hold.effectRand < reachRate;
  const toSt = jackpot && hold.routeRand < spec.stRatio;
  const v = spec.variation;
  // 変動時間は effectRand とは別に揺らす (同じ乱数を使い回すと偏るため)
  const t = rng.next();
  let duration: number;
  if (reach) duration = inRange(support ? v.supportReach : v.reach, t);
  else if (support) duration = inRange(v.supportMiss, t);
  else if (holdsLeft >= v.shortenHolds) duration = v.shortened;
  else duration = inRange(v.normalMiss, t);
  return { jackpot, reach, toSt, symbols: pickSymbols(rng, jackpot, reach, toSt), duration };
}

/** 停止図柄を決める。大当りはゾロ目 (ST 行きは奇数)、リーチハズレは左右だけ揃う */
export function pickSymbols(
  rng: SeededRng,
  jackpot: boolean,
  reach: boolean,
  toSt: boolean,
): [number, number, number] {
  const pick = () => rng.int(SYMBOL_COUNT) + 1;
  if (jackpot) {
    const odd = [1, 3, 5, 7, 9];
    const even = [2, 4, 6, 8];
    const s = rng.pick(toSt ? odd : even);
    return [s, s, s];
  }
  const a = pick();
  if (reach) {
    let b = pick();
    while (b === a) b = pick();
    return [a, b, a];
  }
  let c = pick();
  while (c === a) c = pick();
  return [a, pick(), c];
}
