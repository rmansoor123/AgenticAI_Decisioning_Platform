/**
 * LLM Client - Anthropic Claude Integration
 *
 * Provides LLM reasoning capabilities to agents with:
 * - Singleton pattern for shared client
 * - Graceful fallback when API key absent
 * - Retry with exponential backoff
 * - Usage/latency stats tracking
 */

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
   * Call Claude with system + user prompts
   * Returns { content, usage, latencyMs, toolUse } or null on failure
   */
  async complete(systemPrompt, userPrompt, options = {}) {
    if (!this.enabled) return null;

    const startTime = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: options.model || MODEL,
          max_tokens: options.maxTokens || MAX_TOKENS,
          temperature: options.temperature ?? TEMPERATURE,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        });

        const latencyMs = Date.now() - startTime;
        const inputTokens = response.usage?.input_tokens || 0;
        const outputTokens = response.usage?.output_tokens || 0;

        this.stats.calls++;
        this.stats.totalTokens += inputTokens + outputTokens;
        this.stats.totalLatencyMs += latencyMs;

        const content = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n');

        const toolUse = response.content.find(b => b.type === 'tool_use') || null;

        return {
          content,
          usage: { inputTokens, outputTokens },
          latencyMs,
          toolUse
        };
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
   * Get stats summary
   */
  getStats() {
    return {
      enabled: this.enabled,
      model: MODEL,
      ...this.stats,
      avgLatencyMs: this.stats.calls > 0
        ? Math.round(this.stats.totalLatencyMs / this.stats.calls)
        : 0
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
