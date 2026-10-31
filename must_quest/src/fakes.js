export class PayoutDeclined extends Error {
  constructor(message) { super(message); this.name = 'PayoutDeclined'; }
}
export class GatewayCrash extends Error {
  constructor(message) { super(message); this.name = 'GatewayCrash'; }
}
export class GatewayTimeout extends Error {
  constructor(message) { super(message); this.name = 'GatewayTimeout'; }
}

export class FakeLedger {
  constructor(initial = []) {
    this.entries = new Map(initial.map((e) => [e.taskId, { ...e }]));
  }
  async has(taskId) { return this.entries.has(taskId); }
  async record(taskId, entry) { this.entries.set(taskId, { taskId, ...entry }); }
  async setNotification(taskId, status) {
    const e = this.entries.get(taskId);
    if (e) e.notification = status;
  }
  get(taskId) { return this.entries.get(taskId); }
}

export class FakePayoutGateway {
  constructor({ crashOnCall, timeoutAfterCommitOnCall, declineUsers = [] } = {}) {
    this.calls = 0;
    this.transfers = [];
    this.reversals = [];
    this.byKey = new Map();
    this.crashOnCall = crashOnCall;
    this.timeoutAfterCommitOnCall = timeoutAfterCommitOnCall;
    this.declineUsers = new Set(declineUsers);
  }

  recover() { this.crashOnCall = undefined; this.timeoutAfterCommitOnCall = undefined; }

  async pay({ userId, taskId, amount, idempotencyKey }) {
    this.calls += 1;
    if (this.crashOnCall === this.calls) throw new GatewayCrash(`Gateway unavailable on call ${this.calls}`);
    if (this.declineUsers.has(userId)) throw new PayoutDeclined(`Payout declined for ${userId}`);

    if (this.byKey.has(idempotencyKey)) return this.byKey.get(idempotencyKey);

    const transfer = { transferId: `tr_${this.transfers.length + 1}`, userId, taskId, amount, idempotencyKey };
    this.transfers.push(transfer);
    this.byKey.set(idempotencyKey, transfer);

    if (this.timeoutAfterCommitOnCall === this.calls) {
      throw new GatewayTimeout(`Response lost after commit on call ${this.calls}`);
    }
    return transfer;
  }

  async reverse(transferId) { this.reversals.push(transferId); }

  transfersForTask(taskId) { return this.transfers.filter((t) => t.taskId === taskId); }
  totalFor(userId) { return this.transfers.filter((t) => t.userId === userId).reduce((s, t) => s + t.amount, 0); }
  total() { return this.transfers.reduce((s, t) => s + t.amount, 0); }
}

export class FakeNotifier {
  constructor({ failUsers = [] } = {}) {
    this.sent = [];
    this.failUsers = new Set(failUsers);
  }
  async send(userId, message) {
    if (this.failUsers.has(userId)) throw new Error(`Push provider rejected message for ${userId}`);
    this.sent.push({ userId, ...message });
  }
  sentTo(userId) { return this.sent.filter((m) => m.userId === userId); }
}
