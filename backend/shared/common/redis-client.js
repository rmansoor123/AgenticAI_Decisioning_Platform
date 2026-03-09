/**
 * Redis client — singleton ioredis connection with retry and health tracking.
 *
 * Usage:
 *   import { getRedisClient, isRedisAvailable } from './redis-client.js';
 *   const redis = getRedisClient();
 *   if (isRedisAvailable()) { await redis.set('key', 'value'); }
 */

import Redis from 'ioredis';

let instance = null;
let available = false;

/**
 * Get or create the singleton Redis client.
 * @returns {Redis|null} Redis client instance, or null if not configured
 */
export function getRedisClient() {
  if (instance) return instance;

  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const backend = (process.env.CACHE_BACKEND || 'memory').toLowerCase();

  if (backend !== 'redis') {
    return null;
  }

  try {
    instance = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null; // Stop retrying after 3 attempts
        return Math.min(times * 200, 2000); // Exponential backoff, max 2s
      },
      lazyConnect: true,
      enableReadyCheck: true,
      connectTimeout: 5000,
    });

    instance.on('connect', () => {
      available = true;
      console.log('[redis-client] Connected');
    });

    instance.on('ready', () => {
      available = true;
    });

    instance.on('error', (err) => {
      available = false;
      console.warn(`[redis-client] Error: ${err.message}`);
    });

    instance.on('close', () => {
      available = false;
    });

    // Eagerly connect
    instance.connect().catch((err) => {
      available = false;
      console.warn(`[redis-client] Initial connect failed: ${err.message}`);
    });
  } catch (err) {
    console.warn(`[redis-client] Failed to create client: ${err.message}`);
    instance = null;
  }

  return instance;
}

/**
 * Check if Redis is currently available.
 */
export function isRedisAvailable() {
  return available && instance?.status === 'ready';
}

/**
 * Gracefully close the Redis connection.
 */
export async function closeRedis() {
  if (instance) {
    await instance.quit();
    instance = null;
    available = false;
  }
}
