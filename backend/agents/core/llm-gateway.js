/**
 * LLM Gateway — unified interface for calling any LLM provider.
 * Supports: OpenAI, Anthropic, Ollama, Mistral, Groq, Together AI.
 * Automatically routes based on model name prefix.
 *
 * Usage:
 *   const gateway = getLLMGateway();
 *   const result = await gateway.complete({ model: 'gpt-4o-mini', messages: [...] });
 *   const result = await gateway.complete({ model: 'claude-haiku-4-5-20251001', messages: [...] });
 *   const result = await gateway.complete({ model: 'mistral-small', messages: [...] });
 */

const PROVIDER_CONFIGS = {
  openai: {
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: () => process.env.OPENAI_API_KEY,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o3'],
    matchPrefix: (model) => model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')
  },
  anthropic: {
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
    apiKey: () => process.env.ANTHROPIC_API_KEY,
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    matchPrefix: (model) => model.startsWith('claude-')
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    apiKey: () => 'ollama',
    models: ['qwen2.5:7b', 'llama3:8b', 'mistral:7b', 'codellama:7b'],
    matchPrefix: (model) => model.includes(':') || model.startsWith('llama') || model.startsWith('qwen')
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1',
    apiKey: () => process.env.MISTRAL_API_KEY,
    models: ['mistral-small', 'mistral-medium', 'mistral-large'],
    matchPrefix: (model) => model.startsWith('mistral-')
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: () => process.env.GROQ_API_KEY,
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    matchPrefix: (model) => model.startsWith('llama-3') || model.startsWith('mixtral-')
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1',
    apiKey: () => process.env.TOGETHER_API_KEY,
    models: ['meta-llama/Llama-3-70b-chat-hf'],
    matchPrefix: (model) => model.includes('/')
  }
};

class LLMGateway {
  constructor() {
    this.stats = { calls: 0, byProvider: {}, byModel: {}, totalTokens: 0, errors: 0 };
    this.defaultModel = process.env.LLM_MODEL || 'gpt-4o-mini';
    this.defaultProvider = process.env.LLM_PROVIDER || 'openai';
  }

  _resolveProvider(model) {
    for (const [name, config] of Object.entries(PROVIDER_CONFIGS)) {
      if (config.matchPrefix(model)) return { name, config };
    }
    // Fallback to default provider
    return { name: this.defaultProvider, config: PROVIDER_CONFIGS[this.defaultProvider] || PROVIDER_CONFIGS.openai };
  }

  async complete({ model, messages, maxTokens = 1000, temperature = 0.7, jsonMode = false }) {
    const effectiveModel = model || this.defaultModel;
    const { name: providerName, config } = this._resolveProvider(effectiveModel);
    const apiKey = config.apiKey();

    if (!apiKey || (apiKey === 'ollama' && providerName !== 'ollama')) {
      throw new Error(`No API key for provider ${providerName}. Set the appropriate env var.`);
    }

    const startTime = Date.now();
    this.stats.calls++;
    this.stats.byProvider[providerName] = (this.stats.byProvider[providerName] || 0) + 1;
    this.stats.byModel[effectiveModel] = (this.stats.byModel[effectiveModel] || 0) + 1;

    try {
      const body = {
        model: effectiveModel,
        messages,
        max_tokens: maxTokens,
        temperature
      };
      if (jsonMode) body.response_format = { type: 'json_object' };

      // Anthropic uses different API format
      if (providerName === 'anthropic') {
        return await this._callAnthropic(config, body, startTime);
      }

      // All others use OpenAI-compatible API
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        const error = await response.text();
        this.stats.errors++;
        throw new Error(`${providerName} API error ${response.status}: ${error.substring(0, 200)}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const tokens = data.usage?.total_tokens || 0;
      this.stats.totalTokens += tokens;

      return {
        content, provider: providerName, model: effectiveModel,
        tokens, latencyMs: Date.now() - startTime,
        finishReason: data.choices?.[0]?.finish_reason
      };
    } catch (err) {
      this.stats.errors++;
      throw err;
    }
  }

  async _callAnthropic(config, body, startTime) {
    const systemMsg = body.messages.find(m => m.role === 'system');
    const userMsgs = body.messages.filter(m => m.role !== 'system');

    const response = await fetch(`${config.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: body.model,
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        system: systemMsg?.content || '',
        messages: userMsgs.map(m => ({ role: m.role, content: m.content }))
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${error.substring(0, 200)}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    this.stats.totalTokens += tokens;

    return {
      content, provider: 'anthropic', model: body.model,
      tokens, latencyMs: Date.now() - startTime,
      finishReason: data.stop_reason
    };
  }

  getAvailableModels() {
    const available = {};
    for (const [name, config] of Object.entries(PROVIDER_CONFIGS)) {
      const hasKey = config.apiKey() && config.apiKey() !== 'ollama';
      available[name] = {
        available: name === 'ollama' || !!hasKey,
        models: config.models,
        baseUrl: config.baseUrl
      };
    }
    return available;
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getLLMGateway() {
  if (!instance) instance = new LLMGateway();
  return instance;
}
export default { getLLMGateway };
