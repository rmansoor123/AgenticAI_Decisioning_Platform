/**
 * Cache factory — routes to Redis-backed or in-memory implementations
 * based on CACHE_BACKEND env var ('redis' | 'memory').
 *
 * Usage:
 *   import { getCacheBackend, getCacheLLM, getCachePatternMemory } from './cache-factory.js';
 *   const llmCache = await getCacheLLM();
 *   const patternMemory = await getCachePatternMemory();
 */

let resolvedLLMCache = null;
let resolvedPatternMemory = null;

/**
 * Get the cache backend type.
 * @returns {'redis' | 'memory'}
 */
export function getCacheBackendType() {
  return (process.env.CACHE_BACKEND || 'memory').toLowerCase();
}

/**
 * Get the LLM cache implementation (Redis or in-memory).
 * @returns {Promise<object>} LLMCache-compatible instance
 */
export async function getCacheLLM() {
  if (resolvedLLMCache) return resolvedLLMCache;

  if (getCacheBackendType() === 'redis') {
    try {
      const { getLLMCacheRedis } = await import('./llm-cache-redis.js');
      resolvedLLMCache = getLLMCacheRedis();
      console.log('[cache-factory] LLM cache: Redis');
      return resolvedLLMCache;
    } catch (err) {
      console.warn(`[cache-factory] Redis LLM cache init failed: ${err.message}, falling back to memory`);
    }
  }

  const { getLLMCache } = await import('./llm-cache.js');
  resolvedLLMCache = getLLMCache();
  console.log('[cache-factory] LLM cache: in-memory');
  return resolvedLLMCache;
}

/**
 * Get the pattern memory implementation (Redis or in-memory).
 * @returns {Promise<object>} PatternMemory-compatible instance
 */
export async function getCachePatternMemory() {
  if (resolvedPatternMemory) return resolvedPatternMemory;

  if (getCacheBackendType() === 'redis') {
    try {
      const { getPatternMemoryRedis } = await import('./pattern-memory-redis.js');
      resolvedPatternMemory = getPatternMemoryRedis();
      console.log('[cache-factory] Pattern memory: Redis');
      return resolvedPatternMemory;
    } catch (err) {
      console.warn(`[cache-factory] Redis pattern memory init failed: ${err.message}, falling back to memory`);
    }
  }

  const { getPatternMemory } = await import('./pattern-memory.js');
  resolvedPatternMemory = getPatternMemory();
  console.log('[cache-factory] Pattern memory: in-memory');
  return resolvedPatternMemory;
}
