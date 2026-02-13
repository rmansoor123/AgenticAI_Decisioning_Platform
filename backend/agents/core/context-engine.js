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
      try {
        const recentMemory = this.memoryStore.getShortTerm(agentId, sessionId);
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

    // 4. RAG results from knowledge base
    const queryText = typeof task === 'string' ? task : (task.type || task.eventType || JSON.stringify(task).slice(0, 200));
    const namespace = domain ? (DOMAIN_TO_NAMESPACE[domain] || null) : null;
    if (namespace) {
      try {
        const ragResults = this.knowledgeBase.searchKnowledge(
          namespace,
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
      } catch (e) {
        // RAG search failed (e.g. invalid namespace); skip gracefully
      }
    }

    // 5. Long-term memory
    try {
      const longTermResults = this.memoryStore.queryLongTerm(agentId, queryText, 5);
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
