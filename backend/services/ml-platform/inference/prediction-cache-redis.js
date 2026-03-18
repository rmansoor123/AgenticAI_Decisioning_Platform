/**
 * ML Prediction Cache — Redis-backed, keyed by SHA-256 of feature vector.
 * TTL: 5 minutes.
 */
import crypto from 'crypto';
import { getRedisClient, isRedisAvailable } from '../../../shared/common/redis-client.js';

const CACHE_TTL = 300;
const KEY_PREFIX = 'prediction_cache:';
let stats = { hits: 0, misses: 0, sets: 0 };

export function hashFeatureVector(vector) {
  return crypto.createHash('sha256').update(JSON.stringify(vector)).digest('hex').substring(0, 16);
}

export async function getCachedPrediction(featureVector) {
  const redis = getRedisClient();
  if (!redis || !isRedisAvailable()) { stats.misses++; return null; }
  try {
    const cached = await redis.get(KEY_PREFIX + hashFeatureVector(featureVector));
    if (cached) { stats.hits++; return JSON.parse(cached); }
  } catch (e) {}
  stats.misses++;
  return null;
}

export async function setCachedPrediction(featureVector, result) {
  const redis = getRedisClient();
  if (!redis || !isRedisAvailable()) return;
  try {
    await redis.set(KEY_PREFIX + hashFeatureVector(featureVector),
      JSON.stringify({ ...result, cachedAt: new Date().toISOString() }), 'EX', CACHE_TTL);
    stats.sets++;
  } catch (e) {}
}

export function getPredictionCacheStats() {
  const total = stats.hits + stats.misses;
  return { hits: stats.hits, misses: stats.misses, sets: stats.sets,
    hitRate: total > 0 ? stats.hits / total : 0, backend: isRedisAvailable() ? 'redis' : 'none' };
}
export default { getCachedPrediction, setCachedPrediction, getPredictionCacheStats, hashFeatureVector };
