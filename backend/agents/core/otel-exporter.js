/**
 * OpenTelemetry Exporter - Exports traces in OTLP JSON format.
 *
 * Converts our internal trace format (from trace-collector.js) into
 * OpenTelemetry-compatible OTLP JSON for external observability platforms.
 *
 * No OTel SDK dependency — pure JSON formatting + HTTP export.
 */

import { getTraceCollector } from './trace-collector.js';

const OTLP_ENDPOINT = process.env.OTLP_ENDPOINT || null;
const SERVICE_NAME = 'fraud-detection-agents';
const SERVICE_VERSION = '1.0.0';

class OTelExporter {
  constructor() {
    this.traceCollector = getTraceCollector();
    this.exportQueue = [];
    this.maxQueueSize = 100;
    this.stats = { exported: 0, failed: 0, queued: 0 };
    this.batchInterval = null;
  }

  /**
   * Convert an internal trace to OTLP format.
   */
  toOTLP(trace) {
    const traceIdHex = this._toHexId(trace.traceId, 32);

    const spans = trace.spans.map((span, i) => ({
      traceId: traceIdHex,
      spanId: this._toHexId(`${trace.traceId}-${span.spanName}-${i}`, 16),
      parentSpanId: i === 0 ? '' : this._toHexId(`${trace.traceId}-${trace.spans[i-1].spanName}-${i-1}`, 16),
      name: span.spanName,
      kind: 1, // SPAN_KIND_INTERNAL
      startTimeUnixNano: (span.startTime * 1_000_000).toString(),
      endTimeUnixNano: ((span.endTime || Date.now()) * 1_000_000).toString(),
      attributes: [
        { key: 'agent.id', value: { stringValue: trace.agentId } },
        { key: 'span.status', value: { stringValue: span.status } },
        ...(span.data ? [{ key: 'span.data', value: { stringValue: typeof span.data === 'string' ? span.data : JSON.stringify(span.data).slice(0, 500) } }] : []),
      ],
      status: {
        code: span.status === 'failed' ? 2 : 1, // STATUS_CODE_ERROR or STATUS_CODE_OK
        message: span.status === 'failed' ? (span.result || 'Failed') : '',
      },
    }));

    // Add a root span for the entire trace
    const rootSpan = {
      traceId: traceIdHex,
      spanId: this._toHexId(trace.traceId, 16),
      parentSpanId: '',
      name: `agent.reason.${trace.agentId}`,
      kind: 2, // SPAN_KIND_SERVER
      startTimeUnixNano: (trace.startTime * 1_000_000).toString(),
      endTimeUnixNano: ((trace.endTime || Date.now()) * 1_000_000).toString(),
      attributes: [
        { key: 'service.name', value: { stringValue: SERVICE_NAME } },
        { key: 'service.version', value: { stringValue: SERVICE_VERSION } },
        { key: 'agent.id', value: { stringValue: trace.agentId } },
        { key: 'trace.status', value: { stringValue: trace.status } },
        { key: 'trace.duration_ms', value: { intValue: trace.duration || 0 } },
      ],
      status: {
        code: trace.status === 'failed' ? 2 : 1,
      },
    };

    return {
      resourceSpans: [{
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: SERVICE_NAME } },
            { key: 'service.version', value: { stringValue: SERVICE_VERSION } },
            { key: 'deployment.environment', value: { stringValue: process.env.NODE_ENV || 'development' } },
          ],
        },
        scopeSpans: [{
          scope: { name: 'fraud-detection-agents', version: SERVICE_VERSION },
          spans: [rootSpan, ...spans],
        }],
      }],
    };
  }

  /**
   * Convert a string to a hex ID of specified length.
   */
  _toHexId(str, length) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return hex.repeat(Math.ceil(length / hex.length)).slice(0, length);
  }

  /**
   * Queue a trace for export.
   */
  queueTrace(trace) {
    const otlp = this.toOTLP(trace);
    this.exportQueue.push(otlp);
    this.stats.queued++;

    if (this.exportQueue.length > this.maxQueueSize) {
      this.exportQueue = this.exportQueue.slice(-this.maxQueueSize);
    }
  }

  /**
   * Export queued traces to OTLP endpoint.
   */
  async flush() {
    if (!OTLP_ENDPOINT || this.exportQueue.length === 0) return { exported: 0 };

    const batch = this.exportQueue.splice(0, 50);
    let exported = 0;

    for (const otlp of batch) {
      try {
        const response = await fetch(`${OTLP_ENDPOINT}/v1/traces`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(otlp),
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          exported++;
          this.stats.exported++;
        } else {
          this.stats.failed++;
        }
      } catch (e) {
        this.stats.failed++;
      }
    }

    return { exported, remaining: this.exportQueue.length };
  }

  /**
   * Start periodic batch export.
   */
  startBatchExport(intervalMs = 30000) {
    if (this.batchInterval) return;
    this.batchInterval = setInterval(() => this.flush(), intervalMs);
  }

  /**
   * Stop periodic batch export.
   */
  stopBatchExport() {
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
  }

  /**
   * Export recent traces as OTLP JSON (for debugging/download).
   */
  getRecentOTLP(limit = 10) {
    const traces = this.traceCollector.getRecentTraces(limit);
    return traces.map(t => this.toOTLP(t));
  }

  getStats() {
    return {
      ...this.stats,
      queueSize: this.exportQueue.length,
      otlpEndpoint: OTLP_ENDPOINT || 'not configured',
      batchExportActive: this.batchInterval !== null,
    };
  }
}

// Singleton
let instance = null;
export function getOTelExporter() {
  if (!instance) instance = new OTelExporter();
  return instance;
}

export default { OTelExporter, getOTelExporter };
