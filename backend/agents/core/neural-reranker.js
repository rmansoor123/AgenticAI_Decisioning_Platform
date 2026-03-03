/**
 * Neural Reranker - Re-scores search results using cross-encoder semantics.
 *
 * Uses LLM for semantic relevance scoring with heuristic fallback.
 * Integrates with context-engine.js for post-retrieval reranking.
 */

import { getLLMClient } from './llm-client.js';

class NeuralReranker {
  constructor() {
    this.llmClient = getLLMClient();
    this.stats = { rerankCalls: 0, llmReranks: 0, heuristicReranks: 0, avgLatencyMs: 0 };
  }

  /**
   * Rerank search results by relevance to query.
   * @param {string} query - The original search query
   * @param {Array} results - Array of {text, relevanceScore, ...} objects
   * @param {number} topK - Number of results to return
   * @returns {Array} Reranked results with _rerankScore
   */
  async rerank(query, results, topK = 5) {
    if (!results || results.length === 0) return [];
    if (results.length <= 1) return results;

    this.stats.rerankCalls++;
    const startTime = Date.now();

    let reranked;
    if (this.llmClient?.enabled && results.length <= 10) {
      reranked = await this._llmRerank(query, results);
    } else {
      reranked = this._heuristicRerank(query, results);
    }

    const duration = Date.now() - startTime;
    this.stats.avgLatencyMs = (this.stats.avgLatencyMs * (this.stats.rerankCalls - 1) + duration) / this.stats.rerankCalls;

    return reranked.slice(0, topK);
  }

  /**
   * LLM-based reranking: ask the LLM to score each result's relevance.
   */
  async _llmRerank(query, results) {
    try {
      const prompt = `You are a relevance scorer. Rate each document's relevance to the query on a scale of 0-10.

Query: "${query}"

Documents:
${results.map((r, i) => `[${i}] ${(r.text || '').slice(0, 300)}`).join('\n\n')}

Return ONLY a JSON array of scores, one per document, in order. Example: [8, 3, 7, 5]`;

      const response = await this.llmClient.generateText(prompt, { temperature: 0, maxTokens: 200 });
      const scores = JSON.parse(response.match(/\[[\d\s,\.]+\]/)?.[0] || '[]');

      if (scores.length === results.length) {
        this.stats.llmReranks++;
        return results
          .map((r, i) => ({ ...r, _rerankScore: scores[i] / 10, _rerankMethod: 'llm' }))
          .sort((a, b) => b._rerankScore - a._rerankScore);
      }
    } catch (e) {
      // LLM reranking failed; fall through to heuristic
    }

    return this._heuristicRerank(query, results);
  }

  /**
   * Heuristic reranking: keyword overlap + position bias + original score.
   */
  _heuristicRerank(query, results) {
    this.stats.heuristicReranks++;
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    return results
      .map((r, i) => {
        const text = (r.text || '').toLowerCase();

        // Keyword overlap score (0-1)
        const matchedTerms = queryTerms.filter(t => text.includes(t));
        const overlapScore = queryTerms.length > 0 ? matchedTerms.length / queryTerms.length : 0;

        // Exact phrase match bonus
        const phraseBonus = text.includes(query.toLowerCase().slice(0, 50)) ? 0.2 : 0;

        // Original score contribution (normalized)
        const origScore = Math.min(r.relevanceScore || r.rrfScore || 0.5, 1);

        // Combined score: 40% overlap + 20% phrase + 30% original + 10% position
        const positionScore = 1 - (i / results.length);
        const combinedScore = (overlapScore * 0.4) + (phraseBonus * 0.2) + (origScore * 0.3) + (positionScore * 0.1);

        return { ...r, _rerankScore: Math.round(combinedScore * 1000) / 1000, _rerankMethod: 'heuristic' };
      })
      .sort((a, b) => b._rerankScore - a._rerankScore);
  }

  getStats() {
    return { ...this.stats };
  }
}

// Singleton
let instance = null;
export function getNeuralReranker() {
  if (!instance) instance = new NeuralReranker();
  return instance;
}

export default { NeuralReranker, getNeuralReranker };
