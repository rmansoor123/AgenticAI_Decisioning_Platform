/**
 * In-memory temporal memory — chronological entity fact tracking.
 * Fallback for when Zep is not available.
 *
 * Usage:
 *   import { getTemporalMemoryInMemory } from './temporal-memory.js';
 *   const tm = getTemporalMemoryInMemory();
 *   tm.saveTemporalFact('SELLER-123', 'seller', { text: '...', confidence: 0.9 });
 */

let _instance = null;

class TemporalMemory {
  constructor() {
    /** @type {Map<string, Array<{fact: object, timestamp: string, metadata: object}>>} */
    this.entityTimelines = new Map();
    this.stats = { writes: 0, reads: 0 };
  }

  /**
   * Save a temporal fact for an entity.
   * @param {string} entityId - Unique entity identifier (e.g., 'SELLER-123')
   * @param {string} entityType - Entity type (e.g., 'seller', 'transaction', 'account')
   * @param {object} fact - The fact to record (should have at least { text, confidence })
   * @param {object} [metadata] - Additional metadata
   * @returns {string} Fact ID
   */
  saveTemporalFact(entityId, entityType, fact, metadata = {}) {
    if (!this.entityTimelines.has(entityId)) {
      this.entityTimelines.set(entityId, []);
    }

    const factId = `TF-${entityId.slice(0, 8)}-${Date.now().toString(36)}`;
    const entry = {
      factId,
      entityId,
      entityType,
      fact,
      metadata,
      timestamp: new Date().toISOString(),
    };

    this.entityTimelines.get(entityId).push(entry);
    this.stats.writes++;
    return factId;
  }

  /**
   * Query temporal history for an entity, optionally filtered by text similarity.
   * @param {string} entityId
   * @param {string} [query] - Optional text query for keyword matching
   * @param {number} [limit=10]
   * @returns {Array} Matching facts, most recent first
   */
  queryTemporalHistory(entityId, query = null, limit = 10) {
    const timeline = this.entityTimelines.get(entityId) || [];
    this.stats.reads++;

    let results = [...timeline];

    if (query) {
      const queryLower = query.toLowerCase();
      results = results.filter(entry => {
        const factText = JSON.stringify(entry.fact).toLowerCase();
        return factText.includes(queryLower);
      });
    }

    return results
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Get the full timeline for an entity.
   * @param {string} entityId
   * @param {object} [options] - { startDate, endDate, entityType }
   * @returns {Array} All facts for this entity in chronological order
   */
  getEntityTimeline(entityId, options = {}) {
    const timeline = this.entityTimelines.get(entityId) || [];
    this.stats.reads++;

    let results = [...timeline];

    if (options.startDate) {
      results = results.filter(e => new Date(e.timestamp) >= new Date(options.startDate));
    }
    if (options.endDate) {
      results = results.filter(e => new Date(e.timestamp) <= new Date(options.endDate));
    }
    if (options.entityType) {
      results = results.filter(e => e.entityType === options.entityType);
    }

    return results.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /**
   * Get a summary of an entity's temporal data.
   * @param {string} entityId
   * @returns {object} Summary with fact count, date range, entity types
   */
  getEntitySummary(entityId) {
    const timeline = this.entityTimelines.get(entityId) || [];

    if (timeline.length === 0) {
      return { entityId, factCount: 0, exists: false };
    }

    const sorted = [...timeline].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const entityTypes = [...new Set(timeline.map(e => e.entityType))];

    return {
      entityId,
      factCount: timeline.length,
      exists: true,
      firstSeen: sorted[0].timestamp,
      lastSeen: sorted[sorted.length - 1].timestamp,
      entityTypes,
    };
  }

  /**
   * Health check.
   */
  health() {
    return {
      status: 'ok',
      backend: 'in-memory',
      entityCount: this.entityTimelines.size,
      totalFacts: Array.from(this.entityTimelines.values()).reduce((sum, tl) => sum + tl.length, 0),
    };
  }

  /**
   * Get stats.
   */
  getStats() {
    return {
      ...this.stats,
      backend: 'in-memory',
      entityCount: this.entityTimelines.size,
      totalFacts: Array.from(this.entityTimelines.values()).reduce((sum, tl) => sum + tl.length, 0),
    };
  }
}

export function getTemporalMemoryInMemory() {
  if (!_instance) {
    _instance = new TemporalMemory();
  }
  return _instance;
}

export { TemporalMemory };
