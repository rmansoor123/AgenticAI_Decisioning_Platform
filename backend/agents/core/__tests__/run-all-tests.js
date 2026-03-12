#!/usr/bin/env node
/**
 * Test Runner — Discovers and runs all .test.js files in this directory.
 *
 * Usage:
 *   node backend/agents/core/__tests__/run-all-tests.js           # run all tests
 *   node backend/agents/core/__tests__/run-all-tests.js --quick   # skip golden suite (fast CI)
 *
 * Each test file is run as a subprocess. Exit code 0 = all passed,
 * non-zero = at least one suite failed.
 */

import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isQuick = process.argv.includes('--quick');

// Discover test files
const testFiles = readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js') && f !== 'run-all-tests.js')
  .filter(f => !(isQuick && f === 'golden-test-suite.test.js'))
  .sort();

console.log('\n══════════════════════════════════════════════════════');
console.log(`  Test Runner — ${testFiles.length} test suites${isQuick ? ' (quick mode)' : ''}`);
console.log('══════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;
const failures = [];
const startTime = Date.now();

async function runTest(file) {
  const filePath = join(__dirname, file);
  return new Promise((resolve) => {
    const suiteStart = Date.now();
    const child = fork(filePath, [], {
      env: { ...process.env, USE_LLM: 'false' },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      timeout: 120_000 // 2 minute timeout per suite
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('exit', (code) => {
      const durationMs = Date.now() - suiteStart;
      const durationStr = `${(durationMs / 1000).toFixed(1)}s`;
      if (code === 0) {
        passed++;
        console.log(`  ✓ ${file} (${durationStr})`);
      } else {
        failed++;
        console.log(`  ✗ ${file} (${durationStr}) — exit code ${code}`);
        failures.push({ file, code, stderr: stderr.trim().split('\n').slice(-5).join('\n') });
      }
      resolve(code);
    });

    child.on('error', (err) => {
      failed++;
      console.log(`  ✗ ${file} — ${err.message}`);
      failures.push({ file, code: -1, stderr: err.message });
      resolve(-1);
    });
  });
}

// Run tests sequentially to avoid DB contention
for (const file of testFiles) {
  await runTest(file);
}

const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

console.log('\n══════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed (${totalDuration}s)`);
console.log('══════════════════════════════════════════════════════\n');

if (failures.length > 0) {
  console.log('Failures:\n');
  for (const f of failures) {
    console.log(`  ${f.file} (exit ${f.code}):`);
    if (f.stderr) console.log(`    ${f.stderr.replace(/\n/g, '\n    ')}`);
    console.log('');
  }
}

process.exit(failed > 0 ? 1 : 0);
