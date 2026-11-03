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
* Concurrency between workers, a notification resend job, wallet changes and admin changes mid week. These are recorded as gaps G1 to G7.

All data in this project is synthetic. User names such as alice and bilal are fictional.

## 3. Requirements

1. A local fixture: Node 20 or later, no network calls during tests, and one test dependency (Playwright Test).
2. At least eight test cases with inputs and expected outcomes, covering:
   * the happy path
   * a cut off boundary
   * a time zone conversion
   * duplicate input
   * a retry
   * a partial failure
3. One command per implementation, with the output of both runs saved in `results/`.
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
| Quest Loom | [https://www.loom.com/share/1e16088a63b94cab90fffeffb2a6ff7c](https://www.loom.com/share/1e16088a63b94cab90fffeffb2a6ff7c) |
| Career Path and Career Leverage video | [Aisha: Loom or Drive link] |
| Intent and prioritisation | [intent.md](intent.md) |
| Flow map, assumptions and 16 test cases with results | [docs/test_cases.md](docs/test_cases.md) |
| Defect and root cause report (DEF 001) | [docs/defect_report.md](docs/defect_report.md) |
| Release readiness checklist, decision and gaps | [docs/release_readiness_checklist.md](docs/release_readiness_checklist.md) |
| Failing run (faulty build) | [results/faulty_run.txt](results/faulty_run.txt) |
| Passing run (fixed build) | [results/fixed_run.txt](results/fixed_run.txt) |
| Code change | [results/fix.diff](results/fix.diff) |
| Test suite (Playwright Test) | [tests/settlement.spec.js](tests/settlement.spec.js) |

### B. How to reproduce

```
git clone https://github.com/Sharjeel-AS/E2E-Automation-Portfolio.git
cd E2E-Automation-Portfolio/must_quest
npm install
npm test              # fixed implementation
npm run test:faulty   # faulty implementation, reproduces DEF 001
```

You need Node 20 or later. Run `npm install` once before the tests. To watch the tests run, use `npm run test:ui`.

### C. Checks and actual results

| Run | Command | Result |
|---|---|---|
| Fixed build | `npm test` | 16 passed, 0 failed |
| Faulty build | `npm run test:faulty` | 12 passed, 4 failed (TC10, TC11, TC12, TC13) |

The failure messages match the defect:

* TC10: the rerun paid task_101 and task_102 again (expected nothing new).
* TC11: task_101 has 2 transfers instead of 1.
* TC12: after the lost response, the retry paid task_101 and task_102 again (2 transfers each instead of 1).
* TC13: a task from an earlier week was paid again.

These results come from running both commands on 3 Nov 2026 with Node 22 and Playwright Test 1.63.0, on a fresh clone of the repository.

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

* In the first version (Node's built in test runner), the runner script pointed Node at a folder (`tests/`) and failed to start. It was corrected to point at the test file, then both modes were rerun.
* The first defect notes said TC12 paid only task_102 twice. The Playwright run showed that the retry pays task_101 and task_102 twice, so the documents were corrected.
* TC08 changes the server time zone during the test. The first draft restored it incorrectly when no time zone was set; this was fixed before the final run.

**What I decided and verified myself.**

I reviewed the AI output the way I review any test suite before sign off, and changed what I would not accept:

* **Tooling:** the first version used Node's built in test runner. I moved it to Playwright Test, which is the stack I use, so the suite can run in CI the same way and can be watched in UI mode.
* **Assertion quality:** I required at least two assertions in every test, so each test checks both the money moved and the user facing result (paid list or notification). The suite now has 57 assertions.
* **Flakiness:** I checked that there are no fixed waits or sleeps, so the results do not depend on timing.
* **Maintainability:** I asked for the code to be rewritten in a plain style (one step per line, no unused code, a simple `beforeEach`) so another QA engineer can extend it without help.
* **Traceability:** I kept TC numbering so every automated test maps to a row in `docs/test_cases.md` and to the defect evidence, and replaced placeholder data with realistic task IDs.
* **Verification:** I broke the fix on purpose by changing the payment key to a random value on every run, then ran `npm test`. TC12 (retry after a lost response) failed while the other 15 passed, which showed that the ledger check alone does not protect a payment whose response was lost; the stable key is what protects it. I then restored the fix and all 16 passed again.
* **Understanding:** I asked for an explanation of every part I was not sure about, for example how one test file runs against both builds and how `countFor` detects a double payment, so I can explain and own the result.

### F. Limitations

* This is a fixture with fakes, not a real payout system. No real gateway, database or blockchain was tested.
* Only one deep failure was chosen. Boundary, time zone and notification behaviour are covered by tests but were not investigated in depth.
* The likelihood scores in `intent.md` are my judgment, not measured incident data.
* Gaps G1 to G7 in the checklist remain open.

### G. Actual effort

About 8 hours across 30 Oct to 3 Nov 2026 (estimate), including review sessions, code changes, documentation and the two Loom recordings.
