import { describe, expect, it } from 'vitest';
import type { BoardObject } from '@/board/types';
import { makeWorld } from './helpers';

describe('処理性能', () => {
  it('玉 200 個・釘 500 本でも、等倍 60fps に必要な物理の処理時間に十分収まる', async () => {
    const nails: BoardObject[] = [];
    for (let row = 0; row < 20; row++) {
      for (let i = 0; i < 25; i++) {
        nails.push({
          id: `nail-${row * 25 + i}`,
          type: 'nail',
          x: 60 + i * 36 + (row % 2) * 18,
          y: 150 + row * 36,
          r: 1.95,
        });
      }
    }
    const floor: BoardObject = {
      id: 'wall-f',
      type: 'wall',
      closed: false,
      material: 'rail',
      points: [
        { x: 0, y: 880 },
        { x: 500, y: 960 },
        { x: 1000, y: 880 },
      ],
    };
    const w = await makeWorld([...nails, floor]);
    w.params.maxBalls = 1000;
    w.params.stallTime = 1e9;
    let n = 0;
    const keep = () => {
      while (w.ballCount < 200) w.spawnBall(80 + ((n++ * 37) % 840), 110, 0, 0);
    };
    // 玉が盤面に行き渡るまで進める
    for (let i = 0; i < 240 * 5; i++) {
      keep();
      w.step();
      w.drainEvents();
    }
    const steps = 240 * 5;
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) {
      keep();
      w.step();
      w.drainEvents();
    }
    const msPerStep = (performance.now() - t0) / steps;
    w.dispose();
    // 等倍 60fps は 1 フレーム 4 ステップ。1 ステップ 1ms なら 4ms で、予算 (12ms) に収まる
    expect(msPerStep).toBeLessThan(1);
  }, 120_000);
});
