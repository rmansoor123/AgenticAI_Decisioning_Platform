/**
 * Stream Processors for the Streaming Engine
 *
 * Provides windowed aggregation, transaction velocity processing,
 * risk signal aggregation, and feature materialization processors
 * that consume from engine topics and materialize results to the feature store.
 */

// ---------------------------------------------------------------------------
// WindowedAggregation
// ---------------------------------------------------------------------------

/**
 * Supports tumbling and sliding windows with key-based accumulators.
 *
 * - Tumbling window: slideMs === windowSizeMs (each window is non-overlapping)
 * - Sliding window:  slideMs < windowSizeMs  (windows overlap)
 *
 * Each key maintains a list of time-bucketed windows.  Values are accumulated
 * inside the window that covers their timestamp.
 */
class WindowedAggregation {
  /**
   * @param {number} windowSizeMs - Duration of each window in milliseconds.
   * @param {number} [slideMs]    - Slide interval in ms.  Defaults to windowSizeMs (tumbling).
   */
  constructor(windowSizeMs, slideMs) {
    this.windowSizeMs = windowSizeMs;
    this.slideMs = slideMs != null ? slideMs : windowSizeMs;
    // Map<key, Array<{ start, end, count, sum, min, max, values }>>
    this._windows = new Map();
  }

  /**
   * Add a value into the appropriate window(s) for the given key.
   *
   * @param {string} key       - Aggregation key (e.g. sellerId).
   * @param {number} value     - Numeric value to accumulate.
   * @param {number} timestamp - Event timestamp in epoch milliseconds.
   */
  add(key, value, timestamp) {
    if (!this._windows.has(key)) {
      this._windows.set(key, []);
    }

    const windows = this._windows.get(key);

    // Determine which window slots this timestamp falls into.
    // For a tumbling window there will be exactly one slot; for a sliding
    // window there may be several overlapping slots.
    const slotStart = Math.floor(timestamp / this.slideMs) * this.slideMs;

    // Walk backwards from slotStart to find all windows that cover `timestamp`.
    const coveredStarts = [];
    for (
      let start = slotStart;
      start + this.windowSizeMs > timestamp && start >= slotStart - this.windowSizeMs + this.slideMs;
      start -= this.slideMs
    ) {
      if (start < 0) break;
      coveredStarts.push(start);
    }

    for (const start of coveredStarts) {
      let win = windows.find(w => w.start === start);
      if (!win) {
        win = {
          start,
          end: start + this.windowSizeMs,
          count: 0,
          sum: 0,
          min: Infinity,
          max: -Infinity,
          values: []
        };
        windows.push(win);
      }
      win.count += 1;
      win.sum += value;
      win.min = Math.min(win.min, value);
      win.max = Math.max(win.max, value);
      win.values.push({ value, timestamp });
    }
  }

  /**
   * Return the most recent (current) window aggregate for a key.
   *
   * @param {string} key
   * @returns {{ start: number, end: number, count: number, sum: number, min: number, max: number, avg: number } | null}
   */
  getWindow(key) {
    const windows = this._windows.get(key);
    if (!windows || windows.length === 0) {
      return null;
    }

    // Sort descending by start and return the latest window.
    windows.sort((a, b) => b.start - a.start);
    const latest = windows[0];

    return {
      start: latest.start,
      end: latest.end,
      count: latest.count,
      sum: latest.sum,
      min: latest.min === Infinity ? 0 : latest.min,
      max: latest.max === -Infinity ? 0 : latest.max,
      avg: latest.count > 0 ? latest.sum / latest.count : 0
    };
  }

  /**
   * Remove windows whose end time is before `now - windowSizeMs`.
   * Call periodically to prevent unbounded memory growth.
   */
  cleanup() {
    const cutoff = Date.now() - this.windowSizeMs;
    for (const [key, windows] of this._windows.entries()) {
      const kept = windows.filter(w => w.end > cutoff);
      if (kept.length === 0) {
        this._windows.delete(key);
      } else {
        this._windows.set(key, kept);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// TransactionVelocityProcessor
// ---------------------------------------------------------------------------

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 1000;

/**
 * Consumes from the `transactions.decided` topic, maintains 1-hour and
 * 24-hour tumbling windows per seller, and materializes aggregated
 * velocity features to the feature store under the `transaction_velocity`
 * group.
 */
class TransactionVelocityProcessor {
  constructor() {
    this._engine = null;
    this._featureStore = null;
    this._consumer = null;
    this._interval = null;
    this._running = false;

    // Tumbling windows (slideMs === windowSizeMs)
    this._window1h = new WindowedAggregation(ONE_HOUR_MS, ONE_HOUR_MS);
    this._window24h = new WindowedAggregation(TWENTY_FOUR_HOURS_MS, TWENTY_FOUR_HOURS_MS);
  }

  /**
   * Start consuming and processing.
   *
   * @param {object} engine       - Streaming engine instance (must expose createConsumerGroup).
   * @param {object} featureStore - Feature store instance (must expose putFeatures).
   */
  async start(engine, featureStore) {
    this._engine = engine;
    this._featureStore = featureStore;
    this._running = true;

    this._group = engine.createConsumerGroup(
      'transaction-velocity-processor',
      'transactions.decided'
    );
    this._consumerId = 'tvp-0';
    this._group.addConsumer(this._consumerId);

    this._interval = setInterval(() => this._poll(), POLL_INTERVAL_MS);
  }

  /** Stop the processor and clear the polling interval. */
  stop() {
    this._running = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  /** @private */
  async _poll() {
    if (!this._running || !this._group) return;

    try {
      const messages = this._group.poll(this._consumerId, 100);
      if (!messages || messages.length === 0) return;

      for (const message of messages) {
        this._processMessage(message);
      }

      // Periodically clean expired windows
      this._window1h.cleanup();
      this._window24h.cleanup();
    } catch (err) {
      console.error('[TransactionVelocityProcessor] poll error:', err);
    }
  }

  /** @private */
  _processMessage(message) {
    const data = typeof message === 'string' ? JSON.parse(message) : (message.value || message);
    const sellerId = data.sellerId || data.seller_id;
    if (!sellerId) return;

    const amount = typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0;
    const timestamp = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();

    // Accumulate into both windows
    this._window1h.add(sellerId, amount, timestamp);
    this._window24h.add(sellerId, amount, timestamp);

    // Materialize current velocity to feature store
    const agg1h = this._window1h.getWindow(sellerId) || { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
    const agg24h = this._window24h.getWindow(sellerId) || { count: 0, sum: 0, avg: 0, min: 0, max: 0 };

    this._featureStore.putFeatures(sellerId, 'transaction_velocity', {
      transactions_1h: agg1h.count,
      amount_1h: agg1h.sum,
      avg_amount_1h: agg1h.avg,
      min_amount_1h: agg1h.min,
      max_amount_1h: agg1h.max,
      transactions_24h: agg24h.count,
      amount_24h: agg24h.sum,
      avg_amount_24h: agg24h.avg,
      min_amount_24h: agg24h.min,
      max_amount_24h: agg24h.max,
      last_updated: Date.now()
    });
  }
}

// ---------------------------------------------------------------------------
// RiskSignalAggregator
// ---------------------------------------------------------------------------

/**
 * Consumes from the `risk.events` topic, aggregates risk signals across
 * domains per seller, and materializes to the feature store as the
 * `network_risk` group.
 */
class RiskSignalAggregator {
  constructor() {
    this._engine = null;
    this._featureStore = null;
    this._consumer = null;
    this._interval = null;
    this._running = false;

    // In-memory risk signal state keyed by sellerId
    // Map<sellerId, { domains: Map<domain, { count, maxSeverity, lastSeen }>, totalSignals, ... }>
    this._sellerSignals = new Map();
  }

  /**
   * Start consuming and processing.
   *
   * @param {object} engine       - Streaming engine instance.
   * @param {object} featureStore - Feature store instance.
   */
  async start(engine, featureStore) {
    this._engine = engine;
    this._featureStore = featureStore;
    this._running = true;

    this._group = engine.createConsumerGroup(
      'risk-signal-aggregator',
      'risk.events'
    );
    this._consumerId = 'rsa-0';
    this._group.addConsumer(this._consumerId);

    this._interval = setInterval(() => this._poll(), POLL_INTERVAL_MS);
  }

  /** Stop the processor. */
  stop() {
    this._running = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  /** @private */
  async _poll() {
    if (!this._running || !this._group) return;

    try {
      const messages = this._group.poll(this._consumerId, 100);
      if (!messages || messages.length === 0) return;

      for (const message of messages) {
        this._processMessage(message);
      }
    } catch (err) {
      console.error('[RiskSignalAggregator] poll error:', err);
    }
  }

  /** @private */
  _processMessage(message) {
    const data = typeof message === 'string' ? JSON.parse(message) : (message.value || message);
    const sellerId = data.sellerId || data.seller_id;
    if (!sellerId) return;

    const domain = data.domain || data.riskDomain || 'unknown';
    const severity = typeof data.severity === 'number'
      ? data.severity
      : this._parseSeverity(data.severity);
    const timestamp = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();

    // Initialise seller entry if absent
    if (!this._sellerSignals.has(sellerId)) {
      this._sellerSignals.set(sellerId, {
        domains: new Map(),
        totalSignals: 0,
        maxSeverity: 0,
        firstSeen: timestamp,
        lastSeen: timestamp
      });
    }

    const sellerState = this._sellerSignals.get(sellerId);
    sellerState.totalSignals += 1;
    sellerState.lastSeen = Math.max(sellerState.lastSeen, timestamp);
    sellerState.maxSeverity = Math.max(sellerState.maxSeverity, severity);

    // Per-domain aggregation
    if (!sellerState.domains.has(domain)) {
      sellerState.domains.set(domain, {
        count: 0,
        maxSeverity: 0,
        totalSeverity: 0,
        lastSeen: 0
      });
    }
    const domainState = sellerState.domains.get(domain);
    domainState.count += 1;
    domainState.maxSeverity = Math.max(domainState.maxSeverity, severity);
    domainState.totalSeverity += severity;
    domainState.lastSeen = Math.max(domainState.lastSeen, timestamp);

    // Materialize aggregated risk signals to feature store
    const domainSummary = {};
    for (const [d, st] of sellerState.domains.entries()) {
      domainSummary[`${d}_count`] = st.count;
      domainSummary[`${d}_max_severity`] = st.maxSeverity;
      domainSummary[`${d}_avg_severity`] = st.count > 0 ? st.totalSeverity / st.count : 0;
    }

    this._featureStore.putFeatures(sellerId, 'network_risk', {
      total_signals: sellerState.totalSignals,
      max_severity: sellerState.maxSeverity,
      distinct_domains: sellerState.domains.size,
      first_signal_at: sellerState.firstSeen,
      last_signal_at: sellerState.lastSeen,
      ...domainSummary,
      last_updated: Date.now()
    });
  }

  /**
   * Map textual severity labels to numeric values.
   * @private
   */
  _parseSeverity(label) {
    const map = { low: 1, medium: 2, high: 3, critical: 4 };
    return map[String(label).toLowerCase()] || 0;
  }
}

// ---------------------------------------------------------------------------
// FeatureMaterializationProcessor
// ---------------------------------------------------------------------------

/**
 * Consumes from the `features.materialized` topic and writes computed
 * features directly to the feature store based on message content.
 *
 * Expected message schema:
 *   { entityId, group, features: { ... } }
 */
class FeatureMaterializationProcessor {
  constructor() {
    this._engine = null;
    this._featureStore = null;
    this._consumer = null;
    this._interval = null;
    this._running = false;
    this._processedCount = 0;
  }

  /**
   * Start consuming and processing.
   *
   * @param {object} engine       - Streaming engine instance.
   * @param {object} featureStore - Feature store instance.
   */
  async start(engine, featureStore) {
    this._engine = engine;
    this._featureStore = featureStore;
    this._running = true;

    this._group = engine.createConsumerGroup(
      'feature-materialization-processor',
      'features.materialized'
    );
    this._consumerId = 'fmp-0';
    this._group.addConsumer(this._consumerId);

    this._interval = setInterval(() => this._poll(), POLL_INTERVAL_MS);
  }

  /** Stop the processor. */
  stop() {
    this._running = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  /** @private */
  async _poll() {
    if (!this._running || !this._group) return;

    try {
      const messages = this._group.poll(this._consumerId, 100);
      if (!messages || messages.length === 0) return;

      for (const message of messages) {
        this._processMessage(message);
      }
    } catch (err) {
      console.error('[FeatureMaterializationProcessor] poll error:', err);
    }
  }

  /** @private */
  _processMessage(message) {
    const data = typeof message === 'string' ? JSON.parse(message) : (message.value || message);

    const entityId = data.entityId || data.entity_id;
    const group = data.group || data.featureGroup || 'default';
    const features = data.features;

    if (!entityId || !features || typeof features !== 'object') {
      console.warn(
        '[FeatureMaterializationProcessor] skipping malformed message:',
        data
      );
      return;
    }

    this._featureStore.putFeatures(entityId, group, {
      ...features,
      materialized_at: Date.now()
    });

    this._processedCount += 1;
  }
}

// ---------------------------------------------------------------------------
// Initialisation helper
// ---------------------------------------------------------------------------

/**
 * Create and start all stream processors.
 *
 * @param {object} engine       - Streaming engine instance.
 * @param {object} featureStore - Feature store instance.
 * @returns {Promise<Array>}    - Array of started processor instances.
 */
async function initStreamProcessors(engine, featureStore) {
  const processors = [
    new TransactionVelocityProcessor(),
    new RiskSignalAggregator(),
    new FeatureMaterializationProcessor()
  ];

  for (const processor of processors) {
    await processor.start(engine, featureStore);
  }

  return processors;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  initStreamProcessors,
  WindowedAggregation,
  TransactionVelocityProcessor,
  RiskSignalAggregator,
  FeatureMaterializationProcessor
};
