/**
 * Retrieval Evaluator — measures retrieval quality separately from generation quality.
 *
 * Computes standard IR metrics:
 *   - Hit Rate (recall): fraction of relevant docs found in retrieved set
 *   - MRR (Mean Reciprocal Rank): 1 / rank of first relevant doc
 *   - NDCG (Normalized Discounted Cumulative Gain): position-aware relevance scoring
 *
 * Singleton: getRetrievalEvaluator()
 */

class RetrievalEvaluator {
  constructor() {
    this.evaluations = [];
  }

  /**
   * Compute hit rate — fraction of relevant documents found in retrieved set.
   * @param {string[]} retrievedIds - IDs of retrieved documents
   * @param {string[]} relevantIds - IDs of ground-truth relevant documents
   * @returns {number} hit rate between 0 and 1
   */
  computeHitRate(retrievedIds, relevantIds) {
    if (!relevantIds || relevantIds.length === 0) return 0;
    if (!retrievedIds || retrievedIds.length === 0) return 0;

    const retrievedSet = new Set(retrievedIds);
    const hits = relevantIds.filter(id => retrievedSet.has(id)).length;
    return hits / relevantIds.length;
  }

  /**
   * Compute Mean Reciprocal Rank — 1 / (rank of first relevant document).
   * @param {string[]} retrievedIds - IDs of retrieved documents (ordered by rank)
   * @param {string[]} relevantIds - IDs of ground-truth relevant documents
   * @returns {number} MRR between 0 and 1
   */
  computeMRR(retrievedIds, relevantIds) {
    if (!retrievedIds || retrievedIds.length === 0) return 0;
    if (!relevantIds || relevantIds.length === 0) return 0;

    const relevantSet = new Set(relevantIds);
    for (let i = 0; i < retrievedIds.length; i++) {
      if (relevantSet.has(retrievedIds[i])) {
        return 1 / (i + 1);
      }
    }
    return 0;
  }

  /**
   * Compute Normalized Discounted Cumulative Gain at k.
   * Uses binary relevance: 1 if doc is in relevant set, 0 otherwise.
   * @param {string[]} retrievedIds - IDs of retrieved documents (ordered by rank)
   * @param {string[]} relevantIds - IDs of ground-truth relevant documents
   * @param {number} k - cutoff rank (default 5)
   * @returns {number} NDCG@k between 0 and 1
   */
  computeNDCG(retrievedIds, relevantIds, k = 5) {
    if (!retrievedIds || retrievedIds.length === 0) return 0;
    if (!relevantIds || relevantIds.length === 0) return 0;

    const relevantSet = new Set(relevantIds);

    // DCG: sum of 1/log2(i+1) for each relevant doc at position i (1-indexed)
    let dcg = 0;
    const limit = Math.min(k, retrievedIds.length);
    for (let i = 0; i < limit; i++) {
      if (relevantSet.has(retrievedIds[i])) {
        dcg += 1 / Math.log2(i + 2); // i+2 because positions are 1-indexed: log2(rank+1)
      }
    }

    // IDCG: best possible DCG with min(k, |relevant|) relevant docs at top positions
    const idealCount = Math.min(k, relevantIds.length);
    let idcg = 0;
    for (let i = 0; i < idealCount; i++) {
      idcg += 1 / Math.log2(i + 2);
    }

    if (idcg === 0) return 0;
    return dcg / idcg;
  }

  /**
   * Aggregate all retrieval metrics into one evaluation object.
   * @param {string[]} retrievedIds - IDs of retrieved documents
   * @param {string[]} relevantIds - IDs of ground-truth relevant documents
   * @param {string} query - the query that produced this retrieval
   * @param {number} k - cutoff for NDCG (default 5)
   * @returns {{ query, hitRate, mrr, ndcg, retrievedCount, relevantCount, timestamp }}
   */
  evaluateRetrieval(retrievedIds, relevantIds, query, k = 5) {
    const result = {
      query,
      hitRate: this.computeHitRate(retrievedIds, relevantIds),
      mrr: this.computeMRR(retrievedIds, relevantIds),
      ndcg: this.computeNDCG(retrievedIds, relevantIds, k),
      retrievedCount: retrievedIds ? retrievedIds.length : 0,
      relevantCount: relevantIds ? relevantIds.length : 0,
      timestamp: new Date().toISOString(),
    };

    this.evaluations.push(result);
    return result;
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────

let instance = null;

export function getRetrievalEvaluator() {
  if (!instance) {
    instance = new RetrievalEvaluator();
  }
  return instance;
}
