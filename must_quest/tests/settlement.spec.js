import { test, expect } from '@playwright/test';
import { FakeLedger, FakeGateway, FakeNotifier, GatewayCrash, GatewayTimeout } from '../src/fakes.js';
import { getSettlementWindow } from '../src/window.js';

// tuesday 27 oct run pays for week 19 oct to 26 oct
const RUN_AT = '2026-10-27T09:00:00Z';
const NEXT_RUN_AT = '2026-11-03T09:00:00Z';

let runSettlement;
let ledger;
let gateway;
let notifier;

function task(taskId, userId, completedAt, status = 'completed') {
  return { taskId, userId, completedAt, status };
}

function settle(tasks, runAt = RUN_AT) {
  return runSettlement({ runAt, tasks, ledger, gateway, notifier });
}

// load fixed or faulty code based on project, and reset fakes
test.beforeEach(async ({}, testInfo) => {
  if (testInfo.project.name === 'faulty') {
    runSettlement = (await import('../src/settlement.faulty.js')).runSettlement;
  } else {
    runSettlement = (await import('../src/settlement.js')).runSettlement;
  }
  ledger = new FakeLedger();
  gateway = new FakeGateway();
  notifier = new FakeNotifier();
});

test('TC01 pays completed tasks in the week', () => {
  const report = settle([
    task('task_101', 'alice', '2026-10-20T10:00:00Z'),
    task('task_102', 'alice', '2026-10-22T15:30:00Z'),
    task('task_103', 'bilal', '2026-10-24T08:00:00Z'),
  ]);

  expect(report.windowId).toBe('2026-10-19');
  expect(report.paid).toEqual(['task_101', 'task_102', 'task_103']);
  expect(gateway.totalPaidTo('alice')).toBe(20);
  expect(gateway.totalPaidTo('bilal')).toBe(10);
  expect(notifier.sent.length).toBe(3);
});

test('TC02 pays task at monday 00:00 utc', () => {
  const report = settle([task('task_101', 'alice', '2026-10-19T00:00:00Z')]);

  expect(report.paid).toEqual(['task_101']);
  expect(gateway.countFor('task_101')).toBe(1);
});

test('TC03 task at next monday 00:00 goes to next week', () => {
  const tasks = [task('task_101', 'alice', '2026-10-26T00:00:00Z')];

  const thisWeek = settle(tasks);
  expect(thisWeek.paid).toEqual([]);
  expect(gateway.countFor('task_101')).toBe(0);

  const nextWeek = settle(tasks, NEXT_RUN_AT);
  expect(nextWeek.paid).toEqual(['task_101']);
  expect(gateway.countFor('task_101')).toBe(1);
});

test('TC04 pays task at sunday 23:59:59', () => {
  const report = settle([task('task_101', 'alice', '2026-10-25T23:59:59.999Z')]);

  expect(report.paid).toEqual(['task_101']);
  expect(gateway.countFor('task_101')).toBe(1);
});

// 04:30 monday in karachi = 23:30 sunday utc
test('TC05 karachi monday morning counts this week', () => {
  const report = settle([task('task_101', 'sana', '2026-10-26T04:30:00+05:00')]);

  expect(report.paid).toEqual(['task_101']);
  expect(gateway.countFor('task_101')).toBe(1);
});

// 19:30 sunday in LA = 02:30 monday utc
test('TC06 LA sunday evening counts next week', () => {
  const tasks = [task('task_101', 'leo', '2026-10-25T19:30:00-07:00')];

  const thisWeek = settle(tasks);
  expect(thisWeek.paid).toEqual([]);

  const nextWeek = settle(tasks, NEXT_RUN_AT);
  expect(nextWeek.paid).toEqual(['task_101']);
  expect(gateway.countFor('task_101')).toBe(1);
});

test('TC07 skips task without timezone', () => {
  const report = settle([task('task_101', 'alice', '2026-10-21T10:00:00')]);

  expect(report.paid).toEqual([]);
  expect(gateway.transfers.length).toBe(0);
  expect(notifier.sent.length).toBe(0);
});

test('TC08 server timezone does not change the week', () => {
  const originalTZ = process.env.TZ;

  for (const tz of ['UTC', 'Asia/Karachi', 'America/Los_Angeles']) {
    process.env.TZ = tz;
    const window = getSettlementWindow(RUN_AT);
    expect(window.start.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-10-26T00:00:00.000Z');
  }

  if (originalTZ) process.env.TZ = originalTZ;
  else delete process.env.TZ;
});

test('TC09 duplicate task is paid once', () => {
  const report = settle([
    task('task_101', 'alice', '2026-10-20T10:00:00Z'),
    task('task_101', 'alice', '2026-10-20T10:00:00Z'),
  ]);

  expect(report.paid).toEqual(['task_101']);
  expect(gateway.countFor('task_101')).toBe(1);
  expect(notifier.sent.length).toBe(1);
});

test('TC10 rerun does not pay again', () => {
  const tasks = [
    task('task_101', 'alice', '2026-10-20T10:00:00Z'),
    task('task_102', 'bilal', '2026-10-21T10:00:00Z'),
  ];

  settle(tasks);
  const rerun = settle(tasks);

  expect(rerun.paid).toEqual([]);
  expect(gateway.totalPaid()).toBe(20);
  expect(notifier.sent.length).toBe(2);
});

// gateway crashes on 3rd payment, then job is retried
test('TC11 retry after crash does not pay twice', () => {
  const tasks = [
    task('task_101', 'user1', '2026-10-20T12:00:00Z'),
    task('task_102', 'user2', '2026-10-21T12:00:00Z'),
    task('task_103', 'user3', '2026-10-22T12:00:00Z'),
    task('task_104', 'user4', '2026-10-23T12:00:00Z'),
    task('task_105', 'user5', '2026-10-24T12:00:00Z'),
  ];
  gateway.crashOnCall = 3;

  expect(() => settle(tasks)).toThrow(GatewayCrash);
  expect(gateway.transfers.length).toBe(2);

  gateway.crashOnCall = 0;
  settle(tasks);

  expect(gateway.countFor('task_101')).toBe(1);
  expect(gateway.countFor('task_102')).toBe(1);
  expect(gateway.countFor('task_103')).toBe(1);
  expect(gateway.countFor('task_104')).toBe(1);
  expect(gateway.countFor('task_105')).toBe(1);
  expect(gateway.totalPaid()).toBe(50);
  expect(notifier.sent.length).toBe(5);
});

// payment goes through but response is lost, then job is retried
test('TC12 retry after timeout does not pay twice', () => {
  const tasks = [
    task('task_101', 'alice', '2026-10-20T10:00:00Z'),
    task('task_102', 'bilal', '2026-10-21T10:00:00Z'),
  ];
  gateway.timeoutOnCall = 2;

  expect(() => settle(tasks)).toThrow(GatewayTimeout);

  gateway.timeoutOnCall = 0;
  settle(tasks);

  expect(gateway.countFor('task_101')).toBe(1);
  expect(gateway.countFor('task_102')).toBe(1);
  expect(gateway.totalPaid()).toBe(20);
});

test('TC13 task paid last week is not paid again', () => {
  ledger.save('task_101', { userId: 'alice', transferId: 99, notification: 'sent' });

  const report = settle([task('task_101', 'alice', '2026-10-20T10:00:00Z')]);

  expect(report.paid).toEqual([]);
  expect(gateway.transfers.length).toBe(0);
  expect(notifier.sent.length).toBe(0);
});

test('TC14 payment stays if notification fails', () => {
  notifier.failingUser = 'bilal';

  const report = settle([
    task('task_101', 'alice', '2026-10-20T10:00:00Z'),
    task('task_102', 'bilal', '2026-10-21T10:00:00Z'),
  ]);

  expect(report.paid).toEqual(['task_101', 'task_102']);
  expect(gateway.totalPaidTo('bilal')).toBe(10);
  expect(report.notifyFailed).toEqual(['task_102']);
  expect(ledger.get('task_102').notification).toBe('pending');
  expect(ledger.get('task_101').notification).toBe('sent');
});

test('TC15 no notification if payment is declined', () => {
  gateway.declinedUser = 'chen';

  const report = settle([
    task('task_101', 'alice', '2026-10-20T10:00:00Z'),
    task('task_102', 'chen', '2026-10-21T10:00:00Z'),
  ]);

  expect(report.paid).toEqual(['task_101']);
  expect(gateway.countFor('task_102')).toBe(0);
  expect(ledger.has('task_102')).toBe(false);
  expect(notifier.sent).toEqual([{ userId: 'alice', taskId: 'task_101' }]);
});

test('TC16 incomplete tasks are not paid', () => {
  const report = settle([
    task('task_101', 'alice', '2026-10-20T10:00:00Z', 'in_progress'),
    task('task_102', 'alice', '2026-10-20T11:00:00Z', 'cancelled'),
  ]);

  expect(report.paid).toEqual([]);
  expect(gateway.transfers.length).toBe(0);
  expect(notifier.sent.length).toBe(0);
});
