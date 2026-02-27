/**
 * LLM Client - Anthropic Claude Integration
 *
 * Provides LLM reasoning capabilities to agents with:
 * - Singleton pattern for shared client
 * - Graceful fallback when API key absent
 * - Retry with exponential backoff
 * - Usage/latency stats tracking
 * - Response caching (hash-based, TTL-aware)
 * - Cost tracking with per-agent attribution
 */

import { getLLMCache } from './llm-cache.js';
import { getCostTracker } from './cost-tracker.js';

let Anthropic = null;
try {
  const mod = await import('@anthropic-ai/sdk');
  Anthropic = mod.default || mod.Anthropic;
} catch (e) {
  // SDK not installed — LLM features disabled
}

const MODEL = 'claude-sonnet-4-20250514';
const TEMPERATURE = 0.3;
const MAX_TOKENS = 2048;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

class LLMClient {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.stats = {
      calls: 0,
      totalTokens: 0,
      errors: 0,
      totalLatencyMs: 0
    };
    this.repairStats = { attempts: 0, successes: 0 };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const useLLM = process.env.USE_LLM === 'true';

    if (Anthropic && apiKey && apiKey !== 'your_anthropic_key' && useLLM) {
      try {
        this.client = new Anthropic({ apiKey });
        this.enabled = true;
        console.log('LLM Client initialized (Claude enabled)');
      } catch (e) {
        console.warn('LLM Client: Failed to initialize Anthropic SDK:', e.message);
      }
    } else {
      const reasons = [];
      if (!Anthropic) reasons.push('SDK not installed');
      if (!apiKey || apiKey === 'your_anthropic_key') reasons.push('no API key');
      if (!useLLM) reasons.push('USE_LLM not true');
      console.log(`LLM Client disabled (${reasons.join(', ')}). Agents use hardcoded logic.`);
    }
  }

  /**
   * Call Claude with system + user prompts.
   * Returns { content, usage, latencyMs, toolUse, cached? } or null on failure.
   *
   * Options:
   *   - model: override model
   *   - maxTokens: override max tokens
   *   - temperature: override temperature
   *   - agentId: caller agent ID for cost attribution
   *   - skipCache: if true, bypass response cache
   */
  async complete(systemPrompt, userPrompt, options = {}) {
    if (!this.enabled) return null;

    const model = options.model || MODEL;
    const temperature = options.temperature ?? TEMPERATURE;
    const agentId = options.agentId || 'SYSTEM';

    // Check cache first (unless explicitly skipped)
    if (!options.skipCache) {
      const cache = getLLMCache();
      const cached = cache.get(model, temperature, systemPrompt, userPrompt);
      if (cached) {
        this.stats.calls++;
        return cached;
      }
    }

    const startTime = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.messages.create({
          model,
          max_tokens: options.maxTokens || MAX_TOKENS,
          temperature,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        });

        const latencyMs = Date.now() - startTime;
        const inputTokens = response.usage?.input_tokens || 0;
        const outputTokens = response.usage?.output_tokens || 0;

        this.stats.calls++;
        this.stats.totalTokens += inputTokens + outputTokens;
        this.stats.totalLatencyMs += latencyMs;

        // Record cost
        const costTracker = getCostTracker();
        costTracker.recordCost(agentId, model, inputTokens, outputTokens, latencyMs);

        const content = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n');

        const toolUse = response.content.find(b => b.type === 'tool_use') || null;

        const result = {
          content,
          usage: { inputTokens, outputTokens },
          latencyMs,
          toolUse
        };

        // Store in cache
        if (!options.skipCache) {
          const cache = getLLMCache();
          cache.set(model, temperature, systemPrompt, userPrompt, result);
        }

        return result;
      } catch (error) {
        lastError = error;
        const status = error?.status || error?.statusCode;

        if (status === 429 || status >= 500) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        // Non-retryable error
        break;
      }
    }

    this.stats.errors++;
    console.warn('LLM Client: Call failed after retries:', lastError?.message);
    return null;
  }

  /**
   * Parse LLM output into chain-of-thought step types
   */
  parseReasoning(text) {
    if (!text) return [];

    const steps = [];
    const lines = text.split('\n').filter(l => l.trim());

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(observ|notic|see|detect|found)/i.test(trimmed)) {
        steps.push({ type: 'observation', content: trimmed });
      } else if (/^(hypothes|suspect|likely|could be|might be|possibly)/i.test(trimmed)) {
        steps.push({ type: 'hypothesis', content: trimmed });
      } else if (/^(evidence|data shows|confirms|indicates|the .* shows)/i.test(trimmed)) {
        steps.push({ type: 'evidence', content: trimmed });
      } else if (/^(therefore|conclusion|recommend|decision|verdict|based on)/i.test(trimmed)) {
        steps.push({ type: 'conclusion', content: trimmed });
      } else if (trimmed.length > 10) {
        steps.push({ type: 'analysis', content: trimmed });
      }
    }

    return steps;
  }

  /**
   * Attempt to parse JSON from LLM text output.
   * Handles plain JSON, markdown ```json blocks, and plain ``` blocks.
   * @param {string} text - Raw LLM output
   * @returns {Object|Array|null} Parsed JSON or null on failure
   */
  _tryParseJson(text) {
    if (!text) return null;

    // Try extracting from markdown code blocks first (```json ... ``` or ``` ... ```)
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (e) {
        // Fall through to general extraction
      }
    }

    // Try to extract a JSON object { ... }
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (e) {
        // Fall through
      }
    }

    // Try to extract a JSON array [ ... ]
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch (e) {
        // Fall through
      }
    }

    return null;
  }

  /**
   * Call LLM and parse JSON from the response, with one repair retry on parse failure.
   *
   * Flow:
   *   1. If LLM not enabled, return fallback immediately.
   *   2. Call this.complete() and try to parse JSON from the response.
   *   3. If parse fails, build a repair prompt with the raw output + expected schema,
   *      call complete() again (max 1 repair = 2 total LLM calls).
   *   4. Track repair success rate in this.repairStats.
   *   5. If both fail, return fallback.
   *
   * @param {string} systemPrompt - System prompt for LLM
   * @param {string} userPrompt - User prompt for LLM
   * @param {Object} schema - Expected JSON schema (used in repair prompt)
   * @param {*} fallback - Value to return if all parsing fails
   * @returns {Promise<Object>} Parsed JSON or fallback
   */
  async completeWithJsonRetry(systemPrompt, userPrompt, schema, fallback) {
    if (!this.enabled) return fallback;

    // First attempt
    const firstResponse = await this.complete(systemPrompt, userPrompt);
    if (!firstResponse) return fallback;

    const firstParsed = this._tryParseJson(firstResponse.content);
    if (firstParsed !== null) return firstParsed;

    // First parse failed — attempt repair
    this.repairStats.attempts++;

    const repairPrompt =
      `The previous response could not be parsed as valid JSON.\n\n` +
      `Raw output:\n${firstResponse.content}\n\n` +
      `Expected JSON schema:\n${JSON.stringify(schema, null, 2)}\n\n` +
      `Please respond with ONLY valid JSON matching the schema above. No explanation, no markdown.`;

    const repairResponse = await this.complete(systemPrompt, repairPrompt);
    if (!repairResponse) return fallback;

    const repairParsed = this._tryParseJson(repairResponse.content);
    if (repairParsed !== null) {
      this.repairStats.successes++;
      return repairParsed;
    }

    return fallback;
  }

  /**
   * Get stats summary
   */
  getStats() {
    return {
      enabled: this.enabled,
      model: MODEL,
      ...this.stats,
      avgLatencyMs: this.stats.calls > 0
        ? Math.round(this.stats.totalLatencyMs / this.stats.calls)
        : 0,
      cache: getLLMCache().getStats(),
      cost: getCostTracker().getSystemCost()
    };
  }
}

// Singleton
let instance = null;

export function getLLMClient() {
  if (!instance) {
    instance = new LLMClient();
  }
  return instance;
}

export default { getLLMClient };
