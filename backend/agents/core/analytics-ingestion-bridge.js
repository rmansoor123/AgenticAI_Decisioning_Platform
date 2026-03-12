/**
 * Analytics Ingestion Bridge — subscribes to event bus events and pushes
 * buffered batches to the analytics backend.
 *
 * Mirrors the event-persister.js pattern:
 *   - start(eventBus) subscribes to risk:*, decision:*, agent:decision:complete
 *   - Buffers events (max 50 / 5s flush interval)
 *   - Fire-and-forget — errors swallowed + counted, never propagated
 */

import { getAnalyticsBackend } from './analytics-factory.js';

const MAX_BUFFER_SIZE = 50;
const FLUSH_INTERVAL_MS = 5_000;

class AnalyticsIngestionBridge {
  constructor() {
    this.started = false;
    this.unsubscribers = [];
    this.riskBuffer = [];
    this.decisionBuffer = [];
    this.metricsBuffer = [];
    this.flushTimer = null;
    this.stats = { riskIngested: 0, decisionsIngested: 0, metricsIngested: 0, errors: 0, flushes: 0 };
  }

  /**
   * Subscribe to event bus topics and begin buffered ingestion.
   */
  start(eventBus) {
    if (this.started) return;

    // Risk events
    this.unsubscribers.push(
      eventBus.subscribe('risk:*', (event) => {
        this._bufferRisk(event.data || event);
      })
    );

    // Agent decisions
    this.unsubscribers.push(
      eventBus.subscribe('agent:decision:complete', (event) => {
        this._bufferDecision(event.data || event);
      })
    );

    // Agent metrics (if emitted)
    this.unsubscribers.push(
      eventBus.subscribe('agent:metrics', (event) => {
        this._bufferMetrics(event.data || event);
      })
    );

    // Periodic flush
    this.flushTimer = setInterval(() => this._flush(), FLUSH_INTERVAL_MS);

    this.started = true;
    console.log('[AnalyticsIngestionBridge] Started — subscribing to risk:*, agent:decision:complete, agent:metrics');
  }

  /**
   * Stop the bridge and unsubscribe.
   */
  stop() {
    if (!this.started) return;

    for (const unsub of this.unsubscribers) {
      if (typeof unsub === 'function') unsub();
    }
    this.unsubscribers = [];

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    this._flush();

    this.started = false;
    console.log('[AnalyticsIngestionBridge] Stopped');
  }

  _bufferRisk(event) {
    this.riskBuffer.push(event);
    if (this.riskBuffer.length >= MAX_BUFFER_SIZE) this._flushRisk();
  }

  _bufferDecision(decision) {
    this.decisionBuffer.push(decision);
    if (this.decisionBuffer.length >= MAX_BUFFER_SIZE) this._flushDecisions();
  }

  _bufferMetrics(metrics) {
    this.metricsBuffer.push(metrics);
    if (this.metricsBuffer.length >= MAX_BUFFER_SIZE) this._flushMetrics();
  }

  _flush() {
    this.stats.flushes++;
    this._flushRisk();
    this._flushDecisions();
    this._flushMetrics();
  }

  async _flushRisk() {
    if (this.riskBuffer.length === 0) return;
    const batch = this.riskBuffer.splice(0);
    try {
      const backend = await getAnalyticsBackend();
      await backend.ingestRiskEvent(batch);
      this.stats.riskIngested += batch.length;
    } catch (_) {
      this.stats.errors++;
    }
  }

  async _flushDecisions() {
    if (this.decisionBuffer.length === 0) return;
    const batch = this.decisionBuffer.splice(0);
    try {
      const backend = await getAnalyticsBackend();
      await backend.ingestDecision(batch);
      this.stats.decisionsIngested += batch.length;
    } catch (_) {
      this.stats.errors++;
    }
  }

  async _flushMetrics() {
    if (this.metricsBuffer.length === 0) return;
    const batch = this.metricsBuffer.splice(0);
    try {
      const backend = await getAnalyticsBackend();
      await backend.ingestMetrics(batch);
      this.stats.metricsIngested += batch.length;
    } catch (_) {
      this.stats.errors++;
    }
  }

  getStats() {
    return {
      ...this.stats,
      started: this.started,
      pendingRisk: this.riskBuffer.length,
      pendingDecisions: this.decisionBuffer.length,
      pendingMetrics: this.metricsBuffer.length
    };
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let instance = null;

export function getAnalyticsIngestionBridge() {
  if (!instance) instance = new AnalyticsIngestionBridge();
  return instance;
}

export default { AnalyticsIngestionBridge, getAnalyticsIngestionBridge };
