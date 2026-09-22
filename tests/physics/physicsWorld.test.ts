import { describe, expect, it } from 'vitest';
import type { BoardObject } from '@/board/types';
import { makeWorld, stepFor } from './helpers';

/** 左右と底を壁で囲ったカップ */
function cup(x: number, y: number, w: number, h: number): BoardObject {
  return {
    id: 'wall-cup',
    type: 'wall',
    closed: false,
    material: 'rail',
    points: [
      { x: x - w / 2, y: y - h },
      { x: x - w / 2, y },
      { x: x + w / 2, y },
      { x: x + w / 2, y: y - h },
    ],
  };
}

describe('PhysicsWorld', () => {
  it('落とした玉は重力で落ちる', async () => {
    const w = await makeWorld([]);
    const id = w.spawnBall(500, 100, 0, 0);
    stepFor(w, 0.2);
    const b = w.getBall(id)!;
    // 減衰を無視した自由落下: 0.5 * 980 * 0.2^2 = 19.6 cm
    const fallenCm = (b.y - 100) / w.units.pxPerCm;
    expect(fallenCm).toBeGreaterThan(17);
    expect(fallenCm).toBeLessThan(20);
    w.dispose();
  });

  it('最高速の玉を薄い壁に当ててもすり抜けない', async () => {
    const wall: BoardObject = {
      id: 'wall-1',
      type: 'wall',
      closed: false,
      material: 'rail',
      points: [
        { x: 0, y: 600 },
        { x: 1000, y: 600 },
      ],
    };
    const w = await makeWorld([wall]);
    const ids: number[] = [];
    for (let i = 0; i < 40; i++) {
      // 発射の最高速 520 cm/s の 2 倍までの速さで、斜めにも打ち込む
      const speed = 520 + i * 13;
      const angle = (Math.PI / 2) * (0.6 + (i % 5) * 0.1);
      ids.push(w.spawnBall(40 + i * 23, 500, Math.cos(angle) * speed, Math.sin(angle) * speed));
    }
    stepFor(w, 1.5);
    for (const id of ids) {
      const b = w.getBall(id);
      if (b) expect(b.y).toBeLessThan(600);
    }
    w.dispose();
  });

  it('高速の玉が釘の列をすり抜けない', async () => {
    // 中心間 20px (隙間は玉の直径 23.8px より狭い) の釘の列
    const nails: BoardObject[] = [];
    for (let i = 0; i < 50; i++) {
      nails.push({ id: `nail-${i + 1}`, type: 'nail', x: i * 20, y: 600, r: 1.95 });
    }
    const w = await makeWorld(nails, {});
    const ids: number[] = [];
    for (let i = 0; i < 30; i++) ids.push(w.spawnBall(100 + i * 25, 450, 0, 520 + i * 20));
    stepFor(w, 1);
    for (const id of ids) {
      const b = w.getBall(id);
      if (b) expect(b.y).toBeLessThan(600);
    }
    w.dispose();
  });

  it('入賞口に入った玉は回収され、イベントになる', async () => {
    const w = await makeWorld([
      cup(500, 520, 40, 60),
      {
        id: 'pocket-1',
        type: 'pocket',
        kind: 'start',
        rect: { x: 500, y: 495, w: 38, h: 50, angle: 0 },
        payout: 3,
      },
    ]);
    const id = w.spawnBall(500, 300, 0, 0);
    const events = stepFor(w, 1);
    expect(events).toContainEqual({
      type: 'pocket',
      ballId: id,
      objectId: 'pocket-1',
      kind: 'start',
      payout: 3,
    });
    expect(w.hasBall(id)).toBe(false);
    w.dispose();
  });

  it('ゲートを通過した玉はイベントになり、そのまま落ち続ける', async () => {
    const w = await makeWorld([
      { id: 'gate-1', type: 'gate', rect: { x: 500, y: 400, w: 40, h: 20, angle: 0 } },
    ]);
    const id = w.spawnBall(500, 300, 0, 0);
    const events = stepFor(w, 0.15);
    expect(events).toContainEqual({ type: 'gate', ballId: id, objectId: 'gate-1' });
    expect(w.hasBall(id)).toBe(true);
    expect(w.getBall(id)!.y).toBeGreaterThan(420);
    w.dispose();
  });

  it('遊技領域の外に出た玉は回収される', async () => {
    const w = await makeWorld([]);
    const id = w.spawnBall(500, 900, 0, 0);
    const events = stepFor(w, 1);
    expect(events).toContainEqual({ type: 'lost', ballId: id, reason: 'outside' });
    w.dispose();
  });

  it('動かなくなった玉は stallTime 後に回収される', async () => {
    const w = await makeWorld([cup(500, 600, 40, 60)]);
    w.params.stallTime = 1;
    const id = w.spawnBall(500, 560, 0, 0);
    const early = stepFor(w, 0.8);
    expect(early.some((e) => e.type === 'lost')).toBe(false);
    const events = stepFor(w, 1);
    expect(events).toContainEqual({ type: 'lost', ballId: id, reason: 'stall' });
    w.dispose();
  });

  it('蓋が閉じていると入賞せず、開くと入賞する', async () => {
    const w = await makeWorld([
      cup(500, 620, 60, 80),
      {
        id: 'pocket-a',
        type: 'pocket',
        kind: 'attacker',
        rect: { x: 500, y: 600, w: 58, h: 36, angle: 0 },
        payout: 15,
        lid: { x: 500, y: 560, w: 70, h: 6, angle: 0 },
      },
    ]);
    const first = w.spawnBall(500, 400, 0, 0);
    let events = stepFor(w, 0.8);
    expect(events.some((e) => e.type === 'pocket')).toBe(false);
    expect(w.getBall(first)!.y).toBeLessThan(560);
    w.setLidOpen('pocket-a', true);
    expect(w.isLidOpen('pocket-a')).toBe(true);
    events = stepFor(w, 0.8);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'pocket', ballId: first, objectId: 'pocket-a' }),
    );
    w.dispose();
  });

  it('玉に押されると風車が回る', async () => {
    const w = await makeWorld([
      { id: 'windmill-1', type: 'windmill', x: 500, y: 500, r: 26, blades: 4, damping: 0.5 },
    ]);
    const before: number[] = [];
    w.forEachWindmill((_, a) => before.push(a));
    w.spawnBall(510, 380, 0, 0);
    stepFor(w, 0.6);
    const after: number[] = [];
    w.forEachWindmill((_, a) => after.push(a));
    expect(Math.abs(after[0]! - before[0]!)).toBeGreaterThan(0.05);
    w.dispose();
  });

  it('同じ入力なら同じ結果になる (決定論)', async () => {
    const nails: BoardObject[] = [];
    for (let row = 0; row < 10; row++) {
      for (let i = 0; i < 20; i++) {
        nails.push({
          id: `nail-${row * 20 + i}`,
          type: 'nail',
          x: 100 + i * 40 + (row % 2) * 20,
          y: 200 + row * 40,
          r: 1.95,
        });
      }
    }
    const floor: BoardObject = {
      id: 'wall-floor',
      type: 'wall',
      closed: false,
      material: 'rail',
      points: [
        { x: 0, y: 700 },
        { x: 500, y: 900 },
        { x: 1000, y: 700 },
      ],
    };
    const run = async () => {
      const w = await makeWorld([...nails, floor]);
      for (let i = 0; i < 30; i++) w.spawnBall(300 + i * 13.7, 120, (i % 7) * 11 - 30, 50);
      stepFor(w, 2);
      const snap = w.snapshotBalls();
      w.dispose();
      return snap;
    };
    const a = await run();
    const b = await run();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('同時に存在できる玉の数には上限がある', async () => {
    const w = await makeWorld([]);
    w.params.maxBalls = 3;
    expect(w.spawnBall(100, 100, 0, 0)).toBeGreaterThan(0);
    w.spawnBall(200, 100, 0, 0);
    w.spawnBall(300, 100, 0, 0);
    expect(w.spawnBall(400, 100, 0, 0)).toBe(-1);
    w.dispose();
  });
});
