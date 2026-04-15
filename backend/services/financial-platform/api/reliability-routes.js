/**
 * Platform Reliability API Routes
 */
import express from 'express';
import { getPlatformReliability } from '../services/platform-reliability.js';

const router = express.Router();

router.get('/sla', (req, res) => {
  const reliability = getPlatformReliability();
  res.json({ success: true, data: reliability.getSLAMetrics() });
});

router.get('/health-matrix', async (req, res) => {
  try {
    const reliability = getPlatformReliability();
    const result = await reliability.getServiceHealth();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/circuit-breakers', (req, res) => {
  const reliability = getPlatformReliability();
  res.json({ success: true, data: reliability.getCircuitBreakers() });
});

router.get('/degradation-modes', (req, res) => {
  const reliability = getPlatformReliability();
  res.json({ success: true, data: reliability.getDegradationModes() });
});

router.get('/incidents', (req, res) => {
  const reliability = getPlatformReliability();
  res.json({ success: true, data: reliability.getIncidents() });
});

router.post('/incidents', (req, res) => {
  const reliability = getPlatformReliability();
  const incident = reliability.logIncident(req.body);
  res.json({ success: true, data: incident });
});

export default router;
