import { describe, expect, it } from 'vitest';
import { buildRails, createSampleBoard } from '@/board/sampleBoard';
import type { BoardData } from '@/board/types';
import { SeededRng } from '@/core/SeededRng';
import { Game } from '@/game/Game';
import { Launcher } from '@/game/Launcher';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { loadRapier } from '@/physics/rapier';

/** レールだけの盤面 (釘による散らばりを除いて、発射装置とレールの性質だけを見る) */
function railsOnlyBoard(): BoardData {
  const board = createSampleBoard();
  const rails = buildRails();
  board.objects = [
    ...rails.walls,
    rails.foul,
    ...board.objects.filter((o) => o.type === 'pocket' && o.kind === 'out'),
  ];
  return board;
}

/**
 * 1 発打って、玉がレールを離れて落ち始めた位置を調べる。
 * 外レールに沿って進んだ角度 (左端 = 0°、真上 = 90°、右端 = 180°) を返す。
 * ファールなら -1。
 */
async function reachAngle(board: BoardData, strength: number, seed: number): Promise<number> {
  const R = await loadRapier();
  const w = new PhysicsWorld(R, board);
  const order = new Launcher(board.launcher, new SeededRng(seed)).makeOrder(strength);
  const id = w.spawnBall(order.x, order.y, order.vx, order.vy);
  let best = -1;
  for (let i = 0; i < 240 * 4; i++) {
    w.step();
    if (w.drainEvents().some((e) => e.type === 'pocket' && e.kind === 'foul')) break;
    const b = w.getBall(id);
    if (!b) break;
    // 円の中心から見た角度で、どこまで回ったかを測る
    if (b.y < 700) {
      const a = (Math.atan2(700 - b.y, b.x - 560) * 180) / Math.PI;
      best = Math.max(best, 180 - a);
    }
  }
  w.dispose();
  return best;
}

describe('発射とレール', () => {
  it('強度を上げるほど玉は遠くまで届く (単調)', async () => {
    const board = railsOnlyBoard();
    const means: number[] = [];
    for (const s of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
      let sum = 0;
      for (let seed = 1; seed <= 3; seed++) sum += await reachAngle(board, s, seed);
      means.push(sum / 3);
    }
    for (let i = 1; i < means.length; i++) {
      expect(means[i]!).toBeGreaterThanOrEqual(means[i - 1]! - 1);
    }
    // 弱いと左側で落ち、強いと右側 (右打ち) まで届く
    expect(means[0]!).toBeLessThan(60);
    expect(means[means.length - 1]!).toBeGreaterThan(170);
  });

  it('強度 0 ではファールになり、玉は持ち玉に戻る', async () => {
    const R = await loadRapier();
    const board = createSampleBoard();
    const game = new Game(new PhysicsWorld(R, board), board, { seed: 1, initialBalls: 10 });
    game.launcher.setStrength(0);
    game.launcher.holding = true;
    for (let i = 0; i < 240 * 0.3; i++) game.step(1 / 240);
    game.launcher.holding = false;
    for (let i = 0; i < 240 * 3; i++) game.step(1 / 240);
    expect(game.fouls).toBe(1);
    expect(game.launched).toBe(0);
    expect(game.held).toBe(10);
    game.physics.dispose();
  });

  it('1 分間に 100 発打て、最高速で 1000 発打っても盤外に出る玉はない', async () => {
    const R = await loadRapier();
    const board = createSampleBoard();
    const game = new Game(new PhysicsWorld(R, board), board, { seed: 7, initialBalls: 2000 });
    game.launcher.setStrength(1);
    game.launcher.holding = true;
    const dt = board.physics.timestep;
    for (let i = 0; i < Math.round(60 / dt); i++) game.step(dt);
    expect(game.launched + game.fouls).toBe(100);
    // 残り 900 発
    game.launcher.def = { ...game.launcher.def, rate: 600 };
    while (game.launched + game.fouls < 1000) game.step(dt);
    game.launcher.holding = false;
    for (let i = 0; i < Math.round(20 / dt) && game.balls.count > 0; i++) game.step(dt);
    expect(game.balls.count).toBe(0);
    expect(game.lost).toBe(0);
    expect(game.pockets.out + game.fouls).toBe(1000);
    game.physics.dispose();
  }, 120_000);
});

describe('テスト発射', () => {
  it('玉は打つが、発射数・持ち玉・入賞の集計には含めない', async () => {
    const R = await loadRapier();
    const board = createSampleBoard();
    const game = new Game(new PhysicsWorld(R, board), board, { seed: 3, initialBalls: 50 });
    game.launcher.setStrength(0.5);
    let spawned = 0;
    game.bus.on('pocket', () => spawned++);
    for (let i = 0; i < 240 * 3; i++) game.testStep(1 / 240, true);
    expect(game.balls.count).toBeGreaterThan(0);
    for (let i = 0; i < 240 * 10; i++) game.testStep(1 / 240, false);
    expect(game.balls.count).toBe(0);
    expect(game.launched).toBe(0);
    expect(game.held).toBe(50);
    expect(game.pockets.out).toBe(0);
    expect(spawned).toBe(0);
    game.physics.dispose();
  });
});
