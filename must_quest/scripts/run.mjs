// Cross platform runner: node scripts/run.mjs fixed|faulty
// Runs the suite against the chosen implementation and saves the output in results/.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const impl = process.argv[2] === 'faulty' ? 'faulty' : 'fixed';
const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'tests/settlement.test.js'], {
  env: { ...process.env, IMPL: impl, FORCE_COLOR: '0', NO_COLOR: '1' },
  encoding: 'utf8',
});
const output = `${result.stdout}${result.stderr}`;
process.stdout.write(output);

mkdirSync('results', { recursive: true });
const stamp = new Date().toISOString();
writeFileSync(`results/${impl}_run.txt`, `IMPL=${impl}  node ${process.version}  ${stamp}\n\n${output}`);
console.log(`\nSaved results/${impl}_run.txt (exit code ${result.status})`);
process.exit(result.status ?? 1);
