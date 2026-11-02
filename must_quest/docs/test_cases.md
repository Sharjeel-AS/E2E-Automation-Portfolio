# Flow map and test cases

## Flow map (weekly settlement)

1. **Trigger:** the scheduler starts the run on Tuesday 09:00 UTC.
2. **Window:** compute [previous Monday 00:00 UTC, most recent Monday 00:00 UTC). The upper bound is excluded and all math is in UTC.
3. **Validate each task:** it needs a task ID, a user ID and a timestamp with an explicit offset. Otherwise it is skipped and not paid.
4. **Qualify:** the status must be `completed` and `completedAt` must be inside the window.
5. **Dedupe in the batch:** the same task ID appearing twice in the input counts once.
6. **Dedupe across runs:** if the ledger already has the task ID, skip it.
7. **Pay:** call the gateway for 10 credits with idempotency key `task:<taskId>`.
   * Declined: no ledger entry and no notification. The task stays eligible.
   * Crash or timeout: stop the run. The job runner retries it.
8. **Record:** write a ledger entry with notification status `pending`.
9. **Notify:** send a push to the user.
   * Success: notification status becomes `sent`.
   * Failure: the payout stays, the status stays `pending` and the task is reported for resend.

## Assumptions

* **Account changes:** the payout goes to the user ID that owns the task when settlement runs. A wallet address change between completion and settlement is out of scope (gap G4).
* **Admin settings:** credits per task (10) and the schedule are fixed for this assessment. A mid week admin change to the credit value is out of scope (gap G5).
* **Timestamps:** the timestamp arrives as ISO 8601. One without an offset is ambiguous, so it is skipped, not guessed.
* **Gateway:** it honours idempotency keys indefinitely. The ledger check is the second guard if it does not.

## Test cases

Fixture run: Tuesday 27 Oct 2026 09:00 UTC, which settles window `2026-10-19`, that is [Mon 19 Oct 00:00 UTC, Mon 26 Oct 00:00 UTC).
Results come from `results/faulty_run.txt` and `results/fixed_run.txt`.

| ID | Covers | Input | Expected | Faulty | Fixed |
|---|---|---|---|---|---|
| TC01 | Happy path | 3 tasks, 2 users, inside window | alice 20, bilal 10, 3 notifications | Pass | Pass |
| TC02 | Cut off, lower bound | `2026-10-19T00:00:00.000Z` | Paid | Pass | Pass |
| TC03 | Cut off, upper bound | `2026-10-26T00:00:00.000Z` | Not paid this run, paid in the 3 Nov run | Pass | Pass |
| TC04 | Cut off, last millisecond | `2026-10-25T23:59:59.999Z` | Paid | Pass | Pass |
| TC05 | Time zone, ahead of UTC | `2026-10-26T04:30:00+05:00` (Monday in Karachi, Sunday 23:30 UTC) | Paid this week | Pass | Pass |
| TC06 | Time zone, behind UTC | `2026-10-25T19:30:00-07:00` (Sunday in LA, Monday 02:30 UTC) | Paid next week, not this week | Pass | Pass |
| TC07 | Invalid timestamp | `2026-10-21T10:00:00` (no offset) | Not paid, no notification | Pass | Pass |
| TC08 | Server time zone | Window computed with TZ = UTC, Asia/Karachi, America/Los_Angeles | Same window every time | Pass | Pass |
| TC09 | Duplicate input | task_101 listed twice in one batch | One transfer | Pass | Pass |
| TC10 | Retry after success | Same week run twice | 20 credits total, 2 notifications | **Fail** (40 credits) | Pass |
| TC11 | Retry after partial failure (selected) | 5 tasks, gateway crashes on call 3, job retried | Each task exactly one transfer, 50 total | **Fail** (task_101, task_102 paid twice) | Pass |
| TC12 | Retry after a lost response (selected) | task_102 transfer commits, response lost, job retried | One transfer per task, 20 total | **Fail** (task_101 and task_102 paid twice) | Pass |
| TC13 | Already paid earlier | task_101 in ledger from week `2026-10-12` | No transfer | **Fail** (paid again) | Pass |
| TC14 | Partial failure, notification | Push fails for bilal | Payout stays, status `pending` | Pass | Pass |
| TC15 | Payout declined | Gateway declines chen | No notification, no ledger entry, still eligible | Pass | Pass |
| TC16 | Not qualifying | Status `in_progress`, `cancelled` | No payout | Pass | Pass |

**Totals:** the faulty build passes 12 and fails 4. The fixed build passes 16 and fails 0.
