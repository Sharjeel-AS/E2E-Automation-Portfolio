# Directive: stop duplicate payouts on settlement retry

Final version. It grew out of `intent.md`.

## 1. Objective

Prove with a runnable local fixture that a weekly rewards settlement pays each task ID exactly once, even when the job is retried after a partial failure. Show the regression failing on the faulty behaviour and passing on a corrected reference implementation.

## 2. Scope

**In scope**

* The settlement window: the run is Tuesday 09:00 UTC; the window starts Monday 00:00 UTC and excludes the upper bound.
* 10 test credits per completed task. Each task ID is counted once.
* Retry after a gateway crash, retry after a lost gateway response, rerun after success, and tasks already paid in an earlier week.
* A notification is sent only after a successful payout. A notification failure never reverses a payout.

**Out of scope (non goals)**

* Any live MUST product, live financial system or real blockchain transaction.
* Concurrency between workers, a notification resend job, wallet changes and admin changes mid week. These are recorded as gaps G1 to G6.

All data in this project is synthetic. User names such as alice and bilal are fictional.

## 3. Requirements

1. A local fixture with no dependencies: Node 20 or later, no network calls, nothing to install.
2. At least eight test cases with inputs and expected outcomes, covering:
   * the happy path
   * a cut off boundary
   * a time zone conversion
   * duplicate input
   * a retry
   * a partial failure
3. One command per implementation. Each one saves its output to `results/`.
4. Assertions check money that actually moved (gateway transfers), not only the job report.
5. One defect report with:
   * reproduction steps
   * expected and actual behaviour
   * severity rationale
   * root cause
   * evidence
   * a proposed fix
   * the release checks that would block the failure
6. A release readiness checklist with a decision, gaps and handoff notes.

## 4. Completion criteria

| Criterion | Status |
|---|---|
| At least 3 failure problems listed and ranked | Done: 4, in `intent.md` |
| At least 8 test cases with inputs and expected results | Done: 16, in `docs/test_cases.md` |
| Regression fails on the faulty behaviour | Done: TC10 to TC13 fail |
| Regression passes on the fixed implementation | Done: 16 of 16 pass |
| Defect report complete | Done: `docs/defect_report.md` |
| Release decision and gaps recorded | Done: `docs/release_readiness_checklist.md` |
| Loom of 5 minutes or less | Linked in the appendix |

## Appendix: results and handoff

### A. Links

| Item | Link |
|---|---|
| Repository (runnable test project) | [https://github.com/Sharjeel-AS/E2E-Automation-Portfolio/tree/main/must_quest](https://github.com/Sharjeel-AS/E2E-Automation-Portfolio/tree/main/must_quest) |
| Quest Loom | [Aisha: Loom link] |
| Career Path and Career Leverage video | [Aisha: Loom or Drive link] |
| Intent and prioritisation | [intent.md](intent.md) |
| Flow map, assumptions and 16 test cases with results | [docs/test_cases.md](docs/test_cases.md) |
| Defect and root cause report (DEF 001) | [docs/defect_report.md](docs/defect_report.md) |
| Release readiness checklist, decision and gaps | [docs/release_readiness_checklist.md](docs/release_readiness_checklist.md) |
| Failing run (faulty build) | [results/faulty_run.txt](results/faulty_run.txt) |
| Passing run (fixed build) | [results/fixed_run.txt](results/fixed_run.txt) |
| Code change | [results/fix.diff](results/fix.diff) |
| Test suite | [tests/settlement.test.js](tests/settlement.test.js) |

### B. How to reproduce

```
git clone https://github.com/Sharjeel-AS/E2E-Automation-Portfolio.git
cd E2E-Automation-Portfolio/must_quest
npm test              # fixed implementation
npm run test:faulty   # faulty implementation, reproduces DEF 001
```

You need Node 20 or later. There is nothing to install.

### C. Checks and actual results

| Run | Command | Result |
|---|---|---|
| Fixed build | `npm test` | 16 passed, 0 failed |
| Faulty build | `npm run test:faulty` | 12 passed, 4 failed (TC10, TC11, TC12, TC13) |

The failure messages match the defect:

* TC10: 40 credits paid instead of 20.
* TC11: T1 has 2 transfers instead of 1.
* TC12: T2 has 2 transfers instead of 1.
* TC13: a task from an earlier week was paid again.

These results come from running both commands locally on [Aisha: date, macOS, Node version].

### D. Release decision

* **Faulty build: No Go.**
* **Fixed build: Go for the retry fix.** One condition: run a gateway versus ledger reconciliation on staging first.
* **Next items:** G1 (concurrency guard) and G2 (notification resend job).

### E. AI contribution, corrections and my own work

**What existed before.** Nothing from past employers. I prepared this project from the Quest brief that was published in the job posting, before I formally accepted the Quest. The rules come from the suggested fictional case in that brief.

**What AI did.** I used Claude (Anthropic) to draft:

* the failure list
* the fixture, fakes and implementations
* the first version of the 16 tests
* the first drafts of every document

**AI output that was corrected:**

* The first version of the test runner pointed Node at a folder (`tests/`) and failed to start. It was corrected to point at the test file, then both modes were rerun.
* A [Aisha: add anything you changed or rejected. For example, a test you rewrote, a severity you changed, or wording you corrected.]

**What I decided and verified myself.** [Aisha: write this honestly in your own words. For example:]

* the choice of failure and its ranking
* the assumption that timestamps without an offset are rejected
* the release decision
* reading the diff line by line
* running both modes myself
* temporarily reverting the fix to watch TC11 fail

### F. Limitations

* This is a fixture with fakes, not a real payout system. No real gateway, database or blockchain was tested.
* Only one deep failure was chosen. Boundary, time zone and notification behaviour are covered by tests but were not investigated in depth.
* The likelihood scores in `intent.md` are my judgment, not measured incident data.
* Gaps G1 to G6 in the checklist remain open.

### G. Actual effort

[Aisha: total hours, for example "about 7 hours including review, documentation and Loom"]
