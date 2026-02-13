# Agentic AI Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the fraud detection platform into a state-of-the-art agentic AI system with RAG/Vector DB, persistent memory, observability, context engineering, advanced orchestration, multi-agent coordination, and autonomous onboarding.

**Architecture:** Seven layers built bottom-up. Knowledge Layer (Pinecone) is the foundation. Memory Layer persists to SQLite. Context Engine assembles prompts from memory + RAG. Orchestration adds conditional branching, retry, circuit breakers. Multi-Agent adds coordination and consensus. Observability instruments everything. Autonomous Onboarding is the capstone that uses all layers.

**Tech Stack:** Node.js ES modules, Express.js, SQLite (better-sqlite3 with in-memory fallback), Pinecone (via MCP tools), React + Vite + Tailwind v4 + Recharts, WebSocket for real-time.

**Codebase Conventions:**
- All backend files use ES module syntax (`import`/`export`)
- Database: all data stored as JSON blob in TEXT `data` column, with `created_at`/`updated_at` columns
- `db_ops` is the database abstraction — `insert(table, idField, id, data)`, `getById(table, idField, id)`, `getAll(table, limit, offset)`, `update(table, idField, id, data)`, `count(table)`, `raw(sql, params)`, `run(sql, params)`
- `memoryStore` in `database.js` is the in-memory fallback — add new Maps for new tables
- Migrations follow pattern in `backend/shared/common/migrations/` — `export const up = (db) => { ... }; export const down = (db) => { ... };`
- Services are Express routers mounted on the gateway in `backend/gateway/server.js`
- Agents extend `BaseAgent` from `backend/agents/core/base-agent.js`
- Singleton pattern used via `let instance = null; export function getInstance() { ... }`
- Frontend pages go in `src/pages/`, components in `src/components/`
- API base URL: `http://localhost:3005/api`, WS: `ws://localhost:3005/ws`
- No test framework installed — verify with `curl` commands and server logs

---

## Task 1: Knowledge Layer — Pinecone Index Setup and Knowledge Base Module

**Files:**
- Create: `backend/agents/core/knowledge-base.js`
- Modify: `backend/agents/core/base-agent.js:14-17` (add knowledge-base import)

**Context:** This is the foundation layer. All other layers depend on this for semantic retrieval. The Pinecone MCP tools are available — use `mcp__plugin_pinecone_pinecone__create-index-for-model` to create the index, then build a wrapper module that other code imports.

**Step 1: Create the Pinecone index**

Use the Pinecone MCP tool to create index `fraud-knowledge-base` with `multilingual-e5-large` embedding model and `text` field map. Cloud: `aws`, region: `us-east-1`.

**Step 2: Create `backend/agents/core/knowledge-base.js`**

This module wraps Pinecone operations for the rest of the codebase. Since agents run server-side and Pinecone is accessed via MCP tools (which are only available to Claude Code, not to the running Node.js server), the knowledge base module must use the Pinecone REST API directly OR store knowledge locally and provide a search interface.

**IMPORTANT DESIGN DECISION:** The running Node.js server cannot call MCP tools at runtime. The knowledge base module should:
1. Maintain a local SQLite-backed knowledge store for the running app
2. Provide `addKnowledge(namespace, records)` and `searchKnowledge(namespace, query, topK)` methods
3. Use keyword/TF-IDF style search locally (since we can't call Pinecone embeddings from Node.js)
4. Optionally sync to Pinecone via a CLI/admin script

Create the file with:

```javascript
/**
 * Knowledge Base - Semantic knowledge storage and retrieval
 *
 * Stores knowledge entries in SQLite for fast local retrieval.
 * Uses TF-IDF scoring for keyword-based semantic search.
 * Can be synced to Pinecone for production vector search.
 */
import { db_ops } from '../../shared/common/database.js';

const NAMESPACES = ['transactions', 'onboarding', 'decisions', 'risk-events', 'rules'];

class KnowledgeBase {
  constructor() {
    this.stats = {
      totalEntries: 0,
      searches: 0,
      hits: 0
    };
  }

  /**
   * Add knowledge entries to a namespace
   * @param {string} namespace - One of: transactions, onboarding, decisions, risk-events, rules
   * @param {Array} records - Array of { _id, text, category, sellerId, domain, outcome, riskScore, timestamp, source }
   */
  addKnowledge(namespace, records) {
    if (!NAMESPACES.includes(namespace)) {
      throw new Error(`Invalid namespace: ${namespace}. Must be one of: ${NAMESPACES.join(', ')}`);
    }

    for (const record of records) {
      const id = record._id || `KB-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const entry = {
        knowledgeId: id,
        namespace,
        text: record.text,
        category: record.category || namespace,
        sellerId: record.sellerId || null,
        domain: record.domain || null,
        outcome: record.outcome || 'pending',
        riskScore: record.riskScore || 0,
        timestamp: record.timestamp || new Date().toISOString(),
        source: record.source || 'unknown',
        // Pre-compute search tokens for TF-IDF
        tokens: this._tokenize(record.text),
        createdAt: new Date().toISOString()
      };

      db_ops.insert('knowledge_entries', 'knowledge_id', id, entry);
      this.stats.totalEntries++;
    }

    return { added: records.length, namespace };
  }

  /**
   * Search knowledge by text query with optional filters
   * @param {string} namespace - Namespace to search (or null for all)
   * @param {string} query - Search text
   * @param {Object} filters - Optional filters: { sellerId, domain, outcome, category }
   * @param {number} topK - Number of results to return
   * @returns {Array} Ranked results with relevance scores
   */
  searchKnowledge(namespace, query, filters = {}, topK = 5) {
    this.stats.searches++;

    // Get all entries (filtered by namespace if specified)
    let entries = db_ops.getAll('knowledge_entries', 10000, 0).map(r => r.data);

    if (namespace) {
      entries = entries.filter(e => e.namespace === namespace);
    }

    // Apply filters
    if (filters.sellerId) entries = entries.filter(e => e.sellerId === filters.sellerId);
    if (filters.domain) entries = entries.filter(e => e.domain === filters.domain);
    if (filters.outcome) entries = entries.filter(e => e.outcome === filters.outcome);
    if (filters.category) entries = entries.filter(e => e.category === filters.category);

    // Score by TF-IDF-like relevance
    const queryTokens = this._tokenize(query);
    const scored = entries.map(entry => {
      const score = this._calculateRelevance(queryTokens, entry.tokens || this._tokenize(entry.text));
      // Boost by recency (exponential decay, half-life 7 days)
      const daysSince = (Date.now() - new Date(entry.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      const recencyBoost = Math.pow(0.5, daysSince / 7);
      return { ...entry, relevanceScore: score * 0.7 + recencyBoost * 0.3 };
    });

    // Sort by relevance and return top K
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const results = scored.slice(0, topK);

    if (results.length > 0) this.stats.hits++;

    return results;
  }

  /**
   * Get knowledge entries for a specific seller
   */
  getSellerKnowledge(sellerId, limit = 20) {
    return db_ops.getAll('knowledge_entries', 10000, 0)
      .map(r => r.data)
      .filter(e => e.sellerId === sellerId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      totalEntries: db_ops.count('knowledge_entries'),
      namespaces: NAMESPACES
    };
  }

  // ── Private helpers ────────────────────────────────────────────

  _tokenize(text) {
    if (!text) return [];
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  _calculateRelevance(queryTokens, entryTokens) {
    if (queryTokens.length === 0 || entryTokens.length === 0) return 0;

    const entryTokenSet = new Set(entryTokens);
    let matches = 0;
    for (const token of queryTokens) {
      if (entryTokenSet.has(token)) matches++;
    }

    // Jaccard-like similarity
    const union = new Set([...queryTokens, ...entryTokens]).size;
    return union > 0 ? matches / union : 0;
  }
}

// Singleton
let instance = null;

export function getKnowledgeBase() {
  if (!instance) {
    instance = new KnowledgeBase();
  }
  return instance;
}

export default { KnowledgeBase, getKnowledgeBase };
```

**Step 3: Add migration for knowledge_entries table**

Create `backend/shared/common/migrations/004-knowledge-base.js`:

```javascript
export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_entries (
      knowledge_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_created ON knowledge_entries(created_at)`);
  console.log('Migration 004-knowledge-base applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS knowledge_entries');
  console.log('Migration 004-knowledge-base rolled back');
};

export default { up, down };
```

**Step 4: Register migration and update database.js**

Modify `backend/shared/common/migrations/index.js` — add import for `004-knowledge-base.js` and add it to the `migrations` array.

Modify `backend/shared/common/database.js`:
- Add `knowledge_entries: new Map()` to `memoryStore`
- Add `knowledge_entries: 'knowledge_id'` to `getIdField()`
- Add `'knowledge_entries'` to the `getStats()` tables array

**Step 5: Wire knowledge base into services**

Modify `backend/services/risk-profile/index.js` — after POST `/event` inserts a risk event, also add it to the knowledge base:

```javascript
import { getKnowledgeBase } from '../../agents/core/knowledge-base.js';

// Inside POST /event handler, after db_ops.insert:
const kb = getKnowledgeBase();
kb.addKnowledge('risk-events', [{
  _id: eventId,
  text: `Risk event: ${eventType} for seller ${sellerId} in domain ${domain}. Score: ${riskScore}. ${JSON.stringify(metadata || {})}`,
  category: 'risk-event',
  sellerId,
  domain,
  outcome: riskScore > 60 ? 'fraud' : riskScore > 30 ? 'pending' : 'legitimate',
  riskScore,
  timestamp: now,
  source: 'risk-profile-service'
}]);
```

**Step 6: Verify**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && node backend/gateway/server.js`

Then test:
```bash
# Add a risk event (which should also populate knowledge base)
curl -s -X POST http://localhost:3005/api/risk-profile/event \
  -H 'Content-Type: application/json' \
  -d '{"sellerId":"SELLER-TEST","domain":"ato","eventType":"TEST_EVENT","riskScore":50}' | jq .

# The knowledge base entry is now stored - we'll add an API to query it in a later task
```

Expected: 200 response with event + updated profile. No errors in server logs.

**Step 7: Commit**

```bash
git add backend/agents/core/knowledge-base.js backend/shared/common/migrations/004-knowledge-base.js backend/shared/common/migrations/index.js backend/shared/common/database.js backend/services/risk-profile/index.js
git commit -m "feat: add Knowledge Layer with knowledge-base module and SQLite storage"
```

---

## Task 2: Memory Layer — Persistent Short-Term and Long-Term Memory

**Files:**
- Create: `backend/agents/core/memory-store.js`
- Create: `backend/shared/common/migrations/005-agent-memory.js`
- Modify: `backend/shared/common/migrations/index.js` (add 005 migration)
- Modify: `backend/shared/common/database.js` (add memoryStore entries and ID fields)
- Modify: `backend/agents/core/base-agent.js` (integrate persistent memory)

**Context:** Currently, `BaseAgent` stores memory in plain JS arrays/Maps that vanish on restart. This task replaces that with SQLite-backed persistent memory.

**Step 1: Create `backend/shared/common/migrations/005-agent-memory.js`**

```javascript
export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_short_term_memory (
      memory_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stm_created ON agent_short_term_memory(created_at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_long_term_memory (
      memory_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ltm_created ON agent_long_term_memory(created_at)`);

  console.log('Migration 005-agent-memory applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS agent_long_term_memory');
  db.exec('DROP TABLE IF EXISTS agent_short_term_memory');
  console.log('Migration 005-agent-memory rolled back');
};

export default { up, down };
```

**Step 2: Register migration and update database.js**

Add to `migrations/index.js`: import and register `005-agent-memory`.

Add to `database.js`:
- `agent_short_term_memory: new Map()` and `agent_long_term_memory: new Map()` to `memoryStore`
- Both with `'memory_id'` in `getIdField()`
- Both to `getStats()` tables array

**Step 3: Create `backend/agents/core/memory-store.js`**

```javascript
/**
 * Memory Store - Persistent short-term and long-term memory for agents
 *
 * Short-term: Session-scoped, TTL 24h, max 50 entries per session
 * Long-term: Permanent, importance-weighted, cross-session learning
 */
import { db_ops } from '../../shared/common/database.js';

const SHORT_TERM_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SHORT_TERM_MAX_ENTRIES = 50;

class MemoryStore {
  constructor() {
    this.stats = {
      shortTermWrites: 0,
      longTermWrites: 0,
      retrievals: 0,
      consolidations: 0
    };
  }

  // ── Short-Term Memory ──────────────────────────────────────────

  /**
   * Save an entry to short-term memory
   */
  saveShortTerm(agentId, sessionId, entry) {
    const memoryId = `STM-${agentId}-${sessionId}-${Date.now()}`;
    const record = {
      memoryId,
      agentId,
      sessionId,
      entry,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SHORT_TERM_TTL_MS).toISOString()
    };

    db_ops.insert('agent_short_term_memory', 'memory_id', memoryId, record);
    this.stats.shortTermWrites++;

    // Enforce max entries per session (FIFO eviction)
    this._enforceShortTermLimit(agentId, sessionId);

    return record;
  }

  /**
   * Get short-term memory for an agent session
   */
  getShortTerm(agentId, sessionId) {
    this.stats.retrievals++;
    const all = db_ops.getAll('agent_short_term_memory', 10000, 0)
      .map(r => r.data)
      .filter(m => m.agentId === agentId && m.sessionId === sessionId)
      .filter(m => new Date(m.expiresAt) > new Date()) // Not expired
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return all.map(m => m.entry);
  }

  // ── Long-Term Memory ───────────────────────────────────────────

  /**
   * Save to long-term memory
   * @param {string} agentId
   * @param {string} type - pattern|insight|preference|correction
   * @param {Object} content - The memory content
   * @param {number} importance - 0-1 importance score
   */
  saveLongTerm(agentId, type, content, importance = 0.5) {
    const memoryId = `LTM-${agentId}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const record = {
      memoryId,
      agentId,
      memoryType: type,
      content,
      importanceScore: importance,
      accessCount: 0,
      lastAccessed: null,
      createdAt: new Date().toISOString()
    };

    db_ops.insert('agent_long_term_memory', 'memory_id', memoryId, record);
    this.stats.longTermWrites++;

    return record;
  }

  /**
   * Query long-term memory by keyword and importance
   */
  queryLongTerm(agentId, query, limit = 10) {
    this.stats.retrievals++;
    const all = db_ops.getAll('agent_long_term_memory', 10000, 0)
      .map(r => r.data)
      .filter(m => m.agentId === agentId);

    // Score by keyword match + importance + recency of access
    const queryLower = (query || '').toLowerCase();
    const scored = all.map(m => {
      const contentStr = JSON.stringify(m.content).toLowerCase();
      const keywordScore = queryLower.split(/\s+/).filter(w => w.length > 2 && contentStr.includes(w)).length;
      const importanceWeight = m.importanceScore || 0.5;
      const accessBoost = m.lastAccessed
        ? Math.pow(0.5, (Date.now() - new Date(m.lastAccessed).getTime()) / (7 * 24 * 60 * 60 * 1000))
        : 0;
      return { ...m, score: keywordScore * 0.5 + importanceWeight * 0.3 + accessBoost * 0.2 };
    });

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit);

    // Update access counts
    for (const result of results) {
      result.accessCount = (result.accessCount || 0) + 1;
      result.lastAccessed = new Date().toISOString();
      db_ops.update('agent_long_term_memory', 'memory_id', result.memoryId, result);
    }

    return results.map(r => ({ ...r.content, _memoryId: r.memoryId, _importance: r.importanceScore, _type: r.memoryType }));
  }

  /**
   * Get all long-term memories for an agent by type
   */
  getLongTermByType(agentId, type) {
    return db_ops.getAll('agent_long_term_memory', 10000, 0)
      .map(r => r.data)
      .filter(m => m.agentId === agentId && m.memoryType === type)
      .sort((a, b) => b.importanceScore - a.importanceScore);
  }

  // ── Consolidation ──────────────────────────────────────────────

  /**
   * Consolidate short-term patterns into long-term memory
   * Called at end of session or when short-term is full
   */
  consolidate(agentId, sessionId) {
    const shortTerm = this.getShortTerm(agentId, sessionId);
    if (shortTerm.length < 3) return { consolidated: 0 };

    // Find repeated patterns (entries with similar keys appearing 3+ times)
    const patternCounts = {};
    for (const entry of shortTerm) {
      const key = entry.type || entry.action || 'unknown';
      patternCounts[key] = (patternCounts[key] || 0) + 1;
    }

    let consolidated = 0;
    for (const [pattern, count] of Object.entries(patternCounts)) {
      if (count >= 3) {
        this.saveLongTerm(agentId, 'pattern', {
          pattern,
          frequency: count,
          sessionId,
          summary: `Pattern "${pattern}" occurred ${count} times in session ${sessionId}`,
          sampleEntries: shortTerm.filter(e => (e.type || e.action) === pattern).slice(0, 3)
        }, Math.min(1, count / 10));
        consolidated++;
      }
    }

    this.stats.consolidations++;
    return { consolidated };
  }

  // ── Cleanup ────────────────────────────────────────────────────

  /**
   * Clean up expired short-term memories
   */
  cleanup() {
    const all = db_ops.getAll('agent_short_term_memory', 10000, 0).map(r => r.data);
    let cleaned = 0;
    for (const m of all) {
      if (new Date(m.expiresAt) <= new Date()) {
        db_ops.delete('agent_short_term_memory', 'memory_id', m.memoryId);
        cleaned++;
      }
    }
    return { cleaned };
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      shortTermEntries: db_ops.count('agent_short_term_memory'),
      longTermEntries: db_ops.count('agent_long_term_memory')
    };
  }

  // ── Private ────────────────────────────────────────────────────

  _enforceShortTermLimit(agentId, sessionId) {
    const entries = db_ops.getAll('agent_short_term_memory', 10000, 0)
      .map(r => r.data)
      .filter(m => m.agentId === agentId && m.sessionId === sessionId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    while (entries.length > SHORT_TERM_MAX_ENTRIES) {
      const oldest = entries.shift();
      db_ops.delete('agent_short_term_memory', 'memory_id', oldest.memoryId);
    }
  }
}

// Singleton
let instance = null;

export function getMemoryStore() {
  if (!instance) {
    instance = new MemoryStore();
  }
  return instance;
}

export default { MemoryStore, getMemoryStore };
```

**Step 4: Integrate memory store into BaseAgent**

Modify `backend/agents/core/base-agent.js`:

1. Add import at top: `import { getMemoryStore } from './memory-store.js';`
2. In constructor, after `this.patternMemory = getPatternMemory();` add:
   ```javascript
   this.memoryStore = getMemoryStore();
   this.sessionId = `SESSION-${Date.now().toString(36)}`;
   ```
3. Replace `updateMemory(thought)` method body to also persist to memory store:
   ```javascript
   updateMemory(thought) {
     // Add to in-memory short-term (keep for backward compat)
     this.memory.shortTerm.push({
       timestamp: thought.timestamp,
       summary: thought.result?.summary || 'Action completed',
       key_facts: this.extractKeyFacts(thought)
     });

     if (this.memory.shortTerm.length > this.maxMemorySize) {
       const removed = this.memory.shortTerm.shift();
       this.consolidateToLongTerm(removed);
     }

     // Persist to memory store
     this.memoryStore.saveShortTerm(this.agentId, this.sessionId, {
       timestamp: thought.timestamp,
       type: thought.actions?.[0]?.action?.type || 'reasoning',
       summary: thought.result?.summary || 'Action completed',
       key_facts: this.extractKeyFacts(thought),
       success: thought.result?.success
     });
   }
   ```
4. Replace `consolidateToLongTerm(memory)` to use memory store:
   ```javascript
   consolidateToLongTerm(memory) {
     const key = `memory_${Date.now()}`;
     this.memory.longTerm.set(key, memory);

     // Persist to long-term memory store
     this.memoryStore.saveLongTerm(this.agentId, 'insight', {
       ...memory,
       consolidatedAt: new Date().toISOString()
     }, 0.5);
   }
   ```
5. Replace `retrieveRelevantMemory(input)` to also check persistent memory:
   ```javascript
   retrieveRelevantMemory(input) {
     const inputStr = JSON.stringify(input).toLowerCase();

     // Check in-memory first (fast)
     const inMemory = this.memory.shortTerm
       .filter(m => JSON.stringify(m).toLowerCase().includes(inputStr.slice(0, 50)))
       .slice(-5);

     // Also check persistent long-term memory
     const longTerm = this.memoryStore.queryLongTerm(this.agentId, inputStr.slice(0, 100), 3);

     return { recent: inMemory, learned: longTerm };
   }
   ```

**Step 5: Verify**

Kill existing server, restart:
```bash
lsof -ti:3005 | xargs kill 2>/dev/null; cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && node backend/gateway/server.js
```

Then:
```bash
# Trigger an agent action to verify memory persistence
curl -s -X POST http://localhost:3005/api/agents/investigate \
  -H 'Content-Type: application/json' \
  -d '{"transactionId":"TXN-TEST-001"}' | jq '.data.agentName'
```

Expected: Agent processes request, memory entries are created in SQLite. No errors.

**Step 6: Commit**

```bash
git add backend/agents/core/memory-store.js backend/shared/common/migrations/005-agent-memory.js backend/shared/common/migrations/index.js backend/shared/common/database.js backend/agents/core/base-agent.js
git commit -m "feat: add persistent Memory Layer with short-term and long-term storage"
```

---

## Task 3: Context Engineering Layer — Context Engine and Prompt Builder

**Files:**
- Create: `backend/agents/core/context-engine.js`
- Create: `backend/agents/core/prompt-builder.js`
- Modify: `backend/agents/core/base-agent.js` (integrate context engine into reasoning loop)

**Context:** The context engine assembles the right information from memory, RAG, and current state into a structured prompt within a token budget. The prompt builder formats it.

**Step 1: Create `backend/agents/core/prompt-builder.js`**

```javascript
/**
 * Prompt Builder - Template-based prompt construction
 *
 * Takes assembled context sections and formats them into
 * agent-specific prompts with clear section markers.
 */

const SECTION_TEMPLATES = {
  system: (content) => `## System Instructions\n${content}`,
  task: (content) => `## Current Task\n${content}`,
  shortTermMemory: (content) => `## Recent Context\n${content}`,
  ragResults: (content) => `## Similar Historical Cases\n${content}`,
  longTermMemory: (content) => `## Learned Patterns & Insights\n${content}`,
  domainContext: (content) => `## Domain Context\n${content}`
};

export class PromptBuilder {
  /**
   * Build a prompt from assembled context sections
   * @param {Object} sections - { system, task, shortTermMemory, ragResults, longTermMemory, domainContext }
   * @param {Object} options - { agentName, agentRole }
   * @returns {string} Formatted prompt
   */
  build(sections, options = {}) {
    const parts = [];

    if (options.agentName) {
      parts.push(`# Agent: ${options.agentName} (${options.agentRole || 'General'})\n`);
    }

    for (const [key, content] of Object.entries(sections)) {
      if (content && content.trim().length > 0 && SECTION_TEMPLATES[key]) {
        parts.push(SECTION_TEMPLATES[key](content));
      }
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Format an array of memory entries as text
   */
  formatMemoryEntries(entries, maxEntries = 5) {
    if (!entries || entries.length === 0) return '';
    return entries.slice(0, maxEntries).map((entry, i) => {
      if (typeof entry === 'string') return `${i + 1}. ${entry}`;
      const summary = entry.summary || entry.pattern || JSON.stringify(entry).slice(0, 150);
      return `${i + 1}. ${summary}`;
    }).join('\n');
  }

  /**
   * Format RAG results as text
   */
  formatRAGResults(results, maxResults = 5) {
    if (!results || results.length === 0) return '';
    return results.slice(0, maxResults).map((r, i) => {
      const score = r.relevanceScore ? ` (relevance: ${(r.relevanceScore * 100).toFixed(0)}%)` : '';
      const outcome = r.outcome ? ` [${r.outcome}]` : '';
      return `${i + 1}. ${r.text || r.summary || 'Unknown'}${outcome}${score}`;
    }).join('\n');
  }

  /**
   * Estimate token count (rough: ~4 chars per token)
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate text to fit within token budget
   */
  truncateToTokenBudget(text, maxTokens) {
    if (!text) return '';
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 3) + '...';
  }
}

// Singleton
let instance = null;

export function getPromptBuilder() {
  if (!instance) {
    instance = new PromptBuilder();
  }
  return instance;
}

export default { PromptBuilder, getPromptBuilder };
```

**Step 2: Create `backend/agents/core/context-engine.js`**

```javascript
/**
 * Context Engine - Intelligent context assembly for agent prompts
 *
 * Gathers context from memory, knowledge base, and current state.
 * Scores and ranks by relevance. Allocates within token budgets.
 * Tracks which context was useful for future optimization.
 */

import { getMemoryStore } from './memory-store.js';
import { getKnowledgeBase } from './knowledge-base.js';
import { getPromptBuilder } from './prompt-builder.js';

const DEFAULT_TOKEN_BUDGET = 4000;

const SOURCE_BUDGETS = {
  system:          { priority: 1, maxTokens: 200 },
  task:            { priority: 2, maxTokens: 500 },
  shortTermMemory: { priority: 3, maxTokens: 500 },
  ragResults:      { priority: 4, maxTokens: 800 },
  longTermMemory:  { priority: 5, maxTokens: 400 },
  domainContext:   { priority: 6, maxTokens: 300 }
};

class ContextEngine {
  constructor() {
    this.memoryStore = getMemoryStore();
    this.knowledgeBase = getKnowledgeBase();
    this.promptBuilder = getPromptBuilder();

    // Track context quality
    this.qualityLog = [];
    this.stats = {
      assemblies: 0,
      avgSourcesUsed: 0,
      avgTokensUsed: 0
    };
  }

  /**
   * Assemble context for an agent's reasoning
   *
   * @param {string} agentId - The agent requesting context
   * @param {Object} task - Current task/input
   * @param {Object} options - {
   *   sessionId: string,
   *   systemPrompt: string,
   *   domain: string,
   *   sellerId: string,
   *   tokenBudget: number
   * }
   * @returns {Object} { prompt: string, sources: Object, tokenCount: number }
   */
  assembleContext(agentId, task, options = {}) {
    const {
      sessionId,
      systemPrompt = '',
      domain = null,
      sellerId = null,
      tokenBudget = DEFAULT_TOKEN_BUDGET
    } = options;

    const sections = {};
    const sourceMeta = {};
    let totalTokens = 0;

    // 1. System instructions (always included)
    if (systemPrompt) {
      sections.system = this.promptBuilder.truncateToTokenBudget(systemPrompt, SOURCE_BUDGETS.system.maxTokens);
      totalTokens += this.promptBuilder.estimateTokens(sections.system);
      sourceMeta.system = { included: true, tokens: this.promptBuilder.estimateTokens(sections.system) };
    }

    // 2. Current task
    const taskText = typeof task === 'string' ? task : JSON.stringify(task, null, 2);
    sections.task = this.promptBuilder.truncateToTokenBudget(taskText, SOURCE_BUDGETS.task.maxTokens);
    totalTokens += this.promptBuilder.estimateTokens(sections.task);
    sourceMeta.task = { included: true, tokens: this.promptBuilder.estimateTokens(sections.task) };

    // 3. Short-term memory
    if (sessionId) {
      const recentMemory = this.memoryStore.getShortTerm(agentId, sessionId);
      if (recentMemory.length > 0) {
        const memoryText = this.promptBuilder.formatMemoryEntries(recentMemory, 5);
        sections.shortTermMemory = this.promptBuilder.truncateToTokenBudget(memoryText, SOURCE_BUDGETS.shortTermMemory.maxTokens);
        totalTokens += this.promptBuilder.estimateTokens(sections.shortTermMemory);
        sourceMeta.shortTermMemory = { included: true, entries: recentMemory.length, tokens: this.promptBuilder.estimateTokens(sections.shortTermMemory) };
      }
    }

    // 4. RAG results from knowledge base
    const queryText = typeof task === 'string' ? task : (task.type || task.eventType || JSON.stringify(task).slice(0, 200));
    const ragResults = this.knowledgeBase.searchKnowledge(
      domain ? domain.replace(/-/g, '-') : null,
      queryText,
      sellerId ? { sellerId } : {},
      5
    );
    if (ragResults.length > 0) {
      const ragText = this.promptBuilder.formatRAGResults(ragResults, 5);
      sections.ragResults = this.promptBuilder.truncateToTokenBudget(ragText, SOURCE_BUDGETS.ragResults.maxTokens);
      totalTokens += this.promptBuilder.estimateTokens(sections.ragResults);
      sourceMeta.ragResults = { included: true, results: ragResults.length, tokens: this.promptBuilder.estimateTokens(sections.ragResults) };
    }

    // 5. Long-term memory
    const longTermResults = this.memoryStore.queryLongTerm(agentId, queryText, 5);
    if (longTermResults.length > 0) {
      const ltmText = this.promptBuilder.formatMemoryEntries(longTermResults, 5);
      sections.longTermMemory = this.promptBuilder.truncateToTokenBudget(ltmText, SOURCE_BUDGETS.longTermMemory.maxTokens);
      totalTokens += this.promptBuilder.estimateTokens(sections.longTermMemory);
      sourceMeta.longTermMemory = { included: true, entries: longTermResults.length, tokens: this.promptBuilder.estimateTokens(sections.longTermMemory) };
    }

    // 6. Domain context (seller profile, recent events)
    if (sellerId) {
      const sellerKnowledge = this.knowledgeBase.getSellerKnowledge(sellerId, 5);
      if (sellerKnowledge.length > 0) {
        const contextText = sellerKnowledge.map(k =>
          `[${k.domain}] ${k.text?.slice(0, 100) || 'No details'} (score: ${k.riskScore})`
        ).join('\n');
        sections.domainContext = this.promptBuilder.truncateToTokenBudget(contextText, SOURCE_BUDGETS.domainContext.maxTokens);
        totalTokens += this.promptBuilder.estimateTokens(sections.domainContext);
        sourceMeta.domainContext = { included: true, entries: sellerKnowledge.length, tokens: this.promptBuilder.estimateTokens(sections.domainContext) };
      }
    }

    // Build final prompt
    const prompt = this.promptBuilder.build(sections, {
      agentName: agentId,
      agentRole: options.agentRole
    });

    // Update stats
    this.stats.assemblies++;
    const sourcesUsed = Object.values(sourceMeta).filter(s => s.included).length;
    this.stats.avgSourcesUsed = (this.stats.avgSourcesUsed * (this.stats.assemblies - 1) + sourcesUsed) / this.stats.assemblies;
    this.stats.avgTokensUsed = (this.stats.avgTokensUsed * (this.stats.assemblies - 1) + totalTokens) / this.stats.assemblies;

    return {
      prompt,
      sections,
      sources: sourceMeta,
      tokenCount: totalTokens,
      assembledAt: new Date().toISOString()
    };
  }

  /**
   * Log context quality feedback (was the context useful for the decision?)
   */
  logQuality(assemblyId, agentId, wasUseful, decision) {
    this.qualityLog.push({
      assemblyId,
      agentId,
      wasUseful,
      decision,
      timestamp: new Date().toISOString()
    });

    // Keep log manageable
    if (this.qualityLog.length > 500) {
      this.qualityLog = this.qualityLog.slice(-250);
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      qualityLogSize: this.qualityLog.length,
      avgTokensUsed: Math.round(this.stats.avgTokensUsed),
      avgSourcesUsed: Math.round(this.stats.avgSourcesUsed * 10) / 10
    };
  }
}

// Singleton
let instance = null;

export function getContextEngine() {
  if (!instance) {
    instance = new ContextEngine();
  }
  return instance;
}

export default { ContextEngine, getContextEngine };
```

**Step 3: Integrate context engine into BaseAgent reasoning loop**

Modify `backend/agents/core/base-agent.js`:

1. Add import: `import { getContextEngine } from './context-engine.js';`
2. In constructor, add: `this.contextEngine = getContextEngine();`
3. In the `reason()` method, before Step 1 (THINK), add context assembly:
   ```javascript
   // Assemble context from all sources
   const assembledContext = this.contextEngine.assembleContext(this.agentId, input, {
     sessionId: this.sessionId,
     systemPrompt: `You are ${this.name}, a ${this.role} agent.`,
     domain: input?.domain || context?.domain || null,
     sellerId: input?.sellerId || context?.sellerId || null,
     agentRole: this.role
   });
   context._assembledContext = assembledContext;
   ```

**Step 4: Verify**

Restart server and test:
```bash
curl -s -X POST http://localhost:3005/api/agents/investigate \
  -H 'Content-Type: application/json' \
  -d '{"transactionId":"TXN-TEST-002"}' | jq '.data.thoughtProcess'
```

Expected: Agent processes with assembled context. No errors.

**Step 5: Commit**

```bash
git add backend/agents/core/context-engine.js backend/agents/core/prompt-builder.js backend/agents/core/base-agent.js
git commit -m "feat: add Context Engineering Layer with prompt builder and token budgets"
```

---

## Task 4: Advanced Orchestration — Conditional Branching, Retry, Circuit Breaker

**Files:**
- Create: `backend/agents/core/circuit-breaker.js`
- Create: `backend/agents/core/agent-router.js`
- Create: `backend/shared/common/migrations/006-orchestration.js`
- Modify: `backend/shared/common/migrations/index.js` (add 006)
- Modify: `backend/shared/common/database.js` (add workflow_checkpoints)
- Modify: `backend/agents/core/agent-orchestrator.js` (add conditional branching, retry, checkpointing)

**Step 1: Create `backend/agents/core/circuit-breaker.js`**

```javascript
/**
 * Circuit Breaker - Prevents cascade failures
 *
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing)
 * Opens after 5 failures in 60s, tests after 30s cooldown.
 */

const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 60 * 1000;
const COOLDOWN_MS = 30 * 1000;

const STATES = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker {
  constructor(name) {
    this.name = name;
    this.state = STATES.CLOSED;
    this.failures = [];
    this.lastFailure = null;
    this.lastStateChange = Date.now();
    this.successCount = 0;
    this.failureCount = 0;
  }

  /**
   * Check if the circuit allows execution
   */
  canExecute() {
    this._cleanOldFailures();

    if (this.state === STATES.CLOSED) return true;

    if (this.state === STATES.OPEN) {
      // Check if cooldown has elapsed
      if (Date.now() - this.lastStateChange >= COOLDOWN_MS) {
        this.state = STATES.HALF_OPEN;
        this.lastStateChange = Date.now();
        return true; // Allow one test request
      }
      return false;
    }

    if (this.state === STATES.HALF_OPEN) {
      return true; // Allow test request
    }

    return false;
  }

  /**
   * Record a successful execution
   */
  recordSuccess() {
    this.successCount++;
    if (this.state === STATES.HALF_OPEN) {
      this.state = STATES.CLOSED;
      this.failures = [];
      this.lastStateChange = Date.now();
    }
  }

  /**
   * Record a failed execution
   */
  recordFailure() {
    this.failureCount++;
    this.failures.push(Date.now());
    this.lastFailure = Date.now();
    this._cleanOldFailures();

    if (this.state === STATES.HALF_OPEN) {
      this.state = STATES.OPEN;
      this.lastStateChange = Date.now();
    } else if (this.state === STATES.CLOSED && this.failures.length >= FAILURE_THRESHOLD) {
      this.state = STATES.OPEN;
      this.lastStateChange = Date.now();
    }
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      recentFailures: this.failures.length,
      successCount: this.successCount,
      failureCount: this.failureCount,
      lastFailure: this.lastFailure ? new Date(this.lastFailure).toISOString() : null
    };
  }

  _cleanOldFailures() {
    const cutoff = Date.now() - FAILURE_WINDOW_MS;
    this.failures = this.failures.filter(f => f > cutoff);
  }
}

// Registry of circuit breakers (one per agent)
const breakers = new Map();

export function getCircuitBreaker(name) {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(name));
  }
  return breakers.get(name);
}

export function getAllCircuitBreakerStates() {
  return Array.from(breakers.values()).map(b => b.getState());
}

export { STATES };
export default { CircuitBreaker, getCircuitBreaker, getAllCircuitBreakerStates, STATES };
```

**Step 2: Create `backend/agents/core/agent-router.js`**

```javascript
/**
 * Agent Router - Dynamic task routing based on capability, load, and performance
 */

class AgentRouter {
  constructor() {
    this.capabilities = new Map(); // agentId -> Set<capability>
    this.performance = new Map(); // agentId -> { successes, failures, avgDuration }
    this.load = new Map(); // agentId -> currentTasks
  }

  /**
   * Register an agent's capabilities
   */
  registerAgent(agentId, capabilities = []) {
    this.capabilities.set(agentId, new Set(capabilities));
    if (!this.performance.has(agentId)) {
      this.performance.set(agentId, { successes: 0, failures: 0, avgDuration: 0, totalTasks: 0 });
    }
    if (!this.load.has(agentId)) {
      this.load.set(agentId, 0);
    }
  }

  /**
   * Find the best agent for a task type
   */
  route(taskType) {
    const candidates = [];

    for (const [agentId, caps] of this.capabilities) {
      if (caps.has(taskType)) {
        const perf = this.performance.get(agentId) || { successes: 0, failures: 0, totalTasks: 0 };
        const currentLoad = this.load.get(agentId) || 0;
        const successRate = perf.totalTasks > 0 ? perf.successes / perf.totalTasks : 0.5;

        candidates.push({
          agentId,
          score: successRate * 0.6 + (1 / (currentLoad + 1)) * 0.4, // Balance quality vs load
          currentLoad,
          successRate
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  /**
   * Record task start (increase load)
   */
  taskStarted(agentId) {
    this.load.set(agentId, (this.load.get(agentId) || 0) + 1);
  }

  /**
   * Record task completion
   */
  taskCompleted(agentId, success, durationMs) {
    this.load.set(agentId, Math.max(0, (this.load.get(agentId) || 1) - 1));

    const perf = this.performance.get(agentId) || { successes: 0, failures: 0, avgDuration: 0, totalTasks: 0 };
    perf.totalTasks++;
    if (success) perf.successes++;
    else perf.failures++;
    perf.avgDuration = (perf.avgDuration * (perf.totalTasks - 1) + durationMs) / perf.totalTasks;
    this.performance.set(agentId, perf);
  }

  getStats() {
    return {
      agents: Array.from(this.capabilities.entries()).map(([id, caps]) => ({
        agentId: id,
        capabilities: Array.from(caps),
        performance: this.performance.get(id),
        currentLoad: this.load.get(id) || 0
      }))
    };
  }
}

// Singleton
let instance = null;

export function getAgentRouter() {
  if (!instance) {
    instance = new AgentRouter();
  }
  return instance;
}

export default { AgentRouter, getAgentRouter };
```

**Step 3: Create migration `backend/shared/common/migrations/006-orchestration.js`**

```javascript
export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON workflow_checkpoints(created_at)`);
  console.log('Migration 006-orchestration applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS workflow_checkpoints');
  console.log('Migration 006-orchestration rolled back');
};

export default { up, down };
```

**Step 4: Register migration and update database.js**

Add to `migrations/index.js`: import and register `006-orchestration`.

Add to `database.js`:
- `workflow_checkpoints: new Map()` to `memoryStore`
- `workflow_checkpoints: 'checkpoint_id'` to `getIdField()`
- `'workflow_checkpoints'` to `getStats()` tables array

**Step 5: Enhance `agent-orchestrator.js`**

Add to `backend/agents/core/agent-orchestrator.js`:

1. Add imports at top:
   ```javascript
   import { getCircuitBreaker } from './circuit-breaker.js';
   import { getAgentRouter } from './agent-router.js';
   import { db_ops } from '../../shared/common/database.js';
   ```

2. In constructor, add:
   ```javascript
   this.router = getAgentRouter();
   ```

3. In `registerAgent()`, after `this.agents.set(...)`, add:
   ```javascript
   this.router.registerAgent(agent.agentId, agent.capabilities || []);
   ```

4. Add new method `executeStepWithRetry()` after `executeStep()`:
   ```javascript
   async executeStepWithRetry(step, context, execution) {
     const maxRetries = step.maxRetries || 3;
     const backoffMs = step.backoffMs || 1000;
     const backoffMultiplier = step.backoffMultiplier || 2;

     // Check circuit breaker
     const agentId = step.agent;
     const breaker = getCircuitBreaker(agentId);

     if (!breaker.canExecute()) {
       return {
         stepName: step.name,
         status: 'CIRCUIT_OPEN',
         error: `Circuit breaker open for agent ${agentId}`,
         startedAt: new Date().toISOString(),
         completedAt: new Date().toISOString(),
         duration: 0
       };
     }

     let lastError = null;
     for (let attempt = 0; attempt <= maxRetries; attempt++) {
       try {
         this.router.taskStarted(agentId);
         const startTime = Date.now();
         const result = await this.executeStep(step, context, execution);
         const duration = Date.now() - startTime;
         this.router.taskCompleted(agentId, result.status === 'COMPLETED', duration);

         if (result.status === 'COMPLETED' || result.status === 'ESCALATED') {
           breaker.recordSuccess();
           return result;
         }

         lastError = result.error;
         breaker.recordFailure();
       } catch (error) {
         lastError = error.message;
         breaker.recordFailure();
         this.router.taskCompleted(agentId, false, 0);
       }

       if (attempt < maxRetries) {
         const delay = backoffMs * Math.pow(backoffMultiplier, attempt);
         await new Promise(resolve => setTimeout(resolve, delay));
         this.log('STEP_RETRY', { step: step.name, attempt: attempt + 1, delay });
       }
     }

     return {
       stepName: step.name,
       status: 'FAILED',
       error: `Failed after ${maxRetries + 1} attempts: ${lastError}`,
       startedAt: new Date().toISOString(),
       completedAt: new Date().toISOString(),
       duration: 0
     };
   }
   ```

5. Add `executeConditionalStep()` method:
   ```javascript
   async executeConditionalStep(step, context, execution) {
     const branchKey = step.evaluate(context);
     const branchSteps = step.branches[branchKey];

     if (!branchSteps) {
       return { stepName: step.name, status: 'FAILED', error: `No branch for key: ${branchKey}` };
     }

     this.log('CONDITIONAL_BRANCH', { step: step.name, branch: branchKey });

     const results = [];
     for (const subStep of branchSteps) {
       const result = await this.executeStepWithRetry(subStep, context, execution);
       results.push(result);
       if (result.status === 'FAILED' && !subStep.continueOnError) break;
       context[subStep.outputKey || `sub_${results.length}`] = result.output;
     }

     return {
       stepName: step.name,
       status: results.every(r => r.status !== 'FAILED') ? 'COMPLETED' : 'FAILED',
       branch: branchKey,
       subResults: results
     };
   }
   ```

6. Add checkpoint methods:
   ```javascript
   saveCheckpoint(executionId, stepIndex, state) {
     const checkpointId = `${executionId}-step-${stepIndex}`;
     db_ops.insert('workflow_checkpoints', 'checkpoint_id', checkpointId, {
       executionId,
       stepIndex,
       state,
       status: 'saved',
       savedAt: new Date().toISOString()
     });
   }

   loadCheckpoint(executionId) {
     const all = db_ops.getAll('workflow_checkpoints', 100, 0)
       .map(r => r.data)
       .filter(c => c.executionId === executionId)
       .sort((a, b) => b.stepIndex - a.stepIndex);
     return all[0] || null;
   }
   ```

7. Modify `executeWorkflow()` — replace the `executeStep` call inside the for loop with:
   ```javascript
   let stepResult;
   if (step.type === 'conditional') {
     stepResult = await this.executeConditionalStep(step, context, execution);
   } else {
     stepResult = await this.executeStepWithRetry(step, context, execution);
   }

   // Save checkpoint after each successful step
   if (stepResult.status === 'COMPLETED') {
     this.saveCheckpoint(execution.executionId, i, context);
   }
   ```

**Step 6: Verify**

Restart server and test:
```bash
curl -s http://localhost:3005/api/agents/status | jq '.data.agents | length'
```

Expected: Returns agent count (4). No errors on startup.

**Step 7: Commit**

```bash
git add backend/agents/core/circuit-breaker.js backend/agents/core/agent-router.js backend/shared/common/migrations/006-orchestration.js backend/shared/common/migrations/index.js backend/shared/common/database.js backend/agents/core/agent-orchestrator.js
git commit -m "feat: add Advanced Orchestration with retry, circuit breaker, conditional branching"
```

---

## Task 5: Multi-Agent Coordination — Coordinator, Consensus Engine, Enhanced Messaging

**Files:**
- Create: `backend/agents/core/agent-coordinator.js`
- Create: `backend/agents/core/consensus-engine.js`
- Modify: `backend/agents/core/agent-messenger.js` (add structured message types, correlation IDs, priority queue)
- Modify: `backend/agents/core/base-agent.js` (add delegate method)

**Step 1: Create `backend/agents/core/consensus-engine.js`**

```javascript
/**
 * Consensus Engine - Multi-agent voting and agreement
 *
 * Strategies: majority, unanimous, weighted
 * Tracks disagreements for learning.
 */

import { getMemoryStore } from './memory-store.js';

class ConsensusEngine {
  constructor() {
    this.memoryStore = getMemoryStore();
    this.sessions = new Map(); // sessionId -> { votes, config }
    this.stats = {
      consensusReached: 0,
      consensusFailed: 0,
      totalSessions: 0
    };
  }

  /**
   * Start a consensus session
   */
  createSession(sessionId, config = {}) {
    const session = {
      sessionId,
      strategy: config.strategy || 'majority', // majority, unanimous, weighted
      requiredVoters: config.requiredVoters || [],
      votes: [],
      status: 'open',
      createdAt: new Date().toISOString()
    };
    this.sessions.set(sessionId, session);
    this.stats.totalSessions++;
    return session;
  }

  /**
   * Cast a vote
   */
  vote(sessionId, agentId, decision, confidence = 0.5, reasoning = '') {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'open') return null;

    // Prevent duplicate votes
    if (session.votes.find(v => v.agentId === agentId)) return null;

    session.votes.push({
      agentId,
      decision,
      confidence,
      reasoning,
      votedAt: new Date().toISOString()
    });

    return session;
  }

  /**
   * Evaluate consensus
   */
  evaluate(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const votes = session.votes;
    if (votes.length === 0) return { consensus: false, reason: 'No votes cast' };

    let result;
    switch (session.strategy) {
      case 'unanimous':
        result = this._evaluateUnanimous(votes);
        break;
      case 'weighted':
        result = this._evaluateWeighted(votes);
        break;
      case 'majority':
      default:
        result = this._evaluateMajority(votes);
    }

    session.status = 'closed';
    session.result = result;

    if (result.consensus) {
      this.stats.consensusReached++;
    } else {
      this.stats.consensusFailed++;
      // Log disagreement for learning
      this._logDisagreement(session);
    }

    return result;
  }

  _evaluateMajority(votes) {
    const counts = {};
    for (const v of votes) {
      counts[v.decision] = (counts[v.decision] || 0) + 1;
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const [topDecision, topCount] = sorted[0];
    const consensus = topCount > votes.length / 2;

    return {
      consensus,
      decision: consensus ? topDecision : null,
      votes: counts,
      reason: consensus
        ? `Majority agreed on ${topDecision} (${topCount}/${votes.length})`
        : `No majority: ${sorted.map(([d, c]) => `${d}(${c})`).join(' vs ')}`
    };
  }

  _evaluateUnanimous(votes) {
    const decisions = new Set(votes.map(v => v.decision));
    const consensus = decisions.size === 1;

    return {
      consensus,
      decision: consensus ? votes[0].decision : null,
      reason: consensus
        ? `Unanimous agreement on ${votes[0].decision}`
        : `Disagreement: ${Array.from(decisions).join(' vs ')}`
    };
  }

  _evaluateWeighted(votes) {
    const weightedCounts = {};
    for (const v of votes) {
      weightedCounts[v.decision] = (weightedCounts[v.decision] || 0) + v.confidence;
    }

    const totalWeight = Object.values(weightedCounts).reduce((a, b) => a + b, 0);
    const sorted = Object.entries(weightedCounts).sort((a, b) => b[1] - a[1]);
    const [topDecision, topWeight] = sorted[0];
    const consensus = topWeight / totalWeight > 0.6; // 60% weighted threshold

    return {
      consensus,
      decision: consensus ? topDecision : null,
      weightedVotes: weightedCounts,
      reason: consensus
        ? `Weighted consensus on ${topDecision} (${(topWeight / totalWeight * 100).toFixed(0)}%)`
        : `No weighted consensus: ${sorted.map(([d, w]) => `${d}(${(w / totalWeight * 100).toFixed(0)}%)`).join(' vs ')}`
    };
  }

  _logDisagreement(session) {
    const agentIds = session.votes.map(v => v.agentId);
    for (const agentId of agentIds) {
      this.memoryStore.saveLongTerm(agentId, 'correction', {
        type: 'disagreement',
        sessionId: session.sessionId,
        myVote: session.votes.find(v => v.agentId === agentId),
        allVotes: session.votes,
        result: session.result,
        learnedAt: new Date().toISOString()
      }, 0.7);
    }
  }

  getStats() {
    return {
      ...this.stats,
      activeSessions: Array.from(this.sessions.values()).filter(s => s.status === 'open').length
    };
  }
}

// Singleton
let instance = null;

export function getConsensusEngine() {
  if (!instance) {
    instance = new ConsensusEngine();
  }
  return instance;
}

export default { ConsensusEngine, getConsensusEngine };
```

**Step 2: Create `backend/agents/core/agent-coordinator.js`**

```javascript
/**
 * Agent Coordinator - Parallel dispatch, result aggregation, consensus
 */

import { v4 as uuidv4 } from 'uuid';
import { getConsensusEngine } from './consensus-engine.js';

class AgentCoordinator {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.consensusEngine = getConsensusEngine();
    this.stats = {
      parallelDispatches: 0,
      delegations: 0,
      consensusSessions: 0
    };
  }

  /**
   * Dispatch a task to multiple agents in parallel
   */
  async dispatchParallel(agentIds, task, options = {}) {
    this.stats.parallelDispatches++;
    const timeout = options.timeout || 30000;

    const promises = agentIds.map(id => {
      const agent = this.orchestrator.getAgent(id);
      if (!agent) return Promise.resolve({ agentId: id, status: 'not_found', result: null });

      const taskPromise = agent.reason(task).then(result => ({
        agentId: id,
        status: 'completed',
        result
      }));

      const timeoutPromise = new Promise(resolve => {
        setTimeout(() => resolve({ agentId: id, status: 'timeout', result: null }), timeout);
      });

      return Promise.race([taskPromise, timeoutPromise]);
    });

    const results = await Promise.allSettled(promises);

    return results.map(r => r.status === 'fulfilled' ? r.value : { agentId: 'unknown', status: 'error', error: r.reason?.message });
  }

  /**
   * Delegate a subtask from one agent to another
   */
  async delegate(fromAgentId, toAgentId, subtask, options = {}) {
    this.stats.delegations++;
    const timeout = options.timeout || 30000;

    const agent = this.orchestrator.getAgent(toAgentId);
    if (!agent) throw new Error(`Agent ${toAgentId} not found`);

    const taskPromise = agent.reason(subtask, { delegatedFrom: fromAgentId });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Delegation timeout')), timeout);
    });

    try {
      return await Promise.race([taskPromise, timeoutPromise]);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Run consensus-based decision across multiple agents
   */
  async runConsensus(agentIds, task, strategy = 'majority') {
    this.stats.consensusSessions++;
    const sessionId = `CONS-${uuidv4().slice(0, 8)}`;

    this.consensusEngine.createSession(sessionId, {
      strategy,
      requiredVoters: agentIds
    });

    // Dispatch to all agents in parallel
    const results = await this.dispatchParallel(agentIds, task);

    // Collect votes
    for (const result of results) {
      if (result.status === 'completed' && result.result?.result) {
        const decision = result.result.result.recommendation?.action ||
                        result.result.result.decision?.action ||
                        result.result.result.decision ||
                        'UNKNOWN';
        const confidence = result.result.result.confidence ||
                          result.result.result.recommendation?.confidence ||
                          0.5;

        this.consensusEngine.vote(sessionId, result.agentId, decision, confidence,
          result.result.result.summary || '');
      }
    }

    // Evaluate
    const consensus = this.consensusEngine.evaluate(sessionId);

    return {
      sessionId,
      consensus,
      agentResults: results,
      timestamp: new Date().toISOString()
    };
  }

  getStats() {
    return {
      ...this.stats,
      consensus: this.consensusEngine.getStats()
    };
  }
}

// Singleton (initialized with orchestrator reference)
let instance = null;

export function getAgentCoordinator(orchestrator) {
  if (!instance && orchestrator) {
    instance = new AgentCoordinator(orchestrator);
  }
  return instance;
}

export default { AgentCoordinator, getAgentCoordinator };
```

**Step 3: Enhance `agent-messenger.js`**

Add these new message types to the `MESSAGE_TYPES` constant:
```javascript
CONSENSUS_REQUEST: 'consensus_request',
CONSENSUS_VOTE: 'consensus_vote',
CONFLICT_ESCALATION: 'conflict_escalation',
RESULT_REPORT: 'result_report'
```

**Step 4: Add delegation to BaseAgent**

Add to `backend/agents/core/base-agent.js` after the `shareInformation()` method:

```javascript
/**
 * Delegate a subtask to another agent
 */
async delegate(targetAgentId, subtask) {
  this.emitEvent('agent:action:start', {
    agentId: this.agentId,
    action: 'delegate',
    target: targetAgentId
  });

  try {
    const result = await this.messenger.delegateTask({
      from: this.agentId,
      to: targetAgentId,
      task: subtask.task || 'delegated_task',
      input: subtask,
      context: { delegatedFrom: this.agentId }
    });

    this.emitEvent('agent:action:complete', {
      agentId: this.agentId,
      action: 'delegate',
      success: true
    });

    return result;
  } catch (error) {
    this.emitEvent('agent:action:complete', {
      agentId: this.agentId,
      action: 'delegate',
      success: false,
      error: error.message
    });
    return null;
  }
}
```

**Step 5: Initialize coordinator in agents/index.js**

Modify `backend/agents/index.js` — after orchestrator registration, add:

```javascript
import { getAgentCoordinator } from './core/agent-coordinator.js';

// Initialize coordinator with orchestrator reference
const coordinator = getAgentCoordinator(orchestrator);
```

And add `coordinator` to the exports.

**Step 6: Verify and Commit**

Restart server. Test:
```bash
curl -s http://localhost:3005/api/agents/status | jq '.data.agents | length'
```

Expected: 4 agents, no errors.

```bash
git add backend/agents/core/agent-coordinator.js backend/agents/core/consensus-engine.js backend/agents/core/agent-messenger.js backend/agents/core/base-agent.js backend/agents/index.js
git commit -m "feat: add Multi-Agent Coordination with consensus engine and parallel dispatch"
```

---

## Task 6: Observability Layer — Metrics, Tracing, Decision Logging, API, and Frontend

**Files:**
- Create: `backend/agents/core/metrics-collector.js`
- Create: `backend/agents/core/trace-collector.js`
- Create: `backend/agents/core/decision-logger.js`
- Create: `backend/services/observability/index.js`
- Create: `backend/shared/common/migrations/007-observability.js`
- Create: `src/pages/Observability.jsx`
- Modify: `backend/shared/common/migrations/index.js` (add 007)
- Modify: `backend/shared/common/database.js` (add observability tables)
- Modify: `backend/gateway/server.js` (mount observability router, add to banner)
- Modify: `backend/agents/core/base-agent.js` (instrument with metrics and tracing)
- Modify: `src/App.jsx` (add Observability route)
- Modify: `src/components/Layout.jsx` (add Observability nav item)

**This is the largest task. Sub-steps:**

**Step 1: Create migration `007-observability.js`**

Creates tables: `agent_metrics`, `agent_traces`, `agent_decisions`. Same pattern as other migrations (PK TEXT, data TEXT NOT NULL, created_at, updated_at).

**Step 2: Register migration and update database.js**

Add tables to `memoryStore`, `getIdField()`, and `getStats()`.

**Step 3: Create `metrics-collector.js`**

Singleton that tracks per-agent metrics: execution count, duration histogram, success/failure counts, tool usage. Methods: `recordExecution(agentId, duration, success)`, `recordToolUse(agentId, tool, duration)`, `getMetrics(agentId, timeRange)`, `getAllMetrics()`. Periodically flushes to SQLite.

**Step 4: Create `trace-collector.js`**

Span-based tracing. Methods: `startTrace(traceId, agentId, input)`, `startSpan(traceId, spanName, data)`, `endSpan(traceId, spanName, result)`, `endTrace(traceId, result)`, `getTrace(traceId)`, `getRecentTraces(limit)`. Each span has: name, startTime, endTime, duration, data.

**Step 5: Create `decision-logger.js`**

Logs every agent decision. Methods: `logDecision(agentId, decision, context, reasoning)`, `getDecisions(filters)`, `getDecisionsByAgent(agentId, limit)`. Stored in `agent_decisions` table.

**Step 6: Create observability API router**

`backend/services/observability/index.js` — Express router with endpoints:
- `GET /metrics` — All agent metrics
- `GET /traces` — Recent traces (query param: limit, agentId)
- `GET /traces/:traceId` — Single trace with spans
- `GET /decisions` — Decision audit log (query params: agentId, limit)
- `GET /health` — Agent health summary (all agents, statuses, error rates)

**Step 7: Instrument BaseAgent**

In `backend/agents/core/base-agent.js`:
- Import metrics-collector and trace-collector
- In `reason()`: start trace at beginning, end at completion. Record execution metric.
- In `act()`: start/end span for each tool use. Record tool usage metric.
- In `observe()`: log decision via decision-logger.

**Step 8: Mount observability router in gateway**

In `backend/gateway/server.js`:
- Import: `import observabilityRouter from '../services/observability/index.js';`
- Mount: `app.use('/api/observability', observabilityRouter);`
- Add to health check services and API docs
- Add to startup banner

**Step 9: Create Observability frontend page**

Create `src/pages/Observability.jsx` — a React page with 4 tabs:
1. **Agent Health** — Cards per agent showing status, success rate, avg latency, last active
2. **Metrics** — Recharts line chart for execution trends over time
3. **Traces** — Table of recent traces, click to expand spans
4. **Decisions** — Filterable table of decisions with expandable reasoning

Uses `fetch('http://localhost:3005/api/observability/...')` for data.

**Step 10: Add route and nav item**

In `src/App.jsx`: Add `import Observability from './pages/Observability'` and `<Route path="/observability" element={<Observability />} />`.

In `src/components/Layout.jsx`: Add `Eye` to lucide-react imports. Add nav item: `{ name: 'Observability', href: '/observability', icon: Eye, color: 'text-cyan-400' }` before the "Services" item.

**Step 11: Verify**

Restart server and frontend. Navigate to `/observability` in browser. Trigger some agent actions:
```bash
curl -s -X POST http://localhost:3005/api/agents/investigate -H 'Content-Type: application/json' -d '{"transactionId":"TXN-OBS-001"}'
curl -s http://localhost:3005/api/observability/health | jq .
curl -s http://localhost:3005/api/observability/metrics | jq .
curl -s http://localhost:3005/api/observability/traces | jq .
```

Expected: Observability page renders. APIs return data. Traces show agent execution spans.

**Step 12: Commit**

```bash
git add backend/agents/core/metrics-collector.js backend/agents/core/trace-collector.js backend/agents/core/decision-logger.js backend/services/observability/index.js backend/shared/common/migrations/007-observability.js backend/shared/common/migrations/index.js backend/shared/common/database.js backend/gateway/server.js backend/agents/core/base-agent.js src/pages/Observability.jsx src/App.jsx src/components/Layout.jsx
git commit -m "feat: add Observability Layer with metrics, tracing, decision logging, and dashboard"
```

---

## Task 7: Autonomous Onboarding — Tool Executor, Self-Correction, Enhanced Agent

**Files:**
- Create: `backend/agents/core/tool-executor.js`
- Create: `backend/agents/core/self-correction.js`
- Modify: `backend/agents/specialized/seller-onboarding-agent.js` (upgrade to autonomous with tools, confidence thresholds, self-correction)

**Context:** This is the capstone task. The onboarding agent already has tools registered. We upgrade it to use the knowledge base, memory, context engine, and add self-correction. Supervised autonomy: auto-decide for low/medium risk, escalate for high/critical.

**Step 1: Create `backend/agents/core/tool-executor.js`**

Generic tool execution framework that any agent can use. Wraps tool calls with tracing, metrics, error handling.

```javascript
/**
 * Tool Executor - Generic tool execution framework with tracing
 */

import { getMetricsCollector } from './metrics-collector.js';
import { getTraceCollector } from './trace-collector.js';

class ToolExecutor {
  constructor(agentId) {
    this.agentId = agentId;
    this.metrics = getMetricsCollector();
    this.tracer = getTraceCollector();
  }

  /**
   * Execute a tool with tracing and metrics
   */
  async execute(toolName, handler, params, traceId = null) {
    const startTime = Date.now();

    if (traceId) {
      this.tracer.startSpan(traceId, `tool:${toolName}`, { params });
    }

    try {
      const result = await handler(params);
      const duration = Date.now() - startTime;

      this.metrics.recordToolUse(this.agentId, toolName, duration, true);

      if (traceId) {
        this.tracer.endSpan(traceId, `tool:${toolName}`, { success: true, duration });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.recordToolUse(this.agentId, toolName, duration, false);

      if (traceId) {
        this.tracer.endSpan(traceId, `tool:${toolName}`, { success: false, error: error.message });
      }

      throw error;
    }
  }
}

export function createToolExecutor(agentId) {
  return new ToolExecutor(agentId);
}

export default { ToolExecutor, createToolExecutor };
```

**Step 2: Create `backend/agents/core/self-correction.js`**

```javascript
/**
 * Self-Correction - Outcome tracking and reasoning adjustment
 *
 * After decisions, tracks predictions vs actual outcomes.
 * When accuracy drops, analyzes errors and updates reasoning.
 */

import { db_ops } from '../../shared/common/database.js';
import { getMemoryStore } from './memory-store.js';

class SelfCorrection {
  constructor(agentId) {
    this.agentId = agentId;
    this.memoryStore = getMemoryStore();
    this.predictions = []; // In-memory prediction log
    this.accuracyThreshold = 0.7; // Below this triggers correction
  }

  /**
   * Log a prediction for later verification
   */
  logPrediction(decisionId, sellerId, prediction, confidence, reasoning) {
    const entry = {
      decisionId,
      agentId: this.agentId,
      sellerId,
      prediction, // APPROVE, REJECT, ESCALATE
      confidence,
      reasoning,
      actualOutcome: null,
      verified: false,
      createdAt: new Date().toISOString()
    };

    this.predictions.push(entry);

    // Also persist to long-term memory
    this.memoryStore.saveLongTerm(this.agentId, 'pattern', {
      type: 'prediction',
      ...entry
    }, confidence);

    return entry;
  }

  /**
   * Record actual outcome and check accuracy
   */
  recordOutcome(sellerId, actualOutcome) {
    // Find matching predictions
    const matching = this.predictions.filter(p => p.sellerId === sellerId && !p.verified);

    for (const pred of matching) {
      pred.actualOutcome = actualOutcome;
      pred.verified = true;
      pred.wasCorrect = this._checkCorrectness(pred.prediction, actualOutcome);
      pred.verifiedAt = new Date().toISOString();
    }

    // Check if accuracy has dropped
    const recentPredictions = this.predictions.filter(p => p.verified).slice(-50);
    if (recentPredictions.length >= 10) {
      const accuracy = recentPredictions.filter(p => p.wasCorrect).length / recentPredictions.length;
      if (accuracy < this.accuracyThreshold) {
        this._runCorrectionCycle(recentPredictions);
      }
    }
  }

  /**
   * Get accuracy stats
   */
  getAccuracy() {
    const verified = this.predictions.filter(p => p.verified);
    if (verified.length === 0) return { accuracy: 1, total: 0, correct: 0 };

    const correct = verified.filter(p => p.wasCorrect).length;
    return {
      accuracy: correct / verified.length,
      total: verified.length,
      correct,
      incorrect: verified.length - correct,
      recentAccuracy: this._getRecentAccuracy(20)
    };
  }

  _checkCorrectness(prediction, actualOutcome) {
    // Map outcomes to expected decisions
    const correctMapping = {
      'fraud': 'REJECT',
      'chargeback': 'REJECT',
      'legitimate': 'APPROVE',
      'successful': 'APPROVE',
      'suspicious': 'ESCALATE'
    };

    const expectedDecision = correctMapping[actualOutcome] || null;
    if (!expectedDecision) return prediction !== 'APPROVE'; // Conservative: if unknown, rejecting is safer

    return prediction === expectedDecision;
  }

  _getRecentAccuracy(n) {
    const recent = this.predictions.filter(p => p.verified).slice(-n);
    if (recent.length === 0) return 1;
    return recent.filter(p => p.wasCorrect).length / recent.length;
  }

  _runCorrectionCycle(recentPredictions) {
    const incorrect = recentPredictions.filter(p => !p.wasCorrect);

    // Analyze patterns in errors
    const errorPatterns = {};
    for (const pred of incorrect) {
      const key = `${pred.prediction}->${pred.actualOutcome}`;
      errorPatterns[key] = (errorPatterns[key] || 0) + 1;
    }

    // Save correction to long-term memory
    this.memoryStore.saveLongTerm(this.agentId, 'correction', {
      type: 'accuracy_correction',
      errorPatterns,
      incorrectCount: incorrect.length,
      totalReviewed: recentPredictions.length,
      accuracy: recentPredictions.filter(p => p.wasCorrect).length / recentPredictions.length,
      correctedAt: new Date().toISOString(),
      lesson: `Common errors: ${Object.entries(errorPatterns).map(([k, v]) => `${k} (${v}x)`).join(', ')}`
    }, 0.9);
  }
}

export function createSelfCorrection(agentId) {
  return new SelfCorrection(agentId);
}

export default { SelfCorrection, createSelfCorrection };
```

**Step 3: Upgrade `seller-onboarding-agent.js`**

Modify `backend/agents/specialized/seller-onboarding-agent.js`:

1. Add imports at top:
   ```javascript
   import { getKnowledgeBase } from '../core/knowledge-base.js';
   import { getContextEngine } from '../core/context-engine.js';
   import { createSelfCorrection } from '../core/self-correction.js';
   import { createToolExecutor } from '../core/tool-executor.js';
   ```

2. In constructor, after `this.registerTools();`, add:
   ```javascript
   this.knowledgeBase = getKnowledgeBase();
   this.contextEngine = getContextEngine();
   this.selfCorrection = createSelfCorrection(this.agentId);
   this.toolExecutor = createToolExecutor(this.agentId);

   // Autonomy thresholds
   this.autonomyThresholds = {
     AUTO_APPROVE_MAX_RISK: 30,   // Auto-approve if risk <= 30
     AUTO_REJECT_MIN_RISK: 80,    // Auto-reject if risk >= 80
     ESCALATE_MIN_RISK: 60        // Escalate to human if risk >= 60
   };
   ```

3. Add new tool: `searchVectorDB` after existing tools:
   ```javascript
   this.registerTool('search_knowledge_base', 'Search knowledge base for similar past cases', async (params) => {
     const { query, namespace, sellerId } = params;
     const results = this.knowledgeBase.searchKnowledge(
       namespace || null,
       query,
       sellerId ? { sellerId } : {},
       5
     );
     return { success: true, data: { results, count: results.length } };
   });
   ```

4. Add new tool: `queryRiskProfile`:
   ```javascript
   this.registerTool('query_risk_profile', 'Get current risk profile for seller', async (params) => {
     const { sellerId } = params;
     const record = db_ops.getById('seller_risk_profiles', 'seller_id', sellerId);
     return {
       success: true,
       data: record ? record.data : { exists: false, sellerId }
     };
   });
   ```

5. Add new tool: `retrieveMemory`:
   ```javascript
   this.registerTool('retrieve_memory', 'Retrieve relevant patterns from long-term memory', async (params) => {
     const { context } = params;
     const memories = this.memoryStore.queryLongTerm(this.agentId, context, 5);
     return { success: true, data: { memories, count: memories.length } };
   });
   ```

6. Modify the `observe()` method to add autonomous decision-making and self-correction:

   After `const decision = this.generateOnboardingDecision(overallRisk, riskFactors);`, add:
   ```javascript
   // Autonomous decision-making based on risk score
   const isAutonomous = overallRisk.score < this.autonomyThresholds.ESCALATE_MIN_RISK;
   const needsHumanReview = !isAutonomous || decision.action === 'REVIEW';

   // Log prediction for self-correction
   if (context.input?.sellerId) {
     this.selfCorrection.logPrediction(
       `ONB-${Date.now().toString(36).toUpperCase()}`,
       context.input.sellerId,
       decision.action,
       decision.confidence,
       this.generateOnboardingReasoning(riskFactors, decision)
     );
   }

   // Add to knowledge base for future RAG
   this.knowledgeBase.addKnowledge('onboarding', [{
     _id: `ONB-${Date.now()}`,
     text: `Onboarding evaluation for seller ${context.input?.sellerId}. Decision: ${decision.action}. Risk score: ${overallRisk.score}. Factors: ${riskFactors.map(f => f.factor).join(', ')}`,
     category: 'onboarding',
     sellerId: context.input?.sellerId,
     domain: 'onboarding',
     outcome: decision.action === 'APPROVE' ? 'legitimate' : decision.action === 'REJECT' ? 'fraud' : 'pending',
     riskScore: overallRisk.score,
     source: this.agentId
   }]);
   ```

   Then update the return statement to use `isAutonomous` and `needsHumanReview`:
   ```javascript
   return {
     success: true,
     onboardingId: `ONB-${Date.now().toString(36).toUpperCase()}`,
     summary: `Onboarding evaluation complete. ${riskFactors.length} risk factors identified. ${isAutonomous ? 'Autonomous decision.' : 'Requires human review.'}`,
     evidence,
     riskFactors,
     overallRisk,
     decision,
     confidence: decision.confidence,
     isAutonomous,
     needsHumanReview,
     escalationReason: needsHumanReview ? `Risk score ${overallRisk.score} requires human review` : null,
     selfCorrectionStats: this.selfCorrection.getAccuracy(),
     reasoning: this.generateOnboardingReasoning(riskFactors, decision)
   };
   ```

7. In the `plan()` method, add knowledge base and memory tools to the plan actions:

   After the existing basic checks, add:
   ```javascript
   // Search knowledge base for similar cases
   actions.push({
     type: 'search_knowledge_base',
     params: {
       query: `onboarding ${context.input?.sellerData?.businessCategory} ${context.input?.sellerData?.country}`,
       namespace: 'onboarding',
       sellerId: context.input?.sellerId
     }
   });

   // Retrieve relevant memory
   actions.push({
     type: 'retrieve_memory',
     params: { context: `onboarding evaluation ${context.input?.sellerData?.businessCategory}` }
   });

   // Check existing risk profile
   if (context.input?.sellerId) {
     actions.push({
       type: 'query_risk_profile',
       params: { sellerId: context.input.sellerId }
     });
   }
   ```

**Step 4: Verify**

Restart server and test autonomous onboarding:
```bash
curl -s -X POST http://localhost:3005/api/agents/onboarding/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"sellerData":{"businessName":"Test Corp","email":"test@example.com","country":"US","businessCategory":"ELECTRONICS"}}' \
  | jq '{decision: .data.decision, isAutonomous: .data.evaluation.isAutonomous, selfCorrection: .data.evaluation.selfCorrectionStats}'
```

Expected: Returns decision with `isAutonomous: true/false` and `selfCorrectionStats`. No errors.

**Step 5: Commit**

```bash
git add backend/agents/core/tool-executor.js backend/agents/core/self-correction.js backend/agents/specialized/seller-onboarding-agent.js
git commit -m "feat: add Autonomous Onboarding with tool executor, self-correction, and RAG integration"
```

---

## Task 8: Integration Wiring — Seed Knowledge Base and End-to-End Verification

**Files:**
- Modify: `backend/gateway/server.js` (seed knowledge base with historical data during startup)
- Modify: `backend/services/agents/index.js` (add observability and coordination endpoints)

**Context:** This task wires everything together. Seeds the knowledge base with existing data on startup, adds API endpoints for the new coordination and observability features, and does end-to-end verification.

**Step 1: Seed knowledge base during startup**

In `backend/gateway/server.js`, in the `seedDatabase()` function, after the risk profile seeding block, add:

```javascript
// Seed knowledge base with historical data
const { getKnowledgeBase } = await import('../agents/core/knowledge-base.js');
const kb = getKnowledgeBase();

// Seed transaction knowledge
const allTx = db_ops.getAll('transactions', 100, 0).map(t => t.data);
kb.addKnowledge('transactions', allTx.slice(0, 50).map(tx => ({
  _id: tx.transactionId,
  text: `Transaction ${tx.transactionId}: amount $${tx.amount}, merchant ${tx.merchant || 'Unknown'}, risk score ${tx.riskScore || 0}. Decision: ${tx.decision || 'APPROVED'}`,
  category: 'transaction',
  sellerId: tx.sellerId,
  domain: 'transaction',
  outcome: tx.decision === 'BLOCKED' ? 'fraud' : 'legitimate',
  riskScore: tx.riskScore || 0,
  source: 'seed-data'
})));

// Seed onboarding knowledge
const allOnboarding = db_ops.getAll('sellers', 100, 0).map(s => s.data);
kb.addKnowledge('onboarding', allOnboarding.slice(0, 50).map(s => ({
  _id: s.sellerId,
  text: `Seller ${s.businessName}: category ${s.businessCategory || 'Unknown'}, country ${s.country || 'US'}, status ${s.status || 'ACTIVE'}, risk ${s.riskTier || 'LOW'}`,
  category: 'onboarding',
  sellerId: s.sellerId,
  domain: 'onboarding',
  outcome: s.status === 'BLOCKED' ? 'fraud' : 'legitimate',
  riskScore: s.riskScore || 0,
  source: 'seed-data'
})));

console.log(`  Knowledge Base: ${kb.getStats().totalEntries} entries`);
```

**Step 2: Add coordination endpoints to agents API**

In `backend/services/agents/index.js`, add these endpoints after existing ones:

```javascript
import { getAgentCoordinator } from '../../agents/core/agent-coordinator.js';

// Consensus-based investigation
router.post('/consensus/investigate', async (req, res) => {
  try {
    const { transactionId, strategy = 'majority' } = req.body;
    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'transactionId is required' });
    }

    const coordinator = getAgentCoordinator();
    const agentIds = Array.from(orchestrator.agents.keys());
    const result = await coordinator.runConsensus(agentIds, { transactionId, type: 'fraud_investigation' }, strategy);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get coordination stats
router.get('/coordination/stats', (req, res) => {
  const coordinator = getAgentCoordinator();
  res.json({ success: true, data: coordinator ? coordinator.getStats() : {} });
});
```

**Step 3: End-to-end verification**

Kill existing server processes and restart everything:

```bash
lsof -ti:3005 | xargs kill 2>/dev/null
cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && node backend/gateway/server.js
```

Verify all layers:

```bash
# 1. Knowledge Layer — search knowledge base
curl -s http://localhost:3005/api/observability/health | jq .

# 2. Memory Layer — check memory stats
curl -s http://localhost:3005/api/agents/status | jq '.data.agents[0].memorySize'

# 3. Observability — trigger agent action, then check traces
curl -s -X POST http://localhost:3005/api/agents/investigate -H 'Content-Type: application/json' -d '{"transactionId":"TXN-E2E-001"}'
curl -s http://localhost:3005/api/observability/traces | jq '. | length'
curl -s http://localhost:3005/api/observability/metrics | jq .

# 4. Autonomous Onboarding — test supervised autonomy
curl -s -X POST http://localhost:3005/api/agents/onboarding/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"sellerData":{"businessName":"Safe Corp","email":"safe@example.com","country":"US","businessCategory":"CLOTHING"}}' \
  | jq '{decision: .data.decision, isAutonomous: .data.evaluation.isAutonomous}'

# 5. Consensus — multi-agent decision
curl -s -X POST http://localhost:3005/api/agents/consensus/investigate \
  -H 'Content-Type: application/json' \
  -d '{"transactionId":"TXN-CONSENSUS-001","strategy":"majority"}' | jq '.data.consensus'

# 6. Observability page — check frontend
# Open http://localhost:5173/observability in browser
```

Expected: All endpoints return data. Observability page renders. No crashes.

**Step 4: Commit**

```bash
git add backend/gateway/server.js backend/services/agents/index.js
git commit -m "feat: wire all layers together with knowledge seeding and coordination endpoints"
```

---

## Summary

| Task | Layer | New Files | Modified Files | Key Deliverable |
|------|-------|-----------|---------------|-----------------|
| 1 | Knowledge | knowledge-base.js, 004 migration | database.js, migrations/index.js, risk-profile/index.js | SQLite-backed knowledge store with TF-IDF search |
| 2 | Memory | memory-store.js, 005 migration | database.js, migrations/index.js, base-agent.js | Persistent short/long-term memory with consolidation |
| 3 | Context | context-engine.js, prompt-builder.js | base-agent.js | Token-budgeted context assembly from all sources |
| 4 | Orchestration | circuit-breaker.js, agent-router.js, 006 migration | database.js, migrations/index.js, agent-orchestrator.js | Retry, circuit breaker, conditional branching, checkpoints |
| 5 | Multi-Agent | agent-coordinator.js, consensus-engine.js | agent-messenger.js, base-agent.js, agents/index.js | Parallel dispatch, consensus voting, delegation |
| 6 | Observability | metrics-collector.js, trace-collector.js, decision-logger.js, observability/index.js, 007 migration, Observability.jsx | database.js, migrations/index.js, base-agent.js, server.js, App.jsx, Layout.jsx | Full instrumentation + dashboard page |
| 7 | Autonomous | tool-executor.js, self-correction.js | seller-onboarding-agent.js | Supervised autonomy with RAG, memory, self-correction |
| 8 | Integration | — | server.js, agents/index.js | Knowledge seeding, coordination endpoints, E2E verification |
