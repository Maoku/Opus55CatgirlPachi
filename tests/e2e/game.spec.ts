import { expect, test } from '@playwright/test';

test('大当り → 10R → ST または時短 → 通常 が一通り動く', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
  await page.evaluate(() => {
    const a = window.__pachi!;
    const g = a.game;
    // 1 周を短く確認するため、ST・時短の回数を減らし、再度の大当りは起こさない
    g.spec.stSpins = 5;
    g.spec.jitanSpins = 5;
    g.spec.stJackpotProb = 0;
    g.spec.jackpotProb = 0;
    const w = window as unknown as { __modes: string[]; __rounds: number };
    w.__modes = [g.machine.mode];
    w.__rounds = 0;
    g.machine.bus.on('mode', ({ to }) => w.__modes.push(to));
    g.machine.bus.on('roundEnd', () => w.__rounds++);
    // カットインを確認できるよう、大当りの瞬間に等倍へ戻す
    g.machine.bus.on('jackpotStart', () => (a.loop.speed = 1));
    g.launcher.setStrength(0.9);
    g.launcher.locked = true;
    a.loop.speed = Infinity;
    g.forceJackpot();
  });
  await page.waitForFunction(
    () => (window as unknown as { __modes: string[] }).__modes.includes('jackpot'),
    null,
    { timeout: 60_000 },
  );
  // 大当りの直後はキャラクターのカットインが液晶に出る
  await page.waitForTimeout(700);
  const visible = await page.evaluate(
    () => window.__pachi!.displayLayer.sprites.filter((sp) => sp.visible).length,
  );
  expect(visible).toBe(3);
  await page.screenshot({ path: 'Docs/screenshots/phase6-cutin.png' });
  await page.evaluate(() => (window.__pachi!.loop.speed = Infinity));
  await page.waitForFunction(() => window.__pachi!.game.machine.jackpot?.phase === 'round', null, {
    timeout: 60_000,
  });
  await page.evaluate(() => (window.__pachi!.loop.speed = 1));
  await page.waitForTimeout(1500);
  await expect(page.locator('.mode-badge')).toHaveText('大当り');
  await expect(page.locator('.right-shot')).toBeVisible();
  await page.screenshot({ path: 'Docs/screenshots/phase6-jackpot.png' });
  await page.evaluate(() => (window.__pachi!.loop.speed = Infinity));

  await page.waitForFunction(
    () => {
      const m = (window as unknown as { __modes: string[] }).__modes;
      return m.length >= 4 && m.at(-1) === 'normal';
    },
    null,
    { timeout: 120_000 },
  );
  const result = await page.evaluate(() => {
    const w = window as unknown as { __modes: string[]; __rounds: number };
    const g = window.__pachi!.game;
    return {
      modes: w.__modes,
      rounds: w.__rounds,
      jackpots: g.jackpots,
      attacker: g.pockets.attacker,
    };
  });
  expect(result.modes[0]).toBe('normal');
  expect(result.modes[1]).toBe('jackpot');
  expect(['st', 'jitan']).toContain(result.modes[2]);
  expect(result.modes[3]).toBe('normal');
  expect(result.rounds).toBe(10);
  expect(result.jackpots).toBe(1);
  // 右打ちでアタッカーに入賞している
  expect(result.attacker).toBeGreaterThan(50);
});
