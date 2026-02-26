/**
 * Knowledge Base Module
 * Stores and retrieves knowledge entries from SQLite via db_ops.
 * Provides TF-IDF keyword matching with recency boost for search.
 *
 * This is the FOUNDATION layer of the agentic AI platform.
 * All other layers (memory, context engine, orchestration, etc.) depend on this.
 */

import { v4 as uuidv4 } from 'uuid';
import { db_ops } from '../../shared/common/database.js';
import { getChunker } from './chunker.js';

// ── Valid namespaces ─────────────────────────────────────────────────────────
const VALID_NAMESPACES = new Set([
  'transactions',
  'onboarding',
  'decisions',
  'risk-events',
  'rules'
]);

// ── TF-IDF / Search constants ────────────────────────────────────────────────
const RECENCY_HALF_LIFE_DAYS = 7;
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'can', 'could', 'of', 'in', 'to',
  'for', 'with', 'on', 'at', 'from', 'by', 'about', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'because', 'if', 'when', 'where', 'how',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'it', 'its', 'he', 'she', 'they', 'them', 'we', 'us', 'i', 'me',
  'my', 'your', 'his', 'her', 'our', 'their'
]);

/**
 * Tokenize text into an array of lowercase, non-stop-word tokens.
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Compute Jaccard-like similarity between two token arrays.
 * Uses term-frequency weighting: overlap tokens contribute their min frequency.
 */
function computeSimilarity(queryTokens, entryTokens) {
  if (queryTokens.length === 0 || entryTokens.length === 0) return 0;

  const queryFreq = new Map();
  for (const t of queryTokens) {
    queryFreq.set(t, (queryFreq.get(t) || 0) + 1);
  }

  const entryFreq = new Map();
  for (const t of entryTokens) {
    entryFreq.set(t, (entryFreq.get(t) || 0) + 1);
  }

  // Intersection: sum of min frequencies for overlapping tokens
  let intersection = 0;
  for (const [token, qCount] of queryFreq) {
    const eCount = entryFreq.get(token) || 0;
    intersection += Math.min(qCount, eCount);
  }

  // Union: sum of max frequencies across all tokens
  const allTokens = new Set([...queryFreq.keys(), ...entryFreq.keys()]);
  let union = 0;
  for (const token of allTokens) {
    union += Math.max(queryFreq.get(token) || 0, entryFreq.get(token) || 0);
  }

  return union > 0 ? intersection / union : 0;
}

/**
 * Compute recency boost using exponential decay.
 * Half-life of 7 days: a 7-day-old entry gets 0.5 boost, 14-day-old gets 0.25, etc.
 */
function computeRecencyBoost(timestamp) {
  if (!timestamp) return 0.5;
  const daysSince = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, daysSince / RECENCY_HALF_LIFE_DAYS);
}

// ── Knowledge Base Class ─────────────────────────────────────────────────────

class KnowledgeBase {
  constructor() {
    this.initialized = true;
    console.log('[KnowledgeBase] Initialized');
  }

  /**
   * Add knowledge entries to a namespace.
   * @param {string} namespace - One of: transactions, onboarding, decisions, risk-events, rules
   * @param {Array<Object>} records - Array of record objects
   * @returns {Array<string>} Array of knowledgeId values for inserted records
   */
  addKnowledge(namespace, records) {
    if (!VALID_NAMESPACES.has(namespace)) {
      throw new Error(`Invalid namespace: "${namespace}". Must be one of: ${[...VALID_NAMESPACES].join(', ')}`);
    }

    if (!Array.isArray(records) || records.length === 0) {
      return [];
    }

    const ids = [];

    for (const record of records) {
      const knowledgeId = record._id || `KB-${uuidv4()}`;
      const now = new Date().toISOString();

      // Pre-compute search tokens from text
      const tokens = tokenize(record.text || '');

      const entry = {
        knowledgeId,
        namespace,
        text: record.text || '',
        category: record.category || null,
        sellerId: record.sellerId || null,
        domain: record.domain || null,
        outcome: record.outcome || null,
        riskScore: record.riskScore !== undefined ? record.riskScore : null,
        timestamp: record.timestamp || now,
        source: record.source || null,
        tokens,
        // Parent document retrieval fields (set when entry is a chunk)
        parentDocumentId: record.parentDocumentId || null,
        chunkIndex: record.chunkIndex !== undefined ? record.chunkIndex : null,
        totalChunks: record.totalChunks !== undefined ? record.totalChunks : null
      };

      db_ops.insert('knowledge_entries', 'knowledge_id', knowledgeId, entry);
      ids.push(knowledgeId);
    }

    return ids;
  }

  /**
   * Search knowledge entries by TF-IDF keyword matching with recency boost.
   * @param {string} namespace - Namespace to search within
   * @param {string} query - Search query text
   * @param {Object} filters - Optional filters: { sellerId, domain, outcome, category }
   * @param {number} topK - Maximum number of results to return (default: 10)
   * @returns {Array<Object>} Matching entries sorted by relevance score
   */
  searchKnowledge(namespace, query, filters = {}, topK = 10) {
    if (!VALID_NAMESPACES.has(namespace)) {
      throw new Error(`Invalid namespace: "${namespace}". Must be one of: ${[...VALID_NAMESPACES].join(', ')}`);
    }

    // Retrieve all knowledge entries
    const allEntries = db_ops.getAll('knowledge_entries', 10000, 0);

    // Filter by namespace
    let entries = allEntries
      .map(e => e.data)
      .filter(e => e.namespace === namespace);

    // Apply filters
    if (filters.sellerId) {
      entries = entries.filter(e => e.sellerId === filters.sellerId);
    }
    if (filters.domain) {
      entries = entries.filter(e => e.domain === filters.domain);
    }
    if (filters.outcome) {
      entries = entries.filter(e => e.outcome === filters.outcome);
    }
    if (filters.category) {
      entries = entries.filter(e => e.category === filters.category);
    }

    if (!query || entries.length === 0) {
      // No query: return most recent entries
      return entries
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, topK);
    }

    // Tokenize query
    const queryTokens = tokenize(query);

    // Score each entry
    const scored = entries.map(entry => {
      const entryTokens = entry.tokens || tokenize(entry.text || '');

      // TF-IDF-like similarity
      const similarity = computeSimilarity(queryTokens, entryTokens);

      // Recency boost
      const recency = computeRecencyBoost(entry.timestamp);

      // Combined score: 70% similarity, 30% recency
      const score = (similarity * 0.7) + (recency * 0.3);

      return { ...entry, _score: score };
    });

    // Sort by score descending, return topK
    return scored
      .filter(e => e._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, topK);
  }

  /**
   * Get all knowledge entries for a specific seller, across all namespaces.
   * @param {string} sellerId - The seller ID
   * @param {number} limit - Maximum number of results (default: 50)
   * @returns {Array<Object>} Knowledge entries for the seller
   */
  getSellerKnowledge(sellerId, limit = 50) {
    if (!sellerId) return [];

    const allEntries = db_ops.getAll('knowledge_entries', 10000, 0);

    return allEntries
      .map(e => e.data)
      .filter(e => e.sellerId === sellerId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Store a full document AND its chunks for parent document retrieval.
   * The full document is stored in 'knowledge_documents' so it can be retrieved
   * when any of its chunks match a search query.
   *
   * @param {string} namespace - One of the valid namespaces
   * @param {Object} record - Record with at least a 'text' field
   * @returns {{ documentId: string, chunkIds: string[] }}
   */
  addDocumentWithChunks(namespace, record) {
    if (!VALID_NAMESPACES.has(namespace)) {
      throw new Error(`Invalid namespace: "${namespace}". Must be one of: ${[...VALID_NAMESPACES].join(', ')}`);
    }

    const documentId = `DOC-${uuidv4()}`;
    const now = new Date().toISOString();
    const text = record.text || '';

    // Store the full document in knowledge_documents
    const docEntry = {
      documentId,
      namespace,
      text,
      category: record.category || null,
      sellerId: record.sellerId || null,
      domain: record.domain || null,
      source: record.source || null,
      timestamp: record.timestamp || now,
      chunkCount: 0 // updated below
    };

    // Chunk the text using the adaptive chunker
    const chunker = getChunker();
    const chunks = chunker.chunk(text, {
      parentId: documentId,
      namespace,
      sellerId: record.sellerId,
      domain: record.domain,
      category: record.category
    });

    docEntry.chunkCount = chunks.length;

    // Persist the full document
    db_ops.insert('knowledge_documents', 'document_id', documentId, docEntry);

    // Store each chunk as a knowledge entry via the existing addKnowledge method
    const chunkIds = [];
    for (const chunk of chunks) {
      const chunkRecords = [{
        text: chunk.text,
        category: record.category || null,
        sellerId: record.sellerId || null,
        domain: record.domain || null,
        source: record.source || null,
        timestamp: record.timestamp || now,
        parentDocumentId: documentId,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks
      }];
      const ids = this.addKnowledge(namespace, chunkRecords);
      chunkIds.push(...ids);
    }

    return { documentId, chunkIds };
  }

  /**
   * Retrieve a full parent document by its documentId.
   *
   * @param {string} documentId - The DOC-{uuid} identifier
   * @returns {Object|null} The document object, or null if not found
   */
  getParentDocument(documentId) {
    const row = db_ops.getById('knowledge_documents', 'document_id', documentId);
    if (!row) return null;
    return row.data || row;
  }

  /**
   * Get knowledge base statistics.
   * @returns {Object} Stats including total count and per-namespace counts
   */
  getStats() {
    const allEntries = db_ops.getAll('knowledge_entries', 10000, 0).map(e => e.data);

    const namespaceCounts = {};
    for (const ns of VALID_NAMESPACES) {
      namespaceCounts[ns] = 0;
    }

    const sellerIds = new Set();
    const domains = new Set();

    for (const entry of allEntries) {
      if (entry.namespace && namespaceCounts[entry.namespace] !== undefined) {
        namespaceCounts[entry.namespace]++;
      }
      if (entry.sellerId) sellerIds.add(entry.sellerId);
      if (entry.domain) domains.add(entry.domain);
    }

    return {
      totalEntries: allEntries.length,
      namespaceCounts,
      uniqueSellers: sellerIds.size,
      uniqueDomains: domains.size,
      namespaces: [...VALID_NAMESPACES]
    };
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let instance = null;

/**
 * Get the singleton KnowledgeBase instance.
 * @returns {KnowledgeBase}
 */
export function getKnowledgeBase() {
  if (!instance) {
    instance = new KnowledgeBase();
  }
  return instance;
}

export default { getKnowledgeBase };
