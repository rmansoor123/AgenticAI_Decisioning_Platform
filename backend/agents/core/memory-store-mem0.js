/**
 * Mem0-backed memory store.
 * Routes long-term and shared memory through the Mem0 Python service via HTTP.
 * Keeps short-term (TTL/FIFO) and episodic (relational) memory in the existing SQLite store.
 *
 * Same interface as memory-store.js.
 */

import { getMemoryStore } from './memory-store.js';

const EVAL_SERVICE_URL = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
const TIMEOUT_MS = 10000;

class MemoryStoreMem0 {
  constructor() {
    this.sqliteFallback = getMemoryStore();
    this.stats = { writes: 0, retrievals: 0, consolidations: 0, mem0Errors: 0 };
  }

  // ============================================================
  // Short-term memory — always uses SQLite (TTL + FIFO semantics)
  // ============================================================

  saveShortTerm(agentId, sessionId, entry) {
    return this.sqliteFallback.saveShortTerm(agentId, sessionId, entry);
  }

  getShortTerm(agentId, sessionId) {
    return this.sqliteFallback.getShortTerm(agentId, sessionId);
  }

  // ============================================================
  // Long-term memory — routed to Mem0 (semantic search, dedup)
  // ============================================================

  async saveLongTerm(agentId, type, content, importance = 0.5) {
    try {
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
      const resp = await fetch(`${EVAL_SERVICE_URL}/memory/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          content: contentStr,
          metadata: { type, importance, source: 'long_term' },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) throw new Error(`Mem0 add returned ${resp.status}`);
      this.stats.writes++;

      const memId = `LTM-${agentId.slice(0, 8)}-${Date.now().toString(36)}`;
      return memId;
    } catch (err) {
      this.stats.mem0Errors++;
      console.warn(`[memory-store-mem0] saveLongTerm fallback: ${err.message}`);
      return this.sqliteFallback.saveLongTerm(agentId, type, content, importance);
    }
  }

  async queryLongTerm(agentId, query, limit = 5) {
    try {
      const resp = await fetch(`${EVAL_SERVICE_URL}/memory/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, query, limit }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) throw new Error(`Mem0 search returned ${resp.status}`);
      const data = await resp.json();
      this.stats.retrievals++;

      return (data.results || []).map(r => ({
        content: r.memory || r.content,
        score: r.score || 0,
        metadata: r.metadata || {},
      }));
    } catch (err) {
      this.stats.mem0Errors++;
      console.warn(`[memory-store-mem0] queryLongTerm fallback: ${err.message}`);
      return this.sqliteFallback.queryLongTerm(agentId, query, limit);
    }
  }

  getLongTermByType(agentId, type) {
    // Mem0 doesn't have a native type filter; fall back to SQLite
    return this.sqliteFallback.getLongTermByType(agentId, type);
  }

  // ============================================================
  // Shared memory — routed to Mem0 (cross-agent semantic search)
  // ============================================================

  async saveShared(sourceAgentId, topic, content, importance = 0.5) {
    try {
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
      const resp = await fetch(`${EVAL_SERVICE_URL}/memory/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: `shared-${topic}`,
          content: contentStr,
          metadata: { sourceAgentId, topic, importance, source: 'shared' },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) throw new Error(`Mem0 add returned ${resp.status}`);
      this.stats.writes++;

      const memId = `SHR-${topic.slice(0, 8)}-${Date.now().toString(36)}`;
      return memId;
    } catch (err) {
      this.stats.mem0Errors++;
      console.warn(`[memory-store-mem0] saveShared fallback: ${err.message}`);
      return this.sqliteFallback.saveShared(sourceAgentId, topic, content, importance);
    }
  }

  async queryShared(query, topic = null, limit = 5) {
    try {
      const agentId = topic ? `shared-${topic}` : 'shared-global';
      const resp = await fetch(`${EVAL_SERVICE_URL}/memory/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, query, limit }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) throw new Error(`Mem0 search returned ${resp.status}`);
      const data = await resp.json();
      this.stats.retrievals++;

      return (data.results || []).map(r => ({
        content: r.memory || r.content,
        score: r.score || 0,
        metadata: r.metadata || {},
      }));
    } catch (err) {
      this.stats.mem0Errors++;
      console.warn(`[memory-store-mem0] queryShared fallback: ${err.message}`);
      return this.sqliteFallback.queryShared(query, topic, limit);
    }
  }

  // ============================================================
  // Episodic memory — always uses SQLite (relational structure)
  // ============================================================

  saveEpisode(agentId, episode) {
    return this.sqliteFallback.saveEpisode(agentId, episode);
  }

  queryEpisodes(agentId = null, filters = {}, limit = 10) {
    return this.sqliteFallback.queryEpisodes(agentId, filters, limit);
  }

  getEpisode(episodeId) {
    return this.sqliteFallback.getEpisode(episodeId);
  }

  // ============================================================
  // Consolidation & cleanup — delegates to SQLite
  // ============================================================

  consolidate(agentId, sessionId) {
    this.stats.consolidations++;
    return this.sqliteFallback.consolidate(agentId, sessionId);
  }

  consolidatePatterns(agentId, patterns) {
    return this.sqliteFallback.consolidatePatterns(agentId, patterns);
  }

  cleanup() {
    return this.sqliteFallback.cleanup();
  }

  pruneLongTerm(agentId, maxEntries = 500) {
    return this.sqliteFallback.pruneLongTerm(agentId, maxEntries);
  }

  // ============================================================
  // Stats
  // ============================================================

  getStats() {
    const sqliteStats = this.sqliteFallback.getStats();
    return {
      ...sqliteStats,
      ...this.stats,
      backend: 'mem0',
    };
  }
}

let instance = null;

export function getMemoryStoreMem0() {
  if (!instance) instance = new MemoryStoreMem0();
  return instance;
}

export { MemoryStoreMem0 };
