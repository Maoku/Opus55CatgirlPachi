import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
}

test('盤面が WebGL で描画される', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  await expect(page).toHaveTitle('ねこみみパチンコ');
  const coverage = await page.evaluate(() => window.__pachi!.renderer.sampleCoverage());
  // 盤面画像が描かれていれば、画面の大半が暗くない画素になる
  expect(coverage.nonDark / coverage.total).toBeGreaterThan(0.3);
  expect(errors).toEqual([]);
});

test('Shift+クリックした位置に玉を落とせる', async ({ page }) => {
  await ready(page);
  const pos = await page.evaluate(() => {
    const a = window.__pachi!;
    const r = a.layout.canvas.getBoundingClientRect();
    const s = a.renderer.camera.boardToScreen(560, 400);
    return { x: r.left + s.x, y: r.top + s.y };
  });
  await page.keyboard.down('Shift');
  await page.mouse.click(pos.x, pos.y);
  await page.keyboard.up('Shift');
  expect(await page.evaluate(() => window.__pachi!.physics.ballCount)).toBe(1);
  // 玉は釘で跳ねて、やがてアウト口で回収される
  await page.waitForFunction(() => window.__pachi!.game.pockets.out >= 1, null, {
    timeout: 20_000,
  });
});

test('Space を押しているあいだ発射し、持ち玉が減る', async ({ page }) => {
  await ready(page);
  const before = await page.evaluate(() => window.__pachi!.game.held);
  await page.locator('#view').focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(2000);
  await page.keyboard.up('Space');
  const g = await page.evaluate(() => {
    const game = window.__pachi!.game;
    return { held: game.held, launched: game.launched, fouls: game.fouls };
  });
  // 0.6 秒間隔なので 2 秒で 3〜4 発
  expect(g.launched + g.fouls).toBeGreaterThanOrEqual(3);
  expect(g.held).toBe(before - g.launched);
  await page.screenshot({ path: 'Docs/screenshots/phase3-play.png' });
});

test('強度はキーとスライダーで変えられる', async ({ page }) => {
  await ready(page);
  await page.locator('#view').focus();
  const s0 = await page.evaluate(() => window.__pachi!.game.launcher.strength);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+ArrowUp');
  const s1 = await page.evaluate(() => window.__pachi!.game.launcher.strength);
  expect(s1).toBeCloseTo(s0 + 0.06);
  await page.locator('input.strength').fill('80');
  expect(await page.evaluate(() => window.__pachi!.game.launcher.strength)).toBeCloseTo(0.8);
  await page.keyboard.press('f');
  expect(await page.evaluate(() => window.__pachi!.game.launcher.locked)).toBe(true);
});

test('リサイズに追従する', async ({ page }) => {
  await ready(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await expect
    .poll(() => page.evaluate(() => window.__pachi!.renderer.camera.viewH))
    .toBeLessThanOrEqual(600);
});
