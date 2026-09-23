import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEC } from '@/game/GameSpec';
import { isReachShowing, REACH_TIME, reelFrames, reelStopTimes } from '@/game/ReelModel';

const spin = (elapsed: number, reach = false, duration = 8) => ({
  duration,
  reach,
  elapsed,
  symbols: [3, 8, reach ? 3 : 5] as [number, number, number],
});

describe('リールの見え方', () => {
  it('止まる順は 左 → 右 → 中、最後は変動時間ちょうど', () => {
    const [l, c, r] = reelStopTimes(spin(0));
    expect(l).toBeLessThan(r);
    expect(r).toBeLessThan(c);
    expect(c).toBe(8);
  });

  it('開始直後はすべて回っていて、止まる時刻には停止図柄になる', () => {
    expect(reelFrames(spin(0)).every((f) => !f.stopped)).toBe(true);
    const end = reelFrames(spin(8));
    expect(end.map((f) => f.symbol)).toEqual([3, 8, 5]);
    expect(end.every((f) => f.stopped && f.offset === 0)).toBe(true);
  });

  it('止まる直前は停止図柄が上から流れてきて中央に入る', () => {
    const [left] = reelStopTimes(spin(0));
    const f = reelFrames(spin(left - 0.01))[0]!;
    expect(f.stopped).toBe(false);
    expect(f.next).toBe(3);
    // 停止図柄は中央のすぐ上 (offset - 1 がわずかに負) にある
    expect(f.offset).toBeGreaterThan(0.8);
    expect(f.offset).toBeLessThan(1);
    // 少し前は 1 つ前の図柄が上から来ている
    const g = reelFrames(spin(left - 0.1))[0]!;
    expect(g.next).toBe(2);
  });

  it('スクロールは連続している (図柄の切り替わりで位置が飛ばない)', () => {
    // 帯の位置 = symbol + offset が時間に対して単調に増える
    let prev = -Infinity;
    for (let t = 0; t < 3.9; t += 0.002) {
      const f = reelFrames(spin(t))[0]!;
      const unwrapped = f.symbol + f.offset;
      const pos =
        unwrapped < prev - 5 ? unwrapped + 9 * Math.ceil((prev - unwrapped) / 9) : unwrapped;
      expect(pos).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = pos;
    }
  });

  it('図柄は 1〜9 の範囲で折り返す', () => {
    for (let t = 0; t < 8; t += 0.05) {
      for (const f of reelFrames(spin(t)).filter((x) => !x.stopped)) {
        expect(f.symbol).toBeGreaterThanOrEqual(1);
        expect(f.symbol).toBeLessThanOrEqual(9);
        expect(f.next).toBe((f.symbol % 9) + 1);
      }
    }
  });

  it('リーチは左右が止まってから中リールが止まるまで表示する', () => {
    const d = 20;
    const [, , right] = reelStopTimes(spin(0, true, d));
    expect(isReachShowing(spin(right - 0.1, true, d))).toBe(false);
    expect(isReachShowing(spin(right + 0.1, true, d))).toBe(true);
    expect(isReachShowing(spin(d, true, d))).toBe(false);
    expect(isReachShowing(spin(7, false))).toBe(false);
  });

  it('リーチになってから中リールが止まるまでは REACH_TIME 秒', () => {
    for (const [lo, hi] of [DEFAULT_SPEC.variation.reach, DEFAULT_SPEC.variation.supportReach]) {
      for (const d of [lo, hi]) {
        const [left, center, right] = reelStopTimes(spin(0, true, d));
        expect(center - right).toBeCloseTo(REACH_TIME);
        expect(left).toBeGreaterThan(0);
        expect(left).toBeLessThan(right);
      }
    }
  });
});
