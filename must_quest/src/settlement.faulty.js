// FAULTY implementation, kept on purpose to reproduce DEF 001.
//
// Defect: duplicate protection only lives for one run attempt.
//   1. The gateway idempotency key includes a run ID that is new on every retry.
//   2. The persistent ledger is written but never checked before paying.
// Duplicates inside one run are caught (in memory set), so the happy path and
// the single run duplicate test still pass. Every retry pays again.

import { randomUUID } from 'node:crypto';
import { CREDITS_PER_TASK, settlementWindow, isInWindow, hasExplicitOffset } from './window.js';
import { PayoutDeclined } from './fakes.js';

export const IMPLEMENTATION = 'faulty';

export async function runSettlement({ runAt, tasks, ledger, gateway, notifier }) {
  const window = settlementWindow(runAt);
  const runId = randomUUID(); // BUG: new value on every retry
  const report = {
    windowId: window.id,
    paid: [],
    alreadyPaid: [],
    duplicatesInInput: [],
    outOfWindow: [],
    notQualifying: [],
    rejected: [],
    payoutDeclined: [],
    notificationFailed: [],
  };
  const seenThisRun = new Set();

  for (const task of tasks) {
    if (!task?.taskId || !task?.userId || !hasExplicitOffset(task.completedAt)) {
      report.rejected.push(task?.taskId ?? null);
      continue;
    }
    if (task.status !== 'completed') { report.notQualifying.push(task.taskId); continue; }
    if (!isInWindow(task.completedAt, window)) { report.outOfWindow.push(task.taskId); continue; }

    if (seenThisRun.has(task.taskId)) { report.duplicatesInInput.push(task.taskId); continue; }
    seenThisRun.add(task.taskId);

    // BUG: no ledger.has(task.taskId) check here.

    let transfer;
    try {
      transfer = await gateway.pay({
        userId: task.userId,
        taskId: task.taskId,
        amount: CREDITS_PER_TASK,
        idempotencyKey: `${runId}:${task.taskId}`, // BUG: run scoped, not task scoped
      });
    } catch (err) {
      if (err instanceof PayoutDeclined) { report.payoutDeclined.push(task.taskId); continue; }
      throw err;
    }

    await ledger.record(task.taskId, { // overwrites, so the ledger hides the duplicate transfer
      userId: task.userId,
      amount: CREDITS_PER_TASK,
      windowId: window.id,
      transferId: transfer.transferId,
      notification: 'pending',
    });
    report.paid.push(task.taskId);

    try {
      await notifier.send(task.userId, { taskId: task.taskId, amount: CREDITS_PER_TASK, windowId: window.id });
      await ledger.setNotification(task.taskId, 'sent');
    } catch {
      report.notificationFailed.push(task.taskId);
    }
  }

  return report;
}
