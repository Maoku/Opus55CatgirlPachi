import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
}

const panel = (page: Page) => page.locator('.auto-panel');

test('自動プレイ 100 発を最大速度で回し、レポートを表示・保存できる', async ({ page }) => {
  await ready(page);
  const p = panel(page);
  const shots = p.locator('.auto-form input[type=number]').first();
  await shots.fill('100');
  await p.locator('select').selectOption('max');
  await p.getByRole('button', { name: '開始' }).click();
  await expect(p.locator('.report')).toBeVisible({ timeout: 60_000 });
  const report = await page.evaluate(() => window.__pachi!.autoPlay.report!);
  expect(report.shots).toBe(100);
  expect(report.reason).toBe('shots');
  await expect(p.locator('.report-table').first()).toContainText('100 発');
  await p.locator('.report').screenshot({ path: 'Docs/screenshots/phase7-report.png' });

  const jsonDl = page.waitForEvent('download');
  await p.getByRole('button', { name: 'JSON で保存' }).click();
  const json = JSON.parse(readFileSync(await (await jsonDl).path(), 'utf8'));
  expect(json.shots).toBe(100);
  expect(json.history.length).toBeGreaterThan(2);

  const csvDl = page.waitForEvent('download');
  await p.getByRole('button', { name: 'CSV で保存' }).click();
  const csv = readFileSync(await (await csvDl).path(), 'utf8')
    .trim()
    .split('\n');
  expect(csv[0]).toContain('shots');
  expect(csv.length).toBe(json.history.length + 1);
});

test('10 倍速で動き、一時停止・再開・停止ができる', async ({ page }) => {
  await ready(page);
  const p = panel(page);
  await p.locator('.auto-form input[type=number]').first().fill('100000');
  await p.locator('select').selectOption('10');
  await p.getByRole('button', { name: '開始' }).click();
  const t0 = await page.evaluate(() => window.__pachi!.game.time);
  await page.waitForTimeout(1000);
  const t1 = await page.evaluate(() => window.__pachi!.game.time);
  // 実時間 1 秒でゲーム内時間が等倍よりはるかに進む (ソフトウェア描画でも 5 倍以上)
  expect(t1 - t0).toBeGreaterThan(5);

  await p.getByRole('button', { name: '一時停止' }).click();
  const paused = await page.evaluate(() => window.__pachi!.game.time);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pachi!.game.time)).toBe(paused);
  await p.getByRole('button', { name: '再開' }).click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pachi!.game.time)).toBeGreaterThan(paused);

  await p.getByRole('button', { name: '停止', exact: true }).click();
  await expect(p.locator('.report')).toBeVisible();
  expect(await page.evaluate(() => window.__pachi!.autoPlay.report!.reason)).toBe('manual');
});

test('エディタから自動プレイを起動できる', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    localStorage.setItem(
      'pachi.autoplay',
      JSON.stringify({ maxShots: 30, maxTime: null, speed: 'max', seed: 5 }),
    );
  });
  await page.reload();
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
  await page.locator('#view').focus();
  await page.keyboard.press('e');
  await page.getByRole('button', { name: 'この盤面で自動プレイ (前回の設定)' }).click();
  expect(await page.evaluate(() => window.__pachi!.mode)).toBe('play');
  await expect(panel(page).locator('.report')).toBeVisible({ timeout: 60_000 });
  const r = await page.evaluate(() => window.__pachi!.autoPlay.report!);
  expect(r.shots).toBe(30);
  expect(r.seed).toBe(5);
});
