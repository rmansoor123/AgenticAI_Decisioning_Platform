import { Router } from 'express';

const router = Router();
let agent = null;

export function setListingIntelligenceAgent(a) { agent = a; }

router.get('/status', (req, res) => {
  try {
    if (!agent) return res.status(503).json({ success: false, error: 'Agent not initialized' });
    const status = agent.getAutonomousStatus();
    res.json({ success: true, data: { ...status, detectionCount: agent.detections?.length || 0 } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/detections', (req, res) => {
  try {
    if (!agent) return res.status(503).json({ success: false, error: 'Agent not initialized' });
    const { limit = 20, offset = 0 } = req.query;
    const all = agent.detections || [];
    const start = parseInt(offset) || 0;
    const end = start + (parseInt(limit) || 20);
    res.json({ success: true, data: { detections: all.slice(start, end), total: all.length } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/history', (req, res) => {
  try {
    if (!agent) return res.status(503).json({ success: false, error: 'Agent not initialized' });
    const { limit = 20 } = req.query;
    const cycles = agent.getCycleHistory();
    res.json({ success: true, data: { cycles: cycles.slice(0, parseInt(limit) || 20), total: cycles.length } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/scan', async (req, res) => {
  try {
    if (!agent) return res.status(503).json({ success: false, error: 'Agent not initialized' });
    await agent.runOneCycle();
    res.json({ success: true, data: { message: 'Scan triggered', cycleCount: agent.runHistory.length } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

export default router;
