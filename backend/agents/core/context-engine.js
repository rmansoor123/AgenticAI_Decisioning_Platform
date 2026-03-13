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
import { getContextRanker } from './context-ranker.js';
import { getSelfQueryEngine } from './self-query.js';
import { getQueryDecomposer } from './query-decomposer.js';
import { getNeuralReranker } from './neural-reranker.js';
import { vectorSearch } from './vector-backend.js';
import { db_ops } from '../../shared/common/database.js';

const DEFAULT_TOKEN_BUDGET = 4000;

const SOURCE_BUDGETS = {
  system:          { priority: 1, maxTokens: 200 },
  task:            { priority: 2, maxTokens: 500 },
  shortTermMemory: { priority: 3, maxTokens: 500 },
  ragResults:      { priority: 4, maxTokens: 800 },
  longTermMemory:  { priority: 5, maxTokens: 400 },
  domainContext:   { priority: 6, maxTokens: 300 },
  crossAgentContext: { priority: 7, maxTokens: 300 }
};

// Map domain names to valid knowledge base namespaces
const DOMAIN_TO_NAMESPACE = {
  'onboarding': 'onboarding',
  'transaction': 'transactions',
  'transactions': 'transactions',
  'ato': 'risk-events',
  'payout': 'transactions',
  'listing': 'onboarding',
  'shipping': 'risk-events',
  'decisions': 'decisions',
  'rules': 'rules',
  'risk-events': 'risk-events'
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

    console.log('[ContextEngine] Initialized');
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
   *   tokenBudget: number,
   *   agentRole: string
   * }
   * @returns {Object} { prompt: string, sources: Object, tokenCount: number }
   */
  async assembleContext(agentId, task, options = {}) {
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
      try {
        const recentMemory = await this.memoryStore.getShortTerm(agentId, sessionId);
        if (recentMemory.length > 0) {
          const memoryText = this.promptBuilder.formatMemoryEntries(recentMemory, 5);
          sections.shortTermMemory = this.promptBuilder.truncateToTokenBudget(memoryText, SOURCE_BUDGETS.shortTermMemory.maxTokens);
          totalTokens += this.promptBuilder.estimateTokens(sections.shortTermMemory);
          sourceMeta.shortTermMemory = { included: true, entries: recentMemory.length, tokens: this.promptBuilder.estimateTokens(sections.shortTermMemory) };
        }
      } catch (e) {
        // Short-term memory retrieval failed; skip gracefully
      }
    }

    // 4. RAG results — advanced retrieval pipeline
    //    Self-query → Multi-query decomposition → Vector/TF-IDF search → Parent document enrichment
    const queryText = typeof task === 'string' ? task : (task.type || task.eventType || JSON.stringify(task).slice(0, 200));
    const namespace = domain ? (DOMAIN_TO_NAMESPACE[domain] || null) : null;
    if (namespace) {
      let ragResults = [];

      // 4a. Self-query: generate metadata filters from natural language
      const selfQuery = getSelfQueryEngine();
      let searchQuery = queryText;
      let selfQueryFilters = sellerId ? { sellerId } : {};
      try {
        const searchParams = await selfQuery.applyToSearch(queryText, namespace);
        searchQuery = searchParams.query || queryText;
        if (searchParams.filter) {
          selfQueryFilters = { ...selfQueryFilters, ...searchParams.filter };
        }
      } catch (e) {
        // Self-query failed; use original query and basic filters
      }

      // 4b. Multi-query decomposition: break complex queries into sub-queries
      const queryDecomposer = getQueryDecomposer();
      let subQueries;
      try {
        subQueries = await queryDecomposer.decompose(searchQuery);
      } catch (e) {
        subQueries = [searchQuery];
      }

      // 4c. Execute hybrid search for each sub-query (dense + sparse in parallel, fused via RRF)
      const vectorNamespace = namespace === 'onboarding' ? 'onboarding-knowledge' : namespace === 'risk-events' ? 'fraud-cases' : namespace;
      const RRF_K = 60; // Reciprocal Rank Fusion constant

      for (const sq of subQueries) {
        const topK = subQueries.length > 1 ? 3 : 5;

        // Run dense (vector) and sparse (TF-IDF) searches in parallel
        const [denseResults, sparseResults] = await Promise.all([
          // Dense: vector search via vector-backend factory (routes to Pinecone/Qdrant/ChromaDB/Weaviate)
          (async () => {
            try {
              const filter = Object.keys(selfQueryFilters).length > 0 ? selfQueryFilters : null;
              const results = await vectorSearch(vectorNamespace, sq, topK * 2, filter);
              return results.map((r, i) => ({
                text: r.metadata?.text || r.text,
                relevanceScore: r.score,
                outcome: r.metadata?.outcome || null,
                parentDocumentId: r.metadata?.parentDocumentId || null,
                ...r.metadata,
                _rank: i + 1,
                _source: 'dense',
              }));
            } catch (e) { /* vector search unavailable */ }
            return [];
          })(),
          // Sparse: local TF-IDF search
          (async () => {
            try {
              const results = await this.knowledgeBase.searchKnowledge(namespace, sq, selfQueryFilters, topK * 2);
              return results.map((r, i) => ({
                ...r,
                _rank: i + 1,
                _source: 'sparse',
              }));
            } catch (e) { /* TF-IDF failed */ }
            return [];
          })(),
        ]);

        // Reciprocal Rank Fusion: merge dense + sparse results
        const scoreMap = new Map();
        for (const result of denseResults) {
          const key = (result.text || '').slice(0, 80);
          const rrfScore = 1 / (RRF_K + result._rank);
          const existing = scoreMap.get(key);
          if (existing) {
            existing.rrfScore += rrfScore;
            existing._fusedSources = ['dense', 'sparse'];
          } else {
            scoreMap.set(key, { ...result, rrfScore, _fusedSources: ['dense'] });
          }
        }
        for (const result of sparseResults) {
          const key = (result.text || '').slice(0, 80);
          const rrfScore = 1 / (RRF_K + result._rank);
          const existing = scoreMap.get(key);
          if (existing) {
            existing.rrfScore += rrfScore;
            existing._fusedSources = [...new Set([...(existing._fusedSources || []), 'sparse'])];
          } else {
            scoreMap.set(key, { ...result, rrfScore, _fusedSources: ['sparse'] });
          }
        }

        // Sort by fused score, take top K
        const fused = Array.from(scoreMap.values())
          .sort((a, b) => b.rrfScore - a.rrfScore)
          .slice(0, topK);
        ragResults.push(...fused);
      }

      // 4d. Deduplicate by text content, keep highest-scored
      if (ragResults.length > 1) {
        const seen = new Map();
        for (const r of ragResults) {
          const key = (r.text || '').slice(0, 80);
          const existing = seen.get(key);
          if (!existing || (r.relevanceScore || 0) > (existing.relevanceScore || 0)) {
            seen.set(key, r);
          }
        }
        ragResults = Array.from(seen.values())
          .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
          .slice(0, 5);
      }

      // 4d-bis. Neural reranking of fused results
      if (ragResults.length > 1) {
        try {
          const reranker = getNeuralReranker();
          ragResults = await reranker.rerank(queryText, ragResults, 5);
        } catch (e) {
          // Reranking failed; continue with existing order
        }
      }

      // 4e. Parent document retrieval: enrich chunks with full parent context
      for (const result of ragResults) {
        if (result.parentDocumentId) {
          try {
            const parent = this.knowledgeBase.getParentDocument(result.parentDocumentId);
            if (parent) {
              result._parentContext = (parent.text || '').slice(0, 1000);
            }
          } catch (e) {
            // Parent document retrieval failed; skip
          }
        }
      }

      if (ragResults.length > 0) {
        const ragText = this.promptBuilder.formatRAGResults(ragResults, 5);
        sections.ragResults = this.promptBuilder.truncateToTokenBudget(ragText, SOURCE_BUDGETS.ragResults.maxTokens);
        totalTokens += this.promptBuilder.estimateTokens(sections.ragResults);
        sourceMeta.ragResults = {
          included: true,
          results: ragResults.length,
          searchStrategy: ragResults.some(r => r._fusedSources?.length > 1) ? 'hybrid_rrf' : (ragResults.some(r => r._source === 'dense') ? 'dense' : 'sparse'),
          reranked: ragResults.some(r => r._rerankScore != null),
          tokens: this.promptBuilder.estimateTokens(sections.ragResults),
          selfQueryFilters: Object.keys(selfQueryFilters).length > 0 ? selfQueryFilters : null,
          subQueryCount: subQueries.length,
          parentDocsEnriched: ragResults.filter(r => r._parentContext).length
        };
      }
    }

    // 5. Long-term memory
    try {
      const longTermResults = await this.memoryStore.queryLongTerm(agentId, queryText, 5);
      if (longTermResults.length > 0) {
        const ltmText = this.promptBuilder.formatMemoryEntries(longTermResults, 5);
        sections.longTermMemory = this.promptBuilder.truncateToTokenBudget(ltmText, SOURCE_BUDGETS.longTermMemory.maxTokens);
        totalTokens += this.promptBuilder.estimateTokens(sections.longTermMemory);
        sourceMeta.longTermMemory = { included: true, entries: longTermResults.length, tokens: this.promptBuilder.estimateTokens(sections.longTermMemory) };
      }
    } catch (e) {
      // Long-term memory retrieval failed; skip gracefully
    }

    // 6. Domain context (seller profile, recent events)
    if (sellerId) {
      try {
        const sellerKnowledge = this.knowledgeBase.getSellerKnowledge(sellerId, 5);
        if (sellerKnowledge.length > 0) {
          const contextText = sellerKnowledge.map(k =>
            `[${k.domain || k.namespace}] ${k.text?.slice(0, 100) || 'No details'} (score: ${k.riskScore})`
          ).join('\n');
          sections.domainContext = this.promptBuilder.truncateToTokenBudget(contextText, SOURCE_BUDGETS.domainContext.maxTokens);
          totalTokens += this.promptBuilder.estimateTokens(sections.domainContext);
          sourceMeta.domainContext = { included: true, entries: sellerKnowledge.length, tokens: this.promptBuilder.estimateTokens(sections.domainContext) };
        }
      } catch (e) {
        // Domain context retrieval failed; skip gracefully
      }
    }

    // 7. Cross-agent context (seller risk profile + recent agent decisions across all domains)
    if (sellerId) {
      try {
        const riskProfile = await db_ops.getById('seller_risk_profiles', 'seller_id', sellerId);
        if (riskProfile) {
          const p = typeof riskProfile.data === 'string' ? JSON.parse(riskProfile.data) : (riskProfile.data || riskProfile);
          const compositeScore = Math.round(p.compositeScore || p.composite_score || 0);
          const tier = p.tier || 'LOW';
          const domainScores = p.domainScores || p.domain_scores || {};
          const activeActions = p.activeActions || p.active_actions || [];

          // Format non-zero domain scores sorted descending
          const scoreParts = Object.entries(domainScores)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([d, v]) => `${d}: ${Math.round(v)}`)
            .join(', ');

          const actionsPart = activeActions.length > 0
            ? `\nActive actions: ${activeActions.join(', ')}`
            : '';

          // Query last 5 risk events for this seller
          let recentDecisions = '';
          try {
            const eventsRows = await db_ops.query(
              'risk_events',
              "json_extract(data,'$.sellerId') = ?",
              [sellerId],
              5
            );
            if (eventsRows && eventsRows.length > 0) {
              const lines = eventsRows.map(row => {
                const e = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || row);
                const d = e.domain || 'unknown';
                const et = e.eventType || e.event_type || 'unknown';
                const score = Math.round(e.riskScore || e.risk_score || e.score || 0);
                const ts = e.timestamp || row.created_at;
                const hoursAgo = ts ? Math.round((Date.now() - new Date(ts).getTime()) / 3600000) : '?';
                return `- [${d}] ${et} (score: ${score}) ${hoursAgo}h ago`;
              });
              recentDecisions = `\nRecent agent decisions:\n${lines.join('\n')}`;
            }
          } catch (e) {
            // Risk events query failed; skip
          }

          const crossCtx = `Seller ${sellerId} cross-domain risk profile:\nComposite: ${compositeScore} | Tier: ${tier}\nDomain scores: ${scoreParts || 'none'}${actionsPart}\nTotal events: ${(p.totalEvents || p.total_events || 0)}${recentDecisions}`;

          sections.crossAgentContext = this.promptBuilder.truncateToTokenBudget(crossCtx, SOURCE_BUDGETS.crossAgentContext.maxTokens);
          totalTokens += this.promptBuilder.estimateTokens(sections.crossAgentContext);
          sourceMeta.crossAgentContext = { included: true, tokens: this.promptBuilder.estimateTokens(sections.crossAgentContext) };
        }
      } catch (e) {
        // Cross-agent context retrieval failed; skip gracefully
      }
    }

    // ── Global context reranking ──
    // Build context items from non-system, non-task sections for reranking
    const contextRanker = getContextRanker();
    const rerankedSources = ['shortTermMemory', 'ragResults', 'longTermMemory', 'domainContext', 'crossAgentContext'];
    const contextItems = rerankedSources
      .filter(key => sections[key])
      .map(key => ({
        source: key,
        text: sections[key],
        tokens: this.promptBuilder.estimateTokens(sections[key])
      }));

    if (contextItems.length > 0) {
      const ranked = contextRanker.rankItems(contextItems, queryText);
      const guarantees = {
        system: sourceMeta.system ? sourceMeta.system.tokens : 0,
        task: sourceMeta.task ? sourceMeta.task.tokens : 0
      };
      const allocation = contextRanker.allocateBudget(ranked, tokenBudget, guarantees);

      // Remove sections that were not allocated
      const allocatedSources = new Set(allocation.items.map(i => i.source));
      for (const key of rerankedSources) {
        if (sections[key] && !allocatedSources.has(key)) {
          delete sections[key];
          if (sourceMeta[key]) {
            sourceMeta[key].included = false;
            sourceMeta[key].droppedByReranker = true;
          }
        }
      }

      // Recalculate totalTokens after reranking
      totalTokens = 0;
      for (const key of Object.keys(sections)) {
        totalTokens += this.promptBuilder.estimateTokens(sections[key]);
      }

      // Log reranking info in sourceMeta
      sourceMeta._reranking = {
        itemsConsidered: contextItems.length,
        itemsAllocated: allocation.items.length,
        itemsDropped: allocation.droppedItems.length,
        guaranteedTokens: allocation.guaranteedTokens,
        totalAllocatedTokens: allocation.totalTokens,
        remainingBudget: allocation.remainingBudget
      };
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
