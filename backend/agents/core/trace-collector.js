/**
 * Trace Collector - Span-based distributed tracing
 */

import { db_ops } from '../../shared/common/database.js';

class TraceCollector {
  constructor() {
    this.activeTraces = new Map();
    this.completedTraces = [];
    this.maxCompleted = 200;
    this.stats = { tracesStarted: 0, tracesCompleted: 0, spansCreated: 0 };
  }

  startTrace(traceId, agentId, input) {
    const trace = {
      traceId,
      agentId,
      input: typeof input === 'string' ? input : JSON.stringify(input).slice(0, 500),
      spans: [],
      startTime: Date.now(),
      startedAt: new Date().toISOString(),
      endTime: null,
      duration: null,
      status: 'active'
    };
    this.activeTraces.set(traceId, trace);
    this.stats.tracesStarted++;
    return trace;
  }

  startSpan(traceId, spanName, data = {}) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return null;

    const span = {
      spanName,
      data: typeof data === 'string' ? data : JSON.stringify(data).slice(0, 300),
      startTime: Date.now(),
      startedAt: new Date().toISOString(),
      endTime: null,
      duration: null,
      status: 'active'
    };
    trace.spans.push(span);
    this.stats.spansCreated++;
    return span;
  }

  endSpan(traceId, spanName, result = {}) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return null;

    const span = trace.spans.find(s => s.spanName === spanName && s.status === 'active');
    if (!span) return null;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = result.success !== false ? 'completed' : 'failed';
    span.result = typeof result === 'string' ? result : JSON.stringify(result).slice(0, 300);
    return span;
  }

  endTrace(traceId, result = {}) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return null;

    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.status = result.success !== false ? 'completed' : 'failed';
    trace.result = typeof result === 'string' ? result : JSON.stringify(result).slice(0, 200);
    trace.completedAt = new Date().toISOString();

    // Close any open spans
    for (const span of trace.spans) {
      if (span.status === 'active') {
        span.endTime = trace.endTime;
        span.duration = span.endTime - span.startTime;
        span.status = 'auto-closed';
      }
    }

    this.activeTraces.delete(traceId);
    this.completedTraces.push(trace);
    if (this.completedTraces.length > this.maxCompleted) {
      this.completedTraces = this.completedTraces.slice(-this.maxCompleted);
    }

    // Persist to database
    db_ops.insert('agent_traces', 'trace_id', traceId, trace);
    this.stats.tracesCompleted++;

    return trace;
  }

  getTrace(traceId) {
    return this.activeTraces.get(traceId) || this.completedTraces.find(t => t.traceId === traceId) || null;
  }

  getRecentTraces(limit = 20, agentId = null) {
    let traces = [...this.completedTraces];
    if (agentId) {
      traces = traces.filter(t => t.agentId === agentId);
    }
    return traces.slice(-limit).reverse();
  }

  getStats() {
    return {
      ...this.stats,
      activeTraces: this.activeTraces.size,
      completedTraces: this.completedTraces.length
    };
  }
}

let instance = null;

export function getTraceCollector() {
  if (!instance) {
    instance = new TraceCollector();
  }
  return instance;
}

export default { TraceCollector, getTraceCollector };
