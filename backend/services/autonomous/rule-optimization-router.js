import { Router } from 'express';

const router = Router();
let agent = null;

export function setRuleOptimizationAgent(a) { agent = a; }

// GET /status — Agent status
router.get('/status', (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    res.json({
      success: true,
      data: {
        agentId: agent.agentId,
        status: agent.status || 'IDLE',
        name: agent.name
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /optimize — Trigger a rule optimization cycle
router.post('/optimize', async (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    const { type = 'full' } = req.body;
    const result = await agent.optimize(type);
    res.json({
      success: true,
      data: {
        message: 'Optimization cycle complete',
        result
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
