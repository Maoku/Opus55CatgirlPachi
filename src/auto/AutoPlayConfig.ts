export type AutoSpeed = 1 | 2 | 5 | 10 | 'max';
export const AUTO_SPEEDS: readonly AutoSpeed[] = [1, 2, 5, 10, 'max'];

export interface AutoPlayConfig {
  /** 発射数で止める (null なら制限なし) */
  maxShots: number | null;
  /** ゲーム内時間 (秒) で止める (null なら制限なし) */
  maxTime: number | null;
  /** 左打ち・右打ちの強度 (0..1) */
  leftStrength: number;
  rightStrength: number;
  /** 大当り・電サポ中は右打ちに切り替える */
  autoSwitch: boolean;
  /** 持ち玉が切れたとき: 自動で貸玉する / 止める */
  onEmpty: 'lend' | 'stop';
  /** 自動貸玉の投資上限 (円) */
  maxInvest: number;
  speed: AutoSpeed;
  /** null ならランダム */
  seed: number | null;
  /** 開始時の持ち玉 */
  initialBalls: number;
}

export const DEFAULT_AUTO_CONFIG: AutoPlayConfig = {
  maxShots: 1000,
  maxTime: null,
  leftStrength: 0.25,
  rightStrength: 0.9,
  autoSwitch: true,
  onEmpty: 'lend',
  maxInvest: 50_000,
  speed: 1,
  seed: null,
  initialBalls: 0,
};

/** 設定値を妥当な範囲に丸める (保存値の読み込み時にも使う) */
export function normalizeConfig(c: Partial<AutoPlayConfig>): AutoPlayConfig {
  const d = DEFAULT_AUTO_CONFIG;
  const clamp01 = (v: unknown, fb: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fb;
  const posOrNull = (v: unknown, fb: number | null) =>
    v === null ? null : typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fb;
  const shots = posOrNull(c.maxShots, d.maxShots);
  return {
    maxShots: shots === null ? null : Math.round(shots),
    maxTime: posOrNull(c.maxTime, d.maxTime),
    leftStrength: clamp01(c.leftStrength, d.leftStrength),
    rightStrength: clamp01(c.rightStrength, d.rightStrength),
    autoSwitch: typeof c.autoSwitch === 'boolean' ? c.autoSwitch : d.autoSwitch,
    onEmpty: c.onEmpty === 'stop' ? 'stop' : 'lend',
    maxInvest:
      typeof c.maxInvest === 'number' && c.maxInvest >= 0
        ? Math.floor(c.maxInvest / 1000) * 1000
        : d.maxInvest,
    speed: AUTO_SPEEDS.includes(c.speed as AutoSpeed) ? (c.speed as AutoSpeed) : d.speed,
    seed:
      typeof c.seed === 'number' && Number.isFinite(c.seed)
        ? Math.floor(Math.abs(c.seed)) >>> 0
        : null,
    initialBalls:
      typeof c.initialBalls === 'number' && c.initialBalls >= 0
        ? Math.floor(c.initialBalls)
        : d.initialBalls,
  };
}
