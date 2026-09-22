import { describe, expect, it } from 'vitest';
import { analyzeBoard } from '@/board/analysis';
import { createDefaultBoard } from '@/board/defaultBoard';
import { Game } from '@/game/Game';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { loadRapier } from '@/physics/rapier';

async function play(
  strength: number,
  shots: number,
  opts: { lidsOpen?: boolean; seed?: number } = {},
) {
  const R = await loadRapier();
  const board = createDefaultBoard();
  const physics = new PhysicsWorld(R, board);
  if (opts.lidsOpen) {
    physics.setLidOpen('pocket-electric', true);
    physics.setLidOpen('pocket-attacker', true);
  }
  const game = new Game(physics, board, { seed: opts.seed ?? 1, initialBalls: 100_000 });
  let gates = 0;
  game.bus.on('gate', () => gates++);
  game.launcher.setStrength(strength);
  game.launcher.holding = true;
  const dt = board.physics.timestep;
  while (game.launched + game.fouls < shots) game.step(dt);
  game.launcher.holding = false;
  for (let i = 0; i < 240 * 20 && game.balls.count > 0; i++) game.step(dt);
  physics.dispose();
  return { game, gates };
}

describe('デフォルト盤面', () => {
  it('検証を通り、釘の重なりや遊技領域外のオブジェクトがない', () => {
    const board = createDefaultBoard();
    const warnings = analyzeBoard(board);
    expect(warnings).toEqual([]);
    const kinds = board.objects.flatMap((o) => (o.type === 'pocket' ? [o.kind] : []));
    for (const k of ['start', 'electric', 'attacker', 'general', 'out', 'foul'] as const) {
      expect(kinds).toContain(k);
    }
    expect(board.objects.some((o) => o.type === 'gate')).toBe(true);
    expect(board.objects.some((o) => o.type === 'display')).toBe(true);
  });

  it('左打ちでヘソに入賞し、玉が滞留しない', async () => {
    const { game, gates } = await play(0.25, 200);
    expect(game.pockets.start).toBeGreaterThan(0);
    expect(game.lost).toBe(0);
    expect(gates).toBe(0);
    expect(game.balls.count).toBe(0);
  }, 120_000);

  it('右打ちでは普図ゲートを通り、アウト口へ流れる (蓋が閉じているとき)', async () => {
    const { game, gates } = await play(0.9, 60);
    expect(gates).toBe(60);
    expect(game.pockets.start).toBe(0);
    expect(game.pockets.electric + game.pockets.attacker).toBe(0);
    expect(game.lost).toBe(0);
  }, 120_000);

  it('右打ちで蓋が開いていると電チュー・アタッカーに入賞する', async () => {
    const { game } = await play(0.9, 40, { lidsOpen: true });
    expect(game.pockets.electric + game.pockets.attacker).toBeGreaterThan(30);
    expect(game.lost).toBe(0);
  }, 120_000);
});
