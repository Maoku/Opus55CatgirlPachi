import { expect, test } from '@playwright/test';

test('入賞でパーティクルが出て、大当りでフラッシュする', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
  const particles = await page.evaluate(() => {
    const a = window.__pachi!;
    a.game.bus.emit('pocket', { ballId: 0, objectId: 'pocket-start', kind: 'start', payout: 3 });
    return a.effects.particleCount;
  });
  expect(particles).toBeGreaterThan(5);

  const flashed = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const a = window.__pachi!;
        const m = a.game.machine;
        a.loop.speed = 30;
        m.bus.on('jackpotStart', () => {
          a.loop.speed = 1;
          // 次の描画でフラッシュ用のスプライトが見えている
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              resolve(a.renderer.fxSprites.sprites.some((s) => s.visible && s.additive)),
            ),
          );
        });
        a.game.forceJackpot();
      }),
  );
  expect(flashed).toBe(true);
  await page.screenshot({ path: 'Docs/screenshots/phase8-flash.png' });
});
