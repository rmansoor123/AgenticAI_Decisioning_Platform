/**
 * LLM Client - Multi-Provider (Ollama + OpenAI + Anthropic)
 *
 * Provides LLM reasoning capabilities to agents with:
 * - Ollama, OpenAI, and Anthropic provider support (LLM_PROVIDER env var)
 * - Singleton pattern for shared client
 * - Graceful fallback when API key absent
 * - Retry with exponential backoff
 * - Usage/latency stats tracking
 * - Response caching (hash-based, TTL-aware)
 * - Cost tracking with per-agent attribution
 */

import { getLLMCache } from './llm-cache.js';
import { getCostTracker } from './cost-tracker.js';

// Dynamic SDK imports
let Anthropic = null;
let OpenAI = null;

try {
  const mod = await import('@anthropic-ai/sdk');
  Anthropic = mod.default || mod.Anthropic;
} catch (e) {
  // Anthropic SDK not installed
}

try {
  const mod = await import('openai');
  OpenAI = mod.default || mod.OpenAI;
} catch (e) {
  // OpenAI SDK not installed
}

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'ollama'; // 'ollama' | 'openai' | 'anthropic'

const DEFAULT_MODELS = {
  ollama: 'qwen2.5:7b',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001'
};

const MODEL = process.env.LLM_MODEL || DEFAULT_MODELS[LLM_PROVIDER] || 'gpt-4o-mini';
const TEMPERATURE = 0.3;
const MAX_TOKENS = 2048;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const RATE_LIMIT_DELAY_MS = 15000;

class LLMClient {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.provider = LLM_PROVIDER;
    this.stats = {
      calls: 0,
      totalTokens: 0,
      errors: 0,
      totalLatencyMs: 0
    };
    this.repairStats = { attempts: 0, successes: 0 };

    const useLLM = process.env.USE_LLM === 'true';

    if (!useLLM) {
      console.log('LLM Client disabled (USE_LLM not true). Agents use hardcoded logic.');
      return;
    }

    if (this.provider === 'openai') {
      this._initOpenAI();
    } else if (this.provider === 'ollama') {
      this._initOllama();
    } else {
      this._initAnthropic();
    }
  }

  _initOpenAI() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (OpenAI && apiKey && apiKey !== 'your_openai_key') {
      try {
        this.client = new OpenAI({ apiKey });
        this.enabled = true;
        console.log(`LLM Client initialized (OpenAI, model: ${MODEL})`);
      } catch (e) {
        console.warn('LLM Client: Failed to initialize OpenAI SDK:', e.message);
      }
    } else {
      const reasons = [];
      if (!OpenAI) reasons.push('SDK not installed');
      if (!apiKey || apiKey === 'your_openai_key') reasons.push('no OPENAI_API_KEY');
      console.log(`LLM Client: OpenAI disabled (${reasons.join(', ')}). Agents use hardcoded logic.`);
    }
  }

  _initOllama() {
    const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
    if (OpenAI) {
      try {
        this.client = new OpenAI({ baseURL, apiKey: 'ollama' });
        this.enabled = true;
        console.log(`LLM Client initialized (Ollama, model: ${MODEL}, baseURL: ${baseURL})`);
      } catch (e) {
        console.warn('LLM Client: Failed to initialize Ollama via OpenAI SDK:', e.message);
      }
    } else {
      console.log('LLM Client: Ollama disabled (OpenAI SDK not installed — required for OpenAI-compatible API). Agents use hardcoded logic.');
    }
  }

  _initAnthropic() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (Anthropic && apiKey && apiKey !== 'your_anthropic_key') {
      try {
        this.client = new Anthropic({ apiKey });
        this.enabled = true;
        console.log(`LLM Client initialized (Anthropic Claude, model: ${MODEL})`);
      } catch (e) {
        console.warn('LLM Client: Failed to initialize Anthropic SDK:', e.message);
      }
    } else {
      const reasons = [];
      if (!Anthropic) reasons.push('SDK not installed');
      if (!apiKey || apiKey === 'your_anthropic_key') reasons.push('no ANTHROPIC_API_KEY');
      console.log(`LLM Client: Anthropic disabled (${reasons.join(', ')}). Agents use hardcoded logic.`);
    }
  }

  /**
   * Call LLM with system + user prompts.
   * Routes to OpenAI or Anthropic based on provider.
   */
  async complete(systemPrompt, userPrompt, options = {}) {
    if (!this.enabled) return null;

    const model = options.model || MODEL;
    const temperature = options.temperature ?? TEMPERATURE;
    const agentId = options.agentId || 'SYSTEM';

    // Check cache first
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
        let result;
        if (this.provider === 'openai' || this.provider === 'ollama') {
          result = await this._callOpenAI(model, temperature, systemPrompt, userPrompt, options);
        } else {
          result = await this._callAnthropic(model, temperature, systemPrompt, userPrompt, options);
        }

        const latencyMs = Date.now() - startTime;
        const { inputTokens, outputTokens, content, toolUse } = result;

        this.stats.calls++;
        this.stats.totalTokens += inputTokens + outputTokens;
        this.stats.totalLatencyMs += latencyMs;

        const costTracker = getCostTracker();
        costTracker.recordCost(agentId, model, inputTokens, outputTokens, latencyMs);

        const finalResult = {
          content,
          usage: { inputTokens, outputTokens },
          latencyMs,
          toolUse
        };

        if (!options.skipCache) {
          const cache = getLLMCache();
          cache.set(model, temperature, systemPrompt, userPrompt, finalResult);
        }

        return finalResult;
      } catch (error) {
        lastError = error;
        const status = error?.status || error?.statusCode || error?.code;

        if (status === 429 || status === 'rate_limit_exceeded') {
          const delay = RATE_LIMIT_DELAY_MS * (attempt + 1);
          console.warn(`LLM Client: Rate limited, waiting ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        if (typeof status === 'number' && status >= 500) {
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

  async _callOpenAI(model, temperature, systemPrompt, userPrompt, options) {
    const response = await this.client.chat.completions.create({
      model,
      max_tokens: options.maxTokens || MAX_TOKENS,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const choice = response.choices?.[0];
    const content = choice?.message?.content || '';
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;

    // OpenAI tool calls (if any)
    const toolCalls = choice?.message?.tool_calls;
    const toolUse = toolCalls?.[0] ? {
      type: 'tool_use',
      name: toolCalls[0].function?.name,
      input: JSON.parse(toolCalls[0].function?.arguments || '{}')
    } : null;

    return { content, inputTokens, outputTokens, toolUse };
  }

  async _callAnthropic(model, temperature, systemPrompt, userPrompt, options) {
    const response = await this.client.messages.create({
      model,
      max_tokens: options.maxTokens || MAX_TOKENS,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const content = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    const toolUse = response.content.find(b => b.type === 'tool_use') || null;
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;

    return { content, inputTokens, outputTokens, toolUse };
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
   */
  _tryParseJson(text) {
    if (!text) return null;

    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (e) { /* fall through */ }
    }

    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (e) { /* fall through */ }
    }

    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch (e) { /* fall through */ }
    }

    return null;
  }

  /**
   * Call LLM and parse JSON from the response, with one repair retry on parse failure.
   */
  async completeWithJsonRetry(systemPrompt, userPrompt, schema, fallback) {
    if (!this.enabled) return fallback;

    const firstResponse = await this.complete(systemPrompt, userPrompt);
    if (!firstResponse) return fallback;

    const firstParsed = this._tryParseJson(firstResponse.content);
    if (firstParsed !== null) return firstParsed;

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
    const stats = {
      enabled: this.enabled,
      provider: this.provider,
      model: MODEL,
      ...this.stats,
      avgLatencyMs: this.stats.calls > 0
        ? Math.round(this.stats.totalLatencyMs / this.stats.calls)
        : 0,
      cache: getLLMCache().getStats(),
      cost: getCostTracker().getSystemCost()
    };
    if (this.provider === 'ollama') {
      stats.ollamaBaseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
    }
    return stats;
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
