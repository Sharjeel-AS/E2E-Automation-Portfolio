import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'results/html_report', open: 'never' }],
  ],
  projects: [
    { name: 'fixed', use: { impl: 'fixed' } },
    { name: 'faulty', use: { impl: 'faulty' } },
  ],
});
