import { defineConfig, devices, type Project } from '@playwright/test';

const PORT = 5174;
const viewport = { width: 1400, height: 900 };
// ヘッドレス環境でも WebGL2 を使えるようにソフトウェアレンダリングを許可する
const swiftshader = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

/**
 * E2E_BROWSERS=chromium,chrome,msedge,firefox のように指定すると、複数のブラウザで実行する
 * (chrome / msedge はインストール済みのブラウザ、firefox は `npx playwright install firefox` が必要)
 */
const browsers = (process.env.E2E_BROWSERS ?? 'chromium').split(',').map((s) => s.trim());

const all: Record<string, Project> = {
  chromium: {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], viewport, launchOptions: { args: swiftshader } },
  },
  chrome: {
    name: 'chrome',
    use: {
      ...devices['Desktop Chrome'],
      channel: 'chrome',
      viewport,
      launchOptions: { args: swiftshader },
    },
  },
  msedge: {
    name: 'msedge',
    use: {
      ...devices['Desktop Edge'],
      channel: 'msedge',
      viewport,
      launchOptions: { args: swiftshader },
    },
  },
  firefox: {
    name: 'firefox',
    use: { ...devices['Desktop Firefox'], viewport },
  },
};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    ...browsers.map((b) => {
      const p = all[b];
      if (!p) throw new Error(`不明なブラウザです: ${b}`);
      return { ...p, grepInvert: /@long/ };
    }),
    {
      // 長時間の自動プレイ (npm run test:long)。実 GPU があれば使い、GC を呼べるようにする
      name: 'long',
      grep: /@long/,
      use: {
        ...devices['Desktop Chrome'],
        viewport,
        launchOptions: {
          args: [
            '--use-angle=d3d11',
            '--enable-gpu',
            '--ignore-gpu-blocklist',
            '--js-flags=--expose-gc',
          ],
        },
      },
    },
  ],
});
