# Settlement retry regression (MUST Quest)

This project reproduces and prevents a duplicate payout in a **fictional** weekly rewards settlement. It does not touch any live system.

## Run

You need Node 20 or later. There is nothing to install.

```
npm test              # corrected implementation: 16 of 16 pass
npm run test:faulty   # faulty implementation: TC10 to TC13 fail (DEF 001)
```

Output is saved to `results/fixed_run.txt` and `results/faulty_run.txt`.

## Read in this order

1. `intent.md`: why this failure, and how the alternatives were ranked
2. `docs/test_cases.md`: the flow map, assumptions and 16 test cases with results
3. `docs/defect_report.md`: DEF 001 root cause and fix
4. `docs/release_readiness_checklist.md`: the release decision, gaps and handoff
5. `directive.md`: objective, scope, requirements, completion criteria and links

## Layout

```
src/window.js            settlement window rules (UTC, upper bound excluded)
src/settlement.js        corrected reference implementation
src/settlement.faulty.js faulty implementation kept to reproduce DEF 001
src/fakes.js             fake ledger, payout gateway and notifier
tests/settlement.test.js regression suite (node:test)
scripts/run.mjs          runs the suite for one implementation and saves results
results/                 saved runs and fix.diff
```
