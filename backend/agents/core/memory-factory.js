/**
 * Memory factory — routes to Letta, Mem0, or SQLite memory store
 * based on MEMORY_BACKEND env var ('letta' | 'mem0' | 'sqlite').
 *
 * Usage:
 *   import { getMemoryBackend } from './memory-factory.js';
 *   const memoryStore = await getMemoryBackend();
 *   await memoryStore.saveLongTerm(agentId, 'pattern', content, 0.8);
 */

let resolvedMemoryStore = null;

/**
 * Get the memory backend type.
 * @returns {'letta' | 'mem0' | 'sqlite'}
 */
export function getMemoryBackendType() {
  return (process.env.MEMORY_BACKEND || 'sqlite').toLowerCase();
}

/**
 * Get the memory store implementation (Letta, Mem0, or SQLite).
 * @returns {Promise<object>} MemoryStore-compatible instance
 */
export async function getMemoryBackend() {
  if (resolvedMemoryStore) return resolvedMemoryStore;

  const backend = getMemoryBackendType();

  if (backend === 'letta') {
    try {
      const { getMemoryStoreLetta } = await import('./memory-store-letta.js');
      resolvedMemoryStore = getMemoryStoreLetta();
      console.log('[memory-factory] Memory store: Letta');
      return resolvedMemoryStore;
    } catch (err) {
      console.warn(`[memory-factory] Letta init failed: ${err.message}, falling back to SQLite`);
    }
  }

  if (backend === 'mem0') {
    try {
      const { getMemoryStoreMem0 } = await import('./memory-store-mem0.js');
      resolvedMemoryStore = getMemoryStoreMem0();
      console.log('[memory-factory] Memory store: Mem0');
      return resolvedMemoryStore;
    } catch (err) {
      console.warn(`[memory-factory] Mem0 init failed: ${err.message}, falling back to SQLite`);
    }
  }

  const { getMemoryStore } = await import('./memory-store.js');
  resolvedMemoryStore = getMemoryStore();
  console.log('[memory-factory] Memory store: SQLite');
  return resolvedMemoryStore;
}
