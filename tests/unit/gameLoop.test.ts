import { describe, expect, it } from 'vitest';
import { GameLoop, SPEED_MAX } from '@/app/GameLoop';

const DT = 1 / 240;

function makeLoop(stepCostMs = 0) {
  let clock = 0;
  const log = { steps: 0, renders: 0, draws: 0 };
  const loop = new GameLoop(
    {
      step: () => {
        log.steps++;
        clock += stepCostMs;
      },
      render: (info) => {
        log.renders++;
        if (info.draw) log.draws++;
      },
    },
    DT,
    () => clock,
  );
  return { loop, log };
}

/** 60fps で frames フレーム回す */
function run(loop: GameLoop, frames: number) {
  for (let i = 0; i <= frames; i++) loop.tick((i * 1000) / 60);
}

describe('GameLoop', () => {
  it('等倍では 1 秒で 240 ステップ進む', () => {
    const { loop, log } = makeLoop();
    run(loop, 60);
    expect(log.steps).toBe(240);
    expect(log.renders).toBe(61);
  });

  it('speed 倍でシミュレーション時間が進む', () => {
    const { loop, log } = makeLoop();
    loop.speed = 10;
    run(loop, 60);
    expect(log.steps).toBe(2400);
  });

  it('一時停止中は進まない', () => {
    const { loop, log } = makeLoop();
    loop.paused = true;
    run(loop, 30);
    expect(log.steps).toBe(0);
    expect(log.renders).toBe(31);
  });

  it('予算を超えたら残りを捨てる', () => {
    const { loop, log } = makeLoop(1); // 1 ステップ 1ms
    loop.stepBudgetMs = 10;
    loop.speed = 100;
    loop.tick(0);
    const steps = loop.tick(1000 / 60);
    expect(steps).toBe(10);
    expect(loop.saturated).toBe(true);
    // 次のフレームで溜まった分をまとめて処理しようとしない
    loop.tick((2 * 1000) / 60);
    expect(log.steps).toBe(20);
  });

  it('最大速度では予算いっぱいまで進め、描画を間引く', () => {
    const { loop, log } = makeLoop(0.5);
    loop.stepBudgetMs = 12;
    loop.speed = SPEED_MAX;
    loop.maxSpeedRenderInterval = 3;
    run(loop, 29);
    expect(log.steps).toBe(30 * 24);
    expect(log.draws).toBe(10);
  });

  it('長い停止のあとでも経過時間は 0.1 秒で打ち切る', () => {
    const { loop, log } = makeLoop();
    loop.tick(0);
    loop.tick(5000);
    expect(log.steps).toBe(24);
  });

  it('ステップの中で減速・一時停止されたら、そのフレームの残りは進めない', () => {
    let clock = 0;
    let steps = 0;
    const loop: GameLoop = new GameLoop(
      {
        step: () => {
          steps++;
          clock += 0.01;
          if (steps === 5) loop.speed = 1;
          if (steps === 50) loop.paused = true;
        },
        render: () => {},
      },
      DT,
      () => clock,
    );
    loop.speed = SPEED_MAX;
    loop.tick(0);
    expect(steps).toBe(5);
    loop.speed = SPEED_MAX;
    loop.tick(1000 / 60);
    expect(steps).toBe(50);
    loop.tick(2000 / 60);
    expect(steps).toBe(50);
  });
});
