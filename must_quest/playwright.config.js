// Playwright Test configuration.
// The same 16 tests run against two implementations, as two projects:
//   fixed  -> src/settlement.js         (corrected reference, all tests pass)
//   faulty -> src/settlement.faulty.js  (reproduces DEF 001, TC10 to TC13 fail)
// No browser is used: these are API level checks of the settlement logic.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0, // a retry would hide the very failure this suite is about
  reporter: [
    ['list'],
    ['html', { outputFolder: 'results/html_report', open: 'never' }],
  ],
  projects: [
    { name: 'fixed', use: { impl: 'fixed' } },
    { name: 'faulty', use: { impl: 'faulty' } },
  ],
});
