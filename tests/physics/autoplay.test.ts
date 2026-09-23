import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTO_CONFIG, type AutoPlayConfig } from '@/auto/AutoPlayConfig';
import { AutoPlayController, HISTORY_LIMIT } from '@/auto/AutoPlayController';
import { reportToCsv } from '@/auto/AutoPlayStats';
import { runHeadless } from '@/auto/runHeadless';
import { createDefaultBoard } from '@/board/defaultBoard';
import { Game } from '@/game/Game';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { loadRapier } from '@/physics/rapier';

/** App.startAutoPlay と同じ手順 (新しい物理ワールド + シードでリセット) で回す */
async function run(patch: Partial<AutoPlayConfig>, setup?: (g: Game) => void) {
  const R = await loadRapier();
  const board = createDefaultBoard();
  const config: AutoPlayConfig = { ...DEFAULT_AUTO_CONFIG, seed: 123, ...patch };
  const game = new Game(new PhysicsWorld(R, board), board, { seed: 1 });
  game.reset(config.seed!, config.initialBalls);
  const auto = new AutoPlayController(game);
  auto.begin(config, board.name);
  setup?.(game);
  const report = runHeadless(game, auto)!;
  game.physics.dispose();
  return { report, game, auto };
}

describe('自動プレイ', () => {
  it('1000 発を指定するとちょうど 1000 発で止まる', async () => {
    const { report, game } = await run({ maxShots: 1000, maxTime: null });
    expect(report.reason).toBe('shots');
    expect(report.shots).toBe(1000);
    // 止まったあとは盤面に玉が残っていない
    expect(game.balls.count).toBe(0);
    expect(report.history.at(-1)!.shots).toBe(1000);
  }, 120_000);

  it('60 秒を指定するとゲーム内時間 60 秒で止まる', async () => {
    const { report } = await run({ maxShots: null, maxTime: 60 });
    expect(report.reason).toBe('time');
    expect(report.simTime).toBeGreaterThan(60 - 1 / 240);
    expect(report.simTime).toBeLessThan(60 + 1 / 240);
    // 100 発/分なので 60 秒で 100 発 (ファールで戻った玉は発射数に含めない)
    const fired = report.shots + report.pockets.foul;
    expect(fired).toBeGreaterThanOrEqual(99);
    expect(fired).toBeLessThanOrEqual(101);
  }, 120_000);

  it('発射数と時間の両方を指定すると先に達したほうで止まる', async () => {
    const { report } = await run({ maxShots: 50, maxTime: 600 });
    expect(report.reason).toBe('shots');
    expect(report.shots).toBe(50);
  }, 120_000);

  it('同じシードと同じ盤面なら統計が同じになる', async () => {
    const a = await run({ maxShots: 400, seed: 777 });
    const b = await run({ maxShots: 400, seed: 777 });
    expect(JSON.stringify(b.report)).toBe(JSON.stringify(a.report));
    const c = await run({ maxShots: 400, seed: 778 });
    expect(JSON.stringify(c.report.history)).not.toBe(JSON.stringify(a.report.history));
  }, 120_000);

  it('持ち玉が切れると上限まで貸玉し、上限に達したら止まる', async () => {
    const { report } = await run({
      maxShots: 100_000,
      initialBalls: 0,
      onEmpty: 'lend',
      maxInvest: 2000,
      leftStrength: 0.1,
    });
    expect(report.reason).toBe('empty');
    expect(report.invested).toBe(2000);
    expect(report.lent).toBe(500);
    expect(report.finalHeld).toBe(0);
  }, 120_000);

  it('大当り中は右打ちに切り替わり、アタッカーに入賞する', async () => {
    const { report } = await run({ maxShots: 400, autoSwitch: true }, (g) => g.forceJackpot());
    expect(report.jackpots).toBeGreaterThanOrEqual(1);
    expect(report.pockets.attacker).toBeGreaterThan(30);
    expect(report.payoutByKind.attacker).toBe(report.pockets.attacker * 15);
  }, 120_000);

  it('レポートの集計値が整合している', async () => {
    const { report } = await run({ maxShots: 300 });
    expect(report.net).toBe(report.payout - report.shots);
    expect(report.payoutRate).toBeCloseTo(report.payout / report.shots);
    const sum = Object.values(report.payoutByKind).reduce((s, v) => s + v, 0);
    expect(sum).toBe(report.payout);
    const csv = reportToCsv(report).trim().split('\n');
    expect(csv[0]).toBe('time_s,shots,held,net,spins,jackpots,invested_yen');
    expect(csv.length).toBe(report.history.length + 1);
  }, 120_000);

  it('長時間でも持ち玉推移の点数は上限を超えず、時系列の順に並ぶ', async () => {
    // 右打ちは玉が早く抜けるので、長いゲーム内時間を短い実時間で回せる
    const { report } = await run({
      maxShots: null,
      maxTime: 3 * 3600,
      leftStrength: 0.9,
      maxInvest: 1e9,
    });
    expect(report.reason).toBe('time');
    expect(report.history.length).toBeLessThanOrEqual(HISTORY_LIMIT + 1);
    expect(report.history.length).toBeGreaterThan(HISTORY_LIMIT / 2);
    for (let i = 1; i < report.history.length; i++) {
      expect(report.history[i]!.t).toBeGreaterThan(report.history[i - 1]!.t);
    }
    expect(report.lost).toBe(0);
  }, 300_000);
});
