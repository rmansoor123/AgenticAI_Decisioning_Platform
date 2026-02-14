/**
 * Tool Executor - Generic tool execution framework with tracing
 */

import { getMetricsCollector } from './metrics-collector.js';
import { getTraceCollector } from './trace-collector.js';

class ToolExecutor {
  constructor(agentId) {
    this.agentId = agentId;
    this.metrics = getMetricsCollector();
    this.tracer = getTraceCollector();
  }

  async execute(toolName, handler, params, traceId = null) {
    const startTime = Date.now();

    if (traceId) {
      this.tracer.startSpan(traceId, `tool:${toolName}`, { params });
    }

    try {
      const result = await handler(params);
      const duration = Date.now() - startTime;

      this.metrics.recordToolUse(this.agentId, toolName, duration, true);

      if (traceId) {
        this.tracer.endSpan(traceId, `tool:${toolName}`, { success: true, duration });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.recordToolUse(this.agentId, toolName, duration, false);

      if (traceId) {
        this.tracer.endSpan(traceId, `tool:${toolName}`, { success: false, error: error.message });
      }

      throw error;
    }
  }
}

export function createToolExecutor(agentId) {
  return new ToolExecutor(agentId);
}

export default { ToolExecutor, createToolExecutor };
