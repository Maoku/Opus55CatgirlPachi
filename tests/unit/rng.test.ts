import { describe, expect, it } from 'vitest';
import { hashSeed, SeededRng } from '@/core/SeededRng';

describe('SeededRng', () => {
  it('同じシードなら同じ列を返す', () => {
    const a = new SeededRng(12345);
    const b = new SeededRng(12345);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('シードが違えば列も違う', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    const same = Array.from({ length: 100 }, () => a.nextU32() === b.nextU32()).filter(Boolean);
    expect(same.length).toBeLessThan(3);
  });

  it('next は [0, 1) に収まり、平均がほぼ 0.5', () => {
    const r = new SeededRng(99);
    let sum = 0;
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    // 標準誤差は sqrt(1/12/n) ≒ 0.00065。5σ を許容する
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.0033);
  });

  it('int は範囲内の値を一様に返す', () => {
    const r = new SeededRng(7);
    const counts = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) counts[r.int(10)]!++;
    // カイ二乗検定 (自由度 9、有意水準 0.1% の棄却限界 27.88)
    const expected = n / 10;
    const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    expect(chi2).toBeLessThan(27.88);
  });

  it('状態を保存・復元できる', () => {
    const r = new SeededRng(42);
    r.next();
    const state = r.getState();
    const a = [r.next(), r.next()];
    r.setState(state);
    expect([r.next(), r.next()]).toEqual(a);
  });

  it('fork は元の列に影響せず、ラベルごとに独立した列になる', () => {
    const r = new SeededRng(5);
    const x = r.fork('launcher');
    const y = r.fork('lottery');
    expect(x.nextU32()).not.toBe(y.nextU32());
    expect(new SeededRng(5).nextU32()).toBe(r.nextU32());
  });

  it('hashSeed は安定した値を返す', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });
});
