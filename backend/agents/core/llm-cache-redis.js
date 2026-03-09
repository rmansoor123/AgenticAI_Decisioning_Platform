/**
 * Redis-backed LLM response cache.
 * Same interface as LLMCache (get/set/clear/getStats).
 * Falls back to in-memory LLMCache on any Redis error.
 *
 * Key format: llm:{sha256hash}
 * Default TTL: 900 seconds (15 minutes)
 */

import { createHash } from 'crypto';
import { getRedisClient, isRedisAvailable } from '../../shared/common/redis-client.js';
import { getLLMCache } from './llm-cache.js';

const DEFAULT_TTL_SECONDS = 900; // 15 minutes

class LLMCacheRedis {
  constructor() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      expirations: 0,
      errors: 0,
    };
    this.fallback = getLLMCache();
  }

  _makeKey(model, temperature, systemPrompt, userPrompt) {
    const hash = createHash('sha256')
      .update(`${model}|${temperature}|${systemPrompt}|${userPrompt}`)
      .digest('hex');
    return `llm:${hash}`;
  }

  async get(model, temperature, systemPrompt, userPrompt) {
    // Skip cache for high-temperature requests (non-deterministic)
    if (temperature > 0.5) {
      this.stats.misses++;
      return null;
    }

    const redis = getRedisClient();
    if (!redis || !isRedisAvailable()) {
      return this.fallback.get(model, temperature, systemPrompt, userPrompt);
    }

    try {
      const key = this._makeKey(model, temperature, systemPrompt, userPrompt);
      const cached = await redis.get(key);
      if (cached) {
        this.stats.hits++;
        const entry = JSON.parse(cached);
        entry.cacheHits = (entry.cacheHits || 0) + 1;
        // Update hit count in Redis (fire-and-forget)
        redis.set(key, JSON.stringify(entry), 'KEEPTTL').catch(() => {});
        return { ...entry, cached: true };
      }
      this.stats.misses++;
      return null;
    } catch (err) {
      this.stats.errors++;
      console.warn(`[llm-cache-redis] get error: ${err.message}`);
      return this.fallback.get(model, temperature, systemPrompt, userPrompt);
    }
  }

  async set(model, temperature, systemPrompt, userPrompt, response, ttlSeconds = DEFAULT_TTL_SECONDS) {
    if (temperature > 0.5) return;

    const redis = getRedisClient();
    if (!redis || !isRedisAvailable()) {
      return this.fallback.set(model, temperature, systemPrompt, userPrompt, response, ttlSeconds * 1000);
    }

    try {
      const key = this._makeKey(model, temperature, systemPrompt, userPrompt);
      const entry = { ...response, cacheHits: 0, cachedAt: Date.now() };
      await redis.set(key, JSON.stringify(entry), 'EX', ttlSeconds);
      this.stats.sets++;
    } catch (err) {
      this.stats.errors++;
      console.warn(`[llm-cache-redis] set error: ${err.message}`);
      this.fallback.set(model, temperature, systemPrompt, userPrompt, response, ttlSeconds * 1000);
    }
  }

  async clear() {
    const redis = getRedisClient();
    if (!redis || !isRedisAvailable()) {
      return this.fallback.clear();
    }

    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'llm:*', 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
          this.stats.evictions += keys.length;
        }
      } while (cursor !== '0');
    } catch (err) {
      this.stats.errors++;
      console.warn(`[llm-cache-redis] clear error: ${err.message}`);
    }
  }

  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      totalRequests,
      hitRate: totalRequests > 0 ? ((this.stats.hits / totalRequests) * 100).toFixed(1) + '%' : '0%',
      backend: 'redis',
    };
  }
}

let instance = null;

export function getLLMCacheRedis() {
  if (!instance) instance = new LLMCacheRedis();
  return instance;
}

export { LLMCacheRedis };
