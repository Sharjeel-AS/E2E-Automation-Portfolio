// fake ledger, gateway and notifier (no real payments)

export class PayoutDeclined extends Error {}
export class GatewayCrash extends Error {}
export class GatewayTimeout extends Error {}

// fake ledger - keeps paid tasks
export class FakeLedger {
  constructor() {
    this.entries = {};
  }

  has(taskId) {
    return this.entries[taskId] !== undefined;
  }

  save(taskId, entry) {
    this.entries[taskId] = entry;
  }

  get(taskId) {
    return this.entries[taskId];
  }
}

// fake payment gateway
export class FakeGateway {
  constructor() {
    this.transfers = [];
    this.calls = 0;
    this.crashOnCall = 0;
    this.timeoutOnCall = 0;
    this.declinedUser = '';
  }

  // if same key is used again, return the old payment (no new money)
  pay(userId, taskId, amount, key) {
    this.calls = this.calls + 1;

    if (this.calls === this.crashOnCall) {
      throw new GatewayCrash('gateway down');
    }
    if (userId === this.declinedUser) {
      throw new PayoutDeclined('payout declined');
    }

    for (const transfer of this.transfers) {
      if (transfer.key === key) {
        return transfer;
      }
    }

    const transfer = { id: this.transfers.length + 1, userId, taskId, amount, key };
    this.transfers.push(transfer);

    if (this.calls === this.timeoutOnCall) {
      throw new GatewayTimeout('response lost after payment');
    }
    return transfer;
  }

  // number of payments for a task
  countFor(taskId) {
    let count = 0;
    for (const transfer of this.transfers) {
      if (transfer.taskId === taskId) count++;
    }
    return count;
  }

  // total credits paid
  totalPaid() {
    let total = 0;
    for (const transfer of this.transfers) {
      total = total + transfer.amount;
    }
    return total;
  }

  // total credits paid to a user
  totalPaidTo(userId) {
    let total = 0;
    for (const transfer of this.transfers) {
      if (transfer.userId === userId) total = total + transfer.amount;
    }
    return total;
  }
}

// fake notifier
export class FakeNotifier {
  constructor() {
    this.sent = [];
    this.failingUser = '';
  }

  send(userId, taskId) {
    if (userId === this.failingUser) {
      throw new Error('push failed');
    }
    this.sent.push({ userId, taskId });
  }
}
