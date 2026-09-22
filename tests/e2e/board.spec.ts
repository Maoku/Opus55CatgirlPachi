import { expect, test } from '@playwright/test';

test('デフォルト盤面の当たり判定が画像に重なって表示される', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
  const info = await page.evaluate(() => {
    const a = window.__pachi!;
    return { name: a.board.name, objects: a.board.objects.length };
  });
  expect(info.name).toContain('デフォルト');
  expect(info.objects).toBeGreaterThan(40);

  await page.locator('#view').focus();
  await page.keyboard.press('e');
  await page.evaluate(() => window.__pachi!.editor.updateSettings({ showGaps: true }));
  await page.waitForTimeout(200);
  await page.locator('.stage').screenshot({ path: 'Docs/screenshots/phase5-board-colliders.png' });

  // 左打ちで玉が流れる様子
  await page.keyboard.press('e');
  await page.evaluate(() => {
    const g = window.__pachi!.game;
    g.launcher.setStrength(0.25);
    g.launcher.locked = true;
  });
  await page.waitForTimeout(4000);
  await page.locator('.stage').screenshot({ path: 'Docs/screenshots/phase5-board-play.png' });
  expect(await page.evaluate(() => window.__pachi!.game.launched)).toBeGreaterThan(3);
});
