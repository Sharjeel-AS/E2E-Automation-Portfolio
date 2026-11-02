import { randomUUID } from 'node:crypto';
import { CREDITS_PER_TASK, getSettlementWindow, isInWindow, hasTimezone } from './window.js';
import { PayoutDeclined } from './fakes.js';

// weekly settlement - faulty version (DEF 001)
export function runSettlement({ runAt, tasks, ledger, gateway, notifier }) {
  const window = getSettlementWindow(runAt);
  const runId = randomUUID(); // BUG: new value on every retry
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

    // BUG: ledger is not checked before paying

    // pay
    let transfer;
    try {
      transfer = gateway.pay(task.userId, task.taskId, CREDITS_PER_TASK, runId + ':' + task.taskId); // BUG: key changes on every retry
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
