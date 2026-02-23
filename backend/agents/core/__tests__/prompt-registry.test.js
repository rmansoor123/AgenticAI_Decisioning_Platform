/**
 * Integration test: verifies PromptRegistry loads and serves domain knowledge prompts.
 * Run with: node backend/agents/core/__tests__/prompt-registry.test.js
 */

import { getPromptRegistry } from '../prompt-registry.js';

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
  const stats = registry.getStats();

  // ── Test 1: Prompts loaded ──
  console.log('\nTest 1: Prompts loaded from disk');
  assert(stats.totalPrompts >= 10, `Loaded ${stats.totalPrompts} prompts (expected >= 10)`);

  // ── Test 2: Shared prompts exist ──
  console.log('\nTest 2: Shared prompts indexed');
  assert(stats.byAgent.shared >= 3, `Shared prompts: ${stats.byAgent.shared} (expected >= 3)`);

  // ── Test 3: Agent-specific prompts exist ──
  console.log('\nTest 3: Agent-specific prompts indexed');
  assert(stats.byAgent['seller-onboarding'] >= 3, `Seller onboarding prompts: ${stats.byAgent['seller-onboarding']}`);
  assert(stats.byAgent['fraud-investigation'] >= 2, `Fraud investigation prompts: ${stats.byAgent['fraud-investigation']}`);
  assert(stats.byAgent['alert-triage'] >= 1, `Alert triage prompts: ${stats.byAgent['alert-triage']}`);
  assert(stats.byAgent['rule-optimization'] >= 1, `Rule optimization prompts: ${stats.byAgent['rule-optimization']}`);

  // ── Test 4: getPrompts returns content for seller-onboarding think phase ──
  console.log('\nTest 4: getPrompts returns domain knowledge');
  const onboardingThink = registry.getPrompts('seller-onboarding', 'think');
  assert(onboardingThink.length > 0, 'Seller onboarding think phase has content');
  assert(onboardingThink.includes('KYC') || onboardingThink.includes('fraud') || onboardingThink.includes('risk'),
    'Content contains fraud domain knowledge');

  // ── Test 5: Shared prompts included in agent queries ──
  console.log('\nTest 5: Shared prompts merged with agent prompts');
  assert(onboardingThink.includes('fraud-patterns') || onboardingThink.includes('risk-signals') || onboardingThink.includes('Fraud'),
    'Shared knowledge merged into agent prompts');

  // ── Test 6: Unknown agent returns shared-only ──
  console.log('\nTest 6: Unknown agent gets shared prompts');
  const unknownAgent = registry.getPrompts('unknown-agent', 'think');
  assert(unknownAgent.length > 0, 'Unknown agent still gets shared prompts');

  // ── Test 7: Token budget respected ──
  console.log('\nTest 7: Token budget');
  const tiny = registry.getPrompts('seller-onboarding', 'think', 10); // 10 tokens = 40 chars
  assert(tiny.length <= 200, `Tiny budget output length: ${tiny.length} (expected <= 200)`);

  // ── Test 8: getPromptById works ──
  console.log('\nTest 8: getPromptById');
  const fraudPatterns = registry.getPromptById('fraud-patterns');
  assert(fraudPatterns !== null, 'fraud-patterns prompt found');
  assert(fraudPatterns.agent === 'shared', 'fraud-patterns is shared');
  assert(fraudPatterns.priority === 'high', 'fraud-patterns is high priority');

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
