import { expect, test, type Page } from '@playwright/test';

async function waitReady(page: Page) {
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
}

async function toPage(page: Page, x: number, y: number) {
  return page.evaluate(
    ([bx, by]) => {
      const a = window.__pachi!;
      const r = a.layout.canvas.getBoundingClientRect();
      const s = a.renderer.camera.boardToScreen(bx!, by!);
      return { x: r.left + s.x, y: r.top + s.y };
    },
    [x, y],
  );
}

test('起動 → 発射 → エディット → 保存 → 自動プレイ → レポート', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // 起動: 盤面が描画される
  await page.goto('/');
  await waitReady(page);
  const coverage = await page.evaluate(() => window.__pachi!.renderer.sampleCoverage());
  expect(coverage.nonDark / coverage.total).toBeGreaterThan(0.3);

  // 発射: Space を押している間に打てる
  await page.locator('#view').focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.up('Space');
  const shot = await page.evaluate(
    () => window.__pachi!.game.launched + window.__pachi!.game.fouls,
  );
  expect(shot).toBeGreaterThanOrEqual(2);

  // エディット: 釘を 1 本足す
  await page.keyboard.press('e');
  const n0 = await page.evaluate(() => window.__pachi!.board.objects.length);
  await page.keyboard.press('n');
  const p = await toPage(page, 350, 800);
  await page.mouse.click(p.x, p.y);
  expect(await page.evaluate(() => window.__pachi!.board.objects.length)).toBe(n0 + 1);

  // 保存: 自動保存されて、再読み込みしても残る
  await expect(page.locator('.file-status')).toContainText('自動保存しました');
  await page.reload();
  await waitReady(page);
  expect(await page.evaluate(() => window.__pachi!.board.objects.length)).toBe(n0 + 1);

  // 自動プレイ: 200 発を最大速度で
  const auto = page.locator('.auto-panel');
  await auto.locator('.auto-form input[type=number]').first().fill('200');
  await auto.locator('select').selectOption('max');
  await auto.getByRole('button', { name: '開始' }).click();

  // レポート
  await expect(auto.locator('.report')).toBeVisible({ timeout: 90_000 });
  const report = await page.evaluate(() => window.__pachi!.autoPlay.report!);
  expect(report.shots).toBe(200);
  expect(report.lost).toBe(0);
  expect(report.boardName).toContain('デフォルト');
  await expect(auto.locator('.report-table').first()).toContainText('200 発');
  expect(errors).toEqual([]);
});
