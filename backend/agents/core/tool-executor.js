/**
 * Tool Executor - Generic tool execution with retry, caching, and tracing.
 *
 * Features:
 * - Exponential backoff retry (up to 3 attempts)
 * - LRU result cache (deduplicates identical calls)
 * - Schema validation for tool outputs (when schemas registered)
 * - Tracing and metrics integration
 */

import { getMetricsCollector } from './metrics-collector.js';
import { getTraceCollector } from './trace-collector.js';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const CACHE_MAX_SIZE = 200;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class ToolResultCache {
  constructor(maxSize = CACHE_MAX_SIZE, ttlMs = CACHE_TTL_MS) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  _makeKey(toolName, params) {
    return `${toolName}::${JSON.stringify(params || {})}`;
  }

  get(toolName, params) {
    const key = this._makeKey(toolName, params);
    const entry = this.cache.get(key);
    if (!entry) { this.stats.misses++; return null; }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result;
  }

  set(toolName, params, result) {
    const key = this._makeKey(toolName, params);
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
      this.stats.evictions++;
    }
    this.cache.set(key, { result, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(toolName, params) {
    if (params) {
      this.cache.delete(this._makeKey(toolName, params));
    } else {
      // Invalidate all entries for this tool
      for (const key of Array.from(this.cache.keys())) {
        if (key.startsWith(`${toolName}::`)) this.cache.delete(key);
      }
    }
  }

  clear() { this.cache.clear(); }

  getStats() {
    return { ...this.stats, size: this.cache.size, maxSize: this.maxSize };
  }
}

class ToolExecutor {
  constructor(agentId, options = {}) {
    this.agentId = agentId;
    this.metrics = getMetricsCollector();
    this.tracer = getTraceCollector();
    this.maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;
    this.baseDelay = options.baseDelay || DEFAULT_BASE_DELAY_MS;
    this.cache = new ToolResultCache(options.cacheSize, options.cacheTtl);
    this.schemas = new Map(); // toolName → schema for output validation
    this.stats = { executions: 0, retries: 0, retriesExhausted: 0 };
  }

  /**
   * Register an expected output schema for a tool.
   */
  registerToolSchema(toolName, schema) {
    this.schemas.set(toolName, schema);
  }

  /**
   * Execute a tool with retry, caching, and optional schema validation.
   */
  async execute(toolName, handler, params, traceId = null, options = {}) {
    const { skipCache = false, skipRetry = false } = options;
    this.stats.executions++;

    // Check cache first
    if (!skipCache) {
      const cached = this.cache.get(toolName, params);
      if (cached !== null) {
        if (traceId) {
          this.tracer.startSpan(traceId, `tool:${toolName}`, { params, cached: true });
          this.tracer.endSpan(traceId, `tool:${toolName}`, { success: true, cached: true });
        }
        return cached;
      }
    }

    const maxAttempts = skipRetry ? 1 : this.maxRetries;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startTime = Date.now();

      if (traceId && attempt === 1) {
        this.tracer.startSpan(traceId, `tool:${toolName}`, { params, attempt });
      }

      try {
        const result = await handler(params);
        const duration = Date.now() - startTime;

        this.metrics.recordToolUse(this.agentId, toolName, duration, true);

        // Validate output schema if registered
        const schema = this.schemas.get(toolName);
        if (schema && result?.data) {
          const validation = this._validateOutput(result.data, schema);
          if (!validation.valid) {
            result._schemaWarnings = validation.errors;
          }
        }

        // Cache successful result
        if (result?.success !== false) {
          this.cache.set(toolName, params, result);
        }

        if (traceId) {
          this.tracer.endSpan(traceId, `tool:${toolName}`, { success: true, duration, attempt });
        }

        return result;
      } catch (error) {
        lastError = error;
        const duration = Date.now() - startTime;

        if (attempt < maxAttempts) {
          this.stats.retries++;
          // Exponential backoff: 500ms, 1000ms, 2000ms
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, delay));
        } else {
          this.stats.retriesExhausted++;
          this.metrics.recordToolUse(this.agentId, toolName, duration, false);

          if (traceId) {
            this.tracer.endSpan(traceId, `tool:${toolName}`, {
              success: false,
              error: error.message,
              attempts: attempt
            });
          }
        }
      }
    }

    throw lastError;
  }

  _validateOutput(data, schema) {
    const errors = [];
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in data)) errors.push(`Missing required field: ${key}`);
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data && propSchema.type) {
          const actualType = Array.isArray(data[key]) ? 'array' : typeof data[key];
          if (actualType !== propSchema.type) {
            errors.push(`Field '${key}': expected ${propSchema.type}, got ${actualType}`);
          }
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  getCacheStats() { return this.cache.getStats(); }
  getStats() { return { ...this.stats, cache: this.cache.getStats() }; }
}

export function createToolExecutor(agentId, options) {
  return new ToolExecutor(agentId, options);
}

export { ToolResultCache };
export default { ToolExecutor, ToolResultCache, createToolExecutor };
