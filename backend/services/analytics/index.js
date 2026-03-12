/**
 * Analytics API Router — /api/analytics
 *
 * Exposes 5 endpoints backed by the pluggable analytics factory:
 *   GET /risk-trends
 *   GET /agent-performance
 *   GET /velocity
 *   GET /decision-distribution
 *   GET /health
 */

import { Router } from 'express';
import { getAnalyticsBackend, getAnalyticsBackendType } from '../../agents/core/analytics-factory.js';

const router = Router();

// GET /api/analytics/risk-trends
router.get('/risk-trends', async (req, res) => {
  try {
    const { domain, timeWindow = '24h', sellerId, granularity = '1h' } = req.query;
    const backend = await getAnalyticsBackend();
    const data = await backend.queryRiskTrends({ domain, timeWindow, sellerId, granularity });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/agent-performance
router.get('/agent-performance', async (req, res) => {
  try {
    const { agentId, timeWindow = '24h' } = req.query;
    const backend = await getAnalyticsBackend();
    const data = await backend.queryAgentPerformance({ agentId, timeWindow });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/velocity
router.get('/velocity', async (req, res) => {
  try {
    const { sellerId, deviceFingerprint, timeWindow = '1h' } = req.query;
    const backend = await getAnalyticsBackend();
    const data = await backend.queryVelocity({ sellerId, deviceFingerprint, timeWindow });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/decision-distribution
router.get('/decision-distribution', async (req, res) => {
  try {
    const { agentId, action, timeWindow = '24h' } = req.query;
    const backend = await getAnalyticsBackend();
    const data = await backend.queryDecisionDistribution({ agentId, action, timeWindow });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/health
router.get('/health', async (req, res) => {
  try {
    const backend = await getAnalyticsBackend();
    const data = await backend.health();
    data.backendType = getAnalyticsBackendType();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
