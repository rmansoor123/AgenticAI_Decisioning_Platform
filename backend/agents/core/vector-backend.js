/**
 * Vector search backend — JS client that calls the FastAPI eval service.
 * Routes to Qdrant or Pinecone based on VECTOR_BACKEND env var.
 * Falls back to TF-IDF knowledge-base.js when vector service is unavailable.
 *
 * Usage:
 *   import { vectorSearch, vectorIngest, vectorHealth } from './vector-backend.js';
 *   const results = await vectorSearch('fraud-cases', 'suspicious transaction pattern');
 */

const EVAL_SERVICE_URL = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';

/**
 * Search a vector collection by text query.
 * @param {string} collection - Collection name (e.g., 'fraud-cases')
 * @param {string} query - Text query
 * @param {number} topK - Number of results
 * @param {object} filter - Optional MongoDB-style filter
 * @returns {Promise<Array<{id, score, metadata}>>} Search results
 */
export async function vectorSearch(collection, query, topK = 10, filter = null) {
  try {
    const body = { collection, query, top_k: topK };
    if (filter) body.filter = filter;

    const resp = await fetch(`${EVAL_SERVICE_URL}/vector/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      throw new Error(`Vector search returned ${resp.status}`);
    }

    const data = await resp.json();
    return data.results || [];
  } catch (err) {
    console.warn(`[vector-backend] Search failed: ${err.message}`);
    return [];
  }
}

/**
 * Ingest documents into a vector collection.
 * @param {string} collection - Collection name
 * @param {Array<{id, text, metadata}>} documents - Documents to ingest
 * @returns {Promise<{ingested: number}>}
 */
export async function vectorIngest(collection, documents) {
  try {
    const resp = await fetch(`${EVAL_SERVICE_URL}/vector/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, documents }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      throw new Error(`Vector ingest returned ${resp.status}`);
    }

    return await resp.json();
  } catch (err) {
    console.warn(`[vector-backend] Ingest failed: ${err.message}`);
    return { ingested: 0, error: err.message };
  }
}

/**
 * Check vector backend health.
 * @returns {Promise<{status, backend}>}
 */
export async function vectorHealth() {
  try {
    const resp = await fetch(`${EVAL_SERVICE_URL}/vector/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return await resp.json();
  } catch (err) {
    return { status: 'unavailable', error: err.message };
  }
}

/**
 * Get the active vector backend type.
 * @returns {string} 'qdrant' | 'pinecone' | 'chromadb' | 'weaviate'
 */
export function getVectorBackendType() {
  return (process.env.VECTOR_BACKEND || 'pinecone').toLowerCase();
}
