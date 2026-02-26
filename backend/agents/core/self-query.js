/**
 * Self-Query Engine - LLM-powered metadata filter generation
 *
 * Converts natural language queries into Pinecone metadata filters
 * before vector search. Falls back to regex-based extraction when
 * LLM is unavailable or parsing fails.
 *
 * Example:
 *   "high-risk electronics sellers from US"
 *   → { filters: { category: "ELECTRONICS", country: "US", riskScore: { $gt: 60 } },
 *       cleanedQuery: "sellers" }
 */

import { getLLMClient } from './llm-client.js';

const SYSTEM_PROMPT = `You are a metadata filter generator for a fraud detection vector database.

Given a natural language query, extract structured metadata filters and return a cleaned query.

The database has these metadata fields:
- category: string (ELECTRONICS, FASHION, HOME_GARDEN, SPORTS, AUTOMOTIVE, FOOD, HEALTH, TOYS, BOOKS, OTHER)
- country: string (ISO 2-letter code: US, GB, DE, FR, JP, CN, IN, BR, AU, CA, etc.)
- riskScore: number (0-100, higher = more risky)
- riskLevel: string (LOW, MEDIUM, HIGH, CRITICAL)
- status: string (ACTIVE, BLOCKED, SUSPENDED, UNDER_REVIEW, APPROVED, REJECTED)
- sellerId: string
- domain: string (onboarding, transactions, risk-events, decisions, rules)
- outcome: string (APPROVED, REJECTED, BLOCKED, FLAGGED)

Supported filter operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin

Respond ONLY with valid JSON in this exact format:
{
  "filters": { ... },
  "cleanedQuery": "remaining query text after removing filter terms"
}

Examples:
- Input: "high-risk electronics sellers from US"
  Output: {"filters":{"category":"ELECTRONICS","country":"US","riskScore":{"$gt":60}},"cleanedQuery":"sellers"}

- Input: "blocked sellers with chargebacks"
  Output: {"filters":{"status":"BLOCKED"},"cleanedQuery":"sellers with chargebacks"}

- Input: "recent fraud investigations"
  Output: {"filters":{},"cleanedQuery":"recent fraud investigations"}

- Input: "low risk approved transactions in Germany"
  Output: {"filters":{"riskLevel":"LOW","outcome":"APPROVED","country":"DE"},"cleanedQuery":"transactions"}

If no metadata filters can be extracted, return empty filters and the original query as cleanedQuery.`;

// ── Fallback patterns for regex-based extraction ──

const CATEGORY_PATTERNS = {
  ELECTRONICS: /\b(electronics?|tech|gadgets?|devices?|computers?|phones?)\b/i,
  FASHION: /\b(fashion|clothing|apparel|shoes?|accessories)\b/i,
  HOME_GARDEN: /\b(home|garden|furniture|decor|kitchen)\b/i,
  SPORTS: /\b(sports?|athletic|fitness|outdoor|exercise)\b/i,
  AUTOMOTIVE: /\b(automotive|car|vehicle|auto|motor)\b/i,
  FOOD: /\b(food|grocery|groceries|beverage|drink)\b/i,
  HEALTH: /\b(health|medical|pharmacy|wellness|supplement)\b/i,
  TOYS: /\b(toys?|games?|gaming|play)\b/i,
  BOOKS: /\b(books?|publishing|reading|literature)\b/i,
};

const COUNTRY_PATTERNS = {
  US: /\b(US|USA|United\s+States|America)\b/i,
  GB: /\b(UK|GB|United\s+Kingdom|Britain|British)\b/i,
  DE: /\b(DE|Germany|German|Deutschland)\b/i,
  FR: /\b(FR|France|French)\b/i,
  JP: /\b(JP|Japan|Japanese)\b/i,
  CN: /\b(CN|China|Chinese)\b/i,
  IN: /\b(IN|India|Indian)\b/i,
  BR: /\b(BR|Brazil|Brazilian)\b/i,
  AU: /\b(AU|Australia|Australian)\b/i,
  CA: /\b(CA|Canada|Canadian)\b/i,
};

const STATUS_PATTERNS = {
  ACTIVE: /\b(active)\b/i,
  BLOCKED: /\b(blocked)\b/i,
  SUSPENDED: /\b(suspended)\b/i,
  UNDER_REVIEW: /\b(under\s+review|pending\s+review|reviewing)\b/i,
  APPROVED: /\b(approved)\b/i,
  REJECTED: /\b(rejected|denied)\b/i,
};

const RISK_PATTERNS = {
  HIGH: /\b(high[\s-]?risk|risky|dangerous|suspicious)\b/i,
  CRITICAL: /\b(critical[\s-]?risk|extremely\s+risky|severe)\b/i,
  LOW: /\b(low[\s-]?risk|safe|low\s+risk)\b/i,
  MEDIUM: /\b(medium[\s-]?risk|moderate[\s-]?risk|moderate)\b/i,
};

const RISK_SCORE_THRESHOLDS = {
  LOW: { $lt: 30 },
  MEDIUM: { $gte: 30, $lt: 60 },
  HIGH: { $gt: 60 },
  CRITICAL: { $gt: 80 },
};

class SelfQueryEngine {
  constructor() {
    this.llmClient = getLLMClient();
    this.stats = {
      totalQueries: 0,
      llmSuccessCount: 0,
      fallbackCount: 0,
      parseErrors: 0,
    };

    console.log(`[SelfQueryEngine] Initialized (LLM ${this.llmClient?.enabled ? 'enabled' : 'disabled'})`);
  }

  /**
   * Generate Pinecone metadata filters from a natural language query.
   *
   * @param {string} query - Natural language query
   * @returns {Promise<{filters: Object, cleanedQuery: string}>}
   */
  async generateFilters(query) {
    // Handle null/undefined/empty input
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return { filters: {}, cleanedQuery: '' };
    }

    this.stats.totalQueries++;

    // Try LLM-powered filter generation first
    if (this.llmClient?.enabled) {
      try {
        const result = await this._llmGenerateFilters(query);
        if (result) {
          this.stats.llmSuccessCount++;
          return result;
        }
      } catch (e) {
        this.stats.parseErrors++;
        // Fall through to hardcoded fallback
      }
    }

    // Fallback: regex-based extraction
    this.stats.fallbackCount++;
    return this._fallbackGenerateFilters(query);
  }

  /**
   * Apply self-query filters to build Pinecone search parameters.
   *
   * @param {string} query - Natural language query
   * @param {string} namespace - Pinecone namespace
   * @param {number} [topK=5] - Number of results to return
   * @returns {Promise<{query: string, namespace: string, topK: number, filter: Object}>}
   */
  async applyToSearch(query, namespace, topK = 5) {
    const { filters, cleanedQuery } = await this.generateFilters(query);

    const searchParams = {
      query: cleanedQuery || query,
      namespace,
      topK,
    };

    // Only include filter if we have at least one filter key
    if (filters && Object.keys(filters).length > 0) {
      searchParams.filter = filters;
    }

    return searchParams;
  }

  /**
   * Get usage statistics.
   *
   * @returns {Object}
   */
  getStats() {
    return {
      llmEnabled: this.llmClient?.enabled || false,
      ...this.stats,
    };
  }

  // ── Private methods ──

  /**
   * Use LLM to generate metadata filters from natural language.
   * Returns null if LLM call fails or response cannot be parsed.
   */
  async _llmGenerateFilters(query) {
    const response = await this.llmClient.complete(
      SYSTEM_PROMPT,
      `Extract metadata filters from this query: "${query}"`,
      { temperature: 0.1, maxTokens: 512 }
    );

    if (!response?.content) return null;

    // Extract JSON from response (handle markdown code blocks)
    const jsonStr = this._extractJson(response.content);
    if (!jsonStr) return null;

    const parsed = JSON.parse(jsonStr);

    // Validate shape
    if (typeof parsed.filters !== 'object' || typeof parsed.cleanedQuery !== 'string') {
      return null;
    }

    return {
      filters: parsed.filters || {},
      cleanedQuery: parsed.cleanedQuery,
    };
  }

  /**
   * Extract JSON from LLM response, handling markdown code fences.
   */
  _extractJson(text) {
    if (!text) return null;

    // Try to find JSON in code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try to find raw JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0].trim();
    }

    return null;
  }

  /**
   * Fallback: use regex patterns to extract metadata filters.
   */
  _fallbackGenerateFilters(query) {
    const filters = {};
    let cleanedQuery = query;

    // Extract category
    for (const [category, pattern] of Object.entries(CATEGORY_PATTERNS)) {
      if (pattern.test(query)) {
        filters.category = category;
        cleanedQuery = cleanedQuery.replace(pattern, '').trim();
        break;
      }
    }

    // Extract country
    for (const [code, pattern] of Object.entries(COUNTRY_PATTERNS)) {
      if (pattern.test(query)) {
        filters.country = code;
        cleanedQuery = cleanedQuery.replace(pattern, '').trim();
        // Also remove "from" preposition if present
        cleanedQuery = cleanedQuery.replace(/\bfrom\s*$/i, '').trim();
        cleanedQuery = cleanedQuery.replace(/\bfrom\s+/i, '').trim();
        break;
      }
    }

    // Extract risk level
    for (const [level, pattern] of Object.entries(RISK_PATTERNS)) {
      if (pattern.test(query)) {
        filters.riskLevel = level;
        filters.riskScore = RISK_SCORE_THRESHOLDS[level];
        cleanedQuery = cleanedQuery.replace(pattern, '').trim();
        break;
      }
    }

    // Extract status
    for (const [status, pattern] of Object.entries(STATUS_PATTERNS)) {
      if (pattern.test(query)) {
        filters.status = status;
        cleanedQuery = cleanedQuery.replace(pattern, '').trim();
        break;
      }
    }

    // Clean up extra whitespace in cleaned query
    cleanedQuery = cleanedQuery.replace(/\s+/g, ' ').trim();

    return { filters, cleanedQuery };
  }
}

// Singleton
let instance = null;

export function getSelfQueryEngine() {
  if (!instance) {
    instance = new SelfQueryEngine();
  }
  return instance;
}

export default { SelfQueryEngine, getSelfQueryEngine };
