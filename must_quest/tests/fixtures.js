import { test as base, expect } from '@playwright/test';
import { FakeLedger, FakePayoutGateway, FakeNotifier } from '../src/fakes.js';

export const test = base.extend({
  impl: ['fixed', { option: true }],

  runSettlement: async ({ impl }, use) => {
    const mod = await import(impl === 'faulty' ? '../src/settlement.faulty.js' : '../src/settlement.js');
    await use(mod.runSettlement);
  },

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
