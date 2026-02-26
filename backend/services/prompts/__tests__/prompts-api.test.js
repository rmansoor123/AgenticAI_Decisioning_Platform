/**
 * Integration test: verifies PromptRegistry data that the Prompts API serves.
 * Run with: node backend/services/prompts/__tests__/prompts-api.test.js
 */

import { getPromptRegistry } from '../../../agents/core/prompt-registry.js';

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  const registry = getPromptRegistry();

  // ── Test 1: Registry baseline — loads >= 10 prompts ──
  console.log('\nTest 1: Registry baseline');
  const stats = registry.getStats();
  assert(stats.totalPrompts >= 10, `Registry loaded ${stats.totalPrompts} prompts (expected >= 10)`);

  // ── Test 2: getPromptById returns expected fields for fraud-patterns ──
  console.log('\nTest 2: getPromptById returns expected fields');
  const fraudPatterns = registry.getPromptById('fraud-patterns');
  assert(fraudPatterns !== null, 'fraud-patterns prompt exists');
  assert(fraudPatterns.id === 'fraud-patterns', `id is "fraud-patterns" (got "${fraudPatterns?.id}")`);
  assert(fraudPatterns.agent === 'shared', `agent is "shared" (got "${fraudPatterns?.agent}")`);
  assert(Array.isArray(fraudPatterns.phases), `phases is an array`);
  assert(fraudPatterns.content && fraudPatterns.content.length > 100, `content length is ${fraudPatterns?.content?.length} (expected > 100)`);
  assert(typeof fraudPatterns.filePath === 'string' && fraudPatterns.filePath.endsWith('.md'), `filePath ends with .md (got "${fraudPatterns?.filePath}")`);

  // ── Test 3: getStats returns proper structure ──
  console.log('\nTest 3: getStats returns proper structure');
  assert(typeof stats.byAgent === 'object' && stats.byAgent !== null, 'byAgent is an object');
  assert(typeof stats.byPhase === 'object' && stats.byPhase !== null, 'byPhase is an object');
  assert(Array.isArray(stats.prompts), 'prompts is an array');
  assert(stats.prompts.length > 0, 'prompts array is non-empty');

  const sampleEntry = stats.prompts[0];
  assert(typeof sampleEntry.id === 'string' && sampleEntry.id.length > 0, 'prompt entry has id (string)');
  assert(typeof sampleEntry.agent === 'string' && sampleEntry.agent.length > 0, 'prompt entry has agent (string)');
  assert(Array.isArray(sampleEntry.phases), 'prompt entry has phases (array)');
  assert(typeof sampleEntry.priority === 'string' && sampleEntry.priority.length > 0, 'prompt entry has priority (string)');

  // ── Test 4: All prompts have required fields ──
  console.log('\nTest 4: All prompts have required fields');
  let allValid = true;
  for (const entry of stats.prompts) {
    const full = registry.getPromptById(entry.id);
    if (!full) {
      console.error(`  FAIL: getPromptById("${entry.id}") returned null`);
      allValid = false;
      failed++;
      continue;
    }
    const hasId = typeof full.id === 'string' && full.id.length > 0;
    const hasAgent = typeof full.agent === 'string' && full.agent.length > 0;
    const hasPhases = Array.isArray(full.phases) && full.phases.length > 0;
    const hasContent = typeof full.content === 'string' && full.content.length > 0;

    if (!hasId || !hasAgent || !hasPhases || !hasContent) {
      const missing = [];
      if (!hasId) missing.push('id');
      if (!hasAgent) missing.push('agent');
      if (!hasPhases) missing.push('phases');
      if (!hasContent) missing.push('content');
      console.error(`  FAIL: prompt "${entry.id}" missing fields: ${missing.join(', ')}`);
      allValid = false;
      failed++;
    }
  }
  if (allValid) {
    assert(true, `All ${stats.prompts.length} prompts have id, agent, phases, and content`);
  }

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
