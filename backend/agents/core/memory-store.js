/**
 * Memory Store - Persistent Short-Term and Long-Term Memory for Agents
 *
 * Short-term memory: session-scoped, 24h TTL, max 50 entries per session (FIFO).
 * Long-term memory: permanent, importance-weighted, keyword + importance + recency scoring.
 * Consolidation: promotes repeated short-term patterns to long-term storage.
 *
 * Persists through SQLite via db_ops (agent_short_term_memory / agent_long_term_memory tables).
 */

import { db_ops } from '../../shared/common/database.js';

const SHORT_TERM_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_SHORT_TERM_PER_SESSION = 50;
const CONSOLIDATION_THRESHOLD = 3; // entries with same type/action before promoting

class MemoryStore {
  constructor() {
    this.stats = {
      writes: 0,
      retrievals: 0,
      consolidations: 0
    };
    console.log('[MemoryStore] Initialized');
  }

  // ============================================================================
  // SHORT-TERM MEMORY (session-scoped, 24h TTL, max 50 per session)
  // ============================================================================

  /**
   * Save a short-term memory entry.
   * @param {string} agentId - The agent ID
   * @param {string} sessionId - The session ID
   * @param {Object} entry - The memory entry to store
   * @returns {string} The generated memoryId
   */
  saveShortTerm(agentId, sessionId, entry) {
    const timestamp = Date.now();
    const memoryId = `STM-${agentId}-${sessionId}-${timestamp}`;
    const expiresAt = new Date(timestamp + SHORT_TERM_TTL_MS).toISOString();

    const record = {
      memoryId,
      agentId,
      sessionId,
      entry,
      expiresAt,
      createdAt: new Date(timestamp).toISOString()
    };

    db_ops.insert('agent_short_term_memory', 'memory_id', memoryId, record);
    this.stats.writes++;

    // Enforce max entries per session via FIFO eviction
    this._enforceSessionLimit(agentId, sessionId);

    return memoryId;
  }

  /**
   * Get short-term memory entries for an agent session.
   * Excludes expired entries. Returns entries sorted by createdAt DESC.
   * @param {string} agentId - The agent ID
   * @param {string} sessionId - The session ID
   * @returns {Array<Object>} Array of entry objects (not full records)
   */
  getShortTerm(agentId, sessionId) {
    this.stats.retrievals++;

    const allRecords = db_ops.getAll('agent_short_term_memory', 10000, 0);
    const now = new Date().toISOString();

    return allRecords
      .map(r => r.data)
      .filter(r =>
        r.agentId === agentId &&
        r.sessionId === sessionId &&
        r.expiresAt > now
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map(r => r.entry);
  }

  /**
   * Enforce max 50 entries per session. Remove oldest (FIFO) if over limit.
   */
  _enforceSessionLimit(agentId, sessionId) {
    const allRecords = db_ops.getAll('agent_short_term_memory', 10000, 0);

    const sessionRecords = allRecords
      .map(r => ({ id: r.memory_id, data: r.data }))
      .filter(r =>
        r.data.agentId === agentId &&
        r.data.sessionId === sessionId
      )
      .sort((a, b) => (a.data.createdAt || '').localeCompare(b.data.createdAt || ''));

    // Remove oldest entries beyond the limit
    while (sessionRecords.length > MAX_SHORT_TERM_PER_SESSION) {
      const oldest = sessionRecords.shift();
      const idToDelete = oldest.data.memoryId || oldest.id;
      db_ops.delete('agent_short_term_memory', 'memory_id', idToDelete);
    }
  }

  // ============================================================================
  // LONG-TERM MEMORY (permanent, importance-weighted)
  // ============================================================================

  /**
   * Save a long-term memory entry.
   * @param {string} agentId - The agent ID
   * @param {string} type - Memory type: pattern, insight, preference, correction
   * @param {Object|string} content - The content to store
   * @param {number} importance - Importance weight 0-1
   * @returns {string} The generated memoryId
   */
  saveLongTerm(agentId, type, content, importance = 0.5) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const memoryId = `LTM-${agentId}-${timestamp}-${random}`;

    const record = {
      memoryId,
      agentId,
      type,
      content,
      importance: Math.max(0, Math.min(1, importance)),
      accessCount: 0,
      lastAccessed: null,
      createdAt: new Date(timestamp).toISOString()
    };

    db_ops.insert('agent_long_term_memory', 'memory_id', memoryId, record);
    this.stats.writes++;

    return memoryId;
  }

  /**
   * Query long-term memory by keyword match + importance + recency of access.
   * Score: keyword 50% + importance 30% + access recency 20%.
   * Updates access counts on retrieval.
   * @param {string} agentId - The agent ID
   * @param {string} query - Search query
   * @param {number} limit - Max results (default 5)
   * @returns {Array<Object>} Content objects with _memoryId, _importance, _type metadata
   */
  queryLongTerm(agentId, query, limit = 5) {
    this.stats.retrievals++;

    const allRecords = db_ops.getAll('agent_long_term_memory', 10000, 0);
    const agentRecords = allRecords
      .map(r => r.data)
      .filter(r => r.agentId === agentId);

    if (agentRecords.length === 0 || !query) return [];

    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/).filter(t => t.length > 1);
    const now = Date.now();

    const scored = agentRecords.map(record => {
      // Keyword matching score (50%)
      const contentStr = JSON.stringify(record.content).toLowerCase();
      let matchCount = 0;
      for (const token of queryTokens) {
        if (contentStr.includes(token)) {
          matchCount++;
        }
      }
      const keywordScore = queryTokens.length > 0
        ? matchCount / queryTokens.length
        : 0;

      // Importance score (30%)
      const importanceScore = record.importance || 0;

      // Access recency score (20%) - more recent access = higher score
      let recencyScore = 0.5; // default for never-accessed
      if (record.lastAccessed) {
        const daysSinceAccess = (now - new Date(record.lastAccessed).getTime()) / (1000 * 60 * 60 * 24);
        recencyScore = Math.pow(0.5, daysSinceAccess / 7); // 7-day half-life
      }

      const totalScore = (keywordScore * 0.5) + (importanceScore * 0.3) + (recencyScore * 0.2);

      return { record, totalScore };
    });

    // Sort by score descending, take top results
    const topResults = scored
      .filter(s => s.totalScore > 0)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit);

    // Update access counts for retrieved records
    for (const { record } of topResults) {
      record.accessCount = (record.accessCount || 0) + 1;
      record.lastAccessed = new Date().toISOString();
      db_ops.update('agent_long_term_memory', 'memory_id', record.memoryId, record);
    }

    // Return content with metadata
    return topResults.map(({ record }) => {
      const content = typeof record.content === 'object'
        ? { ...record.content }
        : { value: record.content };

      return {
        ...content,
        _memoryId: record.memoryId,
        _importance: record.importance,
        _type: record.type
      };
    });
  }

  /**
   * Get all long-term memories of a specific type for an agent.
   * Sorted by importance DESC.
   * @param {string} agentId - The agent ID
   * @param {string} type - Memory type
   * @returns {Array<Object>} Memory records
   */
  getLongTermByType(agentId, type) {
    this.stats.retrievals++;

    const allRecords = db_ops.getAll('agent_long_term_memory', 10000, 0);

    return allRecords
      .map(r => r.data)
      .filter(r => r.agentId === agentId && r.type === type)
      .sort((a, b) => (b.importance || 0) - (a.importance || 0));
  }

  // ============================================================================
  // CONSOLIDATION
  // ============================================================================

  /**
   * Consolidate short-term patterns into long-term memory.
   * Finds repeated patterns (entries with same type/action appearing 3+ times)
   * and promotes them to long-term as 'pattern' type.
   * @param {string} agentId - The agent ID
   * @param {string} sessionId - The session ID
   * @returns {number} Number of patterns consolidated
   */
  consolidate(agentId, sessionId) {
    const entries = this.getShortTerm(agentId, sessionId);
    if (entries.length < CONSOLIDATION_THRESHOLD) return 0;

    // Group by type or action
    const groups = new Map();
    for (const entry of entries) {
      const key = entry.type || entry.action || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(entry);
    }

    let consolidated = 0;

    for (const [key, group] of groups) {
      if (group.length >= CONSOLIDATION_THRESHOLD) {
        // Promote to long-term memory
        this.saveLongTerm(agentId, 'pattern', {
          patternType: key,
          occurrences: group.length,
          examples: group.slice(0, 3), // Keep first 3 examples
          consolidatedFrom: sessionId,
          consolidatedAt: new Date().toISOString()
        }, Math.min(0.3 + (group.length * 0.1), 1.0));

        consolidated++;
        this.stats.consolidations++;
      }
    }

    return consolidated;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Delete expired short-term entries.
   * @returns {number} Number of entries deleted
   */
  cleanup() {
    const allRecords = db_ops.getAll('agent_short_term_memory', 10000, 0);
    const now = new Date().toISOString();
    let deleted = 0;

    for (const record of allRecords) {
      const data = record.data;
      if (data.expiresAt && data.expiresAt < now) {
        const idToDelete = data.memoryId || record.memory_id;
        db_ops.delete('agent_short_term_memory', 'memory_id', idToDelete);
        deleted++;
      }
    }

    return deleted;
  }

  // ============================================================================
  // STATS
  // ============================================================================

  /**
   * Get memory store statistics.
   * @returns {Object} Statistics object
   */
  getStats() {
    const stmCount = db_ops.count('agent_short_term_memory');
    const ltmCount = db_ops.count('agent_long_term_memory');

    return {
      shortTermEntries: stmCount,
      longTermEntries: ltmCount,
      writes: this.stats.writes,
      retrievals: this.stats.retrievals,
      consolidations: this.stats.consolidations
    };
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let instance = null;

/**
 * Get the singleton MemoryStore instance.
 * @returns {MemoryStore}
 */
export function getMemoryStore() {
  if (!instance) {
    instance = new MemoryStore();
  }
  return instance;
}

export default { getMemoryStore };
