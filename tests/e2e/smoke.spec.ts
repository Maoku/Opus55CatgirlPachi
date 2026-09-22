import { expect, test } from '@playwright/test';

test('盤面が WebGL で描画される', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle('ねこみみパチンコ');
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
  const coverage = await page.evaluate(() => window.__pachi!.renderer.sampleCoverage());
  // 盤面画像が描かれていれば、画面の大半が暗くない画素になる
  expect(coverage.nonDark / coverage.total).toBeGreaterThan(0.3);
  await page.screenshot({ path: 'Docs/screenshots/phase1-render.png' });
  expect(errors).toEqual([]);
});

test('リサイズに追従する', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForTimeout(200);
  const size = await page.evaluate(() => {
    const r = window.__pachi!.renderer;
    return { cw: r.camera.viewW, ch: r.camera.viewH };
  });
  expect(size.ch).toBeLessThanOrEqual(600);
  expect(size.cw).toBeLessThanOrEqual(900);
});
