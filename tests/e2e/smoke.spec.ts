import { expect, test } from '@playwright/test';

test('トップページが開く', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('ねこみみパチンコ');
});
