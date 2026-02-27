/**
 * LLM Response Cache — Hash-based caching for LLM completions.
 *
 * Caches responses by a hash of (model + temperature + systemPrompt + userPrompt).
 * Supports TTL-based expiration and max entry limits. Tracks hit/miss metrics.
 *
 * This avoids redundant API calls for repeated fraud patterns and
 * identical agent reasoning prompts across scan cycles.
 */

import { createHash } from 'crypto';

class LLMCache {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 500;
    this.defaultTTLMs = options.defaultTTLMs || 15 * 60 * 1000; // 15 minutes
    // Cache store: hash -> { response, createdAt, expiresAt, hits }
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0
    };
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
  }

  /**
   * Generate a cache key from the request parameters.
   * Uses SHA-256 hash of model + temperature + prompts.
   */
  _hashKey(model, temperature, systemPrompt, userPrompt) {
    const input = `${model}|${temperature}|${systemPrompt}|${userPrompt}`;
    return createHash('sha256').update(input).digest('hex');
  }

  /**
   * Get a cached response if it exists and hasn't expired.
   * @returns {Object|null} The cached LLM response or null
   */
  get(model, temperature, systemPrompt, userPrompt) {
    const key = this._hashKey(model, temperature, systemPrompt, userPrompt);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.expirations++;
      this.stats.misses++;
      return null;
    }

    // Cache hit
    entry.hits++;
    entry.lastAccessedAt = Date.now();
    this.stats.hits++;

    return {
      ...entry.response,
      cached: true,
      cacheHits: entry.hits
    };
  }

  /**
   * Store a response in the cache.
   * @param {string} model
   * @param {number} temperature
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {Object} response - The LLM response to cache
   * @param {number} [ttlMs] - Optional TTL override
   */
  set(model, temperature, systemPrompt, userPrompt, response, ttlMs) {
    // Don't cache responses with temperature > 0.5 (too random to reuse)
    if (temperature > 0.5) return;

    const key = this._hashKey(model, temperature, systemPrompt, userPrompt);
    const now = Date.now();

    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this._evictOldest();
    }

    this.cache.set(key, {
      response,
      createdAt: now,
      expiresAt: now + (ttlMs || this.defaultTTLMs),
      lastAccessedAt: now,
      hits: 0
    });

    this.stats.sets++;
  }

  /**
   * Invalidate all cache entries.
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      totalRequests,
      hitRate: totalRequests > 0
        ? Math.round((this.stats.hits / totalRequests) * 10000) / 100
        : 0,
      size: this.cache.size,
      maxEntries: this.maxEntries,
      defaultTTLMs: this.defaultTTLMs
    };
  }

  // ── Internal ──

  /**
   * Evict the least recently accessed entry.
   */
  _evictOldest() {
    let oldestKey = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Remove expired entries.
   */
  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.stats.expirations++;
      }
    }
  }
}

// Singleton
let instance = null;

export function getLLMCache() {
  if (!instance) {
    instance = new LLMCache();
  }
  return instance;
}

export default { LLMCache, getLLMCache };
