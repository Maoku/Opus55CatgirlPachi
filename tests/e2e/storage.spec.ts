import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
}

async function enterEdit(page: Page) {
  await page.locator('#view').focus();
  await page.keyboard.press('e');
}

async function addNailAt(page: Page, x: number, y: number) {
  const p = await page.evaluate(
    ([bx, by]) => {
      const a = window.__pachi!;
      const r = a.layout.canvas.getBoundingClientRect();
      const s = a.renderer.camera.boardToScreen(bx!, by!);
      return { x: r.left + s.x, y: r.top + s.y };
    },
    [x, y],
  );
  await page.keyboard.press('n');
  await page.mouse.click(p.x, p.y);
}

const objectCount = (page: Page) => page.evaluate(() => window.__pachi!.board.objects.length);

test('編集した盤面は自動保存され、再読み込みしても残る', async ({ page }) => {
  await ready(page);
  await enterEdit(page);
  const n0 = await objectCount(page);
  await addNailAt(page, 320, 780);
  await expect(page.locator('.file-status')).toContainText('自動保存しました');
  await page.reload();
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
  expect(await objectCount(page)).toBe(n0 + 1);
});

test('JSON を書き出して読み込むと同じ盤面になる', async ({ page }) => {
  await ready(page);
  await enterEdit(page);
  await addNailAt(page, 330, 790);
  const before = await page.evaluate(() => JSON.stringify(window.__pachi!.board));

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON を書き出す' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const exported = readFileSync(path, 'utf8');
  expect(JSON.parse(exported)).toEqual(JSON.parse(before));

  // デフォルトに戻してから、書き出したファイルを読み込む
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'デフォルトに戻す' }).click();
  expect(await page.evaluate(() => JSON.stringify(window.__pachi!.board))).not.toBe(before);
  await page.locator('input[type=file]').setInputFiles({
    name: 'board.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exported),
  });
  await expect(page.locator('.file-message')).toContainText('読み込みました');
  expect(await page.evaluate(() => JSON.stringify(window.__pachi!.board))).toBe(before);

  // 読込は Undo で取り消せる
  await page.locator('#view').focus();
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => JSON.stringify(window.__pachi!.board))).not.toBe(before);
});

test('不正な JSON は読み込まずにエラーを表示する', async ({ page }) => {
  await ready(page);
  await enterEdit(page);
  const before = await page.evaluate(() => JSON.stringify(window.__pachi!.board));
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":1,"objects":[{"type":"nail"}]}'),
  });
  await expect(page.locator('.file-message.ng')).toContainText('読み込めませんでした');
  expect(await page.evaluate(() => JSON.stringify(window.__pachi!.board))).toBe(before);
});
