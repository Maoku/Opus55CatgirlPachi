import { describe, expect, it } from 'vitest';
import { createDefaultBoard } from '@/board/defaultBoard';
import type { PocketKind } from '@/board/types';
import { Game } from '@/game/Game';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { loadRapier } from '@/physics/rapier';

async function makeGame() {
  const R = await loadRapier();
  const board = createDefaultBoard();
  const game = new Game(new PhysicsWorld(R, board), board, { seed: 9 });
  /** 発射した玉が入賞口に入ったことにする */
  const enter = (kind: PocketKind, objectId = `pocket-${kind}`) => {
    const rec = game.balls.launch(game.launcher.makeOrder(0.3), game.time, true)!;
    game.held--;
    game.launched++;
    const payout = board.objects.find((o) => o.id === objectId);
    game.handle([
      {
        type: 'pocket',
        ballId: rec.id,
        objectId,
        kind,
        payout: payout?.type === 'pocket' ? payout.payout : 0,
      },
    ]);
  };
  return { game, board, enter };
}

describe('賞球と抽選の連動', () => {
  it('入賞口ごとの賞球を払い出す', async () => {
    const { game, enter } = await makeGame();
    const held0 = game.held;
    enter('start');
    enter('general', 'pocket-general-1');
    enter('electric');
    enter('attacker');
    enter('out');
    // 5 発打って 3 + 10 + 1 + 15 + 0 = 29 個戻る
    expect(game.held).toBe(held0 - 5 + 29);
    expect(game.payout).toBe(29);
    expect(game.net).toBe(29 - 5);
    expect(game.payoutByKind).toMatchObject({ start: 3, general: 10, electric: 1, attacker: 15 });
    game.physics.dispose();
  });

  it('ヘソ・電チュー入賞で保留が増え、上限を超えた分は保留されない (賞球は出る)', async () => {
    const { game, enter } = await makeGame();
    for (let i = 0; i < 3; i++) enter('start');
    for (let i = 0; i < 3; i++) enter('electric');
    expect(game.machine.holds).toHaveLength(4);
    expect(game.payoutByKind.start + game.payoutByKind.electric).toBe(3 * 3 + 3 * 1);
    game.physics.dispose();
  });

  it('大当りラウンド中はアタッカーの蓋が物理ワールドで開き、入賞で数える', async () => {
    const { game, enter } = await makeGame();
    game.forceJackpot();
    const dt = 1 / 240;
    for (let i = 0; i < 240 * 60 && game.machine.jackpot?.phase !== 'round'; i++) game.update(dt);
    expect(game.machine.jackpot?.phase).toBe('round');
    expect(game.physics.isLidOpen('pocket-attacker')).toBe(true);
    for (let i = 0; i < 3; i++) enter('attacker');
    expect(game.machine.jackpot!.count).toBe(3);
    expect(game.jackpots).toBe(1);
    expect(game.firstHits).toBe(1);
    game.physics.dispose();
  });

  it('盤面を作り直しても蓋の状態を引き継ぐ', async () => {
    const R = await loadRapier();
    const { game, board } = await makeGame();
    game.forceJackpot();
    for (let i = 0; i < 240 * 60 && game.machine.jackpot?.phase !== 'round'; i++)
      game.update(1 / 240);
    const next = new PhysicsWorld(R, board);
    game.physics.dispose();
    game.setBoard(next, board);
    expect(next.isLidOpen('pocket-attacker')).toBe(true);
    expect(next.isLidOpen('pocket-electric')).toBe(false);
    next.dispose();
  });

  it('貸玉で持ち玉と投資額が増える', async () => {
    const { game } = await makeGame();
    const held0 = game.held;
    game.lend();
    game.lend();
    expect(game.held).toBe(held0 + 500);
    expect(game.invested).toBe(2000);
    expect(game.lent).toBe(500);
    game.physics.dispose();
  });
});
