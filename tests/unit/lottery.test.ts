import { describe, expect, it } from 'vitest';
import { SeededRng } from '@/core/SeededRng';
import { DEFAULT_SPEC } from '@/game/GameSpec';
import { drawHold, judge, pickSymbols } from '@/game/Lottery';

/** 二項分布の平均から 5σ 以内か */
function expectBinomial(hits: number, n: number, p: number) {
  const mean = n * p;
  const sd = Math.sqrt(n * p * (1 - p));
  expect(Math.abs(hits - mean)).toBeLessThan(5 * sd);
}

describe('抽選', () => {
  it('通常時の大当り確率は 1/199 (10^6 回の統計検定)', () => {
    const rng = new SeededRng(2026);
    const judgeRng = new SeededRng(7);
    const n = 1_000_000;
    let hits = 0;
    for (let i = 0; i < n; i++) {
      if (judge(DEFAULT_SPEC, 'normal', drawHold(rng, false), 0, judgeRng).jackpot) hits++;
    }
    expectBinomial(hits, n, 1 / 199);
  });

  it('ST 中は 1/39.9、時短中は 1/199', () => {
    const rng = new SeededRng(99);
    const n = 400_000;
    let st = 0;
    let jitan = 0;
    for (let i = 0; i < n; i++) {
      const hold = drawHold(rng, true);
      if (judge(DEFAULT_SPEC, 'st', hold, 0, rng).jackpot) st++;
      if (judge(DEFAULT_SPEC, 'jitan', hold, 0, rng).jackpot) jitan++;
    }
    expectBinomial(st, n, 1 / 39.9);
    expectBinomial(jitan, n, 1 / 199);
  });

  it('大当りの振り分けは ST 50% / 時短 50%', () => {
    const rng = new SeededRng(5);
    const n = 100_000;
    let toSt = 0;
    for (let i = 0; i < n; i++) {
      if (judge(DEFAULT_SPEC, 'normal', drawHold(rng, false), 0, rng, true).toSt) toSt++;
    }
    expectBinomial(toSt, n, 0.5);
  });

  it('同じ保留は、変動を始めた時点の状態で判定される', () => {
    // 1/199 では外れ、1/39.9 なら当たる乱数
    const hold = { jackpotRand: 0.01, effectRand: 0.5, routeRand: 0.5, fromElectric: false };
    const rng = new SeededRng(1);
    expect(judge(DEFAULT_SPEC, 'normal', hold, 0, rng).jackpot).toBe(false);
    expect(judge(DEFAULT_SPEC, 'st', hold, 0, rng).jackpot).toBe(true);
  });
});

describe('図柄と変動時間', () => {
  it('大当りはゾロ目で、ST 行きは奇数・時短行きは偶数', () => {
    const rng = new SeededRng(3);
    for (let i = 0; i < 200; i++) {
      const st = pickSymbols(rng, true, true, true);
      expect(st[0]).toBe(st[1]);
      expect(st[1]).toBe(st[2]);
      expect(st[0] % 2).toBe(1);
      const jt = pickSymbols(rng, true, true, false);
      expect(jt[0] % 2).toBe(0);
    }
  });

  it('リーチハズレは左右だけ揃い、通常ハズレは左右が揃わない', () => {
    const rng = new SeededRng(4);
    for (let i = 0; i < 500; i++) {
      const r = pickSymbols(rng, false, true, false);
      expect(r[0]).toBe(r[2]);
      expect(r[1]).not.toBe(r[0]);
      const m = pickSymbols(rng, false, false, false);
      expect(m[0]).not.toBe(m[2]);
      for (const s of [...r, ...m]) {
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(9);
      }
    }
  });

  it('変動時間は状態・リーチ・保留数に応じた範囲に収まる', () => {
    const rng = new SeededRng(8);
    const v = DEFAULT_SPEC.variation;
    for (let i = 0; i < 2000; i++) {
      const hold = drawHold(rng, false);
      const normal = judge(DEFAULT_SPEC, 'normal', hold, 0, rng);
      const range = normal.reach ? v.reach : v.normalMiss;
      expect(normal.duration).toBeGreaterThanOrEqual(range[0]);
      expect(normal.duration).toBeLessThanOrEqual(range[1]);
      const shortened = judge(DEFAULT_SPEC, 'normal', hold, 3, rng);
      if (!shortened.reach) expect(shortened.duration).toBe(v.shortened);
      const support = judge(DEFAULT_SPEC, 'jitan', hold, 0, rng);
      const sr = support.reach ? v.supportReach : v.supportMiss;
      expect(support.duration).toBeGreaterThanOrEqual(sr[0]);
      expect(support.duration).toBeLessThanOrEqual(sr[1]);
    }
  });
});
