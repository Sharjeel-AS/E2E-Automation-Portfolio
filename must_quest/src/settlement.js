import { CREDITS_PER_TASK, settlementWindow, isInWindow, hasExplicitOffset } from './window.js';
import { PayoutDeclined } from './fakes.js';

export const IMPLEMENTATION = 'fixed';

export function payoutKey(task) {
  return `task:${task.taskId}`;
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

    if (await ledger.has(task.taskId)) { report.alreadyPaid.push(task.taskId); continue; }

    let transfer;
    try {
      transfer = await gateway.pay({
        userId: task.userId,
        taskId: task.taskId,
        amount: CREDITS_PER_TASK,
        idempotencyKey: payoutKey(task),
      });
    } catch (err) {
      if (err instanceof PayoutDeclined) { report.payoutDeclined.push(task.taskId); continue; }
      throw err;
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
      report.notificationFailed.push(task.taskId);
    }
  }

  return report;
}
