// Regression suite for the weekly rewards settlement.
// Run against the corrected implementation:  npm test
// Run against the faulty implementation:     npm run test:faulty
//
// Assertions check gateway transfers (money that actually moved), not only the run report,
// because the faulty ledger overwrites entries and would hide a duplicate payout.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FakeLedger, FakePayoutGateway, FakeNotifier, GatewayCrash, GatewayTimeout } from '../src/fakes.js';
import { settlementWindow } from '../src/window.js';

const IMPL = process.env.IMPL === 'faulty' ? 'faulty' : 'fixed';
const { runSettlement } = await import(IMPL === 'faulty' ? '../src/settlement.faulty.js' : '../src/settlement.js');

// Run on Tuesday 27 Oct 2026 09:00 UTC settles [Mon 19 Oct 00:00 UTC, Mon 26 Oct 00:00 UTC)
const RUN_AT = '2026-10-27T09:00:00Z';
const NEXT_RUN_AT = '2026-11-03T09:00:00Z';

const task = (taskId, userId, completedAt, status = 'completed') => ({ taskId, userId, completedAt, status });

let ledger, gateway, notifier;
const deps = () => ({ ledger, gateway, notifier });

beforeEach(() => {
  ledger = new FakeLedger();
  gateway = new FakePayoutGateway();
  notifier = new FakeNotifier();
});

describe(`weekly settlement [${IMPL} implementation]`, () => {
  test('TC01 happy path: every qualifying task in the window is paid 10 credits and notified', async () => {
    const tasks = [
      task('T1', 'alice', '2026-10-20T10:00:00Z'),
      task('T2', 'alice', '2026-10-22T15:30:00Z'),
      task('T3', 'bilal', '2026-10-24T08:00:00Z'),
    ];
    const report = await runSettlement({ runAt: RUN_AT, tasks, ...deps() });
    assert.equal(report.windowId, '2026-10-19');
    assert.deepEqual(report.paid, ['T1', 'T2', 'T3']);
    assert.equal(gateway.totalFor('alice'), 20);
    assert.equal(gateway.totalFor('bilal'), 10);
    assert.equal(notifier.sent.length, 3);
  });

  test('TC02 lower boundary: Monday 00:00:00.000 UTC is included', async () => {
    await runSettlement({ runAt: RUN_AT, tasks: [task('T1', 'alice', '2026-10-19T00:00:00.000Z')], ...deps() });
    assert.equal(gateway.transfersForTask('T1').length, 1);
  });

  test('TC03 upper boundary: next Monday 00:00:00.000 UTC is excluded now and paid in the next run', async () => {
    const tasks = [task('T1', 'alice', '2026-10-26T00:00:00.000Z')];
    const first = await runSettlement({ runAt: RUN_AT, tasks, ...deps() });
    assert.deepEqual(first.outOfWindow, ['T1']);
    assert.equal(gateway.transfersForTask('T1').length, 0);

    const second = await runSettlement({ runAt: NEXT_RUN_AT, tasks, ...deps() });
    assert.equal(second.windowId, '2026-10-26');
    assert.equal(gateway.transfersForTask('T1').length, 1);
  });

  test('TC04 last millisecond before cut off (Sunday 23:59:59.999 UTC) is included', async () => {
    await runSettlement({ runAt: RUN_AT, tasks: [task('T1', 'alice', '2026-10-25T23:59:59.999Z')], ...deps() });
    assert.equal(gateway.transfersForTask('T1').length, 1);
  });

  test('TC05 time zone: Monday 04:30 in Karachi (+05:00) is Sunday 23:30 UTC, so it counts this week', async () => {
    await runSettlement({ runAt: RUN_AT, tasks: [task('T1', 'sana', '2026-10-26T04:30:00+05:00')], ...deps() });
    assert.equal(gateway.transfersForTask('T1').length, 1);
  });

  test('TC06 time zone: Sunday 19:30 in Los Angeles (-07:00) is Monday 02:30 UTC, so it counts next week', async () => {
    const tasks = [task('T1', 'leo', '2026-10-25T19:30:00-07:00')];
    const first = await runSettlement({ runAt: RUN_AT, tasks, ...deps() });
    assert.deepEqual(first.outOfWindow, ['T1']);
    await runSettlement({ runAt: NEXT_RUN_AT, tasks, ...deps() });
    assert.equal(gateway.transfersForTask('T1').length, 1);
  });

  test('TC07 timestamp without an offset is rejected for review, not guessed', async () => {
    const report = await runSettlement({ runAt: RUN_AT, tasks: [task('T1', 'alice', '2026-10-21T10:00:00')], ...deps() });
    assert.deepEqual(report.rejected, ['T1']);
    assert.equal(gateway.transfers.length, 0);
    assert.equal(notifier.sent.length, 0);
  });

  test('TC08 server time zone does not change the window (UTC, Asia/Karachi, America/Los_Angeles)', () => {
    const original = process.env.TZ;
    try {
      const windows = ['UTC', 'Asia/Karachi', 'America/Los_Angeles'].map((tz) => {
        process.env.TZ = tz;
        const w = settlementWindow(RUN_AT);
        return [w.start.toISOString(), w.end.toISOString()];
      });
      for (const w of windows) assert.deepEqual(w, ['2026-10-19T00:00:00.000Z', '2026-10-26T00:00:00.000Z']);
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
  });

  test('TC09 duplicate task ID in one input batch is paid once', async () => {
    const tasks = [task('T1', 'alice', '2026-10-20T10:00:00Z'), task('T1', 'alice', '2026-10-20T10:00:00Z')];
    const report = await runSettlement({ runAt: RUN_AT, tasks, ...deps() });
    assert.equal(gateway.transfersForTask('T1').length, 1);
    assert.deepEqual(report.duplicatesInInput, ['T1']);
  });

  test('TC10 running the same week again after a full success pays nothing and notifies nobody', async () => {
    const tasks = [task('T1', 'alice', '2026-10-20T10:00:00Z'), task('T2', 'bilal', '2026-10-21T10:00:00Z')];
    await runSettlement({ runAt: RUN_AT, tasks, ...deps() });
    await runSettlement({ runAt: RUN_AT, tasks, ...deps() }); // operator reruns the job
    assert.equal(gateway.total(), 20, 'each task must be paid exactly once');
    assert.equal(notifier.sent.length, 2, 'users must not be told they were paid twice');
  });

  test('TC11 SELECTED FAILURE: retry after the gateway crashes mid batch pays every task exactly once', async () => {
    const tasks = ['T1', 'T2', 'T3', 'T4', 'T5'].map((id, i) => task(id, `user${i + 1}`, `2026-10-2${i}T12:00:00Z`));
    gateway = new FakePayoutGateway({ crashOnCall: 3 });

    await assert.rejects(runSettlement({ runAt: RUN_AT, tasks, ...deps() }), GatewayCrash);
    assert.equal(gateway.transfers.length, 2, 'T1 and T2 were paid before the crash');

    gateway.recover();
    await runSettlement({ runAt: RUN_AT, tasks, ...deps() }); // job runner retries

    for (const id of ['T1', 'T2', 'T3', 'T4', 'T5']) {
      assert.equal(gateway.transfersForTask(id).length, 1, `${id} must have exactly one transfer`);
    }
    assert.equal(gateway.total(), 50);
  });

  test('TC12 SELECTED FAILURE: retry after a lost gateway response does not move money twice', async () => {
    const tasks = [task('T1', 'alice', '2026-10-20T10:00:00Z'), task('T2', 'bilal', '2026-10-21T10:00:00Z')];
    gateway = new FakePayoutGateway({ timeoutAfterCommitOnCall: 2 }); // T2 transfer commits, response is lost

    await assert.rejects(runSettlement({ runAt: RUN_AT, tasks, ...deps() }), GatewayTimeout);
    gateway.recover();
    await runSettlement({ runAt: RUN_AT, tasks, ...deps() });

    assert.equal(gateway.transfersForTask('T1').length, 1);
    assert.equal(gateway.transfersForTask('T2').length, 1);
    assert.equal(gateway.total(), 20);
  });

  test('TC13 task already paid in an earlier week is never paid again', async () => {
    ledger = new FakeLedger([{ taskId: 'T1', userId: 'alice', amount: 10, windowId: '2026-10-12', transferId: 'tr_old' }]);
    const report = await runSettlement({ runAt: RUN_AT, tasks: [task('T1', 'alice', '2026-10-20T10:00:00Z')], ...deps() });
    assert.equal(gateway.transfers.length, 0);
    assert.deepEqual(report.alreadyPaid, ['T1']);
  });

  test('TC14 partial failure: notification failure keeps the payout and leaves the notification pending', async () => {
    notifier = new FakeNotifier({ failUsers: ['bilal'] });
    const tasks = [task('T1', 'alice', '2026-10-20T10:00:00Z'), task('T2', 'bilal', '2026-10-21T10:00:00Z')];
    const report = await runSettlement({ runAt: RUN_AT, tasks, ...deps() });

    assert.equal(gateway.totalFor('bilal'), 10, 'payout must stay');
    assert.equal(gateway.reversals.length, 0, 'nothing may be reversed');
    assert.deepEqual(report.notificationFailed, ['T2']);
    assert.equal(ledger.get('T2').notification, 'pending');
    assert.equal(ledger.get('T1').notification, 'sent');
  });

  test('TC15 declined payout sends no notification and stays eligible for the next attempt', async () => {
    gateway = new FakePayoutGateway({ declineUsers: ['chen'] });
    const tasks = [task('T1', 'alice', '2026-10-20T10:00:00Z'), task('T2', 'chen', '2026-10-21T10:00:00Z')];
    const report = await runSettlement({ runAt: RUN_AT, tasks, ...deps() });

    assert.deepEqual(report.payoutDeclined, ['T2']);
    assert.equal(notifier.sentTo('chen').length, 0);
    assert.equal(await ledger.has('T2'), false);
    assert.equal(notifier.sentTo('alice').length, 1);
  });

  test('TC16 tasks that are not completed earn nothing', async () => {
    const tasks = [
      task('T1', 'alice', '2026-10-20T10:00:00Z', 'in_progress'),
      task('T2', 'alice', '2026-10-20T11:00:00Z', 'cancelled'),
    ];
    const report = await runSettlement({ runAt: RUN_AT, tasks, ...deps() });
    assert.equal(gateway.transfers.length, 0);
    assert.deepEqual(report.notQualifying, ['T1', 'T2']);
  });
});
