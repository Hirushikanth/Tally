// Bundle-size budget guard (Phase H9).
//
// Usage: node scripts/check-bundle-size.mjs   (run after `pnpm build`)
//
// Checks two metrics against thresholds and exits non-zero if a hard budget is
// exceeded, so CI fails before a regression ships:
//
//   1. Total raw JS in dist/assets (all chunks — lazy + initial).
//   2. Initial-load gzip (the .js files modulepreloaded in index.html).
//
// Soft thresholds print a warning; hard thresholds fail the run.
// Adjust numbers in PRODUCTION_HARDENING.md when the budget moves.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const assetsDir = join(distDir, 'assets');

const KB = 1024;

const BUDGETS = {
  totalRaw: { warn: 550 * KB, fail: 700 * KB },
  initialGzip: { warn: 130 * KB, fail: 160 * KB },
};

function fail(message) {
  console.error(`\n[check-bundle-size] FAIL: ${message}`);
  process.exit(1);
}

if (!statSync(distDir, { throwIfNoEntry: false })) {
  fail(`no ${distDir} directory — run "pnpm build" first.`);
}

const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
if (jsFiles.length === 0) {
  fail(`no .js files in ${assetsDir}.`);
}

let totalRaw = 0;
for (const file of jsFiles) {
  totalRaw += statSync(join(assetsDir, file)).size;
}

const html = readFileSync(join(distDir, 'index.html'), 'utf8');
const initialFiles = [...html.matchAll(/href="\/assets\/([^"]+\.js)"/g)].map(
  (m) => m[1],
);
let initialGzip = 0;
for (const file of initialFiles) {
  const content = readFileSync(join(assetsDir, file));
  initialGzip += gzipSync(content, { level: 9 }).length;
}

const fmt = (bytes) => `${(bytes / KB).toFixed(0)} kB`;
const fmtGzip = (bytes) => `${(bytes / KB).toFixed(1)} kB gzip`;

const results = [
  { name: 'total JS (raw)', value: totalRaw, budget: BUDGETS.totalRaw, format: fmt },
  {
    name: 'initial-load JS (gzip)',
    value: initialGzip,
    budget: BUDGETS.initialGzip,
    format: fmtGzip,
  },
];

console.log('\n[check-bundle-size]');
let failed = false;
for (const { name, value, budget, format } of results) {
  const state = value > budget.fail ? 'FAIL' : value > budget.warn ? 'WARN' : 'ok';
  if (state !== 'ok') failed ||= state === 'FAIL';
  console.log(
    `  ${name.padEnd(24)} ${format(value).padStart(14)}  (warn > ${format(budget.warn).padStart(9)}, fail > ${format(budget.fail).padStart(9)})  [${state}]`,
  );
}

if (failed) {
  console.error(
    '[check-bundle-size] Budget exceeded — see PRODUCTION_HARDENING.md (H9) for the audit baseline and expectations.\n',
  );
  process.exit(1);
}
if (initialFiles.length > 0) {
  console.log(
    `  Initial modules (${initialFiles.length}): ${initialFiles.map((f) => f.replace(/\.js$/, '')).join(', ')}\n`,
  );
} else {
  console.log('\n');
}
