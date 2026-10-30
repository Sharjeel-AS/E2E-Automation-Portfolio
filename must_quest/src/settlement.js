// Corrected reference implementation of the weekly rewards settlement.
//
// Business rules (assessment rules, fictional service):
//  R1  Runs Tuesday 09:00 UTC for [previous Monday 00:00 UTC, most recent Monday 00:00 UTC).
//  R2  Each qualifying (status "completed") task earns 10 test credits.
//  R3  A task ID is paid at most once, ever. Retries must never create a second payout.
//  R4  A notification is sent only after a successful payout.
//  R5  A notification failure never reverses a payout.
//  A1  Assumption: timestamps without an explicit offset are rejected for manual review.
//
// Fix for DEF 001: duplicate protection is keyed on the task ID and backed by
// persistent state (ledger check plus a task scoped gateway idempotency key),
// instead of state that only lives for one run attempt.

import { CREDITS_PER_TASK, settlementWindow, isInWindow, hasExplicitOffset } from './window.js';
import { PayoutDeclined } from './fakes.js';

export const IMPLEMENTATION = 'fixed';

export function payoutKey(task) {
  return `task:${task.taskId}`; // stable across every run and every retry
}

export async function runSettlement({ runAt, tasks, ledger, gateway, notifier }) {
  const window = settlementWindow(runAt);
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

    if (await ledger.has(task.taskId)) { report.alreadyPaid.push(task.taskId); continue; } // R3, across runs

    let transfer;
    try {
      transfer = await gateway.pay({
        userId: task.userId,
        taskId: task.taskId,
        amount: CREDITS_PER_TASK,
        idempotencyKey: payoutKey(task), // R3, covers a lost response after commit
      });
    } catch (err) {
      if (err instanceof PayoutDeclined) { report.payoutDeclined.push(task.taskId); continue; } // R4: no notification
      throw err; // gateway crash or timeout: stop the run, the job runner retries it
    }

    await ledger.record(task.taskId, {
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
      report.notificationFailed.push(task.taskId); // R5: payout stays, notification left pending for resend
    }
  }

  return report;
}
