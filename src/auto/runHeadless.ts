import type { Game } from '@/game/Game';
import type { AutoPlayController } from './AutoPlayController';
import type { AutoPlayReport } from './AutoPlayStats';

/**
 * 描画なしで自動プレイを最後まで回す (テストや釘の調整用)。
 * maxSimSeconds を超えたら打ち切って null を返す。
 */
export function runHeadless(
  game: Game,
  auto: AutoPlayController,
  maxSimSeconds = 3600 * 24,
): AutoPlayReport | null {
  const dt = game.physics.params.timestep;
  while (auto.status === 'running' || auto.status === 'draining') {
    auto.beforeStep();
    game.step(dt);
    auto.afterStep(dt);
    if (game.time > maxSimSeconds) return null;
  }
  return auto.report;
}
