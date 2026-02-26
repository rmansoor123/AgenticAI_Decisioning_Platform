import { Router } from 'express';

const router = Router();
let agent = null;

export function setPolicyEvolutionAgent(a) { agent = a; }

// GET /status — Autonomous status + pipeline summary
router.get('/status', (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    const status = agent.getAutonomousStatus();
    const pipeline = agent.rulePipeline || new Map();
    const stageCounts = {};
    for (const [, entry] of pipeline) {
      const stage = entry.stage || 'UNKNOWN';
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    }
    res.json({
      success: true,
      data: {
        ...status,
        pipelineSummary: stageCounts
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /proposals — All rules in pipeline with optional stage filter and pagination
router.get('/proposals', (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    const { stage, limit = 20, offset = 0 } = req.query;
    const pipeline = agent.rulePipeline || new Map();
    let proposals = Array.from(pipeline.entries()).map(([id, entry]) => ({ id, ...entry }));
    if (stage) {
      proposals = proposals.filter(p => p.stage === stage);
    }
    const total = proposals.length;
    const start = parseInt(offset);
    const end = start + parseInt(limit);
    res.json({
      success: true,
      data: {
        proposals: proposals.slice(start, end),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /pipeline — Rules currently in SHADOW stage
router.get('/pipeline', (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    const pipeline = agent.rulePipeline || new Map();
    const shadowRules = [];
    for (const [id, entry] of pipeline) {
      if (entry.stage === 'SHADOW') {
        shadowRules.push({ id, ...entry });
      }
    }
    res.json({ success: true, data: { shadowRules } });
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
    const result = await agent.runOneCycle();
    res.json({
      success: true,
      data: {
        message: 'Scan triggered',
        cycleCount: agent.runHistory.length,
        result
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /promote/:ruleId — Promote a rule to the next stage
router.post('/promote/:ruleId', async (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    const { ruleId } = req.params;
    const promoteTool = agent.tools.find(t => t.name === 'promote_rule');
    if (!promoteTool) {
      return res.status(404).json({ success: false, error: 'promote_rule tool not found' });
    }
    const result = await promoteTool.execute({ ruleId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /reject/:ruleId — Reject a rule in the pipeline
router.post('/reject/:ruleId', (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    const { ruleId } = req.params;
    const pipeline = agent.rulePipeline || new Map();
    const entry = pipeline.get(ruleId);
    if (!entry) {
      return res.status(404).json({ success: false, error: `Rule ${ruleId} not found in pipeline` });
    }
    entry.stage = 'REJECTED';
    entry.rejectedAt = new Date().toISOString();
    pipeline.set(ruleId, entry);
    res.json({
      success: true,
      data: {
        message: `Rule ${ruleId} rejected`,
        rule: { id: ruleId, ...entry }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
