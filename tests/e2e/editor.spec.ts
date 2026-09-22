import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);
}

/** 盤面座標をページ上の座標に変換する */
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

async function firstNail(page: Page) {
  return page.evaluate(() => {
    const n = window.__pachi!.board.objects.find((o) => o.type === 'nail')!;
    return n as { id: string; x: number; y: number };
  });
}

async function nailById(page: Page, id: string) {
  return page.evaluate((nid) => {
    const n = window.__pachi!.board.objects.find((o) => o.id === nid);
    return n as { x: number; y: number } | undefined;
  }, id);
}

test('E でエディットモードに入り、釘をドラッグで動かして Undo / Redo できる', async ({ page }) => {
  await ready(page);
  await page.locator('#view').focus();
  await page.keyboard.press('e');
  expect(await page.evaluate(() => window.__pachi!.mode)).toBe('edit');

  // ズームしてから操作する
  const nail = await firstNail(page);
  const center = await toPage(page, nail.x, nail.y);
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, -600);
  const from = await toPage(page, nail.x, nail.y);
  const scale = await page.evaluate(() => window.__pachi!.renderer.camera.scale);
  expect(scale).toBeGreaterThan(1);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20 * scale, from.y + 10 * scale, { steps: 5 });
  await page.mouse.up();
  const moved = await nailById(page, nail.id);
  expect(moved!.x).toBeCloseTo(nail.x + 20, 0);
  expect(moved!.y).toBeCloseTo(nail.y + 10, 0);

  await page.keyboard.press('Control+z');
  expect(await nailById(page, nail.id)).toMatchObject({ x: nail.x, y: nail.y });
  await page.keyboard.press('Control+y');
  expect((await nailById(page, nail.id))!.x).toBeCloseTo(nail.x + 20, 0);

  // 矢印キーでの微調整
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowUp');
  const nudged = await nailById(page, nail.id);
  expect(nudged!.x).toBeCloseTo(nail.x + 19, 0);
  expect(nudged!.y).toBeCloseTo(nail.y, 0);
  await page.screenshot({ path: 'Docs/screenshots/phase4-editor.png' });

  // プレイに戻ると物理ワールドが作り直される
  await page.keyboard.press('e');
  expect(await page.evaluate(() => window.__pachi!.mode)).toBe('play');
});

test('何もない所からドラッグすると矩形選択になる', async ({ page }) => {
  await ready(page);
  await page.locator('#view').focus();
  await page.keyboard.press('e');
  // 役物の上の天釘を囲む
  const a = await toPage(page, 340, 250);
  const b = await toPage(page, 710, 322);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  const n = await page.evaluate(() => window.__pachi!.editor.selection.size);
  expect(n).toBeGreaterThan(3);
  await page.keyboard.press('Delete');
  const after = await page.evaluate(() => window.__pachi!.editor.selection.size);
  expect(after).toBe(0);
  await page.keyboard.press('Control+z');
  const count = await page.evaluate(() => window.__pachi!.board.objects.length);
  expect(count).toBeGreaterThan(n);
});

test('配置ツールとプロパティパネルで盤面を編集できる', async ({ page }) => {
  await ready(page);
  await page.locator('#view').focus();
  await page.keyboard.press('e');
  const count = () => page.evaluate(() => window.__pachi!.board.objects.length);
  const last = () => page.evaluate(() => window.__pachi!.board.objects.at(-1)!);
  const n0 = await count();

  // 釘
  await page.keyboard.press('n');
  let p = await toPage(page, 300, 760);
  await page.mouse.click(p.x, p.y);
  expect(await count()).toBe(n0 + 1);
  expect(await last()).toMatchObject({ type: 'nail' });

  // 壁 (3 点クリック → Enter)
  await page.keyboard.press('w');
  for (const [x, y] of [
    [300, 800],
    [360, 820],
    [420, 800],
  ]) {
    p = await toPage(page, x!, y!);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press('Enter');
  expect(await last()).toMatchObject({ type: 'wall', points: { length: 3 } });

  // 入賞口 (ドラッグで矩形)
  await page.keyboard.press('p');
  const a = await toPage(page, 500, 900);
  const b = await toPage(page, 540, 930);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
  expect(await last()).toMatchObject({ type: 'pocket', kind: 'start', payout: 3 });

  // プロパティパネルで賞球を変える
  const payout = page.locator('.props label.prop', { hasText: '賞球' }).locator('input');
  await payout.fill('5');
  await payout.press('Enter');
  expect(await last()).toMatchObject({ payout: 5 });

  // 複製と削除
  await page.locator('#view').focus();
  await page.keyboard.press('Control+d');
  expect(await count()).toBe(n0 + 4);
  await page.keyboard.press('Delete');
  expect(await count()).toBe(n0 + 3);
  await page.screenshot({ path: 'Docs/screenshots/phase4-tools.png' });
});

test('テスト発射で玉が出て、集計には含まれない', async ({ page }) => {
  await ready(page);
  await page.locator('#view').focus();
  await page.keyboard.press('e');
  await page.keyboard.press('t');
  await page.waitForFunction(() => window.__pachi!.physics.ballCount > 0, null, {
    timeout: 5000,
  });
  await page.keyboard.press('t');
  expect(await page.evaluate(() => window.__pachi!.game.launched)).toBe(0);
});
