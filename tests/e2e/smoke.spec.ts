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

test('クリックした位置に玉を落とせる', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
  const pos = await page.evaluate(() => {
    const a = window.__pachi!;
    const r = a.layout.canvas.getBoundingClientRect();
    const s = a.renderer.camera.boardToScreen(560, 330);
    return { x: r.left + s.x, y: r.top + s.y };
  });
  await page.mouse.click(pos.x, pos.y);
  expect(await page.evaluate(() => window.__pachi!.physics.ballCount)).toBe(1);
  // 玉は釘で跳ねて、やがてアウト口で回収される
  await page.waitForFunction(() => window.__pachi!.collected.pocket >= 1, null, {
    timeout: 20_000,
  });
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
