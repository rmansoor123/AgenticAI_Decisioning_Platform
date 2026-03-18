/**
 * Feature Store Factory — Redis or in-memory.
 * Env: FEATURE_STORE_BACKEND=redis|memory (default: memory)
 */
let resolvedStore = null;
let resolvedType = 'memory';

export function getFeatureStoreBackendType() { return resolvedType; }

export async function getFeatureStoreBackend() {
  if (resolvedStore) return resolvedStore;
  const backend = (process.env.FEATURE_STORE_BACKEND || 'memory').toLowerCase();
  if (backend === 'redis') {
    try {
      const { isRedisAvailable } = await import('../shared/common/redis-client.js');
      await new Promise(r => setTimeout(r, 500));
      if (isRedisAvailable()) {
        const { getFeatureStoreRedis } = await import('./feature-store-redis.js');
        resolvedStore = getFeatureStoreRedis();
        resolvedType = 'redis';
        console.log('[feature-store-factory] Redis feature store active');
        return resolvedStore;
      }
      console.warn('[feature-store-factory] Redis not available, falling back to in-memory');
    } catch (err) {
      console.warn(`[feature-store-factory] Redis failed: ${err.message}`);
    }
  }
  const { getFeatureStore } = await import('./feature-store.js');
  resolvedStore = getFeatureStore();
  resolvedType = 'memory';
  console.log('[feature-store-factory] In-memory feature store active');
  return resolvedStore;
}
export default { getFeatureStoreBackend, getFeatureStoreBackendType };
