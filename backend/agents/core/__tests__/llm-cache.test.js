/**
 * Integration test for LLMCache.
 * Run with: node backend/agents/core/__tests__/llm-cache.test.js
 */

import defaultExport, { getLLMCache } from '../llm-cache.js';
const { LLMCache } = defaultExport;

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) { console.log(`  PASS: ${message}`); passed++; }
    else { console.error(`  FAIL: ${message}`); failed++; }
  }

  // ── Test 1: Singleton ──
  console.log('\nTest 1: Singleton pattern');
  {
    const a = getLLMCache();
    const b = getLLMCache();
    assert(a === b, 'same instance');
  }

  // ── Test 2: Cache miss on empty cache ──
  console.log('\nTest 2: Cache miss on empty cache');
  {
    const cache = new LLMCache();
    const result = cache.get('model', 0.3, 'system', 'user');
    assert(result === null, 'returns null on miss');
    assert(cache.getStats().misses === 1, 'miss counted');
  }

  // ── Test 3: Cache hit after set ──
  console.log('\nTest 3: Cache hit after set');
  {
    const cache = new LLMCache();
    const response = { content: 'test response', usage: { inputTokens: 100, outputTokens: 50 }, latencyMs: 200 };
    cache.set('model', 0.3, 'system', 'user', response);
    const result = cache.get('model', 0.3, 'system', 'user');
    assert(result !== null, 'returns cached response');
    assert(result.content === 'test response', 'content matches');
    assert(result.cached === true, 'marked as cached');
    assert(cache.getStats().hits === 1, 'hit counted');
  }

  // ── Test 4: Different prompts are different keys ──
  console.log('\nTest 4: Different prompts are different keys');
  {
    const cache = new LLMCache();
    const resp1 = { content: 'response1', usage: {}, latencyMs: 100 };
    const resp2 = { content: 'response2', usage: {}, latencyMs: 100 };
    cache.set('model', 0.3, 'system', 'prompt1', resp1);
    cache.set('model', 0.3, 'system', 'prompt2', resp2);
    const r1 = cache.get('model', 0.3, 'system', 'prompt1');
    const r2 = cache.get('model', 0.3, 'system', 'prompt2');
    assert(r1.content === 'response1', 'prompt1 returns response1');
    assert(r2.content === 'response2', 'prompt2 returns response2');
  }

  // ── Test 5: Different temperatures are different keys ──
  console.log('\nTest 5: Different temperatures are different keys');
  {
    const cache = new LLMCache();
    const resp = { content: 'cold', usage: {}, latencyMs: 100 };
    cache.set('model', 0.3, 'sys', 'user', resp);
    const hitAt03 = cache.get('model', 0.3, 'sys', 'user');
    const missAt05 = cache.get('model', 0.5, 'sys', 'user');
    assert(hitAt03 !== null, 'hit at same temperature');
    assert(missAt05 === null, 'miss at different temperature');
  }

  // ── Test 6: High temperature not cached ──
  console.log('\nTest 6: High temperature not cached');
  {
    const cache = new LLMCache();
    const resp = { content: 'random', usage: {}, latencyMs: 100 };
    cache.set('model', 0.8, 'sys', 'user', resp);
    const result = cache.get('model', 0.8, 'sys', 'user');
    assert(result === null, 'high temp responses not cached');
  }

  // ── Test 7: TTL expiration ──
  console.log('\nTest 7: TTL expiration');
  {
    const cache = new LLMCache({ defaultTTLMs: 1 }); // 1ms TTL
    const resp = { content: 'ephemeral', usage: {}, latencyMs: 100 };
    cache.set('model', 0.3, 'sys', 'user', resp);
    // Wait for expiration
    await new Promise(r => setTimeout(r, 10));
    const result = cache.get('model', 0.3, 'sys', 'user');
    assert(result === null, 'expired entry returns null');
    assert(cache.getStats().expirations >= 1, 'expiration counted');
  }

  // ── Test 8: Max entries eviction ──
  console.log('\nTest 8: Max entries eviction');
  {
    const cache = new LLMCache({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      cache.set('model', 0.3, 'sys', `user-${i}`, { content: `resp-${i}`, usage: {}, latencyMs: 100 });
    }
    assert(cache.getStats().size <= 3, `size capped at 3 (got ${cache.getStats().size})`);
    assert(cache.getStats().evictions >= 2, 'evictions counted');
  }

  // ── Test 9: Clear empties cache ──
  console.log('\nTest 9: Clear empties cache');
  {
    const cache = new LLMCache();
    cache.set('model', 0.3, 'sys', 'user', { content: 'x', usage: {}, latencyMs: 100 });
    assert(cache.getStats().size === 1, 'has 1 entry');
    cache.clear();
    assert(cache.getStats().size === 0, 'empty after clear');
  }

  // ── Test 10: Stats structure ──
  console.log('\nTest 10: Stats structure');
  {
    const cache = new LLMCache();
    cache.set('model', 0.3, 'sys', 'user', { content: 'x', usage: {}, latencyMs: 100 });
    cache.get('model', 0.3, 'sys', 'user'); // hit
    cache.get('model', 0.3, 'sys', 'other'); // miss
    const stats = cache.getStats();
    assert(stats.hits === 1, 'hits tracked');
    assert(stats.misses === 1, 'misses tracked');
    assert(stats.sets === 1, 'sets tracked');
    assert(typeof stats.hitRate === 'number', 'hitRate calculated');
    assert(stats.hitRate === 50, 'hitRate is 50%');
    assert(stats.size === 1, 'size tracked');
    assert(stats.maxEntries === 500, 'maxEntries default');
  }

  // ── Test 11: Hit counter increments ──
  console.log('\nTest 11: Hit counter increments per entry');
  {
    const cache = new LLMCache();
    cache.set('model', 0.3, 'sys', 'user', { content: 'x', usage: {}, latencyMs: 100 });
    cache.get('model', 0.3, 'sys', 'user');
    cache.get('model', 0.3, 'sys', 'user');
    const r = cache.get('model', 0.3, 'sys', 'user');
    assert(r.cacheHits === 3, `3 hits on entry (got ${r.cacheHits})`);
  }

  // ── Test 12: Custom TTL per entry ──
  console.log('\nTest 12: Custom TTL per entry');
  {
    const cache = new LLMCache({ defaultTTLMs: 60000 });
    cache.set('model', 0.3, 'sys', 'short', { content: 'short', usage: {}, latencyMs: 100 }, 1);
    cache.set('model', 0.3, 'sys', 'long', { content: 'long', usage: {}, latencyMs: 100 }, 60000);
    await new Promise(r => setTimeout(r, 10));
    const shortResult = cache.get('model', 0.3, 'sys', 'short');
    const longResult = cache.get('model', 0.3, 'sys', 'long');
    assert(shortResult === null, 'short TTL expired');
    assert(longResult !== null, 'long TTL still valid');
  }

  // ── Test 13: Different models are different keys ──
  console.log('\nTest 13: Different models are different keys');
  {
    const cache = new LLMCache();
    cache.set('model-a', 0.3, 'sys', 'user', { content: 'a', usage: {}, latencyMs: 100 });
    const hitA = cache.get('model-a', 0.3, 'sys', 'user');
    const missB = cache.get('model-b', 0.3, 'sys', 'user');
    assert(hitA !== null, 'hit for model-a');
    assert(missB === null, 'miss for model-b');
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
