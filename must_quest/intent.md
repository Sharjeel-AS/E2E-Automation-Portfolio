# Intent

## Why this problem

A weekly settlement job pays users from a batch. When a batch job fails partway, the normal reaction (by a scheduler or an operator) is to run it again. If duplicate protection only lives inside one run attempt, every retry pays the same tasks again. The money has already left, the ledger can look clean, and the first signal is usually a reconciliation gap or a user who noticed the extra credits.

I chose this failure because it breaks the strictest rule in the brief ("task IDs must be counted once; retries must not create a second payout"). It also cannot be fixed with a support reply: reversing a payout is slow, and on a wallet product it may not be possible at all.

## Failure problems considered

Scores: 3 = high, 2 = medium, 1 = low. For effort, 3 means cheap to prevent with tests.

| Rank | Failure problem | User and business impact | Likelihood | Effort to prevent | Decision |
|---|---|---|---|---|---|
| 1 | Retry after a partial failure pays the same task twice | 3: money out, hard or impossible to reverse, ledger can hide it | 2: job timeouts and gateway errors are routine; retries are the default response | 3: one fixture plus four checks | **Selected** |
| 2 | Cut off boundary or time zone puts a task in the wrong week | 2: late payout, support tickets ("I finished on Sunday, does it count?") | 3: every week, every user near midnight UTC | 3: pure date logic, easy to test | Covered by TC02 to TC08, not the deep dive |
| 3 | Notification failure reverses or blocks the payout | 2: user loses credits they earned, or gets a false "paid" message | 2: push providers fail regularly | 2: needs a pending state and a resend job | Covered by TC14 and TC15; resend job listed as a gap |
| 4 | Account or wallet change between task completion and settlement | 3: payout to an old address | 1: rare per user | 1: needs product decisions first | Assumption recorded, not tested |

## Affected users

* **Reward earners:** they receive credits twice and are told twice. If the duplicate is clawed back later, they lose trust.
* **Operations and support:** they find the gap during reconciliation and have to explain or reverse payouts by hand.
* **Finance:** money leaves the reward pool without being earned. On a wallet product it may not be recoverable.
* **Engineering:** the team is pulled from building to investigate, because the internal ledger looks correct.

## Evidence

* The brief's own rule says "retries must not create a second payout", so the business treats this as critical.
* The role posting describes small live product gaps turning into weeks of operation support.
* The fixture shows the behaviour directly. With the faulty code, one gateway crash in a batch of five tasks turns 50 credits into 70.
* This is not evidence of a real MUST incident. It is a reproduction in synthetic data.

## Intended value

* Four automated checks (TC10 to TC13) that block any change which brings back duplicate payouts.
* A clear rule for engineers: idempotency keys are scoped to the task, and the ledger is checked before paying.
* A release checklist operations can use before every settlement related release.

## Non goals

* Testing a live system or real money.
* Solving the cut off, time zone and notification problems in depth. They are covered by tests only.
* Concurrency between workers, a notification resend job, wallet changes and admin settings. These are recorded as gaps.

## Uncertainty

I have no access to MUST incident history, so I am not claiming any of these happened in a real product. The ranking comes from how batch payout systems behave in general and from the problems described in the role posting. Likelihood scores are my judgment, not measured data. If real support data were available, I would rerank using ticket counts per cause.

## Why the deep dive is worth it

The faulty implementation passes the happy path, the boundary cases, the time zone cases and even the duplicate in one batch case (12 of 16 tests). A suite that only covers single run behaviour would ship this defect. It only shows up when the same week is processed more than once, which is exactly what happens during an incident.

## How AI was used and what I verified

**What AI did:** Claude drafted the failure list, the fixture and fakes, the first version of the 16 test cases and the first drafts of the documents.

**What I verified myself:**

* I ran both builds on my Mac in VS Code: the faulty build fails TC10 to TC13, and the fixed build passes all 16.
* I broke the fix on purpose by making the payment key random, then ran the tests again. TC12 failed and TC11 still passed. This showed that both parts of the fix are needed: the ledger check covers a crash, and the stable key covers a payment whose response was lost. I then restored the fix and all 16 passed.
* I reviewed the code and tests, and asked for an explanation of every part I was not sure about, for example how one test file runs against both builds and how `countFor` catches a double payment.

**What I decided as the reviewer:**

* moved the suite to Playwright Test, the stack I use
* required at least two assertions in every test
* checked there are no fixed waits, so the tests are not timing dependent
* had the code rewritten in a plain style another QA engineer can extend
* kept TC numbering so each test maps to the test case table and the defect evidence
