# DEF 001: Settlement retry pays the same task again

| Field | Value |
|---|---|
| Component | Weekly rewards settlement job |
| Build | `src/settlement.faulty.js` |
| Severity | Critical |
| Priority | P1, blocks release |
| Found by | Regression suite TC10 to TC13, before release |
| Environment | Local fixture with fake gateway, ledger and notifier. No live system. |

## Summary

Duplicate payout protection only exists for one run attempt. When the settlement job is retried after a partial failure, or simply run again, every task that was already paid is paid a second time.

## Steps to reproduce

1. Install Node 20 or later, then run `npm run test:faulty`.
2. Or by hand: build five completed tasks inside window `2026-10-19`, then configure the fake gateway to crash on call 3.
3. Run settlement for `2026-10-27T09:00:00Z`. The run stops after paying T1 and T2.
4. Recover the gateway and run settlement again for the same `runAt`, which is the job retry.
5. Count gateway transfers per task.

## Expected and actual

| | Expected | Actual |
|---|---|---|
| Transfers for T1 and T2 | 1 each | 2 each |
| Total credits paid | 50 | 70 |
| Ledger entries | 5 | 5 (overwritten, so the ledger hides the duplicate) |
| Notifications | 5 | 7 (users are told they were paid twice) |

## Evidence

* **TC11 failure:** `T1 must have exactly one transfer`, 2 !== 1 (see `results/faulty_run.txt`).
* **TC10 failure:** `each task must be paid exactly once`, 40 !== 20.
* **TC12 failure:** after a lost gateway response, T2 has 2 transfers.
* **TC13 failure:** a task paid in week `2026-10-12` is paid again.
* The same 16 tests pass on the fixed build (`results/fixed_run.txt`).

## Severity rationale

* **Money leaves the system.** On a wallet product a payout may not be reversible.
* **The ledger does not show it.** The faulty code overwrites the ledger row, so internal reports match while the gateway has extra transfers. Only reconciliation against the gateway would find it.
* **It triggers on the normal recovery action.** Retrying a failed job is what schedulers and operators do by default, so any gateway timeout turns into a duplicate payout.
* **It scales with the batch.** Everything paid before the failure point is paid again.

## Root cause

Duplicate protection is scoped to the run attempt instead of the task ID.

1. The gateway idempotency key is `${runId}:${taskId}`, and `runId` is a new UUID on every run, so the gateway sees each retry as a new payment.
2. The ledger is written after payment but never read before payment. Only an in memory set (cleared each run) is checked.

## Fix (see `results/fix.diff`)

1. Use a stable key per task: `task:${taskId}`. The gateway then replays the original transfer instead of moving money again, which also covers a response lost after commit.
2. Check the persistent ledger before paying, so tasks paid in this or any earlier run are skipped.
3. **Recommended for production:** a unique constraint on `taskId` in the ledger, plus a lock so two workers cannot settle the same window at once (gap G1).

## Release checks that block this failure

* TC10 to TC13 run in CI on every change to settlement, payout or ledger code. Any failure blocks the merge.
* Before release, run a gateway versus ledger reconciliation on staging (transfer count and total per window must match).
* The idempotency key format is part of the code review checklist for any payout call.
