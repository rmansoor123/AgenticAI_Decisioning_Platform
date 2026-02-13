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
