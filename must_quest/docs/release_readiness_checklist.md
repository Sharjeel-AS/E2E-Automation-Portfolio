# Release readiness checklist: weekly settlement

A change to settlement, payout, ledger or notification code is ready only when every **must** item passes.

| # | Check | Type | Faulty build | Fixed build |
|---|---|---|---|---|
| 1 | Full regression suite passes (TC01 to TC16) | Must | Fail (4) | Pass |
| 2 | Retry and rerun checks pass (TC10 to TC13) | Must | Fail | Pass |
| 3 | Boundary and time zone checks pass (TC02 to TC08) | Must | Pass | Pass |
| 4 | Notification partial failure checks pass (TC14, TC15) | Must | Pass | Pass |
| 5 | Payout calls use a task scoped idempotency key | Must, code review | Fail | Pass |
| 6 | Ledger is checked before paying | Must, code review | Fail | Pass |
| 7 | Staging reconciliation: gateway transfers equal ledger entries per window | Must, staging | Not run | Not run (no staging in this fixture) |
| 8 | Run report lists rejected, declined and notification failed tasks for operations | Must | Pass | Pass |
| 9 | Rollback plan: disable the job flag, no automatic reversals | Must | Documented | Documented |
| 10 | Concurrency guard (one worker per window) | Should | Not covered (G1) | Not covered (G1) |
| 11 | Pending notification resend job exists | Should | Not covered (G2) | Not covered (G2) |

## Remaining gaps

| ID | Gap | Risk if shipped | Suggested next step |
|---|---|---|---|
| G1 | Two workers settling the same window at the same moment can both pass the ledger check | Duplicate payout under concurrency | Unique constraint on `taskId` plus a window lock; add a concurrency test |
| G2 | Notifications left `pending` are never resent | User is paid but never told | Resend job with its own idempotency key; test that a resend does not repeat the payout |
| G3 | Gateway idempotency key retention is unknown | If the gateway forgets keys, a lost response retry would pay twice | Confirm retention with the provider; the ledger check stays as the guard |
| G4 | Wallet or account change between completion and settlement | Payout to the wrong destination | Product decision needed, then test cases |
| G5 | Admin changes credits per task mid week | Users in the same week paid differently | Snapshot the config at window start; add a test |
| G6 | Declined payouts have no retry policy | Eligible users wait indefinitely | Define a retry limit and an operations alert |

## Release decision

* **Faulty build: No go.** Checks 1, 2, 5 and 6 fail, and DEF 001 is critical.
* **Fixed build: Go for the retry fix, with conditions.** Run check 7 on staging before production. Track G1 and G2 as the next release items, because they are the remaining paths to a duplicate or silent payout.

## Handoff

* **Run:** `npm test` (fixed) and `npm run test:faulty` (reproduces DEF 001). Both write output to `results/`.
* **Where the logic lives:** window rules in `src/window.js`, settlement in `src/settlement.js`, test doubles in `src/fakes.js`.
* **Adding a case:** add a `test(...)` block in `tests/settlement.spec.js`. Assert on `gateway.transfers`, not only the run report.
* **Owner for G1 and G2:** backend engineer with QA review. Tests should come before the fix.
