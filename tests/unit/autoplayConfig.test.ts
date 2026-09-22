import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTO_CONFIG, normalizeConfig } from '@/auto/AutoPlayConfig';
import { rotationRate } from '@/auto/AutoPlayStats';
import { DEFAULT_SPEC } from '@/game/GameSpec';

describe('自動プレイの設定', () => {
  it('不正な値は既定値か範囲内に丸める', () => {
    const c = normalizeConfig({
      maxShots: -5,
      maxTime: Number.NaN,
      leftStrength: 3,
      rightStrength: -1,
      maxInvest: 12_345,
      speed: 7 as never,
      seed: -42.7,
    });
    expect(c.maxShots).toBe(DEFAULT_AUTO_CONFIG.maxShots);
    expect(c.maxTime).toBe(DEFAULT_AUTO_CONFIG.maxTime);
    expect(c.leftStrength).toBe(1);
    expect(c.rightStrength).toBe(0);
    expect(c.maxInvest).toBe(12_000);
    expect(c.speed).toBe(DEFAULT_AUTO_CONFIG.speed);
    expect(c.seed).toBe(42);
  });

  it('null は「制限なし」として残す', () => {
    const c = normalizeConfig({ maxShots: null, maxTime: 120, seed: null });
    expect(c.maxShots).toBeNull();
    expect(c.maxTime).toBe(120);
    expect(c.seed).toBeNull();
  });
});

describe('回転率', () => {
  it('通常時の使用玉を 250 玉 = 1000 円に換算した千円あたりの回転数', () => {
    // 500 発打って 125 個戻り、使用玉 375 (= 1500 円) で 30 回転 → 20 回 / 1000 円
    const rr = rotationRate({
      normalSpins: 30,
      normalLaunched: 500,
      normalPayout: 125,
      spec: DEFAULT_SPEC,
    });
    expect(rr).toBeCloseTo(20);
    expect(
      rotationRate({ normalSpins: 3, normalLaunched: 10, normalPayout: 10, spec: DEFAULT_SPEC }),
    ).toBeNull();
  });
});
