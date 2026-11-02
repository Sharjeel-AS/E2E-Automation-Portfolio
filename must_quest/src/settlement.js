import { CREDITS_PER_TASK, getSettlementWindow, isInWindow, hasTimezone } from './window.js';
import { PayoutDeclined } from './fakes.js';

// weekly settlement - fixed version
export function runSettlement({ runAt, tasks, ledger, gateway, notifier }) {
  const window = getSettlementWindow(runAt);
  const paid = [];
  const notifyFailed = [];
  const seen = [];

  for (const task of tasks) {
    // skip invalid tasks
    if (task.status !== 'completed') continue;
    if (!hasTimezone(task.completedAt)) continue;
    if (!isInWindow(task.completedAt, window)) continue;

    // skip duplicates
    if (seen.includes(task.taskId)) continue;
    seen.push(task.taskId);

    // already paid in an earlier run
    if (ledger.has(task.taskId)) continue;

    // pay (same key on every retry so it is never paid twice)
    let transfer;
    try {
      transfer = gateway.pay(task.userId, task.taskId, CREDITS_PER_TASK, 'task:' + task.taskId);
    } catch (error) {
      if (error instanceof PayoutDeclined) continue;
      throw error;
    }

    // save in ledger
    ledger.save(task.taskId, { userId: task.userId, transferId: transfer.id, notification: 'pending' });
    paid.push(task.taskId);

    // notify user (payment stays even if this fails)
    try {
      notifier.send(task.userId, task.taskId);
      ledger.get(task.taskId).notification = 'sent';
    } catch {
      notifyFailed.push(task.taskId);
    }
  }

  return { windowId: window.id, paid, notifyFailed };
}
