# Settlement retry regression (MUST Quest)

This project reproduces and prevents a duplicate payout in a **fictional** weekly rewards settlement. It does not touch any live system. The tests are written in **Playwright Test** as API level checks; no browser is needed.

## Run

You need Node 20 or later.

```
npm install           # installs @playwright/test (one time)
npm test              # corrected implementation: 16 of 16 pass
npm run test:faulty   # faulty implementation: TC10 to TC13 fail (DEF 001)
npm run test:ui       # watch both projects run in Playwright UI mode
npm run report        # open the HTML report of the last run
```

Saved runs are in `results/fixed_run.txt` and `results/faulty_run.txt`. Each run also writes an HTML report to `results/html_report`.

UI mode opens a Playwright window. If Playwright asks for a browser the first time, run `npx playwright install chromium`.

## Read in this order

1. `intent.md`: why this failure, and how the alternatives were ranked
2. `docs/test_cases.md`: the flow map, assumptions, and 16 test cases with results
3. `docs/defect_report.md`: DEF 001 root cause and fix
4. `docs/release_readiness_checklist.md`: the release decision, gaps and handoff
5. `directive.md`: objective, scope, requirements, completion criteria and links

## Layout

```
src/window.js             settlement window rules (UTC, upper bound excluded)
src/settlement.js         corrected reference implementation
src/settlement.faulty.js  faulty implementation, kept to reproduce DEF 001
src/fakes.js              fake ledger, payout gateway and notifier
tests/settlement.spec.js  regression suite (Playwright Test)
playwright.config.js      two projects: "fixed" and "faulty"
results/                  saved runs and fix.diff
```
