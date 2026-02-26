/**
 * Context Ranker - Global context reranking with TF-IDF scoring and token allocation
 *
 * Two-pass context assembly:
 * Pass 1 (Gather): Score each context item by TF-IDF relevance to query.
 * Pass 2 (Allocate): Rank all items across all sources by relevance. Allocate
 *   token budget greedily (highest relevance first). Guarantee minimums for
 *   system (200) and task (300).
 */

// Common English stopwords to filter out of TF-IDF scoring
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'of', 'for',
  'and', 'or', 'but', 'not', 'no', 'with', 'by', 'from', 'as', 'be',
  'was', 'were', 'are', 'been', 'being', 'has', 'had', 'have', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'shall', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
  'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
  'his', 'its', 'our', 'their', 'what', 'which', 'who', 'whom', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'than', 'too', 'very', 'just', 'about',
  'above', 'after', 'again', 'any', 'because', 'before', 'below', 'between',
  'during', 'if', 'into', 'only', 'own', 'same', 'so', 'then', 'there',
  'through', 'under', 'until', 'up', 'while', 'also', 'am', 'down', 'here',
  'now', 'out', 'over', 'still', 'well', 'back', 'even', 'get', 'got',
  'go', 'going', 'make', 'much', 'new', 'old', 'one', 'two', 'three',
  'first', 'last', 'long', 'great', 'little', 'right', 'high', 'small',
  'large', 'next', 'early', 'young', 'important', 'running'
]);

class ContextRanker {
  constructor() {
    console.log('[ContextRanker] Initialized');
  }

  /**
   * Tokenize text into meaningful words, filtering stopwords and short tokens.
   * @param {string} text
   * @returns {string[]}
   */
  _tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOPWORDS.has(w));
  }

  /**
   * Compute term frequency for each term in a list of tokens.
   * @param {string[]} tokens
   * @returns {Map<string, number>} term -> frequency (count / totalTokens)
   */
  _computeTF(tokens) {
    const tf = new Map();
    if (tokens.length === 0) return tf;
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    // Normalize by total token count
    for (const [term, count] of tf) {
      tf.set(term, count / tokens.length);
    }
    return tf;
  }

  /**
   * Compute inverse document frequency across a collection of documents.
   * @param {string[][]} documentsTokens - Array of token arrays, one per document
   * @returns {Map<string, number>} term -> IDF score
   */
  _computeIDF(documentsTokens) {
    const idf = new Map();
    const n = documentsTokens.length;
    if (n === 0) return idf;

    // Count how many documents contain each term
    const docFreq = new Map();
    for (const tokens of documentsTokens) {
      const uniqueTerms = new Set(tokens);
      for (const term of uniqueTerms) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }
    }

    // IDF = log(N / df) + 1 (smoothed)
    for (const [term, df] of docFreq) {
      idf.set(term, Math.log(n / df) + 1);
    }

    return idf;
  }

  /**
   * Rank items by TF-IDF relevance to the query.
   *
   * @param {Array<{source: string, text: string, tokens: number}>} items
   * @param {string} query
   * @returns {Array<{source: string, text: string, tokens: number, relevanceScore: number}>}
   *   Items sorted by relevanceScore (descending)
   */
  rankItems(items, query) {
    if (!items || items.length === 0) return [];

    const queryTokens = this._tokenize(query);

    // If query is empty or has no meaningful tokens, return all items with 0 score
    if (queryTokens.length === 0) {
      return items.map(item => ({ ...item, relevanceScore: 0 }));
    }

    // Tokenize all documents (items + query as a "document" for IDF)
    const documentsTokens = items.map(item => this._tokenize(item.text));

    // Compute IDF across all documents
    const idf = this._computeIDF(documentsTokens);

    // Score each item
    const scored = items.map((item, idx) => {
      const docTF = this._computeTF(documentsTokens[idx]);

      // Sum TF-IDF for query terms found in this document
      let score = 0;
      for (const qTerm of queryTokens) {
        const tf = docTF.get(qTerm) || 0;
        const idfVal = idf.get(qTerm) || 0;
        score += tf * idfVal;
      }

      return { ...item, relevanceScore: score };
    });

    // Sort by relevanceScore descending
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return scored;
  }

  /**
   * Greedily allocate token budget to highest-relevance items first.
   * Reserves guaranteed tokens for system and task sections before allocation.
   *
   * @param {Array<{source: string, text: string, tokens: number, relevanceScore: number}>} rankedItems
   *   Items pre-sorted by relevanceScore descending
   * @param {number} totalBudget - Total token budget (default 4000)
   * @param {Object} guarantees - Reserved token counts, e.g. { system: 200, task: 300 }
   * @returns {{
   *   items: Array, droppedItems: Array,
   *   totalTokens: number, guaranteedTokens: number, remainingBudget: number
   * }}
   */
  allocateBudget(rankedItems, totalBudget = 4000, guarantees = {}) {
    // Calculate guaranteed token reservations
    const guaranteedTokens = Object.values(guarantees).reduce((sum, v) => sum + v, 0);
    let availableBudget = Math.max(0, totalBudget - guaranteedTokens);

    const allocated = [];
    const dropped = [];
    let totalAllocated = 0;

    for (const item of rankedItems) {
      if (item.tokens <= availableBudget) {
        allocated.push(item);
        availableBudget -= item.tokens;
        totalAllocated += item.tokens;
      } else {
        dropped.push(item);
      }
    }

    return {
      items: allocated,
      droppedItems: dropped,
      totalTokens: totalAllocated,
      guaranteedTokens,
      remainingBudget: availableBudget
    };
  }
}

// Singleton
let instance = null;

export function getContextRanker() {
  if (!instance) {
    instance = new ContextRanker();
  }
  return instance;
}

export default { ContextRanker, getContextRanker };
