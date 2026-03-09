/**
 * Temporal memory factory — routes to Zep, in-memory, or null
 * based on TEMPORAL_BACKEND env var ('zep' | 'memory' | 'none').
 *
 * Usage:
 *   import { getTemporalMemory } from './temporal-factory.js';
 *   const tm = await getTemporalMemory();
 *   if (tm) await tm.saveTemporalFact(entityId, entityType, fact);
 */

let _resolved = undefined; // undefined = not yet resolved, null = disabled

/**
 * Get the temporal backend type.
 * @returns {'zep' | 'memory' | 'none'}
 */
export function getTemporalBackendType() {
  return (process.env.TEMPORAL_BACKEND || 'none').toLowerCase();
}

/**
 * Get the temporal memory implementation.
 * Returns null when TEMPORAL_BACKEND=none (default).
 * @returns {Promise<object|null>} TemporalMemory-compatible instance or null
 */
export async function getTemporalMemory() {
  if (_resolved !== undefined) return _resolved;

  const backend = getTemporalBackendType();

  if (backend === 'none') {
    _resolved = null;
    return null;
  }

  if (backend === 'zep') {
    try {
      const { getTemporalMemoryZep } = await import('./temporal-memory-zep.js');
      const tm = getTemporalMemoryZep();

      // Verify connectivity
      const h = await tm.health();
      if (h.status === 'ok') {
        _resolved = tm;
        console.log('[temporal-factory] Temporal memory: Zep');
        return _resolved;
      }

      console.warn(`[temporal-factory] Zep not reachable, falling back to in-memory`);
    } catch (err) {
      console.warn(`[temporal-factory] Zep init failed: ${err.message}, falling back to in-memory`);
    }

    // Fallback to in-memory
    try {
      const { getTemporalMemoryInMemory } = await import('./temporal-memory.js');
      _resolved = getTemporalMemoryInMemory();
      console.log('[temporal-factory] Temporal memory: in-memory (Zep fallback)');
      return _resolved;
    } catch (err) {
      console.warn(`[temporal-factory] In-memory fallback also failed: ${err.message}`);
      _resolved = null;
      return null;
    }
  }

  if (backend === 'memory') {
    try {
      const { getTemporalMemoryInMemory } = await import('./temporal-memory.js');
      _resolved = getTemporalMemoryInMemory();
      console.log('[temporal-factory] Temporal memory: in-memory');
      return _resolved;
    } catch (err) {
      console.warn(`[temporal-factory] In-memory init failed: ${err.message}`);
      _resolved = null;
      return null;
    }
  }

  console.warn(`[temporal-factory] Unknown backend '${backend}', temporal memory disabled`);
  _resolved = null;
  return null;
}
