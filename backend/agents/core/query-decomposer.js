/**
 * Query Decomposer — Breaks complex queries into focused sub-queries.
 *
 * Port of Python query_decomposer.py to Node.js.
 * Uses LLM to decompose complex fraud investigation queries into simpler
 * sub-queries for parallel retrieval. Falls back to returning the original
 * query when LLM is unavailable.
 *
 * Singleton: getQueryDecomposer()
 */

import { getLLMClient } from './llm-client.js';
import { parseLLMJson } from './prompt-templates.js';

const DECOMPOSE_SYSTEM = `You decompose complex fraud investigation queries into simpler sub-queries for vector search retrieval.

Rules:
- Return a JSON array of strings, each a focused sub-query
- Each sub-query should target a different aspect of the original question
- Keep sub-queries concise and search-friendly (no full sentences)
- If the query is already simple and focused, return it unchanged as a single-element array
- Maximum sub-queries: as specified by the user

Examples:
- "What are the risk patterns for high-value electronics sellers from China with chargeback history?"
  → ["risk patterns electronics sellers China", "chargeback history high-value sellers", "electronics seller fraud indicators"]

- "How should we handle a new seller with mismatched business documents and a flagged IP address?"
  → ["mismatched business documents seller onboarding", "flagged IP address seller risk", "new seller verification failure handling"]

- "Check seller risk level"
  → ["check seller risk level"]

Return ONLY the JSON array, no explanation.`;

class QueryDecomposer {
  constructor() {
    this.llmClient = getLLMClient();
    this.stats = {
      totalQueries: 0,
      decomposedCount: 0,
      fallbackCount: 0,
    };
  }

  /**
   * Decompose a complex query into focused sub-queries.
   *
   * @param {string} query - The original query
   * @param {number} [maxSubQueries=3] - Maximum number of sub-queries
   * @returns {Promise<string[]>} Array of sub-queries (at least 1)
   */
  async decompose(query, maxSubQueries = 3) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return [query || ''];
    }

    this.stats.totalQueries++;

    // Short/simple queries don't need decomposition
    const wordCount = query.trim().split(/\s+/).length;
    if (wordCount <= 6) {
      this.stats.fallbackCount++;
      return [query];
    }

    if (!this.llmClient?.enabled) {
      this.stats.fallbackCount++;
      return [query];
    }

    try {
      const result = await this.llmClient.complete(
        DECOMPOSE_SYSTEM,
        `Decompose this query into at most ${maxSubQueries} sub-queries: "${query}"`,
        { temperature: 0.2, maxTokens: 512 }
      );

      if (!result?.content) {
        this.stats.fallbackCount++;
        return [query];
      }

      const parsed = parseLLMJson(result.content, null);

      if (Array.isArray(parsed) && parsed.length > 0) {
        this.stats.decomposedCount++;
        return parsed
          .filter(q => typeof q === 'string' && q.trim().length > 0)
          .slice(0, maxSubQueries);
      }

      // parseLLMJson might return an object; try to extract array from it
      if (parsed?.queries && Array.isArray(parsed.queries)) {
        this.stats.decomposedCount++;
        return parsed.queries
          .filter(q => typeof q === 'string' && q.trim().length > 0)
          .slice(0, maxSubQueries);
      }
    } catch (e) {
      // LLM failed; fall through
    }

    this.stats.fallbackCount++;
    return [query];
  }

  /**
   * Get usage statistics.
   * @returns {Object}
   */
  getStats() {
    return {
      llmEnabled: this.llmClient?.enabled || false,
      ...this.stats,
    };
  }
}

// Singleton
let instance = null;

export function getQueryDecomposer() {
  if (!instance) {
    instance = new QueryDecomposer();
  }
  return instance;
}

export default { QueryDecomposer, getQueryDecomposer };
