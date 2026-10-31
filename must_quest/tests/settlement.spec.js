// Regression suite for the weekly rewards settlement (Playwright Test).
//   npm test             -> project "fixed":  all 16 pass
//   npm run test:faulty  -> project "faulty": TC10 to TC13 fail (DEF 001)
//   npm run test:ui      -> watch both projects run in Playwright UI mode
//
// Assertions check gateway transfers (money that actually moved), not only the run report,
// because the faulty ledger overwrites entries and would hide a duplicate payout.

import { test, expect } from './fixtures.js';
import { FakeLedger, FakePayoutGateway, FakeNotifier, GatewayCrash, GatewayTimeout } from '../src/fakes.js';
import { settlementWindow } from '../src/window.js';

// Run on Tuesday 27 Oct 2026 09:00 UTC settles [Mon 19 Oct 00:00 UTC, Mon 26 Oct 00:00 UTC)
const RUN_AT = '2026-10-27T09:00:00Z';
const NEXT_RUN_AT = '2026-11-03T09:00:00Z';

const task = (taskId, userId, completedAt, status = 'completed') => ({ taskId, userId, completedAt, status });

test.describe('weekly settlement', () => {
  test('TC01 happy path: every qualifying task in the window is paid 10 credits and notified', async ({ runSettlement, world }) => {
    const tasks = [
      task('T1', 'alice', '2026-10-20T10:00:00Z'),
      task('T2', 'alice', '2026-10-22T15:30:00Z'),
      task('T3', 'bilal', '2026-10-24T08:00:00Z'),
    ];
    const report = await runSettlement({ runAt: RUN_AT, tasks, ...world.deps() });
    expect(report.windowId).toBe('2026-10-19');
    expect(report.paid).toEqual(['T1', 'T2', 'T3']);
    expect(world.gateway.totalFor('alice')).toBe(20);
    expect(world.gateway.totalFor('bilal')).toBe(10);
    expect(world.notifier.sent).toHaveLength(3);
  });

  test('TC02 lower boundary: Monday 00:00:00.000 UTC is included', async ({ runSettlement, world }) => {
    await runSettlement({ runAt: RUN_AT, tasks: [task('T1', 'alice', '2026-10-19T00:00:00.000Z')], ...world.deps() });
    expect(world.gateway.transfersForTask('T1')).toHaveLength(1);
  });

  test('TC03 upper boundary: next Monday 00:00:00.000 UTC is excluded now and paid in the next run', async ({ runSettlement, world }) => {
    const tasks = [task('T1', 'alice', '2026-10-26T00:00:00.000Z')];
    const first = await runSettlement({ runAt: RUN_AT, tasks, ...world.deps() });
    expect(first.outOfWindow).toEqual(['T1']);
    expect(world.gateway.transfersForTask('T1')).toHaveLength(0);

    const second = await runSettlement({ runAt: NEXT_RUN_AT, tasks, ...world.deps() });
    expect(second.windowId).toBe('2026-10-26');
    expect(world.gateway.transfersForTask('T1')).toHaveLength(1);
  });

  test('TC04 last millisecond before cut off (Sunday 23:59:59.999 UTC) is included', async ({ runSettlement, world }) => {
    await runSettlement({ runAt: RUN_AT, tasks: [task('T1', 'alice', '2026-10-25T23:59:59.999Z')], ...world.deps() });
    expect(world.gateway.transfersForTask('T1')).toHaveLength(1);
  });

  test('TC05 time zone: Monday 04:30 in Karachi (+05:00) is Sunday 23:30 UTC, so it counts this week', async ({ runSettlement, world }) => {
    await runSettlement({ runAt: RUN_AT, tasks: [task('T1', 'sana', '2026-10-26T04:30:00+05:00')], ...world.deps() });
    expect(world.gateway.transfersForTask('T1')).toHaveLength(1);
  });

  test('TC06 time zone: Sunday 19:30 in Los Angeles (-07:00) is Monday 02:30 UTC, so it counts next week', async ({ runSettlement, world }) => {
    const tasks = [task('T1', 'leo', '2026-10-25T19:30:00-07:00')];
    const first = await runSettlement({ runAt: RUN_AT, tasks, ...world.deps() });
    expect(first.outOfWindow).toEqual(['T1']);
    await runSettlement({ runAt: NEXT_RUN_AT, tasks, ...world.deps() });
    expect(world.gateway.transfersForTask('T1')).toHaveLength(1);
  });

  test('TC07 timestamp without an offset is rejected for review, not guessed', async ({ runSettlement, world }) => {
    const report = await runSettlement({ runAt: RUN_AT, tasks: [task('T1', 'alice', '2026-10-21T10:00:00')], ...world.deps() });
    expect(report.rejected).toEqual(['T1']);
    expect(world.gateway.transfers).toHaveLength(0);
    expect(world.notifier.sent).toHaveLength(0);
  });

  test('TC08 server time zone does not change the window (UTC, Asia/Karachi, America/Los_Angeles)', async () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Asia/Karachi', 'America/Los_Angeles']) {
        process.env.TZ = tz;
        const w = settlementWindow(RUN_AT);
        expect([w.start.toISOString(), w.end.toISOString()], `server TZ ${tz}`)
          .toEqual(['2026-10-19T00:00:00.000Z', '2026-10-26T00:00:00.000Z']);
      }
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
  });

  test('TC09 duplicate task ID in one input batch is paid once', async ({ runSettlement, world }) => {
    const tasks = [task('T1', 'alice', '2026-10-20T10:00:00Z'), task('T1', 'alice', '2026-10-20T10:00:00Z')];
    const report = await runSettlement({ runAt: RUN_AT, tasks, ...world.deps() });
    expect(world.gateway.transfersForTask('T1')).toHaveLength(1);
    expect(report.duplicatesInInput).toEqual(['T1']);
  });

  test('TC10 running the same week again after a full success pays nothing and notifies nobody', async ({ runSettlement, world }) => {
    const tasks = [task('T1', 'alice', '2026-10-20T10:00:00Z'), task('T2', 'bilal', '2026-10-21T10:00:00Z')];
    await runSettlement({ runAt: RUN_AT, tasks, ...world.deps() });
    await runSettlement({ runAt: RUN_AT, tasks, ...world.deps() }); // operator reruns the job
    expect(world.gateway.total(), 'each task must be paid exactly once').toBe(20);
    expect(world.notifier.sent, 'users must not be told they were paid twice').toHaveLength(2);
  });

  test('TC11 SELECTED FAILURE: retry after the gateway crashes mid batch pays every task exactly once', async ({ runSettlement, world }) => {
    const tasks = ['T1', 'T2', 'T3', 'T4', 'T5'].map((id, i) => task(id, `user${i + 1}`, `2026-10-2${i}T12:00:00Z`));
    world.gateway = new FakePayoutGateway({ crashOnCall: 3 });

    await expect(runSettlement({ runAt: RUN_AT, tasks, ...world.deps() })).rejects.toThrow(GatewayCrash);
    expect(world.gateway.transfers, 'T1 and T2 were paid before the crash').toHaveLength(2);

    world.gateway.recover();
    await runSettlement({ runAt: RUN_AT, tasks, ...world.deps() }); // job runner retries

    for (const id of ['T1', 'T2', 'T3', 'T4', 'T5']) {
      expect(world.gateway.transfersForTask(id), `${id} must have exactly one transfer`).toHaveLength(1);
    }
    expect(world.gateway.total()).toBe(50);
  });

  test('TC12 SELECTED FAILURE: retry after a lost gateway response does not move money twice', async ({ runSettlement, world }) => {
    const tasks = [task('T1', 'alice', '2026-10-20T10:00:00Z'), task('T2', 'bilal', '2026-10-21T10:00:00Z')];
    world.gateway = new FakePayoutGateway({ timeoutAfterCommitOnCall: 2 }); // T2 transfer commits, response is lost

    await expect(runSettlement({ runAt: RUN_AT, tasks, ...world.deps() })).rejects.toThrow(GatewayTimeout);
    world.gateway.recover();
    await runSettlement({ runAt: RUN_AT, tasks, ...world.deps() });

    expect(world.gateway.transfersForTask('T1')).toHaveLength(1);
    expect(world.gateway.transfersForTask('T2'), 'T2 must have exactly one transfer').toHaveLength(1);
    expect(world.gateway.total()).toBe(20);
  });

  test('TC13 task already paid in an earlier week is never paid again', async ({ runSettlement, world }) => {
    world.ledger = new FakeLedger([{ taskId: 'T1', userId: 'alice', amount: 10, windowId: '2026-10-12', transferId: 'tr_old' }]);
    const report = await runSettlement({ runAt: RUN_AT, tasks: [task('T1', 'alice', '2026-10-20T10:00:00Z')], ...world.deps() });
    expect(world.gateway.transfers, 'a task paid last week must not be paid again').toHaveLength(0);
    expect(report.alreadyPaid).toEqual(['T1']);
  });

  test('TC14 partial failure: notification failure keeps the payout and leaves the notification pending', async ({ runSettlement, world }) => {
    world.notifier = new FakeNotifier({ failUsers: ['bilal'] });
    const tasks = [task('T1', 'alice', '2026-10-20T10:00:00Z'), task('T2', 'bilal', '2026-10-21T10:00:00Z')];
    const report = await runSettlement({ runAt: RUN_AT, tasks, ...world.deps() });

    expect(world.gateway.totalFor('bilal'), 'payout must stay').toBe(10);
    expect(world.gateway.reversals, 'nothing may be reversed').toHaveLength(0);
    expect(report.notificationFailed).toEqual(['T2']);
    expect(world.ledger.get('T2').notification).toBe('pending');
    expect(world.ledger.get('T1').notification).toBe('sent');
  });

  test('TC15 declined payout sends no notification and stays eligible for the next attempt', async ({ runSettlement, world }) => {
    world.gateway = new FakePayoutGateway({ declineUsers: ['chen'] });
    const tasks = [task('T1', 'alice', '2026-10-20T10:00:00Z'), task('T2', 'chen', '2026-10-21T10:00:00Z')];
    const report = await runSettlement({ runAt: RUN_AT, tasks, ...world.deps() });

    expect(report.payoutDeclined).toEqual(['T2']);
    expect(world.notifier.sentTo('chen')).toHaveLength(0);
    expect(await world.ledger.has('T2')).toBe(false);
    expect(world.notifier.sentTo('alice')).toHaveLength(1);
  });

  test('TC16 tasks that are not completed earn nothing', async ({ runSettlement, world }) => {
    const tasks = [
      task('T1', 'alice', '2026-10-20T10:00:00Z', 'in_progress'),
      task('T2', 'alice', '2026-10-20T11:00:00Z', 'cancelled'),
    ];
    const report = await runSettlement({ runAt: RUN_AT, tasks, ...world.deps() });
    expect(world.gateway.transfers).toHaveLength(0);
    expect(report.notQualifying).toEqual(['T1', 'T2']);
  });
});
