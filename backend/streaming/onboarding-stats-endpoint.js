/**
 * Streaming Engine Stats — Onboarding Pipeline
 *
 * Routes (mounted under /api/streaming):
 *   GET /onboarding/stats  — per-stage message counts for the 6 onboarding topics
 *   GET /backend           — streaming backend type
 */

import express from 'express';
import { getStreamingBackend, getStreamingBackendType } from './streaming-factory.js';

const router = express.Router();

// The 6 onboarding pipeline topic names (in pipeline order)
const ONBOARDING_TOPICS = [
  'onboarding.received',
  'onboarding.enriched',
  'onboarding.features',
  'onboarding.scored',
  'onboarding.decided',
  'onboarding.emitted'
];

// Human-readable stage labels
const STAGE_LABELS = {
  'onboarding.received': 'Received',
  'onboarding.enriched': 'Enriched',
  'onboarding.features': 'Features Extracted',
  'onboarding.scored':   'ML Scored',
  'onboarding.decided':  'Decision Made',
  'onboarding.emitted':  'Risk Event Emitted'
};

// ---------------------------------------------------------------------------
// GET /onboarding/stats
// ---------------------------------------------------------------------------
router.get('/onboarding/stats', async (req, res) => {
  try {
    const engine = await getStreamingBackend();
    const backendType = getStreamingBackendType();

    // Fetch full engine stats — works for both memory StreamEngine and KafkaStreamEngine
    let rawStats = {};
    let connected = true;
    let brokerInfo = null;

    try {
      rawStats = engine.getStats ? engine.getStats() : {};
    } catch (e) {
      connected = false;
    }

    const topicStats = rawStats.topics || {};

    // Build per-stage counts
    const stages = ONBOARDING_TOPICS.map(topic => {
      const info = topicStats[topic] || {};
      return {
        topic,
        stage:        STAGE_LABELS[topic] || topic,
        messageCount: info.messageCount ?? 0,
        partitions:   info.partitions    ?? 1,
        retentionMs:  info.retentionMs   ?? null
      };
    });

    // Kafka-specific broker info (KafkaStreamEngine exposes brokers in stats)
    if (backendType === 'kafka' && rawStats.brokers) {
      brokerInfo = rawStats.brokers;
    } else if (backendType === 'kafka') {
      brokerInfo = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    }

    res.json({
      backendType,
      connected,
      brokerInfo,
      totalTopics:    rawStats.topicCount ?? ONBOARDING_TOPICS.length,
      totalMessages:  rawStats.totalMessagesProduced ?? 0,
      stages,
      retrievedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /backend
// ---------------------------------------------------------------------------
router.get('/backend', (req, res) => {
  const type = getStreamingBackendType();
  res.json({
    type,
    label: type === 'kafka' ? 'Apache Kafka' : 'In-Process Stream Engine'
  });
});

export default router;
