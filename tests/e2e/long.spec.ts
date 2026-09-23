import { expect, test } from '@playwright/test';

/**
 * 長時間の自動プレイ (最大速度で 10 万発)。数分かかるので通常の E2E からは外し、
 * `npm run test:long` で実行する。メモリの増え方と玉の滞留を確認する。
 */
test('@long 最大速度で 10 万発打っても、メモリが増え続けず玉も滞留しない', async ({ page }) => {
  const shots = Number(process.env.LONG_SHOTS ?? 100_000);
  test.setTimeout(60 * 60 * 1000);
  await page.goto('/');
  await page.waitForFunction(() => (window.__pachi?.renderer.frames ?? 0) > 2);

  const heap = () =>
    page.evaluate(() => {
      (window as unknown as { gc?: () => void }).gc?.();
      return (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize;
    });

  await page.evaluate((n) => {
    window.__pachi!.startAutoPlay({
      maxShots: n,
      maxTime: null,
      leftStrength: 0.25,
      rightStrength: 0.9,
      autoSwitch: true,
      onEmpty: 'lend',
      maxInvest: 1e12,
      speed: 'max',
      seed: 20260923,
      initialBalls: 0,
    });
  }, shots);

  // 1 割進んだ時点のヒープを基準にする (JIT やキャッシュが落ち着いたあと)
  await page.waitForFunction((n) => window.__pachi!.game.launched >= n / 10, shots, {
    timeout: 0,
    polling: 1000,
  });
  const heapStart = await heap();
  const startedAt = Date.now();

  await page.waitForFunction(() => window.__pachi!.autoPlay.status === 'finished', null, {
    timeout: 0,
    polling: 1000,
  });
  const heapEnd = await heap();
  const report = await page.evaluate(() => window.__pachi!.autoPlay.report!);
  const summary = {
    shots: report.shots,
    simHours: +(report.simTime / 3600).toFixed(2),
    realMinutes: +((Date.now() - startedAt) / 60000).toFixed(1),
    spins: report.spins,
    jackpots: report.jackpots,
    rotationRate: report.rotationRate && +report.rotationRate.toFixed(2),
    payoutRate: report.payoutRate && +report.payoutRate.toFixed(3),
    lost: report.lost,
    history: report.history.length,
    heapStartMB: heapStart && +(heapStart / 1e6).toFixed(1),
    heapEndMB: heapEnd && +(heapEnd / 1e6).toFixed(1),
  };
  console.log(JSON.stringify(summary));

  expect(report.shots).toBe(shots);
  // 滞留や盤外で回収した玉がない
  expect(report.lost).toBe(0);
  expect(await page.evaluate(() => window.__pachi!.physics.ballCount)).toBe(0);
  // 推移の記録は間引かれて上限内に収まる
  expect(report.history.length).toBeLessThanOrEqual(4001);
  if (heapStart && heapEnd) {
    // 残り 9 割を打つあいだにヒープが大きく増えていない
    expect(heapEnd - heapStart).toBeLessThan(30e6);
  }
});
