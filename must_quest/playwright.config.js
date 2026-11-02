import { defineConfig } from '@playwright/test';

// same tests run on fixed and faulty code
export default defineConfig({
  testDir: './tests',
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'results/html_report', open: 'never' }]],
  projects: [
    { name: 'fixed' },
    { name: 'faulty' },
  ],
});
