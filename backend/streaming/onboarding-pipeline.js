/**
 * Onboarding Pipeline - Kafka-style streaming pipeline for seller onboarding events
 *
 * Implements a 6-stage pipeline:
 *   INGEST → ENRICH → FEATURE_EXTRACT → SCORE → DECIDE → EMIT
 *
 * Each stage consumes from the previous topic, processes, and produces to the
 * next topic.  Follows the same poll-based consumer group pattern used by
 * stream-processors.js.
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 1000;
const FEATURE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Decision thresholds
const REJECT_THRESHOLD = 0.75;
const REVIEW_THRESHOLD = 0.45;

// ---------------------------------------------------------------------------
// Risk lookup maps
// ---------------------------------------------------------------------------

const HIGH_RISK_COUNTRIES = {
  NG: 0.85, RU: 0.80, UA: 0.70, PK: 0.75, BD: 0.70,
  GH: 0.65, KE: 0.60, CM: 0.65, VN: 0.55, PH: 0.50,
  ID: 0.45, BR: 0.40, IN: 0.35, CN: 0.30, RO: 0.60,
  BG: 0.55, BY: 0.70, MM: 0.65, KH: 0.50, LA: 0.45,
};

const HIGH_RISK_CATEGORIES = {
  electronics: 0.70, luxury_goods: 0.80, gift_cards: 0.90,
  cryptocurrency: 0.85, pharmaceuticals: 0.75, supplements: 0.60,
  tickets: 0.65, collectibles: 0.55, digital_goods: 0.60,
  automotive_parts: 0.40, jewelry: 0.65, designer_fashion: 0.70,
};

const INDUSTRY_FRAUD_RATES = {
  retail: 0.018, financial_services: 0.035, travel: 0.025,
  digital_goods: 0.042, marketplace: 0.031, food_delivery: 0.015,
  saas: 0.010, gaming: 0.038, healthcare: 0.012, education: 0.008,
  real_estate: 0.020, logistics: 0.014, entertainment: 0.028,
};

// ---------------------------------------------------------------------------
// OnboardingPipelineStats
// ---------------------------------------------------------------------------

/**
 * Tracks per-stage processing statistics including count, latency, errors,
 * and throughput for the onboarding pipeline.
 */
class OnboardingPipelineStats {
  constructor() {
    this._stages = {};
    const stageNames = ['ingest', 'enrich', 'feature_extract', 'score', 'decide', 'emit'];
    for (const name of stageNames) {
      this._stages[name] = {
        count: 0,
        errors: 0,
        latencySum: 0,
        latencyMin: Infinity,
        latencyMax: -Infinity,
        firstProcessedAt: null,
        lastProcessedAt: null,
      };
    }
  }

  /**
   * Record a successful processing event for a stage.
   *
   * @param {string} stage    - Stage name.
   * @param {number} latencyMs - Processing latency in milliseconds.
   */
  record(stage, latencyMs) {
    const s = this._stages[stage];
    if (!s) return;

    s.count += 1;
    s.latencySum += latencyMs;
    s.latencyMin = Math.min(s.latencyMin, latencyMs);
    s.latencyMax = Math.max(s.latencyMax, latencyMs);
    const now = Date.now();
    if (!s.firstProcessedAt) s.firstProcessedAt = now;
    s.lastProcessedAt = now;
  }

  /**
   * Record an error for a stage.
   *
   * @param {string} stage - Stage name.
   */
  recordError(stage) {
    const s = this._stages[stage];
    if (!s) return;
    s.errors += 1;
  }

  /**
   * Return full pipeline health statistics.
   *
   * @returns {object} Per-stage stats and overall pipeline health.
   */
  getStats() {
    const stages = {};

    for (const [name, s] of Object.entries(this._stages)) {
      const uptimeMs = s.firstProcessedAt
        ? (s.lastProcessedAt || Date.now()) - s.firstProcessedAt
        : 0;
      const throughput = uptimeMs > 0 ? (s.count / (uptimeMs / 1000)) : 0;

      stages[name] = {
        count: s.count,
        errors: s.errors,
        latency: {
          min: s.latencyMin === Infinity ? 0 : s.latencyMin,
          max: s.latencyMax === -Infinity ? 0 : s.latencyMax,
          avg: s.count > 0 ? s.latencySum / s.count : 0,
        },
        throughput: Math.round(throughput * 100) / 100,
        firstProcessedAt: s.firstProcessedAt,
        lastProcessedAt: s.lastProcessedAt,
      };
    }

    const totalCount = Object.values(this._stages).reduce((sum, s) => sum + s.count, 0);
    const totalErrors = Object.values(this._stages).reduce((sum, s) => sum + s.errors, 0);

    return {
      pipeline: 'onboarding',
      healthy: totalErrors === 0 || (totalCount > 0 && totalErrors / totalCount < 0.05),
      totalProcessed: totalCount,
      totalErrors,
      errorRate: totalCount > 0 ? totalErrors / totalCount : 0,
      stages,
    };
  }
}

// ---------------------------------------------------------------------------
// OnboardingIngestProcessor
// ---------------------------------------------------------------------------

/**
 * Stage 1: INGEST
 *
 * Validates incoming seller onboarding data, assigns a correlation ID and
 * timestamp, and produces to the `onboarding.received` topic.
 */
class OnboardingIngestProcessor {
  constructor(stats) {
    this._engine = null;
    this._running = false;
    this._stats = stats;
  }

  /**
   * Ingest a single onboarding event into the pipeline.
   *
   * @param {object} sellerData - Raw seller onboarding payload.
   * @returns {{ correlationId: string, partition: number, offset: number } | null}
   */
  ingest(sellerData) {
    const start = performance.now();

    try {
      // Validate required fields
      if (!sellerData || typeof sellerData !== 'object') {
        throw new Error('Invalid seller data: expected an object');
      }

      const sellerId = sellerData.sellerId || sellerData.seller_id;
      if (!sellerId) {
        throw new Error('Missing required field: sellerId');
      }

      const correlationId = `ONB-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

      const enrichedEvent = {
        ...sellerData,
        sellerId,
        correlationId,
        receivedAt: new Date().toISOString(),
        timestamp: sellerData.timestamp || new Date().toISOString(),
        pipelineStage: 'INGEST',
      };

      const result = this._engine.produce('onboarding.received', sellerId, enrichedEvent);

      const latencyMs = performance.now() - start;
      this._stats.record('ingest', latencyMs);

      return {
        correlationId,
        partition: result.partition,
        offset: result.offset,
      };
    } catch (err) {
      this._stats.recordError('ingest');
      console.error('[OnboardingIngestProcessor] ingest error:', err.message);
      return null;
    }
  }

  /**
   * Start the ingest processor (binds to engine).
   *
   * @param {object} engine - Streaming engine instance.
   */
  async start(engine) {
    this._engine = engine;
    this._running = true;
  }

  /** Stop the processor. */
  stop() {
    this._running = false;
  }
}

// ---------------------------------------------------------------------------
// OnboardingEnrichmentProcessor
// ---------------------------------------------------------------------------

/**
 * Stage 2: ENRICH
 *
 * Consumes from `onboarding.received`, enriches each event with country risk,
 * category risk, and industry fraud rate lookups, then produces to
 * `onboarding.enriched`.
 */
class OnboardingEnrichmentProcessor {
  constructor(stats) {
    this._engine = null;
    this._group = null;
    this._consumerId = 'enrich-0';
    this._interval = null;
    this._running = false;
    this._stats = stats;
  }

  /**
   * Start consuming and enriching.
   *
   * @param {object} engine - Streaming engine instance.
   */
  async start(engine) {
    this._engine = engine;
    this._running = true;

    this._group = engine.createConsumerGroup(
      'onboarding-enrichment-processor',
      'onboarding.received'
    );
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
    } catch (err) {
      this._stats.recordError('enrich');
      console.error('[OnboardingEnrichmentProcessor] poll error:', err);
    }
  }

  /** @private */
  _processMessage(message) {
    const start = performance.now();

    try {
      const data = typeof message === 'string'
        ? JSON.parse(message)
        : (message.value || message);

      const sellerId = data.sellerId || data.seller_id;
      if (!sellerId) return;

      // Country risk lookup
      const countryCode = (data.country || data.countryCode || '').toUpperCase();
      const countryRiskScore = HIGH_RISK_COUNTRIES[countryCode] || 0;
      const countryRiskLevel = countryRiskScore >= 0.7 ? 'HIGH'
        : countryRiskScore >= 0.4 ? 'MEDIUM'
        : 'LOW';

      // Category risk lookup
      const category = (data.category || data.businessCategory || '').toLowerCase();
      const categoryRiskScore = HIGH_RISK_CATEGORIES[category] || 0;
      const categoryRiskLevel = categoryRiskScore >= 0.7 ? 'HIGH'
        : categoryRiskScore >= 0.4 ? 'MEDIUM'
        : 'LOW';

      // Industry fraud rate lookup
      const industry = (data.industry || data.businessIndustry || '').toLowerCase();
      const industryFraudRate = INDUSTRY_FRAUD_RATES[industry] || 0.02;

      const enriched = {
        ...data,
        pipelineStage: 'ENRICH',
        enrichedAt: new Date().toISOString(),
        enrichment: {
          country: {
            code: countryCode,
            riskScore: countryRiskScore,
            riskLevel: countryRiskLevel,
          },
          category: {
            name: category,
            riskScore: categoryRiskScore,
            riskLevel: categoryRiskLevel,
          },
          industry: {
            name: industry,
            fraudRate: industryFraudRate,
          },
        },
      };

      this._engine.produce('onboarding.enriched', sellerId, enriched);

      const latencyMs = performance.now() - start;
      this._stats.record('enrich', latencyMs);
    } catch (err) {
      this._stats.recordError('enrich');
      console.error('[OnboardingEnrichmentProcessor] process error:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// OnboardingFeatureProcessor
// ---------------------------------------------------------------------------

/**
 * Stage 3: FEATURE_EXTRACT
 *
 * Consumes from `onboarding.enriched`, extracts 25 ML features using the
 * onboarding feature extractor, materializes them to the feature store under
 * the `seller_onboarding` group, and produces to `onboarding.features`.
 */
class OnboardingFeatureProcessor {
  constructor(stats) {
    this._engine = null;
    this._featureStore = null;
    this._group = null;
    this._consumerId = 'feature-0';
    this._interval = null;
    this._running = false;
    this._stats = stats;
    this._extractOnboardingFeatures = null;
  }

  /**
   * Start consuming and extracting features.
   *
   * @param {object} engine       - Streaming engine instance.
   * @param {object} featureStore - Feature store instance.
   */
  async start(engine, featureStore) {
    this._engine = engine;
    this._featureStore = featureStore;
    this._running = true;

    // Lazy-load the feature extractor
    try {
      const mod = await import('../services/ml-platform/models/onboarding-feature-extractor.js');
      this._extractOnboardingFeatures = mod.extractOnboardingFeatures;
    } catch (err) {
      console.warn('[OnboardingFeatureProcessor] Feature extractor not available, using passthrough:', err.message);
      this._extractOnboardingFeatures = null;
    }

    this._group = engine.createConsumerGroup(
      'onboarding-feature-processor',
      'onboarding.enriched'
    );
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
        await this._processMessage(message);
      }
    } catch (err) {
      this._stats.recordError('feature_extract');
      console.error('[OnboardingFeatureProcessor] poll error:', err);
    }
  }

  /** @private */
  async _processMessage(message) {
    const start = performance.now();

    try {
      const data = typeof message === 'string'
        ? JSON.parse(message)
        : (message.value || message);

      const sellerId = data.sellerId || data.seller_id;
      if (!sellerId) return;

      // Extract features
      let features;
      if (this._extractOnboardingFeatures) {
        features = await this._extractOnboardingFeatures(data);
      } else {
        // Fallback: pass through enrichment data as raw features
        features = {
          countryRiskScore: data.enrichment?.country?.riskScore || 0,
          categoryRiskScore: data.enrichment?.category?.riskScore || 0,
          industryFraudRate: data.enrichment?.industry?.fraudRate || 0.02,
          hasVerifiedEmail: data.emailVerified ? 1 : 0,
          hasVerifiedPhone: data.phoneVerified ? 1 : 0,
          accountAgeDays: 0,
        };
      }

      // Materialize to feature store with 10-minute TTL
      this._featureStore.putFeatures(sellerId, 'seller_onboarding', {
        ...features,
        ttl: FEATURE_TTL_MS,
        materializedAt: Date.now(),
      });

      const featureEvent = {
        ...data,
        pipelineStage: 'FEATURE_EXTRACT',
        featuresExtractedAt: new Date().toISOString(),
        features,
        featureCount: Object.keys(features).length,
      };

      this._engine.produce('onboarding.features', sellerId, featureEvent);

      const latencyMs = performance.now() - start;
      this._stats.record('feature_extract', latencyMs);
    } catch (err) {
      this._stats.recordError('feature_extract');
      console.error('[OnboardingFeatureProcessor] process error:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// OnboardingMLScoringProcessor
// ---------------------------------------------------------------------------

/**
 * Stage 4: SCORE
 *
 * Consumes from `onboarding.features`, lazy-loads the OnboardingRiskModel,
 * runs inference on the extracted feature vector, and produces score + latency
 * to `onboarding.scored`.
 */
class OnboardingMLScoringProcessor {
  constructor(stats) {
    this._engine = null;
    this._group = null;
    this._consumerId = 'score-0';
    this._interval = null;
    this._running = false;
    this._stats = stats;
    this._model = null;
    this._modelLoaded = false;
  }

  /**
   * Start consuming and scoring.
   *
   * @param {object} engine - Streaming engine instance.
   */
  async start(engine) {
    this._engine = engine;
    this._running = true;

    this._group = engine.createConsumerGroup(
      'onboarding-ml-scoring-processor',
      'onboarding.features'
    );
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

  /**
   * Lazy-load the onboarding risk model on first use.
   * @private
   */
  async _ensureModel() {
    if (this._modelLoaded) return;

    try {
      const mod = await import('../services/ml-platform/models/onboarding-risk-model.js');
      const ModelClass = mod.OnboardingRiskModel || mod.default;
      if (typeof ModelClass === 'function') {
        this._model = new ModelClass();
        if (typeof this._model.initialize === 'function') {
          await this._model.initialize();
        }
      } else if (ModelClass && typeof ModelClass.predict === 'function') {
        this._model = ModelClass;
      }
    } catch (err) {
      console.warn('[OnboardingMLScoringProcessor] Model not available, using heuristic scorer:', err.message);
      this._model = null;
    }

    this._modelLoaded = true;
  }

  /** @private */
  async _poll() {
    if (!this._running || !this._group) return;

    try {
      const messages = this._group.poll(this._consumerId, 100);
      if (!messages || messages.length === 0) return;

      // Ensure model is loaded before processing
      await this._ensureModel();

      for (const message of messages) {
        await this._processMessage(message);
      }
    } catch (err) {
      this._stats.recordError('score');
      console.error('[OnboardingMLScoringProcessor] poll error:', err);
    }
  }

  /** @private */
  async _processMessage(message) {
    const start = performance.now();

    try {
      const data = typeof message === 'string'
        ? JSON.parse(message)
        : (message.value || message);

      const sellerId = data.sellerId || data.seller_id;
      if (!sellerId) return;

      const features = data.features || {};
      let mlScore;
      let modelVersion = 'heuristic-v1';

      if (this._model && typeof this._model.predict === 'function') {
        const prediction = await this._model.predict(features);
        mlScore = typeof prediction === 'number' ? prediction : (prediction?.score || prediction?.riskScore || 0.5);
        modelVersion = this._model.version || this._model.modelVersion || 'ml-v1';
      } else {
        // Heuristic fallback: weighted combination of enrichment signals
        const countryScore = features.countryRiskScore || 0;
        const categoryScore = features.categoryRiskScore || 0;
        const industryRate = features.industryFraudRate || 0.02;

        mlScore = Math.min(1.0,
          (countryScore * 0.35) +
          (categoryScore * 0.25) +
          (industryRate * 5.0 * 0.20) +
          ((1 - (features.hasVerifiedEmail || 0)) * 0.10) +
          ((1 - (features.hasVerifiedPhone || 0)) * 0.10)
        );
      }

      const inferenceLatencyMs = performance.now() - start;

      const scoredEvent = {
        ...data,
        pipelineStage: 'SCORE',
        scoredAt: new Date().toISOString(),
        mlScore: Math.round(mlScore * 10000) / 10000,
        modelVersion,
        inferenceLatencyMs: Math.round(inferenceLatencyMs * 100) / 100,
      };

      this._engine.produce('onboarding.scored', sellerId, scoredEvent);

      const latencyMs = performance.now() - start;
      this._stats.record('score', latencyMs);
    } catch (err) {
      this._stats.recordError('score');
      console.error('[OnboardingMLScoringProcessor] process error:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// OnboardingDecisionProcessor
// ---------------------------------------------------------------------------

/**
 * Stage 5: DECIDE
 *
 * Consumes from `onboarding.scored`, applies decision thresholds based on the
 * ML score combined with rule-based signals, and produces to `onboarding.decided`.
 *
 * Thresholds:
 *   score > 0.75 → REJECT  (high fraud risk)
 *   score > 0.45 → REVIEW  (medium risk)
 *   score <= 0.45 → APPROVE (low risk)
 */
class OnboardingDecisionProcessor {
  constructor(stats) {
    this._engine = null;
    this._group = null;
    this._consumerId = 'decide-0';
    this._interval = null;
    this._running = false;
    this._stats = stats;
  }

  /**
   * Start consuming and deciding.
   *
   * @param {object} engine - Streaming engine instance.
   */
  async start(engine) {
    this._engine = engine;
    this._running = true;

    this._group = engine.createConsumerGroup(
      'onboarding-decision-processor',
      'onboarding.scored'
    );
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
      this._stats.recordError('decide');
      console.error('[OnboardingDecisionProcessor] poll error:', err);
    }
  }

  /** @private */
  _processMessage(message) {
    const start = performance.now();

    try {
      const data = typeof message === 'string'
        ? JSON.parse(message)
        : (message.value || message);

      const sellerId = data.sellerId || data.seller_id;
      if (!sellerId) return;

      const mlScore = typeof data.mlScore === 'number' ? data.mlScore : 0.5;

      // Apply decision thresholds
      let decision;
      let confidence;
      let reason;

      if (mlScore > REJECT_THRESHOLD) {
        decision = 'REJECT';
        confidence = Math.min(1.0, 0.7 + (mlScore - REJECT_THRESHOLD));
        reason = `ML score ${mlScore.toFixed(4)} exceeds reject threshold (${REJECT_THRESHOLD})`;
      } else if (mlScore > REVIEW_THRESHOLD) {
        decision = 'REVIEW';
        confidence = 0.5 + ((mlScore - REVIEW_THRESHOLD) / (REJECT_THRESHOLD - REVIEW_THRESHOLD)) * 0.3;
        reason = `ML score ${mlScore.toFixed(4)} falls in review band (${REVIEW_THRESHOLD}-${REJECT_THRESHOLD})`;
      } else {
        decision = 'APPROVE';
        confidence = Math.min(1.0, 0.8 + ((REVIEW_THRESHOLD - mlScore) / REVIEW_THRESHOLD) * 0.2);
        reason = `ML score ${mlScore.toFixed(4)} below review threshold (${REVIEW_THRESHOLD})`;
      }

      const decidedEvent = {
        ...data,
        pipelineStage: 'DECIDE',
        decidedAt: new Date().toISOString(),
        decision,
        confidence: Math.round(confidence * 10000) / 10000,
        reason,
        thresholds: {
          reject: REJECT_THRESHOLD,
          review: REVIEW_THRESHOLD,
        },
      };

      this._engine.produce('onboarding.decided', sellerId, decidedEvent);

      const latencyMs = performance.now() - start;
      this._stats.record('decide', latencyMs);
    } catch (err) {
      this._stats.recordError('decide');
      console.error('[OnboardingDecisionProcessor] process error:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// OnboardingEmitProcessor
// ---------------------------------------------------------------------------

/**
 * Stage 6: EMIT
 *
 * Consumes from `onboarding.decided`, publishes risk events to the event bus
 * (`onboarding:ml:scored`, `onboarding:ml:decided`), and emits statistics.
 */
class OnboardingEmitProcessor {
  constructor(stats) {
    this._engine = null;
    this._group = null;
    this._consumerId = 'emit-0';
    this._interval = null;
    this._running = false;
    this._stats = stats;
    this._eventBus = null;
    this._emittedCount = 0;
  }

  /**
   * Start consuming and emitting.
   *
   * @param {object} engine - Streaming engine instance.
   */
  async start(engine) {
    this._engine = engine;
    this._running = true;

    // Lazy-load event bus
    try {
      const mod = await import('../gateway/websocket/event-bus.js');
      this._eventBus = mod.getEventBus();
    } catch (err) {
      // Event bus not available; emit disabled
      this._eventBus = null;
    }

    this._group = engine.createConsumerGroup(
      'onboarding-emit-processor',
      'onboarding.decided'
    );
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
      this._stats.recordError('emit');
      console.error('[OnboardingEmitProcessor] poll error:', err);
    }
  }

  /** @private */
  _processMessage(message) {
    const start = performance.now();

    try {
      const data = typeof message === 'string'
        ? JSON.parse(message)
        : (message.value || message);

      const sellerId = data.sellerId || data.seller_id;
      if (!sellerId) return;

      // Publish scored event to event bus
      if (this._eventBus) {
        try {
          this._eventBus.publish('onboarding:ml:scored', {
            sellerId,
            correlationId: data.correlationId,
            mlScore: data.mlScore,
            modelVersion: data.modelVersion,
            inferenceLatencyMs: data.inferenceLatencyMs,
            scoredAt: data.scoredAt,
          }, {
            source: 'onboarding-pipeline',
            stage: 'emit',
          });
        } catch (err) {
          // Swallow event bus errors
        }

        try {
          this._eventBus.publish('onboarding:ml:decided', {
            sellerId,
            correlationId: data.correlationId,
            decision: data.decision,
            confidence: data.confidence,
            mlScore: data.mlScore,
            reason: data.reason,
            decidedAt: data.decidedAt,
          }, {
            source: 'onboarding-pipeline',
            stage: 'emit',
          });
        } catch (err) {
          // Swallow event bus errors
        }
      }

      this._emittedCount += 1;

      const latencyMs = performance.now() - start;
      this._stats.record('emit', latencyMs);
    } catch (err) {
      this._stats.recordError('emit');
      console.error('[OnboardingEmitProcessor] process error:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Pipeline initialisation
// ---------------------------------------------------------------------------

/**
 * Initialise the full onboarding streaming pipeline.
 *
 * Creates all 6 topics (4 partitions each), instantiates and starts all
 * 6 stage processors, and returns the processors array plus the stats tracker.
 *
 * @param {object} engine       - Streaming engine instance.
 * @param {object} featureStore - Feature store instance.
 * @returns {Promise<{ processors: Array, stats: OnboardingPipelineStats }>}
 */
async function initOnboardingPipeline(engine, featureStore) {
  // Create pipeline topics (4 partitions each)
  const topics = [
    'onboarding.received',
    'onboarding.enriched',
    'onboarding.features',
    'onboarding.scored',
    'onboarding.decided',
    'onboarding.emitted',
  ];

  for (const topic of topics) {
    engine.createTopic(topic, 4);
  }

  // Create shared stats tracker
  const stats = new OnboardingPipelineStats();

  // Create processors
  const ingestProcessor = new OnboardingIngestProcessor(stats);
  const enrichmentProcessor = new OnboardingEnrichmentProcessor(stats);
  const featureProcessor = new OnboardingFeatureProcessor(stats);
  const scoringProcessor = new OnboardingMLScoringProcessor(stats);
  const decisionProcessor = new OnboardingDecisionProcessor(stats);
  const emitProcessor = new OnboardingEmitProcessor(stats);

  // Start all processors
  await ingestProcessor.start(engine);
  await enrichmentProcessor.start(engine);
  await featureProcessor.start(engine, featureStore);
  await scoringProcessor.start(engine);
  await decisionProcessor.start(engine);
  await emitProcessor.start(engine);

  const processors = [
    ingestProcessor,
    enrichmentProcessor,
    featureProcessor,
    scoringProcessor,
    decisionProcessor,
    emitProcessor,
  ];

  return { processors, stats };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  OnboardingPipelineStats,
  OnboardingIngestProcessor,
  OnboardingEnrichmentProcessor,
  OnboardingFeatureProcessor,
  OnboardingMLScoringProcessor,
  OnboardingDecisionProcessor,
  OnboardingEmitProcessor,
  initOnboardingPipeline,
  HIGH_RISK_COUNTRIES,
  HIGH_RISK_CATEGORIES,
  INDUSTRY_FRAUD_RATES,
};
