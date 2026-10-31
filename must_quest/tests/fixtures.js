// Shared fixtures for the settlement suite.
// `impl` is set per project in playwright.config.js, so the same tests run
// against the fixed and the faulty implementation.
// Each test gets a fresh ledger, gateway and notifier (no shared state).
import { test as base, expect } from '@playwright/test';
import { FakeLedger, FakePayoutGateway, FakeNotifier } from '../src/fakes.js';

export const test = base.extend({
  impl: ['fixed', { option: true }],

  runSettlement: async ({ impl }, use) => {
    const mod = await import(impl === 'faulty' ? '../src/settlement.faulty.js' : '../src/settlement.js');
    await use(mod.runSettlement);
  },

  // A small mutable bag so a test can swap in a gateway or notifier with failure modes.
  world: async ({}, use) => {
    const world = {
      ledger: new FakeLedger(),
      gateway: new FakePayoutGateway(),
      notifier: new FakeNotifier(),
      deps() { return { ledger: this.ledger, gateway: this.gateway, notifier: this.notifier }; },
    };
    await use(world);
  },
});

export { expect };
