import { Router } from 'express';
import { getSequencePatterns } from '../../agents/core/sequence-patterns.js';

const router = Router();
let agent = null;

export function setCrossDomainAgent(a) { agent = a; }

// GET /status — Autonomous status + detection count
router.get('/status', (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    const status = agent.getAutonomousStatus();
    res.json({
      success: true,
      data: {
        ...status,
        detectionCount: agent.detections ? agent.detections.length : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /detections — Cross-domain detections with pagination
router.get('/detections', (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    const { limit = 20, offset = 0 } = req.query;
    const all = agent.detections || [];
    const start = parseInt(offset) || 0;
    const end = start + (parseInt(limit) || 20);
    const detections = all.slice(start, end);
    res.json({
      success: true,
      data: {
        detections,
        total: all.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /patterns — Sequence patterns from knowledge base
router.get('/patterns', (req, res) => {
  try {
    const patterns = getSequencePatterns();
    res.json({ success: true, data: { patterns } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /history — Cycle history with limit
router.get('/history', (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    const { limit = 20 } = req.query;
    const cycles = agent.getCycleHistory();
    const limited = cycles.slice(0, parseInt(limit));
    res.json({
      success: true,
      data: {
        cycles: limited,
        total: cycles.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /scan — Trigger a single autonomous scan cycle
router.post('/scan', async (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    await agent.runOneCycle();
    res.json({
      success: true,
      data: {
        message: 'Scan triggered',
        cycleCount: agent.runHistory.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
