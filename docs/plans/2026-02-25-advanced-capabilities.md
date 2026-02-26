# Advanced Capabilities Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 13 enhancements across RAG, Context, Knowledge Graph, and Reliability to close all major gaps identified in the architecture audit.

**Architecture:** All modules follow the existing singleton pattern (`getXxx()` factory), LLM-first with hardcoded fallback, ES modules, and fire-and-forget evaluation. New tools integrate into the base-agent's TPAOR loop at their respective phases. Frontend additions follow the existing Tailwind dark-theme pattern.

**Tech Stack:** Node.js (ES modules), Express 4, Claude Sonnet 4 via `@anthropic-ai/sdk`, Pinecone + multilingual-e5-large, Python FastAPI, React 19 + Vite 7 + Tailwind CSS 4, SQLite (better-sqlite3).

**Design Doc:** `docs/plans/2026-02-25-advanced-capabilities-design.md`

---

## Phase 1: Foundation Layer (no dependencies)

### Task 1: Chunking Pipeline

**Files:**
- Create: `backend/agents/core/chunker.js`
- Test: `backend/agents/core/__tests__/chunker.test.js`

**Step 1: Write the failing test**

Create `backend/agents/core/__tests__/chunker.test.js`:

```javascript
import { getChunker } from '../chunker.js';

const chunker = getChunker();
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: Short text returns single chunk
const short = chunker.chunk('Hello world.', { parentId: 'P1' });
assert(short.length === 1, 'short text -> 1 chunk');
assert(short[0].parentId === 'P1', 'chunk carries parentId');
assert(short[0].chunkIndex === 0, 'chunkIndex starts at 0');
assert(short[0].totalChunks === 1, 'totalChunks = 1');

// Test 2: Long text splits into multiple chunks
const longText = Array.from({ length: 50 }, (_, i) => `This is sentence number ${i}. `).join('');
const chunks = chunker.chunk(longText, { parentId: 'P2', category: 'test' });
assert(chunks.length > 1, 'long text -> multiple chunks');
assert(chunks.every(c => c.parentId === 'P2'), 'all chunks carry parentId');
assert(chunks.every(c => c.category === 'test'), 'all chunks carry metadata');
assert(chunks.every((c, i) => c.chunkIndex === i), 'sequential chunkIndex');
assert(chunks.every(c => c.totalChunks === chunks.length), 'all have correct totalChunks');

// Test 3: Overlap — last 2 sentences of chunk N appear at start of chunk N+1
if (chunks.length >= 2) {
  const lastSentences = chunks[0].text.split(/(?<=[.!?])\s+/).slice(-2).join(' ');
  assert(chunks[1].text.startsWith(lastSentences.slice(0, 20)) || chunks[1].text.includes(lastSentences.slice(0, 20)),
    'overlap between consecutive chunks');
}

// Test 4: Each chunk under max length (512 tokens ~ 2048 chars)
assert(chunks.every(c => c.text.length <= 2048), 'all chunks under max size');

// Test 5: needsChunking utility
assert(chunker.needsChunking('Short text.') === false, 'short text does not need chunking');
assert(chunker.needsChunking(longText) === true, 'long text needs chunking');

console.log(`\nChunker tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/core/__tests__/chunker.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `backend/agents/core/chunker.js`:

```javascript
/**
 * Chunking Pipeline — Adaptive text chunking for knowledge base entries.
 *
 * Splits long text at sentence boundaries with configurable target/max sizes
 * and 2-sentence overlap for context continuity. Each chunk carries parent
 * metadata for reassembly.
 */

const TARGET_CHARS = 1024;   // ~256 tokens
const MAX_CHARS = 2048;      // ~512 tokens
const OVERLAP_SENTENCES = 2;

const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

class Chunker {
  chunk(text, metadata = {}) {
    if (!text || typeof text !== 'string') return [];

    const { parentId = null, ...extraMeta } = metadata;

    if (text.length <= TARGET_CHARS) {
      return [{
        text,
        parentId,
        chunkIndex: 0,
        totalChunks: 1,
        ...extraMeta
      }];
    }

    const sentences = text.split(SENTENCE_BOUNDARY).filter(s => s.trim());
    const chunks = [];
    let start = 0;

    while (start < sentences.length) {
      let end = start;
      let charCount = 0;

      // Accumulate sentences up to TARGET_CHARS, never exceeding MAX_CHARS
      while (end < sentences.length) {
        const nextLen = sentences[end].length + 1;
        if (charCount + nextLen > MAX_CHARS && end > start) break;
        charCount += nextLen;
        end++;
        if (charCount >= TARGET_CHARS) break;
      }

      const chunkText = sentences.slice(start, end).join(' ');
      chunks.push({ text: chunkText });

      // Move start, but back up by OVERLAP_SENTENCES for context continuity
      start = Math.max(start + 1, end - OVERLAP_SENTENCES);
    }

    // Tag all chunks
    const totalChunks = chunks.length;
    return chunks.map((c, i) => ({
      ...c,
      parentId,
      chunkIndex: i,
      totalChunks,
      ...extraMeta
    }));
  }

  needsChunking(text) {
    return typeof text === 'string' && text.length > TARGET_CHARS;
  }
}

let instance = null;
export function getChunker() {
  if (!instance) instance = new Chunker();
  return instance;
}
```

**Step 4: Run test to verify it passes**

Run: `node backend/agents/core/__tests__/chunker.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/agents/core/chunker.js backend/agents/core/__tests__/chunker.test.js
git commit -m "feat: add adaptive chunking pipeline for knowledge base entries"
```

---

### Task 2: Self-Query (Metadata Filter Generation)

**Files:**
- Create: `backend/agents/core/self-query.js`
- Test: `backend/agents/core/__tests__/self-query.test.js`

**Step 1: Write the failing test**

Create `backend/agents/core/__tests__/self-query.test.js`:

```javascript
import { getSelfQueryEngine } from '../self-query.js';

const sqe = getSelfQueryEngine();
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: generateFilters returns an object (even in fallback mode)
const result = await sqe.generateFilters('high-risk electronics sellers from US');
assert(typeof result === 'object', 'generateFilters returns object');
assert(result !== null, 'result is not null');

// Test 2: result has filters and cleanedQuery
assert('filters' in result, 'result has filters key');
assert('cleanedQuery' in result, 'result has cleanedQuery key');

// Test 3: Fallback returns empty filters and original query
// (LLM likely not enabled in test env)
assert(typeof result.filters === 'object', 'filters is object');
assert(typeof result.cleanedQuery === 'string', 'cleanedQuery is string');
assert(result.cleanedQuery.length > 0, 'cleanedQuery not empty');

// Test 4: applyToSearch returns enhanced params
const searchParams = sqe.applyToSearch('fraud cases in electronics', 'fraud-cases', 5);
assert(typeof searchParams === 'object', 'applyToSearch returns object');
assert(searchParams.query.length > 0, 'search params has query');
assert(searchParams.namespace === 'fraud-cases', 'search params has namespace');
assert(searchParams.top_k === 5, 'search params has top_k');

console.log(`\nSelf-Query tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/core/__tests__/self-query.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `backend/agents/core/self-query.js`:

```javascript
/**
 * Self-Query — LLM-powered metadata filter generation from natural language.
 *
 * Before vector search, Claude generates structured metadata filters
 * from user queries. Falls back to unfiltered search on failure.
 */

import { getLLMClient } from './llm-client.js';

const FILTER_SCHEMA_PROMPT = `You generate Pinecone metadata filters from natural language queries about fraud detection.

Available metadata fields:
- category: string (ELECTRONICS, FASHION, FOOD, SERVICES, DIGITAL_GOODS, etc.)
- country: string (US, UK, CA, DE, FR, JP, etc.)
- riskScore: number (0-100)
- outcome: string (fraud, legitimate, chargeback, review)
- domain: string (onboarding, transaction, payout, ato, listing)
- sellerId: string

You MUST return valid JSON:
{
  "filters": { ... Pinecone filter object, or {} if no filters apply },
  "cleanedQuery": "the query with filter terms removed for better semantic search"
}

Examples:
- "high-risk electronics sellers from US" → { "filters": { "category": "ELECTRONICS", "country": "US", "riskScore": { "$gt": 60 } }, "cleanedQuery": "high-risk sellers" }
- "recent chargebacks" → { "filters": { "outcome": "chargeback" }, "cleanedQuery": "recent chargebacks" }
- "what are common fraud patterns" → { "filters": {}, "cleanedQuery": "common fraud patterns" }

Return ONLY the JSON object.`;

class SelfQueryEngine {
  constructor() {
    this.llmClient = getLLMClient();
  }

  async generateFilters(query) {
    if (!this.llmClient?.enabled || !query) {
      return { filters: {}, cleanedQuery: query || '' };
    }

    try {
      const response = await this.llmClient.complete(
        FILTER_SCHEMA_PROMPT,
        `Generate metadata filters for this query: "${query}"`,
        { temperature: 0.1, maxTokens: 512 }
      );

      if (response?.content) {
        const match = response.content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          return {
            filters: parsed.filters || {},
            cleanedQuery: parsed.cleanedQuery || query
          };
        }
      }
    } catch (e) {
      // Fall back to unfiltered search
    }

    return { filters: {}, cleanedQuery: query };
  }

  applyToSearch(query, namespace, topK = 5) {
    // Synchronous version — returns params for immediate use.
    // Caller should use generateFilters() async for LLM-powered filtering.
    return {
      query,
      namespace,
      top_k: topK,
      filters: null,
      rerank: false
    };
  }
}

let instance = null;
export function getSelfQueryEngine() {
  if (!instance) instance = new SelfQueryEngine();
  return instance;
}
```

**Step 4: Run test to verify it passes**

Run: `node backend/agents/core/__tests__/self-query.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/agents/core/self-query.js backend/agents/core/__tests__/self-query.test.js
git commit -m "feat: add self-query engine for LLM-powered metadata filter generation"
```

---

### Task 3: Confidence Calibration

**Files:**
- Create: `backend/agents/core/confidence-calibrator.js`
- Test: `backend/agents/core/__tests__/confidence-calibrator.test.js`

**Step 1: Write the failing test**

Create `backend/agents/core/__tests__/confidence-calibrator.test.js`:

```javascript
import { getConfidenceCalibrator } from '../confidence-calibrator.js';

const calibrator = getConfidenceCalibrator();
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: getCalibratedConfidence returns a number between 0-1
const cal = calibrator.getCalibratedConfidence(0.85);
assert(typeof cal === 'number', 'returns number');
assert(cal >= 0 && cal <= 1, 'result in range 0-1');

// Test 2: With no history, returns raw confidence unchanged
assert(cal === 0.85, 'no history -> raw confidence returned');

// Test 3: Record predictions and outcomes
calibrator.recordPrediction('DEC-1', 0.9, true);
calibrator.recordPrediction('DEC-2', 0.9, true);
calibrator.recordPrediction('DEC-3', 0.9, false);
calibrator.recordPrediction('DEC-4', 0.15, false);
calibrator.recordPrediction('DEC-5', 0.15, true);

// Test 4: getCalibrationStats returns bucket data
const stats = calibrator.getCalibrationStats();
assert(typeof stats === 'object', 'stats is object');
assert(Array.isArray(stats.buckets), 'stats has buckets array');
assert(stats.buckets.length === 5, 'five confidence buckets');
assert(typeof stats.calibrationError === 'number', 'has calibrationError');

// Test 5: Bucket 4 (0.8-1.0) should have 3 predictions
const highBucket = stats.buckets.find(b => b.range === '0.8-1.0');
assert(highBucket && highBucket.count === 3, 'high bucket has 3 predictions');
assert(highBucket && highBucket.correct === 2, 'high bucket has 2 correct');

// Test 6: After enough data, calibrated confidence adjusts
const adjusted = calibrator.getCalibratedConfidence(0.9);
assert(typeof adjusted === 'number', 'adjusted is number');

console.log(`\nConfidence Calibrator tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/core/__tests__/confidence-calibrator.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `backend/agents/core/confidence-calibrator.js`:

```javascript
/**
 * Confidence Calibrator — Aligns predicted confidence with actual accuracy.
 *
 * Buckets predictions into 5 confidence ranges, tracks actual accuracy per
 * bucket, and adjusts raw LLM confidence using historical mapping.
 * Persists data to SQLite agent_calibration table.
 */

import { db_ops } from '../../shared/common/database.js';

const BUCKETS = [
  { min: 0.0, max: 0.2, range: '0.0-0.2' },
  { min: 0.2, max: 0.4, range: '0.2-0.4' },
  { min: 0.4, max: 0.6, range: '0.4-0.6' },
  { min: 0.6, max: 0.8, range: '0.6-0.8' },
  { min: 0.8, max: 1.0, range: '0.8-1.0' },
];

const MIN_SAMPLES_FOR_CALIBRATION = 5;

class ConfidenceCalibrator {
  constructor() {
    this.predictions = [];
    this._loadFromDb();
  }

  _loadFromDb() {
    try {
      const rows = db_ops.getAll('agent_calibration', 10000, 0);
      this.predictions = rows.map(r => r.data || r).filter(r => r.confidence !== undefined);
    } catch (e) {
      // Table may not exist yet — start empty
      this.predictions = [];
    }
  }

  recordPrediction(decisionId, confidence, wasCorrect) {
    const entry = {
      decisionId,
      confidence,
      wasCorrect,
      bucket: this._getBucketIndex(confidence),
      createdAt: new Date().toISOString()
    };

    this.predictions.push(entry);

    try {
      db_ops.insert('agent_calibration', 'decision_id', decisionId, entry);
    } catch (e) {
      // DB not available — in-memory only
    }
  }

  getCalibratedConfidence(rawConfidence) {
    const bucketIdx = this._getBucketIndex(rawConfidence);
    const bucketPreds = this.predictions.filter(p => p.bucket === bucketIdx);

    if (bucketPreds.length < MIN_SAMPLES_FOR_CALIBRATION) {
      return rawConfidence;
    }

    // Actual accuracy for this bucket
    const actualAccuracy = bucketPreds.filter(p => p.wasCorrect).length / bucketPreds.length;
    return Math.round(actualAccuracy * 1000) / 1000;
  }

  getCalibrationStats() {
    const buckets = BUCKETS.map((b, idx) => {
      const preds = this.predictions.filter(p => p.bucket === idx);
      const correct = preds.filter(p => p.wasCorrect).length;
      const midpoint = (b.min + b.max) / 2;
      const actualAccuracy = preds.length > 0 ? correct / preds.length : null;

      return {
        range: b.range,
        count: preds.length,
        correct,
        actualAccuracy,
        expectedMidpoint: midpoint,
        calibrationGap: actualAccuracy !== null ? Math.abs(midpoint - actualAccuracy) : null
      };
    });

    const bucketsWithData = buckets.filter(b => b.calibrationGap !== null);
    const calibrationError = bucketsWithData.length > 0
      ? bucketsWithData.reduce((sum, b) => sum + b.calibrationGap, 0) / bucketsWithData.length
      : 0;

    return {
      buckets,
      calibrationError,
      totalPredictions: this.predictions.length
    };
  }

  _getBucketIndex(confidence) {
    const clamped = Math.max(0, Math.min(1, confidence));
    const idx = Math.floor(clamped * 5);
    return Math.min(idx, 4);
  }
}

let instance = null;
export function getConfidenceCalibrator() {
  if (!instance) instance = new ConfidenceCalibrator();
  return instance;
}
```

**Step 4: Run test to verify it passes**

Run: `node backend/agents/core/__tests__/confidence-calibrator.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/agents/core/confidence-calibrator.js backend/agents/core/__tests__/confidence-calibrator.test.js
git commit -m "feat: add confidence calibration with bucket-based accuracy tracking"
```

---

### Task 4: LLM Retry on Parse Failure

**Files:**
- Modify: `backend/agents/core/llm-client.js` (add `completeWithJsonRetry` method)
- Modify: `backend/agents/core/prompt-templates.js` (update `parseLLMJson` to track failures)
- Test: `backend/agents/core/__tests__/llm-json-retry.test.js`

**Step 1: Write the failing test**

Create `backend/agents/core/__tests__/llm-json-retry.test.js`:

```javascript
import { getLLMClient } from '../llm-client.js';

const llm = getLLMClient();
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: completeWithJsonRetry method exists
assert(typeof llm.completeWithJsonRetry === 'function', 'completeWithJsonRetry exists');

// Test 2: Returns fallback when LLM not enabled
const result = await llm.completeWithJsonRetry('system', 'user', { type: 'object' }, { default: true });
assert(result !== null, 'returns a result');
assert(result.default === true, 'returns fallback when LLM disabled');

// Test 3: repairStats tracking
assert(typeof llm.repairStats === 'object', 'repairStats exists');
assert(typeof llm.repairStats.attempts === 'number', 'tracks repair attempts');
assert(typeof llm.repairStats.successes === 'number', 'tracks repair successes');

console.log(`\nLLM JSON Retry tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/core/__tests__/llm-json-retry.test.js`
Expected: FAIL — completeWithJsonRetry not found

**Step 3: Add `completeWithJsonRetry` to llm-client.js**

Add to the `LLMClient` class (after the `complete` method, before `parseReasoning`):

```javascript
  /**
   * Call Claude expecting JSON. On parse failure, retry with a repair prompt.
   * Max 1 repair retry (2 total LLM calls).
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {Object} schema - Expected JSON schema (for repair prompt)
   * @param {Object} fallback - Fallback value if both attempts fail
   * @returns {Object} Parsed JSON or fallback
   */
  async completeWithJsonRetry(systemPrompt, userPrompt, schema, fallback = null) {
    if (!this.enabled) return fallback;

    // First attempt
    const response = await this.complete(systemPrompt, userPrompt);
    if (response?.content) {
      const parsed = this._tryParseJson(response.content);
      if (parsed !== null) return parsed;
    }

    // Repair attempt
    this.repairStats.attempts++;
    const repairPrompt = `The previous response was not valid JSON. Here is the raw output:

---
${response?.content || '(empty response)'}
---

Please return ONLY a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Return ONLY the JSON. No explanation, no markdown.`;

    const repairResponse = await this.complete(systemPrompt, repairPrompt);
    if (repairResponse?.content) {
      const parsed = this._tryParseJson(repairResponse.content);
      if (parsed !== null) {
        this.repairStats.successes++;
        return parsed;
      }
    }

    return fallback;
  }

  _tryParseJson(text) {
    if (!text) return null;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (e) {
      // Parse failed
    }
    return null;
  }
```

Also add to the constructor:

```javascript
    this.repairStats = { attempts: 0, successes: 0 };
```

**Step 4: Run test to verify it passes**

Run: `node backend/agents/core/__tests__/llm-json-retry.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/agents/core/llm-client.js backend/agents/core/__tests__/llm-json-retry.test.js
git commit -m "feat: add LLM JSON retry with repair prompt on parse failure"
```

---

## Phase 2: RAG & Retrieval Enhancements (depend on Phase 1)

### Task 5: Parent Document Retrieval

**Files:**
- Modify: `backend/agents/core/knowledge-base.js` (add `addDocumentWithChunks`, `getParentDocument`)
- Modify: `backend/evaluation/services/pinecone_service.py` (add `upsert_document` method)
- Test: `backend/agents/core/__tests__/parent-document.test.js`

**Step 1: Write the failing test**

Create `backend/agents/core/__tests__/parent-document.test.js`:

```javascript
import { getKnowledgeBase } from '../knowledge-base.js';
import { getChunker } from '../chunker.js';

const kb = getKnowledgeBase();
const chunker = getChunker();
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: addDocumentWithChunks exists
assert(typeof kb.addDocumentWithChunks === 'function', 'addDocumentWithChunks exists');

// Test 2: Store a document and get chunks back
const longText = Array.from({ length: 50 }, (_, i) => `Sentence ${i} about fraud detection patterns. `).join('');
const result = kb.addDocumentWithChunks('onboarding', {
  text: longText,
  category: 'fraud-pattern',
  domain: 'onboarding'
});
assert(result.documentId, 'returns documentId');
assert(result.chunkIds.length > 1, 'returns multiple chunkIds');

// Test 3: getParentDocument retrieves full document
const parent = kb.getParentDocument(result.documentId);
assert(parent !== null, 'parent document found');
assert(parent.text === longText, 'full text preserved');
assert(parent.category === 'fraud-pattern', 'metadata preserved');

// Test 4: Short documents stored without chunking
const shortResult = kb.addDocumentWithChunks('onboarding', {
  text: 'Short document.',
  category: 'test'
});
assert(shortResult.documentId, 'short doc has documentId');
assert(shortResult.chunkIds.length === 1, 'short doc -> 1 chunk');

console.log(`\nParent Document tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/core/__tests__/parent-document.test.js`
Expected: FAIL — addDocumentWithChunks not found

**Step 3: Implement in knowledge-base.js**

Add to the `KnowledgeBase` class:

```javascript
  /**
   * Store a full document and its chunks. Full document stored with documentId.
   * Chunks reference parentDocumentId for retrieval expansion.
   * @param {string} namespace
   * @param {Object} record - { text, category, domain, sellerId, ... }
   * @returns {{ documentId: string, chunkIds: string[] }}
   */
  addDocumentWithChunks(namespace, record) {
    const { getChunker } = require('./chunker.js') || {};
    let chunker;
    try {
      // Dynamic import workaround — use the factory function
      chunker = getChunker();
    } catch (e) {
      // Chunker not available — store as single entry
      const ids = this.addKnowledge(namespace, [record]);
      return { documentId: ids[0], chunkIds: ids };
    }

    const documentId = `DOC-${uuidv4()}`;

    // Store full document
    db_ops.insert('knowledge_documents', 'document_id', documentId, {
      documentId,
      namespace,
      text: record.text,
      category: record.category || null,
      domain: record.domain || null,
      sellerId: record.sellerId || null,
      source: record.source || null,
      createdAt: new Date().toISOString()
    });

    // Chunk and store
    const chunks = chunker.chunk(record.text, {
      parentId: documentId,
      category: record.category,
      domain: record.domain,
      sellerId: record.sellerId,
      source: record.source
    });

    const chunkIds = this.addKnowledge(namespace, chunks.map(c => ({
      text: c.text,
      category: c.category,
      domain: c.domain,
      sellerId: c.sellerId,
      source: c.source,
      parentDocumentId: documentId,
      chunkIndex: c.chunkIndex,
      totalChunks: c.totalChunks
    })));

    return { documentId, chunkIds };
  }

  /**
   * Retrieve full parent document by documentId.
   * @param {string} documentId
   * @returns {Object|null}
   */
  getParentDocument(documentId) {
    try {
      const result = db_ops.getById('knowledge_documents', 'document_id', documentId);
      return result?.data || result || null;
    } catch (e) {
      return null;
    }
  }
```

Note: The import of `getChunker` should use the async import pattern consistent with the codebase. Update the import at the top of knowledge-base.js:

```javascript
import { getChunker } from './chunker.js';
```

And simplify `addDocumentWithChunks` to directly call `getChunker()`.

**Step 4: Run test to verify it passes**

Run: `node backend/agents/core/__tests__/parent-document.test.js`
Expected: All tests PASS

**Step 5: Add Pinecone parent document support**

Add to `pinecone_service.py`:

```python
    def upsert_document(self, namespace: str, document_id: str, full_text: str, chunks: list[dict]) -> int:
        """Upsert a parent document and its chunks.
        Chunks reference parent_document_id for retrieval expansion."""
        records = []
        for chunk in chunks:
            records.append({
                "_id": chunk.get("_id", f"{document_id}-chunk-{chunk.get('chunkIndex', 0)}"),
                "text": chunk["text"],
                "parent_document_id": document_id,
                "chunk_index": chunk.get("chunkIndex", 0),
                "total_chunks": chunk.get("totalChunks", 1),
                **{k: v for k, v in chunk.items() if k not in ("_id", "text", "chunkIndex", "totalChunks")}
            })
        return self.upsert(namespace, records)
```

**Step 6: Commit**

```bash
git add backend/agents/core/knowledge-base.js backend/agents/core/__tests__/parent-document.test.js backend/evaluation/services/pinecone_service.py
git commit -m "feat: add parent document retrieval with chunk-to-document expansion"
```

---

### Task 6: Citation Grounding

**Files:**
- Create: `backend/agents/core/citation-tracker.js`
- Modify: `backend/agents/core/prompt-templates.js` (add citation instructions to observe prompt)
- Test: `backend/agents/core/__tests__/citation-tracker.test.js`

**Step 1: Write the failing test**

Create `backend/agents/core/__tests__/citation-tracker.test.js`:

```javascript
import { getCitationTracker } from '../citation-tracker.js';

const tracker = getCitationTracker();
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: Parse citations from LLM output
const text = 'The seller has high risk [source:identity_verification:0] and the email is suspicious [source:email_verification:1]. Overall verdict is REJECT.';
const citations = tracker.parseCitations(text);
assert(Array.isArray(citations), 'returns array');
assert(citations.length === 2, 'found 2 citations');
assert(citations[0].toolName === 'identity_verification', 'first citation tool');
assert(citations[0].index === 0, 'first citation index');
assert(citations[1].toolName === 'email_verification', 'second citation tool');

// Test 2: Enrich citations with evidence
const evidence = [
  { action: { type: 'identity_verification' }, result: { data: { verified: false, reason: 'mismatch' } } },
  { action: { type: 'email_verification' }, result: { data: { disposable: true } } }
];
const enriched = tracker.enrichCitations(citations, evidence);
assert(enriched[0].evidenceSnippet !== undefined, 'first citation enriched');
assert(enriched[1].evidenceSnippet !== undefined, 'second citation enriched');

// Test 3: Strip citations from display text
const clean = tracker.stripCitations(text);
assert(!clean.includes('[source:'), 'citations stripped');
assert(clean.includes('high risk'), 'content preserved');

// Test 4: No citations returns empty array
const noCites = tracker.parseCitations('No citations here.');
assert(noCites.length === 0, 'no citations -> empty array');

console.log(`\nCitation Tracker tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/core/__tests__/citation-tracker.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `backend/agents/core/citation-tracker.js`:

```javascript
/**
 * Citation Tracker — Parses and enriches source citations from LLM output.
 *
 * LLM output uses [source:tool_name:index] markers to cite evidence.
 * This module extracts, enriches with evidence snippets, and strips for display.
 */

const CITATION_REGEX = /\[source:([a-z_]+):(\d+)\]/gi;

class CitationTracker {
  parseCitations(text) {
    if (!text) return [];

    const citations = [];
    let match;
    const regex = new RegExp(CITATION_REGEX.source, CITATION_REGEX.flags);

    while ((match = regex.exec(text)) !== null) {
      // Find surrounding claim text (up to 100 chars before the citation marker)
      const beforeMarker = text.slice(Math.max(0, match.index - 100), match.index).trim();
      const claimSentence = beforeMarker.split(/[.!?]/).pop()?.trim() || beforeMarker;

      citations.push({
        claim: claimSentence,
        toolName: match[1],
        index: parseInt(match[2], 10),
        confidence: null,
        evidenceSnippet: null
      });
    }

    return citations;
  }

  enrichCitations(citations, evidence) {
    return citations.map(cite => {
      const matchingEvidence = evidence.find(e =>
        e.action?.type === cite.toolName
      );

      if (matchingEvidence?.result?.data) {
        return {
          ...cite,
          evidenceSnippet: JSON.stringify(matchingEvidence.result.data).slice(0, 200),
          confidence: matchingEvidence.result?.success !== false ? 0.9 : 0.3
        };
      }

      return { ...cite, evidenceSnippet: 'Evidence not found', confidence: 0.1 };
    });
  }

  stripCitations(text) {
    if (!text) return '';
    return text.replace(new RegExp(CITATION_REGEX.source, CITATION_REGEX.flags), '').replace(/\s{2,}/g, ' ').trim();
  }
}

let instance = null;
export function getCitationTracker() {
  if (!instance) instance = new CitationTracker();
  return instance;
}
```

**Step 4: Run test to verify it passes**

Run: `node backend/agents/core/__tests__/citation-tracker.test.js`
Expected: All tests PASS

**Step 5: Modify observe prompt for citation instructions**

In `prompt-templates.js`, update `buildObservePrompt` system prompt to add citation instructions after the JSON schema:

Add before `Return ONLY the JSON object.`:

```
IMPORTANT: In your "reasoning" field, cite specific evidence using [source:tool_name:index] markers.
Example: "The identity check failed [source:identity_verification:0] and the email is disposable [source:email_verification:1]."
This helps trace each claim to its evidence source.
```

And add `"citations"` to the observe JSON schema:

```
  "citations": ["array of source references used in reasoning, format: tool_name:index"]
```

**Step 6: Commit**

```bash
git add backend/agents/core/citation-tracker.js backend/agents/core/__tests__/citation-tracker.test.js backend/agents/core/prompt-templates.js
git commit -m "feat: add citation grounding with source tracking in LLM observations"
```

---

### Task 7: Retrieval Evaluation

**Files:**
- Create: `backend/agents/core/retrieval-evaluator.js`
- Create: `backend/evaluation/routers/retrieval_eval.py`
- Modify: `backend/evaluation/main.py` (register new router)
- Modify: `backend/evaluation/models/schemas.py` (add schemas)
- Test: `backend/agents/core/__tests__/retrieval-evaluator.test.js`

**Step 1: Write the failing test**

Create `backend/agents/core/__tests__/retrieval-evaluator.test.js`:

```javascript
import { getRetrievalEvaluator } from '../retrieval-evaluator.js';

const evaluator = getRetrievalEvaluator();
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: computeHitRate
const hitRate = evaluator.computeHitRate(
  ['doc1', 'doc2', 'doc3'],  // retrieved
  ['doc2', 'doc5']            // relevant
);
assert(hitRate === 0.5, `hitRate = ${hitRate}, expected 0.5`);

// Test 2: computeMRR
const mrr = evaluator.computeMRR(
  ['doc1', 'doc2', 'doc3'],
  ['doc2']
);
assert(mrr === 0.5, `MRR = ${mrr}, expected 0.5`);

// Test 3: computeNDCG
const ndcg = evaluator.computeNDCG(
  ['doc1', 'doc2', 'doc3', 'doc4', 'doc5'],
  ['doc1', 'doc3'],
  5
);
assert(typeof ndcg === 'number' && ndcg > 0 && ndcg <= 1, 'NDCG in valid range');

// Test 4: Perfect retrieval
const perfect = evaluator.computeNDCG(['doc1', 'doc2'], ['doc1', 'doc2'], 5);
assert(perfect === 1.0, 'perfect retrieval -> NDCG = 1.0');

// Test 5: evaluateRetrieval aggregates all metrics
const metrics = evaluator.evaluateRetrieval(
  ['doc1', 'doc2', 'doc3'],
  ['doc2', 'doc3'],
  'test query'
);
assert('hitRate' in metrics, 'has hitRate');
assert('mrr' in metrics, 'has mrr');
assert('ndcg' in metrics, 'has ndcg');
assert(typeof metrics.query === 'string', 'has query');

console.log(`\nRetrieval Evaluator tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/core/__tests__/retrieval-evaluator.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `backend/agents/core/retrieval-evaluator.js`:

```javascript
/**
 * Retrieval Evaluator — Measures retrieval quality separately from generation.
 *
 * Metrics: Hit Rate, Mean Reciprocal Rank (MRR), NDCG@k.
 * Logged per query alongside TruLens/RAGAS scores via eval-tracker.
 */

import { getEvalTracker } from './eval-tracker.js';

class RetrievalEvaluator {
  computeHitRate(retrievedIds, relevantIds) {
    if (!relevantIds || relevantIds.length === 0) return 0;
    const retrievedSet = new Set(retrievedIds);
    const hits = relevantIds.filter(id => retrievedSet.has(id)).length;
    return hits / relevantIds.length;
  }

  computeMRR(retrievedIds, relevantIds) {
    if (!relevantIds || relevantIds.length === 0) return 0;
    const relevantSet = new Set(relevantIds);
    for (let i = 0; i < retrievedIds.length; i++) {
      if (relevantSet.has(retrievedIds[i])) {
        return 1 / (i + 1);
      }
    }
    return 0;
  }

  computeNDCG(retrievedIds, relevantIds, k = 5) {
    if (!relevantIds || relevantIds.length === 0) return 0;
    const relevantSet = new Set(relevantIds);
    const topK = retrievedIds.slice(0, k);

    // DCG
    let dcg = 0;
    for (let i = 0; i < topK.length; i++) {
      const rel = relevantSet.has(topK[i]) ? 1 : 0;
      dcg += rel / Math.log2(i + 2);
    }

    // Ideal DCG — all relevant docs at top
    const idealK = Math.min(relevantIds.length, k);
    let idcg = 0;
    for (let i = 0; i < idealK; i++) {
      idcg += 1 / Math.log2(i + 2);
    }

    return idcg > 0 ? Math.round((dcg / idcg) * 10000) / 10000 : 0;
  }

  evaluateRetrieval(retrievedIds, relevantIds, query) {
    const metrics = {
      query,
      hitRate: this.computeHitRate(retrievedIds, relevantIds),
      mrr: this.computeMRR(retrievedIds, relevantIds),
      ndcg: this.computeNDCG(retrievedIds, relevantIds, 5),
      retrievedCount: retrievedIds.length,
      relevantCount: relevantIds.length,
      timestamp: new Date().toISOString()
    };

    // Log alongside TruLens/RAGAS scores (fire-and-forget)
    try {
      const evalTracker = getEvalTracker();
      evalTracker._persistRetrieval?.(metrics);
    } catch (e) {
      // Eval tracker not available
    }

    return metrics;
  }
}

let instance = null;
export function getRetrievalEvaluator() {
  if (!instance) instance = new RetrievalEvaluator();
  return instance;
}
```

**Step 4: Run test to verify it passes**

Run: `node backend/agents/core/__tests__/retrieval-evaluator.test.js`
Expected: All tests PASS

**Step 5: Add Python retrieval evaluation endpoint**

Create `backend/evaluation/routers/retrieval_eval.py`:

```python
"""Retrieval evaluation router — measures retrieval quality metrics."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/evaluate/retrieval", tags=["evaluation"])


class RetrievalEvalRequest(BaseModel):
    retrieved_ids: list[str]
    relevant_ids: list[str]
    query: str
    k: int = 5


class RetrievalEvalResponse(BaseModel):
    hit_rate: float
    mrr: float
    ndcg_at_k: float
    k: int


@router.post("", response_model=RetrievalEvalResponse)
async def evaluate_retrieval(req: RetrievalEvalRequest):
    """Compute retrieval quality metrics."""
    relevant_set = set(req.relevant_ids)

    # Hit Rate
    hits = sum(1 for rid in req.retrieved_ids if rid in relevant_set)
    hit_rate = hits / len(req.relevant_ids) if req.relevant_ids else 0.0

    # MRR
    mrr = 0.0
    for i, rid in enumerate(req.retrieved_ids):
        if rid in relevant_set:
            mrr = 1.0 / (i + 1)
            break

    # NDCG@k
    import math
    top_k = req.retrieved_ids[: req.k]
    dcg = sum(
        (1.0 if rid in relevant_set else 0.0) / math.log2(i + 2)
        for i, rid in enumerate(top_k)
    )
    ideal_k = min(len(req.relevant_ids), req.k)
    idcg = sum(1.0 / math.log2(i + 2) for i in range(ideal_k))
    ndcg = dcg / idcg if idcg > 0 else 0.0

    return RetrievalEvalResponse(
        hit_rate=round(hit_rate, 4),
        mrr=round(mrr, 4),
        ndcg_at_k=round(ndcg, 4),
        k=req.k,
    )
```

Register in `main.py` — add import and `app.include_router(retrieval_eval_router)`.

**Step 6: Commit**

```bash
git add backend/agents/core/retrieval-evaluator.js backend/agents/core/__tests__/retrieval-evaluator.test.js backend/evaluation/routers/retrieval_eval.py backend/evaluation/main.py
git commit -m "feat: add retrieval evaluation with hit rate, MRR, and NDCG metrics"
```

---

## Phase 3: Context & Graph Enhancements (depend on Phases 1-2)

### Task 8: Global Context Reranking

**Files:**
- Create: `backend/agents/core/context-ranker.js`
- Modify: `backend/agents/core/context-engine.js` (integrate reranking into assembleContext)
- Test: `backend/agents/core/__tests__/context-ranker.test.js`

**Step 1: Write the failing test**

Create `backend/agents/core/__tests__/context-ranker.test.js`:

```javascript
import { getContextRanker } from '../context-ranker.js';

const ranker = getContextRanker();
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: rankItems returns items sorted by relevance
const items = [
  { source: 'ragResults', text: 'seller committed fraud in electronics', tokens: 30 },
  { source: 'shortTermMemory', text: 'previous session notes about shipping', tokens: 20 },
  { source: 'longTermMemory', text: 'electronics fraud patterns are common', tokens: 25 },
  { source: 'domainContext', text: 'seller profile: verified business', tokens: 15 },
];

const ranked = ranker.rankItems(items, 'electronics fraud investigation');
assert(Array.isArray(ranked), 'returns array');
assert(ranked.length === items.length, 'same number of items');
assert(ranked[0].relevanceScore >= ranked[1].relevanceScore, 'sorted by relevance desc');

// Test 2: allocateBudget respects token limit
const allocated = ranker.allocateBudget(ranked, 4000, {
  system: 200,
  task: 300
});
assert(typeof allocated === 'object', 'returns object');
assert(allocated.totalTokens <= 4000, 'under token budget');
assert(allocated.items.length > 0, 'has allocated items');
assert(allocated.items.every(i => i.allocated === true), 'items marked as allocated');

// Test 3: Guarantees minimums
const tinyBudget = ranker.allocateBudget(ranked, 600, {
  system: 200,
  task: 300
});
assert(tinyBudget.guaranteedTokens >= 500, 'minimum guarantees met');

console.log(`\nContext Ranker tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/core/__tests__/context-ranker.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `backend/agents/core/context-ranker.js`:

```javascript
/**
 * Context Ranker — Two-pass global context reranking.
 *
 * Pass 1 (Gather): Score each context item by TF-IDF relevance to query.
 * Pass 2 (Allocate): Rank across all sources, allocate tokens greedily.
 * Guarantee minimums for system (200) and task (300) tokens.
 */

const STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should',
  'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'about', 'as',
  'and', 'but', 'or', 'not', 'if', 'this', 'that', 'it']);

function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function tfidfScore(queryTokens, textTokens) {
  if (queryTokens.length === 0 || textTokens.length === 0) return 0;
  const textSet = new Set(textTokens);
  let matches = 0;
  for (const qt of queryTokens) {
    if (textSet.has(qt)) matches++;
  }
  return matches / queryTokens.length;
}

class ContextRanker {
  rankItems(items, query) {
    const queryTokens = tokenize(query);

    return items.map(item => {
      const textTokens = tokenize(item.text);
      const relevanceScore = tfidfScore(queryTokens, textTokens);
      return { ...item, relevanceScore };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  allocateBudget(rankedItems, totalBudget = 4000, guarantees = {}) {
    const guaranteedTokens = Object.values(guarantees).reduce((s, v) => s + v, 0);
    let remaining = totalBudget - guaranteedTokens;

    const allocated = rankedItems.map(item => {
      if (remaining >= item.tokens) {
        remaining -= item.tokens;
        return { ...item, allocated: true };
      }
      return { ...item, allocated: false };
    });

    return {
      items: allocated.filter(i => i.allocated),
      droppedItems: allocated.filter(i => !i.allocated),
      totalTokens: totalBudget - remaining,
      guaranteedTokens,
      remainingBudget: remaining
    };
  }
}

let instance = null;
export function getContextRanker() {
  if (!instance) instance = new ContextRanker();
  return instance;
}
```

**Step 4: Run test to verify it passes**

Run: `node backend/agents/core/__tests__/context-ranker.test.js`
Expected: All tests PASS

**Step 5: Integrate into context-engine.js**

Add import at top of `context-engine.js`:

```javascript
import { getContextRanker } from './context-ranker.js';
```

After all 6 sources are gathered (before `const prompt = this.promptBuilder.build(sections, ...)`), add:

```javascript
    // Global reranking — score and allocate across all gathered context
    const contextRanker = getContextRanker();
    const contextItems = [];
    for (const [source, text] of Object.entries(sections)) {
      if (source === 'system' || source === 'task') continue;
      contextItems.push({ source, text, tokens: this.promptBuilder.estimateTokens(text) });
    }

    if (contextItems.length > 0) {
      const ranked = contextRanker.rankItems(contextItems, queryText);
      const allocation = contextRanker.allocateBudget(ranked, tokenBudget - (sourceMeta.system?.tokens || 0) - (sourceMeta.task?.tokens || 0), {});
      const allocatedSources = new Set(allocation.items.map(i => i.source));
      for (const source of Object.keys(sections)) {
        if (source !== 'system' && source !== 'task' && !allocatedSources.has(source)) {
          delete sections[source];
        }
      }
      sourceMeta._reranking = {
        totalItems: contextItems.length,
        allocatedItems: allocation.items.length,
        droppedItems: allocation.droppedItems.length
      };
    }
```

**Step 6: Commit**

```bash
git add backend/agents/core/context-ranker.js backend/agents/core/__tests__/context-ranker.test.js backend/agents/core/context-engine.js
git commit -m "feat: add global context reranking with TF-IDF scoring and token allocation"
```

---

### Task 9: Graph Tools for Agent Reasoning

**Files:**
- Create: `backend/agents/tools/graph-tools.js`
- Modify: `backend/agents/specialized/seller-onboarding-agent.js` (register graph tools)
- Test: `backend/agents/tools/__tests__/graph-tools.test.js`

**Step 1: Write the failing test**

Create `backend/agents/tools/__tests__/graph-tools.test.js`:

```javascript
import { createGraphTools } from '../graph-tools.js';

const graphTools = createGraphTools();
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: Returns expected tools
const toolNames = Object.keys(graphTools);
assert(toolNames.includes('graph_find_connections'), 'has graph_find_connections');
assert(toolNames.includes('graph_risk_propagation'), 'has graph_risk_propagation');
assert(toolNames.includes('graph_find_rings'), 'has graph_find_rings');
assert(toolNames.includes('graph_community'), 'has graph_community');

// Test 2: Each tool has name, description, handler
for (const [name, tool] of Object.entries(graphTools)) {
  assert(typeof tool.name === 'string', `${name} has name`);
  assert(typeof tool.description === 'string', `${name} has description`);
  assert(typeof tool.handler === 'function', `${name} has handler`);
}

// Test 3: graph_find_connections runs without error
const connResult = await graphTools.graph_find_connections.handler({ sellerId: 'SELLER-TEST-1' });
assert(typeof connResult === 'object', 'graph_find_connections returns object');
assert('success' in connResult, 'has success field');

// Test 4: graph_risk_propagation runs without error
const riskResult = await graphTools.graph_risk_propagation.handler({ sellerId: 'SELLER-TEST-1' });
assert(typeof riskResult === 'object', 'graph_risk_propagation returns object');

// Test 5: graph_community runs without error
const communityResult = await graphTools.graph_community.handler({ sellerId: 'SELLER-TEST-1' });
assert(typeof communityResult === 'object', 'graph_community returns object');

console.log(`\nGraph Tools tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/tools/__tests__/graph-tools.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `backend/agents/tools/graph-tools.js`:

```javascript
/**
 * Graph Tools — Agent-accessible tools for knowledge graph queries.
 *
 * Integrates with graph-engine and graph-queries to provide:
 * - graph_find_connections: entities sharing attributes with a seller
 * - graph_risk_propagation: propagated risk from fraud-flagged neighbors
 * - graph_find_rings: cycles involving the subject
 * - graph_community: community detection and aggregate risk
 */

import { getGraphEngine } from '../../graph/graph-engine.js';
import { findClusters, computePageRank, findCycles, riskPropagation, communityDetection } from '../../graph/graph-queries.js';

function getNeighbors(sellerId, depth = 2) {
  const engine = getGraphEngine();
  const visited = new Set();
  const neighbors = [];
  const queue = [{ id: sellerId, d: 0 }];

  while (queue.length > 0) {
    const { id, d } = queue.shift();
    if (visited.has(id) || d > depth) continue;
    visited.add(id);

    const edges = engine.getEdges();
    for (const [edgeId, edge] of edges) {
      const neighbor = edge.source === id ? edge.target : edge.target === id ? edge.source : null;
      if (neighbor && !visited.has(neighbor)) {
        const node = engine.getNodes().get(neighbor);
        neighbors.push({
          entity: neighbor,
          hop: d + 1,
          relationship: edge.type,
          weight: edge.properties?.weight || 0,
          properties: node?.properties || {}
        });
        if (d + 1 < depth) queue.push({ id: neighbor, d: d + 1 });
      }
    }
  }

  return neighbors;
}

export function createGraphTools() {
  return {
    graph_find_connections: {
      name: 'graph_find_connections',
      description: 'Find entities connected to a seller through shared attributes (email domain, phone prefix, address, IP, bank)',
      handler: async ({ sellerId, depth = 2 }) => {
        try {
          const neighbors = getNeighbors(sellerId, depth);
          return { success: true, data: { sellerId, connections: neighbors, count: neighbors.length } };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
    },

    graph_risk_propagation: {
      name: 'graph_risk_propagation',
      description: 'Calculate propagated risk score from fraud-flagged neighbors',
      handler: async ({ sellerId, depth = 2 }) => {
        try {
          const result = riskPropagation(sellerId, depth);
          return { success: true, data: result };
        } catch (e) {
          return { success: false, error: e.message, data: { propagatedRisk: 0, paths: [] } };
        }
      }
    },

    graph_find_rings: {
      name: 'graph_find_rings',
      description: 'Detect cycles (fraud rings) involving the subject seller',
      handler: async ({ sellerId, maxLength = 5 }) => {
        try {
          const cycles = findCycles(maxLength);
          const relevant = cycles.filter(c => c.includes(sellerId));
          return { success: true, data: { sellerId, rings: relevant, count: relevant.length } };
        } catch (e) {
          return { success: false, error: e.message, data: { rings: [], count: 0 } };
        }
      }
    },

    graph_community: {
      name: 'graph_community',
      description: 'Identify the community a seller belongs to and compute aggregate risk',
      handler: async ({ sellerId }) => {
        try {
          const communities = communityDetection();
          const sellerCommunity = communities.find(c => c.members?.includes(sellerId));
          if (sellerCommunity) {
            return { success: true, data: { sellerId, community: sellerCommunity } };
          }
          return { success: true, data: { sellerId, community: null, message: 'No community found' } };
        } catch (e) {
          return { success: false, error: e.message, data: { community: null } };
        }
      }
    }
  };
}
```

**Step 4: Run test to verify it passes**

Run: `node backend/agents/tools/__tests__/graph-tools.test.js`
Expected: All tests PASS

**Step 5: Register graph tools in specialized agents**

In `seller-onboarding-agent.js`, add import and register the graph tools in the `registerTools()` method:

```javascript
import { createGraphTools } from '../tools/graph-tools.js';
```

Inside `registerTools()`, add:

```javascript
    // Graph network tools
    const graphTools = createGraphTools();
    for (const [name, tool] of Object.entries(graphTools)) {
      this.registerTool(name, tool.description, tool.handler);
    }
```

Do the same for all specialized agents that should have graph access.

**Step 6: Commit**

```bash
git add backend/agents/tools/graph-tools.js backend/agents/tools/__tests__/graph-tools.test.js backend/agents/specialized/seller-onboarding-agent.js
git commit -m "feat: add graph tools for agent reasoning with network context"
```

---

### Task 10: Multi-Hop Graph Reasoning

**Files:**
- Modify: `backend/agents/tools/graph-tools.js` (add `graph_multi_hop_investigate`)
- Modify: `backend/graph/graph-queries.js` (add `multiHopInvestigate` function)
- Test: `backend/agents/tools/__tests__/graph-multi-hop.test.js`

**Step 1: Write the failing test**

Create `backend/agents/tools/__tests__/graph-multi-hop.test.js`:

```javascript
import { createGraphTools } from '../graph-tools.js';

const graphTools = createGraphTools();
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: graph_multi_hop_investigate tool exists
assert('graph_multi_hop_investigate' in graphTools, 'tool exists');

// Test 2: Handler returns structured evidence chain
const result = await graphTools.graph_multi_hop_investigate.handler({
  sellerId: 'SELLER-TEST-1',
  maxHops: 3,
  minWeight: 0.7
});
assert(typeof result === 'object', 'returns object');
assert('success' in result, 'has success');
assert(Array.isArray(result.data?.evidenceChain || []), 'data has evidenceChain array');

// Test 3: Each evidence entry has expected structure
if (result.data?.evidenceChain?.length > 0) {
  const entry = result.data.evidenceChain[0];
  assert('entity' in entry, 'entry has entity');
  assert('hop' in entry, 'entry has hop');
  assert('relationship' in entry, 'entry has relationship');
  assert('riskSignals' in entry, 'entry has riskSignals');
}

console.log(`\nGraph Multi-Hop tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/tools/__tests__/graph-multi-hop.test.js`
Expected: FAIL — tool not found

**Step 3: Add multiHopInvestigate to graph-queries.js**

Add to `graph-queries.js`:

```javascript
/**
 * Multi-hop investigation — traverse up to maxHops on high-weight edges.
 * Collect risk signals at each hop.
 * @param {string} startId
 * @param {number} maxHops
 * @param {number} minWeight - Minimum edge weight to traverse
 * @returns {{ evidenceChain: Array, totalRiskSignals: number }}
 */
export function multiHopInvestigate(startId, maxHops = 3, minWeight = 0.7) {
  const engine = getGraphEngine();
  const nodes = engine.getNodes();
  const edges = engine.getEdges();

  if (!nodes.has(startId)) {
    return { evidenceChain: [], totalRiskSignals: 0 };
  }

  const visited = new Set();
  const evidenceChain = [];
  const queue = [{ id: startId, hop: 0, path: [] }];

  while (queue.length > 0) {
    const { id, hop, path } = queue.shift();
    if (visited.has(id) || hop > maxHops) continue;
    visited.add(id);

    const node = nodes.get(id);
    const riskSignals = [];

    if (node?.properties?.riskScore > 50) riskSignals.push('high-risk-score');
    if (node?.properties?.fraudHistory) riskSignals.push('fraud-history');
    if (node?.properties?.watchlistMatch) riskSignals.push('watchlist-match');
    if (node?.properties?.status === 'REJECTED') riskSignals.push('rejected-entity');

    if (hop > 0) {
      evidenceChain.push({
        entity: id,
        hop,
        relationship: path[path.length - 1]?.type || 'unknown',
        riskSignals,
        properties: node?.properties || {}
      });
    }

    for (const [edgeId, edge] of edges) {
      const neighbor = edge.source === id ? edge.target : edge.target === id ? edge.source : null;
      const weight = edge.properties?.weight || 0;
      if (neighbor && !visited.has(neighbor) && weight >= minWeight) {
        queue.push({ id: neighbor, hop: hop + 1, path: [...path, edge] });
      }
    }
  }

  return {
    evidenceChain,
    totalRiskSignals: evidenceChain.reduce((sum, e) => sum + e.riskSignals.length, 0)
  };
}
```

**Step 4: Add tool to graph-tools.js**

Add `graph_multi_hop_investigate` to the return object of `createGraphTools()`:

```javascript
    graph_multi_hop_investigate: {
      name: 'graph_multi_hop_investigate',
      description: 'Traverse up to 3 hops on high-weight edges, collecting risk signals at each hop for network-level risk assessment',
      handler: async ({ sellerId, maxHops = 3, minWeight = 0.7 }) => {
        try {
          const result = multiHopInvestigate(sellerId, maxHops, minWeight);
          return { success: true, data: result };
        } catch (e) {
          return { success: false, error: e.message, data: { evidenceChain: [], totalRiskSignals: 0 } };
        }
      }
    }
```

And add the import at the top:

```javascript
import { findClusters, computePageRank, findCycles, riskPropagation, communityDetection, multiHopInvestigate } from '../../graph/graph-queries.js';
```

**Step 5: Run test to verify it passes**

Run: `node backend/agents/tools/__tests__/graph-multi-hop.test.js`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add backend/agents/tools/graph-tools.js backend/graph/graph-queries.js backend/agents/tools/__tests__/graph-multi-hop.test.js
git commit -m "feat: add multi-hop graph reasoning with evidence chain collection"
```

---

## Phase 4: Self-Correction & Reliability (depend on Phase 1)

### Task 11: Multi-Turn Re-Planning

**Files:**
- Modify: `backend/agents/core/base-agent.js` (add re-plan logic after ACT phase)
- Test: `backend/agents/core/__tests__/re-planning.test.js`

**Step 1: Write the failing test**

Create `backend/agents/core/__tests__/re-planning.test.js`:

```javascript
import { BaseAgent } from '../base-agent.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: BaseAgent has buildRePlanPrompt method
const agent = new BaseAgent({ name: 'Test Agent', role: 'TEST', capabilities: [] });
assert(typeof agent.buildRePlanPrompt === 'function', 'buildRePlanPrompt exists');

// Test 2: shouldRePlan returns false when no failures
const noFailures = [
  { action: { type: 'test' }, result: { success: true } },
  { action: { type: 'test2' }, result: { success: true } }
];
assert(agent.shouldRePlan(noFailures) === false, 'no failures -> no replan');

// Test 3: shouldRePlan returns true when >50% failures
const manyFailures = [
  { action: { type: 'test' }, result: { success: false } },
  { action: { type: 'test2' }, result: { success: false } },
  { action: { type: 'test3' }, result: { success: true } }
];
assert(agent.shouldRePlan(manyFailures) === true, '>50% failures -> replan');

// Test 4: shouldRePlan respects max 1 replan cycle
agent._replanCount = 1;
assert(agent.shouldRePlan(manyFailures) === false, 'already replanned -> no second replan');
agent._replanCount = 0;

console.log(`\nRe-Planning tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/core/__tests__/re-planning.test.js`
Expected: FAIL — methods not found

**Step 3: Add re-planning to base-agent.js**

Add to the `BaseAgent` class constructor:

```javascript
    this._replanCount = 0;
```

Add new methods:

```javascript
  shouldRePlan(actionResults) {
    if (this._replanCount >= 1) return false;
    if (!actionResults || actionResults.length === 0) return false;

    const failures = actionResults.filter(a => a.result?.success === false).length;
    return failures / actionResults.length > 0.5;
  }

  buildRePlanPrompt(originalGoal, successes, failures) {
    return {
      system: `You are re-planning after partial failure. Some tools failed. Create a revised plan using only successful tools or alternative approaches.

Return valid JSON: { "goal": "...", "reasoning": "...", "actions": [{ "tool": "...", "params": {}, "rationale": "..." }] }
Return ONLY JSON.`,
      user: `## Original Goal
${originalGoal}

## Successful Actions
${successes.map(s => `- ${s.action?.type}: ${JSON.stringify(s.result?.data).slice(0, 150)}`).join('\n') || 'None'}

## Failed Actions
${failures.map(f => `- ${f.action?.type}: ${f.result?.error || 'failed'}`).join('\n') || 'None'}

Create a revised plan to accomplish the original goal despite the failures.`
    };
  }
```

In the `reason()` method, after the ACT loop (after `thought.actions.push(...)` block, before OBSERVE), add:

```javascript
      // Re-plan if >50% actions failed
      if (this.shouldRePlan(thought.actions)) {
        this._replanCount++;
        const successes = thought.actions.filter(a => a.result?.success !== false);
        const failures = thought.actions.filter(a => a.result?.success === false);
        const rePlanPrompt = this.buildRePlanPrompt(
          plan.goal || 'Complete investigation',
          successes,
          failures
        );

        let revisedPlan = null;
        if (this.llmClient?.enabled) {
          const rePlanResponse = await this.llmClient.completeWithJsonRetry(
            rePlanPrompt.system,
            rePlanPrompt.user,
            { type: 'object' },
            null
          );
          if (rePlanResponse?.actions) revisedPlan = rePlanResponse;
        }

        if (revisedPlan && revisedPlan.actions?.length > 0) {
          this.currentChain.addStep({
            type: 'analysis',
            content: `Re-planned with ${revisedPlan.actions.length} revised actions after ${failures.length} failures`,
            confidence: CONFIDENCE.POSSIBLE
          });

          for (const action of revisedPlan.actions.slice(0, 5)) {
            const actionResult = await this.act(action);
            thought.actions.push({ action, result: actionResult, replanned: true });
          }
        }
      }
```

**Step 4: Run test to verify it passes**

Run: `node backend/agents/core/__tests__/re-planning.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/agents/core/base-agent.js backend/agents/core/__tests__/re-planning.test.js
git commit -m "feat: add multi-turn re-planning on >50% action failure rate"
```

---

### Task 12: Integrate Confidence Calibration + Citations into Base Agent

**Files:**
- Modify: `backend/agents/core/base-agent.js` (wire calibrator + citation tracker into OBSERVE)

**Step 1: Add imports to base-agent.js**

```javascript
import { getConfidenceCalibrator } from './confidence-calibrator.js';
import { getCitationTracker } from './citation-tracker.js';
```

**Step 2: Wire into OBSERVE phase**

After the observe call (`thought.result = await this.observe(...)`) and before REFLECT, add:

```javascript
      // Calibrate confidence
      if (thought.result?.confidence) {
        const calibrator = getConfidenceCalibrator();
        const rawConfidence = thought.result.confidence;
        thought.result.confidence = calibrator.getCalibratedConfidence(rawConfidence);
        thought.result._rawConfidence = rawConfidence;
      }

      // Extract citations from reasoning
      if (thought.result?.reasoning) {
        const citationTracker = getCitationTracker();
        const citations = citationTracker.parseCitations(thought.result.reasoning);
        if (citations.length > 0) {
          thought.result.citations = citationTracker.enrichCitations(citations, thought.actions);
          thought.result.reasoning = citationTracker.stripCitations(thought.result.reasoning);
        }
      }
```

**Step 3: Wire handleOutcomeFeedback to calibrator**

In `handleOutcomeFeedback()`, add after the existing outcome recording:

```javascript
      // Record in confidence calibrator
      const calibrator = getConfidenceCalibrator();
      calibrator.recordPrediction(
        decisionId,
        decision.confidence || 0.5,
        isCorrect
      );
```

**Step 4: Commit**

```bash
git add backend/agents/core/base-agent.js
git commit -m "feat: integrate confidence calibration and citation tracking into base agent"
```

---

## Phase 5: Frontend & APIs (depend on backend)

### Task 13: Human Feedback Backend

**Files:**
- Create: `backend/services/feedback/index.js`
- Modify: `backend/gateway/server.js` (register router)
- Test: `backend/services/feedback/__tests__/feedback-api.test.js`

**Step 1: Write the failing test**

Create `backend/services/feedback/__tests__/feedback-api.test.js`:

```javascript
// Standalone test — validates the feedback service module
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: Module exports a router
const __dirname = dirname(fileURLToPath(import.meta.url));
const mod = await import(join(__dirname, '..', 'index.js'));
assert(typeof mod.default === 'function', 'exports express router');

console.log(`\nFeedback API tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/services/feedback/__tests__/feedback-api.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `backend/services/feedback/index.js`:

```javascript
/**
 * Human Feedback Service — Collects analyst feedback on agent decisions.
 *
 * POST /api/feedback — Submit feedback
 * GET /api/feedback/queue — Decisions pending review (sorted by confidence ASC)
 * GET /api/feedback/stats — Feedback statistics
 */

import express from 'express';
import { db_ops } from '../../shared/common/database.js';
import { getConfidenceCalibrator } from '../../agents/core/confidence-calibrator.js';

const router = express.Router();

const VALID_LABELS = ['correct', 'incorrect'];
const VALID_REASONS = [
  'false_positive', 'false_negative', 'wrong_severity',
  'missing_evidence', 'good_decision', 'other'
];

// POST /api/feedback — Submit feedback on a decision
router.post('/', (req, res) => {
  try {
    const { decisionId, correctLabel, reason, analystId, notes } = req.body;

    if (!decisionId || !correctLabel) {
      return res.status(400).json({ success: false, error: 'decisionId and correctLabel required' });
    }
    if (!VALID_LABELS.includes(correctLabel)) {
      return res.status(400).json({ success: false, error: `correctLabel must be one of: ${VALID_LABELS.join(', ')}` });
    }

    const feedbackId = `FB-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      feedbackId,
      decisionId,
      correctLabel,
      reason: reason || null,
      analystId: analystId || 'anonymous',
      notes: notes || null,
      createdAt: new Date().toISOString()
    };

    db_ops.insert('agent_feedback', 'feedback_id', feedbackId, entry);

    // Feed into confidence calibrator
    try {
      const calibrator = getConfidenceCalibrator();
      calibrator.recordPrediction(decisionId, 0.5, correctLabel === 'correct');
    } catch (e) {
      // Calibrator not available
    }

    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/feedback/queue — Decisions awaiting review
router.get('/queue', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const agentId = req.query.agentId || null;

    // Get recent decisions from decision logger
    const decisions = db_ops.getAll('agent_decisions', 200, 0);

    // Get existing feedback
    const feedbackEntries = db_ops.getAll('agent_feedback', 10000, 0);
    const reviewedIds = new Set(feedbackEntries.map(f => (f.data || f).decisionId));

    // Filter to unreviewed decisions
    let queue = decisions
      .map(d => d.data || d)
      .filter(d => !reviewedIds.has(d.decisionId))
      .filter(d => !agentId || d.agentId === agentId)
      .sort((a, b) => (a.confidence || 1) - (b.confidence || 1))
      .slice(0, limit);

    res.json({ success: true, data: queue, total: queue.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/feedback/stats — Feedback statistics
router.get('/stats', (req, res) => {
  try {
    const feedbackEntries = db_ops.getAll('agent_feedback', 10000, 0);
    const entries = feedbackEntries.map(f => f.data || f);

    const total = entries.length;
    const correct = entries.filter(f => f.correctLabel === 'correct').length;
    const incorrect = entries.filter(f => f.correctLabel === 'incorrect').length;

    const byReason = {};
    for (const f of entries) {
      if (f.reason) byReason[f.reason] = (byReason[f.reason] || 0) + 1;
    }

    const byAnalyst = {};
    for (const f of entries) {
      byAnalyst[f.analystId] = (byAnalyst[f.analystId] || 0) + 1;
    }

    res.json({
      success: true,
      data: {
        total,
        correct,
        incorrect,
        accuracy: total > 0 ? correct / total : null,
        byReason,
        byAnalyst,
        recentCount: entries.filter(f => {
          const age = Date.now() - new Date(f.createdAt).getTime();
          return age < 24 * 60 * 60 * 1000;
        }).length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
```

**Step 4: Register in server.js**

Add import:

```javascript
import feedbackRouter from '../services/feedback/index.js';
```

Add mount (after prompt library mount):

```javascript
app.use('/api/feedback', feedbackRouter);
```

**Step 5: Run test to verify it passes**

Run: `node backend/services/feedback/__tests__/feedback-api.test.js`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add backend/services/feedback/index.js backend/services/feedback/__tests__/feedback-api.test.js backend/gateway/server.js
git commit -m "feat: add human feedback API with queue and statistics endpoints"
```

---

### Task 14: Feedback Review Frontend Page

**Files:**
- Create: `src/pages/FeedbackReview.jsx`
- Modify: `src/App.jsx` (add route)
- Modify: `src/components/Layout.jsx` (add nav item)

**Step 1: Write FeedbackReview.jsx**

Create `src/pages/FeedbackReview.jsx` — dedicated feedback review page:

- **Stats header:** Total reviews, accuracy rate, pending count, 24h reviews
- **Filters:** Agent dropdown, date range, confidence range
- **Queue table:** Decision cards sorted by lowest confidence
- **Each card:** Decision summary, risk score, confidence, evidence, reasoning
- **Actions:** Correct/Incorrect buttons + reason dropdown + free text notes
- **Design:** Follow existing dark theme pattern (`bg-[#0d0d14]`, cards with `bg-gray-900/50 border border-gray-800 rounded-xl`, status badges, etc.)

Key sections:
```jsx
// State
const [queue, setQueue] = useState([]);
const [stats, setStats] = useState(null);
const [filters, setFilters] = useState({ agentId: '', dateRange: '7d', minConfidence: 0, maxConfidence: 1 });
const [feedbackForm, setFeedbackForm] = useState({ decisionId: null, label: null, reason: '', notes: '' });

// Fetch queue and stats on mount
useEffect(() => {
  fetch('/api/feedback/queue').then(r => r.json()).then(d => d.success && setQueue(d.data));
  fetch('/api/feedback/stats').then(r => r.json()).then(d => d.success && setStats(d.data));
}, []);

// Submit feedback handler
const submitFeedback = async () => { ... POST /api/feedback ... };
```

Full implementation should be ~400-500 lines following the same patterns as `CaseQueue.jsx` and `AgenticAI.jsx`.

**Step 2: Add route in App.jsx**

```javascript
import FeedbackReview from './pages/FeedbackReview'
```

```jsx
<Route path="/feedback-review" element={<FeedbackReview />} />
```

**Step 3: Add nav item in Layout.jsx**

In the Risk Operations children array, add:

```javascript
{ name: 'Feedback Review', href: '/feedback-review' }
```

**Step 4: Add inline feedback to AgenticAI.jsx and CaseQueue.jsx**

Add thumbs up/down buttons + reason dropdown on each decision card in both pages. Pattern:

```jsx
// Inline feedback component
const InlineFeedback = ({ decisionId }) => {
  const [submitted, setSubmitted] = useState(false);
  const submitFeedback = async (label) => {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionId, correctLabel: label, analystId: 'analyst' })
    });
    const data = await res.json();
    if (data.success) setSubmitted(true);
  };

  if (submitted) return <span className="text-xs text-green-400">Feedback recorded</span>;
  return (
    <div className="flex gap-2">
      <button onClick={() => submitFeedback('correct')} className="p-1 hover:bg-green-500/20 rounded">
        <ThumbsUp className="w-4 h-4 text-gray-400 hover:text-green-400" />
      </button>
      <button onClick={() => submitFeedback('incorrect')} className="p-1 hover:bg-red-500/20 rounded">
        <ThumbsDown className="w-4 h-4 text-gray-400 hover:text-red-400" />
      </button>
    </div>
  );
};
```

**Step 5: Verify frontend builds**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/pages/FeedbackReview.jsx src/App.jsx src/components/Layout.jsx src/pages/AgenticAI.jsx src/pages/CaseQueue.jsx
git commit -m "feat: add feedback review page and inline feedback on decision cards"
```

---

### Task 15: Adversarial Testing

**Files:**
- Create: `backend/agents/core/adversarial-tester.js`
- Modify: `backend/gateway/server.js` (add adversarial endpoints)
- Test: `backend/agents/core/__tests__/adversarial-tester.test.js`

**Step 1: Write the failing test**

Create `backend/agents/core/__tests__/adversarial-tester.test.js`:

```javascript
import { getAdversarialTester } from '../adversarial-tester.js';

const tester = getAdversarialTester();
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Test 1: generateScenarios returns array
const scenarios = tester.generateScenarios('seller-onboarding', 5);
assert(Array.isArray(scenarios), 'returns array');
assert(scenarios.length === 5, 'generates requested count');

// Test 2: Each scenario has required structure
const s = scenarios[0];
assert(s.scenarioId, 'has scenarioId');
assert(s.type, 'has type');
assert(s.input, 'has input');
assert(s.expectedOutcome, 'has expectedOutcome');

// Test 3: Scenario types cover the categories
const types = new Set(scenarios.map(s => s.type));
assert(types.size > 0, 'has diverse scenario types');

// Test 4: analyzeResults works on mock results
const mockResults = scenarios.map(s => ({
  ...s,
  actualDecision: s.expectedOutcome === 'REJECT' ? 'APPROVE' : 'REJECT',
  confidence: 0.7
}));
const report = tester.analyzeResults(mockResults);
assert(typeof report === 'object', 'analyzeResults returns object');
assert('falseNegatives' in report, 'has falseNegatives');
assert('inconsistencies' in report, 'has inconsistencies');
assert('vulnerabilities' in report, 'has vulnerabilities');

console.log(`\nAdversarial Tester tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/core/__tests__/adversarial-tester.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `backend/agents/core/adversarial-tester.js`:

```javascript
/**
 * Adversarial Tester — Generates challenging test scenarios for agent evaluation.
 *
 * Scenario types:
 * - Synthetic identity: fake-looking sellers with generated data
 * - Contradictory signals: mix of positive and negative indicators
 * - Boundary cases: risk scores near decision thresholds
 * - Evasion patterns: sophisticated fraud attempts
 *
 * Can run batch tests and produce vulnerability reports.
 */

import { v4 as uuidv4 } from 'uuid';

const SCENARIO_TEMPLATES = {
  'synthetic-identity': {
    description: 'Synthetic identity with fabricated credentials',
    generate: () => ({
      sellerId: `ADV-SYN-${uuidv4().slice(0, 8)}`,
      businessName: `${['Global', 'Premier', 'Elite'][Math.floor(Math.random() * 3)]} Trading LLC`,
      email: `seller${Math.random().toString(36).slice(2, 6)}@temp-mail.org`,
      country: 'US',
      ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      registrationAge: Math.floor(Math.random() * 30),
      category: 'ELECTRONICS',
      documents: { idVerified: false, addressVerified: false }
    }),
    expectedOutcome: 'REJECT'
  },

  'contradictory-signals': {
    description: 'Mix of strong positive and strong negative indicators',
    generate: () => ({
      sellerId: `ADV-MIX-${uuidv4().slice(0, 8)}`,
      businessName: 'Established Electronics Corp',
      email: 'verified@legitimate-domain.com',
      country: 'US',
      ipAddress: '8.8.8.8',
      registrationAge: 365,
      category: 'ELECTRONICS',
      riskScore: 55,
      documents: { idVerified: true, addressVerified: true },
      previousChargebacks: 3,
      fraudReports: 1,
      revenueHistory: 500000
    }),
    expectedOutcome: 'REVIEW'
  },

  'boundary-case': {
    description: 'Risk score right at decision threshold',
    generate: () => ({
      sellerId: `ADV-BND-${uuidv4().slice(0, 8)}`,
      businessName: 'Borderline Seller Inc',
      email: 'seller@company.com',
      country: 'CA',
      category: 'FASHION',
      riskScore: 30 + Math.floor(Math.random() * 5), // Right at APPROVE/REVIEW boundary
      documents: { idVerified: true, addressVerified: false },
      registrationAge: 90
    }),
    expectedOutcome: 'REVIEW'
  },

  'evasion-pattern': {
    description: 'Sophisticated fraud attempt mimicking legitimate seller',
    generate: () => ({
      sellerId: `ADV-EVA-${uuidv4().slice(0, 8)}`,
      businessName: 'Quality Goods Marketplace',
      email: 'support@quality-goods-marketplace.com',
      country: 'UK',
      category: 'DIGITAL_GOODS',
      ipAddress: '185.220.101.1',  // Known Tor exit node range
      documents: { idVerified: true, addressVerified: true },
      registrationAge: 180,
      bankAccount: { verified: true, country: 'NG' },  // Bank in different country
      shippingAddress: { country: 'CN' }  // Shipping from yet another country
    }),
    expectedOutcome: 'REJECT'
  }
};

class AdversarialTester {
  generateScenarios(agentType, count = 10) {
    const templateKeys = Object.keys(SCENARIO_TEMPLATES);
    const scenarios = [];

    for (let i = 0; i < count; i++) {
      const key = templateKeys[i % templateKeys.length];
      const template = SCENARIO_TEMPLATES[key];

      scenarios.push({
        scenarioId: `ADVTEST-${Date.now().toString(36)}-${i}`,
        type: key,
        description: template.description,
        agentType,
        input: template.generate(),
        expectedOutcome: template.expectedOutcome,
        createdAt: new Date().toISOString()
      });
    }

    return scenarios;
  }

  async runBatch(agent, scenarios) {
    const results = [];

    for (const scenario of scenarios) {
      try {
        const result = await agent.reason(scenario.input, { adversarialTest: true });
        results.push({
          ...scenario,
          actualDecision: result?.recommendation?.action || result?.decision || 'UNKNOWN',
          confidence: result?.confidence || 0,
          riskScore: result?.riskScore || 0,
          correct: (result?.recommendation?.action || result?.decision) === scenario.expectedOutcome,
          error: null
        });
      } catch (e) {
        results.push({
          ...scenario,
          actualDecision: 'ERROR',
          confidence: 0,
          correct: false,
          error: e.message
        });
      }
    }

    return results;
  }

  analyzeResults(results) {
    const falseNegatives = results.filter(r =>
      r.expectedOutcome === 'REJECT' && r.actualDecision === 'APPROVE'
    );

    const falsePositives = results.filter(r =>
      r.expectedOutcome === 'APPROVE' && r.actualDecision === 'REJECT'
    );

    const inconsistencies = results.filter(r =>
      !r.correct && r.actualDecision !== 'ERROR'
    );

    const errors = results.filter(r => r.actualDecision === 'ERROR');

    const byType = {};
    for (const r of results) {
      if (!byType[r.type]) byType[r.type] = { total: 0, correct: 0, incorrect: 0 };
      byType[r.type].total++;
      if (r.correct) byType[r.type].correct++;
      else byType[r.type].incorrect++;
    }

    const vulnerabilities = [];
    for (const [type, stats] of Object.entries(byType)) {
      if (stats.incorrect > 0) {
        vulnerabilities.push({
          type,
          severity: stats.incorrect / stats.total > 0.5 ? 'high' : 'medium',
          failRate: stats.incorrect / stats.total,
          description: SCENARIO_TEMPLATES[type]?.description || type
        });
      }
    }

    return {
      total: results.length,
      correct: results.filter(r => r.correct).length,
      falseNegatives: falseNegatives.length,
      falsePositives: falsePositives.length,
      inconsistencies: inconsistencies.length,
      errors: errors.length,
      accuracy: results.length > 0 ? results.filter(r => r.correct).length / results.length : 0,
      byType,
      vulnerabilities,
      details: {
        falseNegativeScenarios: falseNegatives.map(r => r.scenarioId),
        falsePositiveScenarios: falsePositives.map(r => r.scenarioId)
      }
    };
  }
}

let instance = null;
export function getAdversarialTester() {
  if (!instance) instance = new AdversarialTester();
  return instance;
}
```

**Step 4: Run test to verify it passes**

Run: `node backend/agents/core/__tests__/adversarial-tester.test.js`
Expected: All tests PASS

**Step 5: Add API endpoints in server.js**

Add import:

```javascript
import { getAdversarialTester } from '../agents/core/adversarial-tester.js';
```

Add endpoints (after existing eval tracking endpoints):

```javascript
// Adversarial Testing
app.post('/api/agents/adversarial/run', async (req, res) => {
  try {
    const { agentType = 'seller-onboarding', count = 10 } = req.body;
    const tester = getAdversarialTester();
    const scenarios = tester.generateScenarios(agentType, count);
    const executionId = `ADVEXEC-${Date.now().toString(36)}`;

    // Run async — return executionId immediately
    res.json({ success: true, data: { executionId, scenarioCount: scenarios.length, status: 'running' } });

    // TODO: Run batch in background and persist results
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/agents/adversarial/:executionId', (req, res) => {
  try {
    // TODO: Retrieve persisted results by executionId
    res.json({ success: true, data: { executionId: req.params.executionId, status: 'not_found' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

**Step 6: Commit**

```bash
git add backend/agents/core/adversarial-tester.js backend/agents/core/__tests__/adversarial-tester.test.js backend/gateway/server.js
git commit -m "feat: add adversarial testing framework with scenario generation and vulnerability reports"
```

---

### Task 16: Adversarial Testing Frontend (Observability Tab)

**Files:**
- Modify: `src/pages/Observability.jsx` (add adversarial testing tab)

**Step 1: Add Adversarial Testing tab**

In `Observability.jsx`, add a new tab alongside existing tabs. The tab should display:

- **Run Tests button:** Triggers `POST /api/agents/adversarial/run`
- **Results table:** Scenario type, expected vs actual outcome, confidence, pass/fail
- **Vulnerability summary:** Cards showing vulnerability types with severity badges
- **Stats header:** Total tests, accuracy, false negatives, false positives

Follow existing tab pattern in Observability.jsx for styling consistency.

**Step 2: Verify frontend builds**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/pages/Observability.jsx
git commit -m "feat: add adversarial testing tab to Observability page"
```

---

## Verification

### Final Integration Test

After all tasks are complete, verify:

1. **Backend starts:** `cd backend && node gateway/server.js` — no import errors
2. **Frontend builds:** `npm run build` — no compilation errors
3. **All unit tests pass:**
   ```bash
   node backend/agents/core/__tests__/chunker.test.js
   node backend/agents/core/__tests__/self-query.test.js
   node backend/agents/core/__tests__/confidence-calibrator.test.js
   node backend/agents/core/__tests__/llm-json-retry.test.js
   node backend/agents/core/__tests__/parent-document.test.js
   node backend/agents/core/__tests__/citation-tracker.test.js
   node backend/agents/core/__tests__/retrieval-evaluator.test.js
   node backend/agents/core/__tests__/context-ranker.test.js
   node backend/agents/tools/__tests__/graph-tools.test.js
   node backend/agents/tools/__tests__/graph-multi-hop.test.js
   node backend/agents/core/__tests__/re-planning.test.js
   node backend/agents/core/__tests__/adversarial-tester.test.js
   node backend/services/feedback/__tests__/feedback-api.test.js
   ```
4. **New routes respond:**
   - `GET /api/feedback/stats` → 200
   - `GET /api/feedback/queue` → 200
   - `POST /api/agents/adversarial/run` → 200
5. **New frontend pages load:**
   - `/feedback-review` loads without errors
   - `/observability` shows adversarial testing tab

---

## Files Summary

**New files (12):**
1. `backend/agents/core/chunker.js`
2. `backend/agents/core/self-query.js`
3. `backend/agents/core/confidence-calibrator.js`
4. `backend/agents/core/citation-tracker.js`
5. `backend/agents/core/retrieval-evaluator.js`
6. `backend/agents/core/context-ranker.js`
7. `backend/agents/core/adversarial-tester.js`
8. `backend/agents/tools/graph-tools.js`
9. `backend/services/feedback/index.js`
10. `backend/evaluation/routers/retrieval_eval.py`
11. `src/pages/FeedbackReview.jsx`
12. 13 test files across `__tests__/` directories

**Modified files (10):**
1. `backend/agents/core/base-agent.js` — re-planning + calibration + citations
2. `backend/agents/core/knowledge-base.js` — parent document methods
3. `backend/agents/core/context-engine.js` — global reranking integration
4. `backend/agents/core/prompt-templates.js` — citation instructions in observe
5. `backend/agents/core/llm-client.js` — completeWithJsonRetry method
6. `backend/graph/graph-queries.js` — multiHopInvestigate function
7. `backend/evaluation/main.py` — register retrieval eval router
8. `backend/gateway/server.js` — feedback + adversarial routes
9. `src/App.jsx` — feedback-review route
10. `src/components/Layout.jsx` — feedback-review nav item
11. `src/pages/AgenticAI.jsx` — inline feedback
12. `src/pages/CaseQueue.jsx` — inline feedback
13. `src/pages/Observability.jsx` — adversarial testing tab
14. `backend/agents/specialized/seller-onboarding-agent.js` — graph tools
