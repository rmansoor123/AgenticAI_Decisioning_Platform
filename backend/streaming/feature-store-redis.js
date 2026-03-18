/**
 * Feature Store Redis Backend — HSET/HGET with native TTL.
 * Key pattern: features:{entityId}:{group}
 * Same API as in-memory FeatureStore.
 */
import { getRedisClient, isRedisAvailable } from '../shared/common/redis-client.js';

const FEATURE_GROUPS = {
  seller_profile: { ttl: 300 },
  transaction_velocity: { ttl: 60 },
  device_trust: { ttl: 120 },
  network_risk: { ttl: 300 },
  seller_onboarding: { ttl: 600 },
};

class FeatureStoreRedis {
  constructor() {
    this.stats = { reads: 0, writes: 0, hits: 0, misses: 0 };
    this._syncCache = new Map();
  }

  _key(entityId, group) { return `features:${entityId}:${group}`; }
  _ttlSeconds(group) { return FEATURE_GROUPS[group]?.ttl || 300; }

  getFeatures(entityId, group) {
    this.stats.reads++;
    const key = this._key(entityId, group);
    const cached = this._syncCache.get(key);
    if (cached && Date.now() - cached.ts < this._ttlSeconds(group) * 1000) {
      this.stats.hits++;
      return cached.features;
    }
    this.stats.misses++;
    // Async refresh in background
    const redis = getRedisClient();
    if (redis && isRedisAvailable()) {
      redis.get(key).then(val => {
        if (val) {
          try { this._syncCache.set(key, { features: JSON.parse(val), ts: Date.now() }); } catch (e) {}
        }
      }).catch(() => {});
    }
    return null;
  }

  putFeatures(entityId, group, features) {
    this.stats.writes++;
    const key = this._key(entityId, group);
    this._syncCache.set(key, { features, ts: Date.now() });
    const redis = getRedisClient();
    if (redis && isRedisAvailable()) {
      redis.set(key, JSON.stringify(features), 'EX', this._ttlSeconds(group)).catch(err => {
        console.warn(`[FeatureStoreRedis] Write failed: ${err.message}`);
      });
    }
  }

  async getFeaturesAsOf(entityId, group, timestamp) {
    this.stats.reads++;
    const redis = getRedisClient();
    if (!redis || !isRedisAvailable()) { this.stats.misses++; return null; }
    try {
      const val = await redis.get(this._key(entityId, group));
      if (val) { this.stats.hits++; return JSON.parse(val); }
    } catch (e) {}
    this.stats.misses++;
    return null;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      reads: this.stats.reads, writes: this.stats.writes,
      hits: this.stats.hits, misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      onlineStoreSize: this._syncCache.size,
      featureGroups: Object.keys(FEATURE_GROUPS),
      backend: 'redis'
    };
  }
}

let instance = null;
export function getFeatureStoreRedis() {
  if (!instance) instance = new FeatureStoreRedis();
  return instance;
}
export default { getFeatureStoreRedis };
