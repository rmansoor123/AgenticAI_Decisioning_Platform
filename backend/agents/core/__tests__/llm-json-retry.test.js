/**
 * Tests for LLMClient.completeWithJsonRetry() and _tryParseJson()
 * Run with: node backend/agents/core/__tests__/llm-json-retry.test.js
 */

import { getLLMClient } from '../llm-client.js';

async function runTests() {
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

  const client = getLLMClient();

  // ── Test 1: repairStats initialized in constructor ──
  console.log('\nTest 1: repairStats initialized');
  assert(client.repairStats !== undefined, 'repairStats exists');
  assert(client.repairStats.attempts === 0, 'repairStats.attempts starts at 0');
  assert(client.repairStats.successes === 0, 'repairStats.successes starts at 0');

  // ── Test 2: _tryParseJson with plain JSON ──
  console.log('\nTest 2: _tryParseJson with plain JSON');
  const plain = client._tryParseJson('{"risk": "HIGH", "score": 85}');
  assert(plain !== null, 'Parses plain JSON');
  assert(plain.risk === 'HIGH', 'Correct risk value');
  assert(plain.score === 85, 'Correct score value');

  // ── Test 3: _tryParseJson with markdown code block ──
  console.log('\nTest 3: _tryParseJson with markdown code block');
  const markdown = client._tryParseJson(
    'Here is the result:\n```json\n{"action": "BLOCK", "confidence": 0.9}\n```\nDone.'
  );
  assert(markdown !== null, 'Parses JSON from markdown block');
  assert(markdown.action === 'BLOCK', 'Correct action from markdown');
  assert(markdown.confidence === 0.9, 'Correct confidence from markdown');

  // ── Test 4: _tryParseJson with backtick block (no json tag) ──
  console.log('\nTest 4: _tryParseJson with backtick block (no json tag)');
  const backtick = client._tryParseJson(
    'Result:\n```\n{"status": "ok"}\n```'
  );
  assert(backtick !== null, 'Parses JSON from plain backtick block');
  assert(backtick.status === 'ok', 'Correct status from backtick block');

  // ── Test 5: _tryParseJson with invalid text ──
  console.log('\nTest 5: _tryParseJson with invalid text');
  const invalid = client._tryParseJson('This is not JSON at all');
  assert(invalid === null, 'Returns null for non-JSON text');

  // ── Test 6: _tryParseJson with null/empty ──
  console.log('\nTest 6: _tryParseJson with null/empty');
  assert(client._tryParseJson(null) === null, 'Returns null for null input');
  assert(client._tryParseJson('') === null, 'Returns null for empty string');
  assert(client._tryParseJson(undefined) === null, 'Returns null for undefined');

  // ── Test 7: _tryParseJson with JSON array ──
  console.log('\nTest 7: _tryParseJson with JSON array');
  const arr = client._tryParseJson('Here: [{"id": 1}, {"id": 2}]');
  assert(arr !== null, 'Parses JSON array');
  assert(Array.isArray(arr), 'Result is an array');
  assert(arr.length === 2, 'Array has correct length');

  // ── Test 8: completeWithJsonRetry returns fallback when LLM disabled ──
  console.log('\nTest 8: completeWithJsonRetry returns fallback when LLM disabled');
  // LLM is disabled in test (no API key), so should return fallback immediately
  const fallback = { action: 'REVIEW', reason: 'default' };
  const schema = { action: 'string', reason: 'string' };
  const result = await client.completeWithJsonRetry(
    'You are a test assistant.',
    'Analyze this.',
    schema,
    fallback
  );
  assert(result === fallback, 'Returns fallback when LLM disabled');
  // Should NOT increment repair stats when LLM is disabled
  assert(client.repairStats.attempts === 0, 'No repair attempted when disabled');

  // ── Test 9: completeWithJsonRetry parses on first attempt (mock) ──
  console.log('\nTest 9: completeWithJsonRetry first-attempt parse success (mock)');
  // Temporarily mock complete() to return valid JSON
  const originalComplete = client.complete.bind(client);
  const origEnabled = client.enabled;
  client.enabled = true;
  client.complete = async () => ({
    content: '{"action": "APPROVE", "score": 42}',
    usage: { inputTokens: 10, outputTokens: 20 },
    latencyMs: 100
  });

  const firstAttempt = await client.completeWithJsonRetry(
    'system',
    'user',
    { action: 'string', score: 'number' },
    { action: 'FALLBACK', score: 0 }
  );
  assert(firstAttempt.action === 'APPROVE', 'First attempt returns parsed JSON (action)');
  assert(firstAttempt.score === 42, 'First attempt returns parsed JSON (score)');
  assert(client.repairStats.attempts === 0, 'No repair attempted on first-attempt success');

  // ── Test 10: completeWithJsonRetry triggers repair on bad first response ──
  console.log('\nTest 10: completeWithJsonRetry repair attempt on parse failure');
  let callCount = 0;
  client.complete = async (sys, usr) => {
    callCount++;
    if (callCount === 1) {
      // First call: return non-JSON
      return {
        content: 'I think the risk is high and we should block it.',
        usage: { inputTokens: 10, outputTokens: 20 },
        latencyMs: 100
      };
    }
    // Second call (repair): return valid JSON
    return {
      content: '{"action": "BLOCK", "reason": "high risk"}',
      usage: { inputTokens: 20, outputTokens: 30 },
      latencyMs: 150
    };
  };

  const repairResult = await client.completeWithJsonRetry(
    'system',
    'user',
    { action: 'string', reason: 'string' },
    { action: 'FALLBACK', reason: 'default' }
  );
  assert(repairResult.action === 'BLOCK', 'Repair attempt returns parsed JSON');
  assert(repairResult.reason === 'high risk', 'Repair attempt correct reason');
  assert(client.repairStats.attempts === 1, 'Repair attempts incremented');
  assert(client.repairStats.successes === 1, 'Repair successes incremented');

  // ── Test 11: completeWithJsonRetry returns fallback when both attempts fail ──
  console.log('\nTest 11: completeWithJsonRetry returns fallback when both fail');
  client.complete = async () => ({
    content: 'I cannot produce JSON right now.',
    usage: { inputTokens: 10, outputTokens: 20 },
    latencyMs: 100
  });

  const prevAttempts = client.repairStats.attempts;
  const prevSuccesses = client.repairStats.successes;
  const bothFail = await client.completeWithJsonRetry(
    'system',
    'user',
    { action: 'string' },
    { action: 'DEFAULT' }
  );
  assert(bothFail.action === 'DEFAULT', 'Returns fallback when both attempts fail');
  assert(client.repairStats.attempts === prevAttempts + 1, 'Repair attempts incremented on failure');
  assert(client.repairStats.successes === prevSuccesses, 'Repair successes NOT incremented on failure');

  // ── Test 12: completeWithJsonRetry handles null from complete() ──
  console.log('\nTest 12: completeWithJsonRetry handles null from complete()');
  client.complete = async () => null;

  const nullResult = await client.completeWithJsonRetry(
    'system',
    'user',
    { action: 'string' },
    { action: 'NULL_FALLBACK' }
  );
  assert(nullResult.action === 'NULL_FALLBACK', 'Returns fallback when complete() returns null');

  // ── Test 13: _tryParseJson with nested JSON ──
  console.log('\nTest 13: _tryParseJson with nested JSON');
  const nested = client._tryParseJson(
    '{"outer": {"inner": [1, 2, 3]}, "flag": true}'
  );
  assert(nested !== null, 'Parses nested JSON');
  assert(nested.outer.inner.length === 3, 'Nested array correct');
  assert(nested.flag === true, 'Nested boolean correct');

  // ── Test 14: repair prompt includes schema and raw output ──
  console.log('\nTest 14: repair prompt includes schema and raw output');
  let repairPrompt = null;
  callCount = 0;
  client.complete = async (sys, usr) => {
    callCount++;
    if (callCount === 1) {
      return { content: 'not json stuff here', usage: {}, latencyMs: 50 };
    }
    repairPrompt = usr;
    return { content: '{"fixed": true}', usage: {}, latencyMs: 50 };
  };

  await client.completeWithJsonRetry(
    'system',
    'user prompt text',
    { fixed: 'boolean' },
    { fixed: false }
  );
  assert(repairPrompt !== null, 'Repair prompt was sent');
  assert(repairPrompt.includes('not json stuff here'), 'Repair prompt includes raw output');
  assert(repairPrompt.includes('fixed'), 'Repair prompt includes schema info');

  // Restore
  client.complete = originalComplete;
  client.enabled = origEnabled;

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
