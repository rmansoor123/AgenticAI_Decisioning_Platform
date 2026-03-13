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
  async saveShortTerm(agentId, sessionId, entry) {
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

    await db_ops.insert('agent_short_term_memory', 'memory_id', memoryId, record);
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
  async getShortTerm(agentId, sessionId) {
    this.stats.retrievals++;

    const allRecords = await db_ops.getAll('agent_short_term_memory', 10000, 0);
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
  async _enforceSessionLimit(agentId, sessionId) {
    const allRecords = await db_ops.getAll('agent_short_term_memory', 10000, 0);

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
      await db_ops.delete('agent_short_term_memory', 'memory_id', idToDelete);
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
  async saveLongTerm(agentId, type, content, importance = 0.5) {
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

    await db_ops.insert('agent_long_term_memory', 'memory_id', memoryId, record);
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
  async queryLongTerm(agentId, query, limit = 5) {
    this.stats.retrievals++;

    const allRecords = await db_ops.getAll('agent_long_term_memory', 10000, 0);
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
      await db_ops.update('agent_long_term_memory', 'memory_id', record.memoryId, record);
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
  async getLongTermByType(agentId, type) {
    this.stats.retrievals++;

    const allRecords = await db_ops.getAll('agent_long_term_memory', 10000, 0);

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

  /**
   * Consolidate high-confidence patterns from pattern memory into long-term memory.
   * Patterns with > 10 occurrences and > 70% success rate become "validated knowledge."
   * @param {string} agentId - The agent ID
   * @param {Array} patterns - Array of pattern objects from patternMemory.getTopPatterns()
   * @returns {number} Number of patterns consolidated
   */
  consolidatePatterns(agentId, patterns) {
    if (!patterns || patterns.length === 0) return 0;

    let consolidated = 0;

    for (const pattern of patterns) {
      if (pattern.occurrences >= 10 && pattern.successRate >= 0.7) {
        // Check if we already consolidated this pattern
        const existing = this.queryLongTerm(agentId, pattern.patternId, 1);
        if (existing.length > 0 && JSON.stringify(existing[0]).includes(pattern.patternId)) {
          continue; // Already consolidated
        }

        this.saveLongTerm(agentId, 'validated_knowledge', {
          patternId: pattern.patternId,
          type: pattern.type,
          outcome: pattern.outcome,
          occurrences: pattern.occurrences,
          successRate: pattern.successRate,
          confidence: pattern.confidence,
          features: pattern.features,
          consolidatedAt: new Date().toISOString(),
          description: `Validated pattern: ${pattern.type} → ${pattern.outcome} (${(pattern.successRate * 100).toFixed(0)}% success over ${pattern.occurrences} cases)`
        }, Math.min(0.5 + (pattern.successRate * 0.3), 0.95));

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
  async cleanup() {
    const allRecords = await db_ops.getAll('agent_short_term_memory', 10000, 0);
    const now = new Date().toISOString();
    let deleted = 0;

    for (const record of allRecords) {
      const data = record.data;
      if (data.expiresAt && data.expiresAt < now) {
        const idToDelete = data.memoryId || record.memory_id;
        await db_ops.delete('agent_short_term_memory', 'memory_id', idToDelete);
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
  // ============================================================================
  // SHARED MEMORY (cross-agent knowledge pool)
  // ============================================================================

  /**
   * Save to shared memory accessible by all agents.
   * @param {string} sourceAgentId - Agent that created this knowledge
   * @param {string} topic - Knowledge topic/category
   * @param {Object|string} content - The shared knowledge
   * @param {number} importance - Importance weight 0-1
   * @returns {string} memoryId
   */
  async saveShared(sourceAgentId, topic, content, importance = 0.5) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const memoryId = `SHARED-${topic}-${timestamp}-${random}`;

    const record = {
      memoryId,
      sourceAgentId,
      topic,
      content,
      importance: Math.max(0, Math.min(1, importance)),
      accessCount: 0,
      lastAccessed: null,
      createdAt: new Date(timestamp).toISOString()
    };

    await db_ops.insert('agent_shared_memory', 'memory_id', memoryId, record);
    this.stats.writes++;
    return memoryId;
  }

  /**
   * Query shared memory across all agents by keyword + importance.
   * @param {string} query - Search query
   * @param {string} [topic] - Optional topic filter
   * @param {number} [limit=5] - Max results
   * @returns {Array<Object>}
   */
  async queryShared(query, topic = null, limit = 5) {
    this.stats.retrievals++;
    const allRecords = await db_ops.getAll('agent_shared_memory', 10000, 0);
    let records = allRecords.map(r => r.data);

    if (topic) {
      records = records.filter(r => r.topic === topic);
    }

    if (!query || records.length === 0) return records.slice(0, limit);

    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/).filter(t => t.length > 1);

    const scored = records.map(record => {
      const contentStr = JSON.stringify(record.content).toLowerCase();
      let matchCount = 0;
      for (const token of queryTokens) {
        if (contentStr.includes(token)) matchCount++;
      }
      const keywordScore = queryTokens.length > 0 ? matchCount / queryTokens.length : 0;
      const totalScore = (keywordScore * 0.6) + ((record.importance || 0) * 0.4);
      return { record, totalScore };
    });

    return scored
      .filter(s => s.totalScore > 0)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit)
      .map(({ record }) => ({
        ...(typeof record.content === 'object' ? record.content : { value: record.content }),
        _memoryId: record.memoryId,
        _sourceAgent: record.sourceAgentId,
        _topic: record.topic,
        _importance: record.importance,
      }));
  }

  // ============================================================================
  // LONG-TERM MEMORY PRUNING
  // ============================================================================

  /**
   * Prune low-value long-term memories to prevent unbounded growth.
   * Keeps memories based on importance, access frequency, and recency.
   * @param {string} agentId - The agent ID
   * @param {number} [maxEntries=500] - Maximum entries to keep per agent
   * @returns {{ pruned: number, kept: number }}
   */
  async pruneLongTerm(agentId, maxEntries = 500) {
    const allRecords = await db_ops.getAll('agent_long_term_memory', 10000, 0);
    const agentRecords = allRecords
      .map(r => r.data)
      .filter(r => r.agentId === agentId);

    if (agentRecords.length <= maxEntries) {
      return { pruned: 0, kept: agentRecords.length };
    }

    const now = Date.now();
    // Score each memory for retention priority
    const scored = agentRecords.map(record => {
      const importanceScore = record.importance || 0;
      const accessScore = Math.min((record.accessCount || 0) / 10, 1);
      const ageMs = now - new Date(record.createdAt || 0).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recencyScore = Math.pow(0.5, ageDays / 30); // 30-day half-life
      // Validated knowledge gets a boost
      const typeBoost = record.type === 'validated_knowledge' ? 0.3 : record.type === 'correction' ? 0.2 : 0;
      const retentionScore = (importanceScore * 0.35) + (accessScore * 0.25) + (recencyScore * 0.25) + (typeBoost * 0.15);
      return { record, retentionScore };
    });

    // Sort by retention score descending, keep top `maxEntries`
    scored.sort((a, b) => b.retentionScore - a.retentionScore);
    const toKeep = new Set(scored.slice(0, maxEntries).map(s => s.record.memoryId));
    let pruned = 0;

    for (const { record } of scored) {
      if (!toKeep.has(record.memoryId)) {
        await db_ops.delete('agent_long_term_memory', 'memory_id', record.memoryId);
        pruned++;
      }
    }

    return { pruned, kept: maxEntries };
  }

  // ============================================================================
  // EPISODIC MEMORY (full case replay)
  // ============================================================================

  /**
   * Save a complete investigation episode for later replay.
   * Stores the full narrative: input, each reasoning step, tool results,
   * reflection, decision, and outcome.
   * @param {string} agentId - The agent ID
   * @param {Object} episode - Full investigation record
   * @returns {string} episodeId
   */
  async saveEpisode(agentId, episode) {
    const timestamp = Date.now();
    const episodeId = `EP-${agentId}-${timestamp.toString(36)}`;

    const record = {
      episodeId,
      agentId,
      input: episode.input,
      decision: episode.decision,
      riskScore: episode.riskScore,
      confidence: episode.confidence,
      outcome: episode.outcome || null,
      steps: (episode.steps || []).map(s => ({
        phase: s.phase,
        summary: typeof s.summary === 'string' ? s.summary.slice(0, 500) : JSON.stringify(s.summary).slice(0, 500),
        toolResults: (s.toolResults || []).map(t => ({
          tool: t.tool,
          success: t.success,
          snippet: JSON.stringify(t.data || {}).slice(0, 200),
        })),
        timestamp: s.timestamp || new Date().toISOString(),
      })),
      reflection: episode.reflection || null,
      chainOfThought: episode.chainOfThought ? JSON.stringify(episode.chainOfThought).slice(0, 2000) : null,
      createdAt: new Date(timestamp).toISOString(),
    };

    await db_ops.insert('agent_episodes', 'episode_id', episodeId, record);
    this.stats.writes++;
    return episodeId;
  }

  /**
   * Query episodes for replay or pattern analysis.
   * @param {string} agentId - Agent ID (or null for all agents)
   * @param {Object} [filters] - { decision, minRiskScore, maxRiskScore, outcome }
   * @param {number} [limit=10] - Max results
   * @returns {Array<Object>}
   */
  async queryEpisodes(agentId = null, filters = {}, limit = 10) {
    this.stats.retrievals++;
    const allRecords = await db_ops.getAll('agent_episodes', 10000, 0);
    let episodes = allRecords.map(r => r.data);

    if (agentId) episodes = episodes.filter(e => e.agentId === agentId);
    if (filters.decision) episodes = episodes.filter(e => e.decision === filters.decision);
    if (filters.outcome) episodes = episodes.filter(e => e.outcome === filters.outcome);
    if (filters.minRiskScore !== undefined) episodes = episodes.filter(e => (e.riskScore || 0) >= filters.minRiskScore);
    if (filters.maxRiskScore !== undefined) episodes = episodes.filter(e => (e.riskScore || 0) <= filters.maxRiskScore);

    return episodes
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, limit);
  }

  /**
   * Get a single episode by ID for full replay.
   * @param {string} episodeId
   * @returns {Object|null}
   */
  async getEpisode(episodeId) {
    this.stats.retrievals++;
    const row = await db_ops.getById('agent_episodes', 'episode_id', episodeId);
    return row?.data || null;
  }

  async getStats() {
    const stmCount = await db_ops.count('agent_short_term_memory');
    const ltmCount = await db_ops.count('agent_long_term_memory');
    let sharedCount = 0;
    let episodeCount = 0;
    try { sharedCount = await db_ops.count('agent_shared_memory'); } catch (e) { /* table may not exist */ }
    try { episodeCount = await db_ops.count('agent_episodes'); } catch (e) { /* table may not exist */ }

    return {
      shortTermEntries: stmCount,
      longTermEntries: ltmCount,
      sharedEntries: sharedCount,
      episodeCount,
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
