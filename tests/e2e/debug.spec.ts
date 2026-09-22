import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
}

test('デバッグパネルで物理パラメータを変えると物理ワールドに反映される', async ({ page }) => {
  await ready(page);
  await page.locator('details.debug summary').click();
  await expect(page.locator('.perf')).toContainText('FPS');
  const gravity = page.locator('details.debug label.prop', { hasText: '重力' }).locator('input');
  await gravity.fill('500');
  await gravity.press('Enter');
  expect(await page.evaluate(() => window.__pachi!.board.physics.gravity)).toBe(500);
  // デバウンスのあとで物理ワールドが作り直される
  await expect.poll(() => page.evaluate(() => window.__pachi!.physics.params.gravity)).toBe(500);
  // エディタの「元に戻す」で取り消せる
  await page.evaluate(() => window.__pachi!.editor.undo());
  expect(await page.evaluate(() => window.__pachi!.board.physics.gravity)).toBe(980);
});

test('WebGL コンテキストを失っても、復帰すると描画が再開する', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const gl = window.__pachi!.renderer.gl;
    (window as unknown as { __lose: WEBGL_lose_context }).__lose =
      gl.getExtension('WEBGL_lose_context')!;
    (window as unknown as { __lose: WEBGL_lose_context }).__lose.loseContext();
  });
  await expect(page.locator('.context-lost')).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext(),
  );
  await expect(page.locator('.context-lost')).toBeHidden();
  const before = await page.evaluate(() => window.__pachi!.renderer.frames);
  await page.waitForFunction((n) => window.__pachi!.renderer.frames > n + 2, before);
  const coverage = await page.evaluate(() => window.__pachi!.renderer.sampleCoverage());
  expect(coverage.nonDark / coverage.total).toBeGreaterThan(0.3);
});
