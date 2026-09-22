import { describe, expect, it } from 'vitest';
import { DEFAULT_LAUNCHER } from '@/board/types';
import { SeededRng } from '@/core/SeededRng';
import { Launcher } from '@/game/Launcher';

const DT = 1 / 240;

function makeLauncher() {
  return new Launcher({ ...DEFAULT_LAUNCHER }, new SeededRng(1));
}

describe('Launcher', () => {
  it('強度に対して初速は単調に増える', () => {
    const l = makeLauncher();
    let prev = -Infinity;
    for (let s = 0; s <= 1; s += 0.05) {
      const v = l.speedFor(s);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    expect(l.speedFor(0)).toBe(DEFAULT_LAUNCHER.speedMin);
    expect(l.speedFor(1)).toBe(DEFAULT_LAUNCHER.speedMax);
  });

  it('初速のばらつきは ±spread に収まる', () => {
    const l = makeLauncher();
    const base = l.speedFor(0.6);
    for (let i = 0; i < 1000; i++) {
      const o = l.makeOrder(0.6);
      expect(Math.abs(o.speed / base - 1)).toBeLessThanOrEqual(DEFAULT_LAUNCHER.spread + 1e-9);
      expect(Math.hypot(o.vx, o.vy)).toBeCloseTo(o.speed);
    }
  });

  it('押し続けると 1 分間にちょうど 100 発打つ', () => {
    const l = makeLauncher();
    l.holding = true;
    let shots = 0;
    for (let i = 0; i < 240 * 60; i++) if (l.update(DT)) shots++;
    expect(shots).toBe(100);
  });

  it('押していないときは打たず、発射固定なら押さなくても打つ', () => {
    const l = makeLauncher();
    let shots = 0;
    for (let i = 0; i < 240; i++) if (l.update(DT)) shots++;
    expect(shots).toBe(0);
    l.locked = true;
    for (let i = 0; i < 240 * 6; i++) if (l.update(DT)) shots++;
    expect(shots).toBe(10);
  });

  it('blocked のあいだは打たず、解除するとすぐ打てる', () => {
    const l = makeLauncher();
    l.holding = true;
    l.blocked = true;
    for (let i = 0; i < 240; i++) expect(l.update(DT)).toBeNull();
    l.blocked = false;
    expect(l.update(DT)).not.toBeNull();
  });

  it('強度は 0..1 に丸める', () => {
    const l = makeLauncher();
    l.setStrength(1.5);
    expect(l.strength).toBe(1);
    l.setStrength(-2);
    expect(l.strength).toBe(0);
  });
});
