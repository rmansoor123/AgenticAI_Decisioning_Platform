import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getReturnsAbuseAgent } from '../../../agents/specialized/returns-abuse-agent.js';

const router = express.Router();
const COLLECTION = 'returns';
const ID_FIELD = 'return_id';

// GET / — List with filters/pagination
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status } = req.query;
    let records = (await db_ops.getAll(COLLECTION, parseInt(limit), parseInt(offset))).map(r => r.data);
    if (sellerId) records = records.filter(r => r.sellerId === sellerId);
    if (status) records = records.filter(r => r.status === status);
    res.json({
      success: true,
      data: records,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: await db_ops.count(COLLECTION)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats — Domain statistics
router.get('/stats', async (req, res) => {
  try {
    const all = (await db_ops.getAll(COLLECTION, 10000, 0)).map(r => r.data);
    const byStatus = {};
    const byReason = {};
    let flagged = 0;
    let totalRefunds = 0;

    for (const record of all) {
      byStatus[record.status] = (byStatus[record.status] || 0) + 1;
      const reason = record.reason || 'unknown';
      byReason[reason] = (byReason[reason] || 0) + 1;
      if (record.riskScore > 0) flagged++;
      totalRefunds += record.refundAmount || 0;
    }

    res.json({
      success: true,
      data: { total: all.length, byStatus, byReason, flagged, totalRefunds }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id — Get by ID
router.get('/:id', async (req, res) => {
  try {
    const record = (await db_ops.getAll(COLLECTION, 10000, 0)).map(r => r.data)
      .find(r => r[ID_FIELD] === req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / — Create return request, async fire-and-forget with real-time TPAOR streaming
router.post('/', async (req, res) => {
  try {
    const id = `RET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const correlationId = `RET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Store return immediately with EVALUATING status
    const record = {
      [ID_FIELD]: id,
      ...req.body,
      status: 'EVALUATING',
      riskScore: 0,
      riskFactors: [],
      riskAssessment: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db_ops.insert(COLLECTION, ID_FIELD, id, record);

    // Return HTTP 202 immediately
    res.status(202).json({
      success: true,
      correlationId,
      returnId: id,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    // Fire-and-forget: run ReturnsAbuseAgent asynchronously
    console.log(`[ReturnsService] Evaluating return: ${id} (correlation: ${correlationId})`);

    const agent = getReturnsAbuseAgent();
    agent.reason({
      type: 'returns_abuse_evaluation',
      returnId: id,
      sellerId: req.body.sellerId,
      orderId: req.body.orderId,
      reason: req.body.reason,
      refundAmount: req.body.refundAmount,
      serialReturner: req.body.serialReturner,
      emptyBox: req.body.emptyBox,
      refundExceedsPurchase: req.body.refundExceedsPurchase,
      wardrobing: req.body.wardrobing,
      fundsWithdrawn: req.body.fundsWithdrawn,
      submittedAt: new Date().toISOString()
    }, {
      entityId: id,
      evaluationType: 'returns_abuse',
      _correlationId: correlationId
    })
      .then(async agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'INVESTIGATE';
        const riskScore = agentResult.result?.overallRisk?.score ?? 50;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'RETURNS_ABUSE';
        const riskFactors = agentResult.result?.riskFactors?.map(f => f.factor) || [];

        // Map decision to status
        let status;
        if (decision === 'APPROVE') status = 'APPROVED';
        else if (decision === 'DENY') status = 'DENIED';
        else status = 'UNDER_INVESTIGATION';

        // Update record with final decision
        await db_ops.update(COLLECTION, ID_FIELD, id, {
          ...record,
          status,
          riskScore,
          riskFactors,
          riskAssessment: { decision, riskScore, reasoning, agentId, evaluatedAt: new Date().toISOString() },
          updatedAt: new Date().toISOString()
        });

        // Emit risk event
        emitRiskEvent({
          domain: 'returns',
          eventType: decision === 'APPROVE' ? 'RETURN_APPROVED' : decision === 'DENY' ? 'RETURN_DENIED' : 'RETURN_INVESTIGATING',
          entityId: id, sellerId: req.body.sellerId,
          riskScore: decision === 'APPROVE' ? 0 : riskScore,
          metadata: { decision, returnId: id }
        });

        // Create case on INVESTIGATE or DENY
        if (decision === 'INVESTIGATE' || decision === 'DENY') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          await db_ops.insert('cases', 'case_id', caseId, {
            caseId, checkpoint: 'RETURNS_REVIEW',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN', sellerId: req.body.sellerId, entityId: id, entityType: 'RETURN',
            decision, riskScore, reasoning, agentId, createdAt: new Date().toISOString()
          });
        }

        // Emit completion event with correlationId
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:complete', {
              correlationId, sellerId: req.body.sellerId, entityId: id,
              decision, riskScore, reasoning, timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}

        console.log(`[ReturnsService] Completed: ${id} → ${decision} (risk: ${riskScore})`);
      })
      .catch(async error => {
        console.error(`[ReturnsService] Agent error for ${id}:`, error.message);
        await db_ops.update(COLLECTION, ID_FIELD, id, {
          ...record,
          status: 'UNDER_INVESTIGATION',
          riskScore: 50,
          riskAssessment: { decision: 'INVESTIGATE', riskScore: 50, reasoning: `Agent error: ${error.message}`, agentId: 'RETURNS_ABUSE', evaluatedAt: new Date().toISOString() },
          updatedAt: new Date().toISOString()
        });
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:error', {
              correlationId, sellerId: req.body.sellerId, entityId: id,
              error: error.message, timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}
      });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /:id/status — Update status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const records = await db_ops.getAll(COLLECTION, 10000, 0);
    const entry = records.find(r => r.data[ID_FIELD] === req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    const updated = { ...entry.data, status, updatedAt: new Date().toISOString() };
    await db_ops.update(COLLECTION, ID_FIELD, entry.id, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
