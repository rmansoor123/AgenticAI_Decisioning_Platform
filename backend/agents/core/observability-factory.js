/**
 * Observability factory — routes to Langfuse, Phoenix, or SQLite-based collectors
 * based on OBSERVABILITY_BACKEND env var ('langfuse' | 'phoenix' | 'sqlite').
 *
 * Usage:
 *   import {
 *     getObservabilityTraceCollector,
 *     getObservabilityMetricsCollector,
 *     getObservabilityDecisionLogger,
 *     getObservabilityCostTracker,
 *   } from './observability-factory.js';
 */

let resolvedTrace = null;
let resolvedMetrics = null;
let resolvedDecision = null;
let resolvedCost = null;

const EVAL_SERVICE_URL = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';

/**
 * Get the observability backend type.
 * @returns {'langfuse' | 'phoenix' | 'sqlite'}
 */
export function getObservabilityBackendType() {
  return (process.env.OBSERVABILITY_BACKEND || 'sqlite').toLowerCase();
}

/**
 * Phoenix trace collector — forwards traces to Phoenix via the eval service.
 * Wraps the SQLite trace collector and additionally sends to Phoenix.
 */
function createPhoenixTraceCollector(sqliteCollector) {
  return {
    async startTrace(agentId, input, context) {
      const traceId = await sqliteCollector.startTrace(agentId, input, context);
      return traceId;
    },

    async addSpan(traceId, name, data) {
      await sqliteCollector.addSpan(traceId, name, data);
    },

    async endTrace(traceId, result) {
      const traceResult = await sqliteCollector.endTrace(traceId, result);

      // Fire-and-forget: forward trace to Phoenix
      try {
        fetch(`${EVAL_SERVICE_URL}/phoenix/trace`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trace_id: traceId,
            agent_id: traceResult?.agentId || 'unknown',
            spans: [],
            input: JSON.stringify(traceResult?.input || '').slice(0, 1000),
            output: JSON.stringify(result || '').slice(0, 1000),
            metadata: { duration_ms: traceResult?.durationMs },
          }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => {});
      } catch (_) { /* fire-and-forget */ }

      return traceResult;
    },

    getTrace(traceId) {
      return sqliteCollector.getTrace(traceId);
    },

    getRecentTraces(agentId, limit) {
      return sqliteCollector.getRecentTraces(agentId, limit);
    },

    getStats() {
      return sqliteCollector.getStats();
    },
  };
}

/**
 * Get the trace collector (Langfuse, Phoenix, or SQLite).
 */
export async function getObservabilityTraceCollector() {
  if (resolvedTrace) return resolvedTrace;

  const backend = getObservabilityBackendType();

  if (backend === 'langfuse') {
    try {
      const { getLangfuseTraceCollector } = await import('./observability-langfuse.js');
      resolvedTrace = getLangfuseTraceCollector();
      console.log('[observability-factory] Trace collector: Langfuse');
      return resolvedTrace;
    } catch (err) {
      console.warn(`[observability-factory] Langfuse trace init failed: ${err.message}`);
    }
  }

  if (backend === 'phoenix') {
    try {
      const { getTraceCollector } = await import('./trace-collector.js');
      const sqliteCollector = getTraceCollector();
      resolvedTrace = createPhoenixTraceCollector(sqliteCollector);
      console.log('[observability-factory] Trace collector: Phoenix (+ SQLite)');
      return resolvedTrace;
    } catch (err) {
      console.warn(`[observability-factory] Phoenix trace init failed: ${err.message}`);
    }
  }

  const { getTraceCollector } = await import('./trace-collector.js');
  resolvedTrace = getTraceCollector();
  console.log('[observability-factory] Trace collector: SQLite');
  return resolvedTrace;
}

/**
 * Get the metrics collector (Langfuse or SQLite).
 */
export async function getObservabilityMetricsCollector() {
  if (resolvedMetrics) return resolvedMetrics;

  if (getObservabilityBackendType() === 'langfuse') {
    try {
      const { getLangfuseMetricsCollector } = await import('./observability-langfuse.js');
      resolvedMetrics = getLangfuseMetricsCollector();
      console.log('[observability-factory] Metrics collector: Langfuse');
      return resolvedMetrics;
    } catch (err) {
      console.warn(`[observability-factory] Langfuse metrics init failed: ${err.message}`);
    }
  }

  const { getMetricsCollector } = await import('./metrics-collector.js');
  resolvedMetrics = getMetricsCollector();
  console.log('[observability-factory] Metrics collector: SQLite');
  return resolvedMetrics;
}

/**
 * Get the decision logger (Langfuse or SQLite).
 */
export async function getObservabilityDecisionLogger() {
  if (resolvedDecision) return resolvedDecision;

  if (getObservabilityBackendType() === 'langfuse') {
    try {
      const { getLangfuseDecisionLogger } = await import('./observability-langfuse.js');
      resolvedDecision = getLangfuseDecisionLogger();
      console.log('[observability-factory] Decision logger: Langfuse');
      return resolvedDecision;
    } catch (err) {
      console.warn(`[observability-factory] Langfuse decision init failed: ${err.message}`);
    }
  }

  const { getDecisionLogger } = await import('./decision-logger.js');
  resolvedDecision = getDecisionLogger();
  console.log('[observability-factory] Decision logger: SQLite');
  return resolvedDecision;
}

/**
 * Get the cost tracker (Langfuse or SQLite).
 */
export async function getObservabilityCostTracker() {
  if (resolvedCost) return resolvedCost;

  if (getObservabilityBackendType() === 'langfuse') {
    try {
      const { getLangfuseCostTracker } = await import('./observability-langfuse.js');
      resolvedCost = getLangfuseCostTracker();
      console.log('[observability-factory] Cost tracker: Langfuse');
      return resolvedCost;
    } catch (err) {
      console.warn(`[observability-factory] Langfuse cost init failed: ${err.message}`);
    }
  }

  const { getCostTracker } = await import('./cost-tracker.js');
  resolvedCost = getCostTracker();
  console.log('[observability-factory] Cost tracker: SQLite');
  return resolvedCost;
}
