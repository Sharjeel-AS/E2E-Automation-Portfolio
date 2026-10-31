import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const impl = process.argv[2] === 'faulty' ? 'faulty' : 'fixed';
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const result = spawnSync(process.execPath, [cli, 'test', `--project=${impl}`], {
  env: { ...process.env, FORCE_COLOR: '0' },
  encoding: 'utf8',
});
const output = `${result.stdout}${result.stderr}`;
process.stdout.write(output);

mkdirSync('results', { recursive: true });
const stamp = new Date().toISOString();
writeFileSync(`results/${impl}_run.txt`, `Playwright project=${impl}  node ${process.version}  ${stamp}\n\n${output}`);
console.log(`\nSaved results/${impl}_run.txt (exit code ${result.status})`);
process.exit(result.status ?? 1);
