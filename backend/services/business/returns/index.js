import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getReturnsAbuseAgent } from '../../../agents/specialized/returns-abuse-agent.js';

const router = express.Router();
const COLLECTION = 'returns';
const ID_FIELD = 'return_id';

// GET / — List with filters/pagination
router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status } = req.query;
    let records = db_ops.getAll(COLLECTION, parseInt(limit), parseInt(offset)).map(r => r.data);
    if (sellerId) records = records.filter(r => r.sellerId === sellerId);
    if (status) records = records.filter(r => r.status === status);
    res.json({
      success: true,
      data: records,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: db_ops.count(COLLECTION)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats — Domain statistics
router.get('/stats', (req, res) => {
  try {
    const all = db_ops.getAll(COLLECTION, 10000, 0).map(r => r.data);
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
router.get('/:id', (req, res) => {
  try {
    const record = db_ops.getAll(COLLECTION, 10000, 0)
      .map(r => r.data)
      .find(r => r[ID_FIELD] === req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / — Create return request, run ReturnsAbuseAgent
router.post('/', async (req, res) => {
  try {
    const id = `RET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Run ReturnsAbuseAgent
    let decision = 'INVESTIGATE';
    let riskScore = 50;
    let reasoning = 'Default investigate — agent evaluation pending';
    let agentId = 'RETURNS_ABUSE';
    let riskFactors = [];

    try {
      const agent = getReturnsAbuseAgent();
      const agentResult = await agent.reason({
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
        evaluationType: 'returns_abuse'
      });

      const rec = agentResult.result?.recommendation || agentResult.result?.decision;
      decision = rec?.action || 'INVESTIGATE';
      riskScore = agentResult.result?.overallRisk?.score ?? 50;
      reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
      agentId = agentResult.result?.agentId || 'RETURNS_ABUSE';
      riskFactors = agentResult.result?.riskFactors?.map(f => f.factor) || [];
    } catch (agentError) {
      console.error(`[ReturnsService] Agent error for ${id}:`, agentError.message);
      decision = 'INVESTIGATE';
      riskScore = 50;
      reasoning = `Agent error — defaulting to INVESTIGATE: ${agentError.message}`;
    }

    // Map decision to status
    let status;
    if (decision === 'APPROVE') status = 'APPROVED';
    else if (decision === 'DENY') status = 'DENIED';
    else status = 'UNDER_INVESTIGATION'; // INVESTIGATE

    const record = {
      [ID_FIELD]: id,
      ...req.body,
      status,
      riskScore,
      riskFactors,
      riskAssessment: {
        decision, riskScore, reasoning, agentId,
        evaluatedAt: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db_ops.insert(COLLECTION, record);

    // Emit risk event
    emitRiskEvent({
      domain: 'returns',
      eventType: decision === 'APPROVE' ? 'RETURN_APPROVED' : decision === 'DENY' ? 'RETURN_DENIED' : 'RETURN_INVESTIGATING',
      entityId: id,
      sellerId: req.body.sellerId,
      riskScore: decision === 'APPROVE' ? 0 : riskScore,
      metadata: { decision, returnId: id }
    });

    // Create case on INVESTIGATE or DENY
    if (decision === 'INVESTIGATE' || decision === 'DENY') {
      const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
      db_ops.insert('cases', 'case_id', caseId, {
        caseId,
        checkpoint: 'RETURNS_REVIEW',
        priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
        status: 'OPEN',
        sellerId: req.body.sellerId,
        entityId: id,
        entityType: 'RETURN',
        decision,
        riskScore,
        reasoning,
        agentId,
        createdAt: new Date().toISOString()
      });
    }

    console.log(`[ReturnsService] ${id} → ${decision} (risk: ${riskScore})`);

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /:id/status — Update status
router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const records = db_ops.getAll(COLLECTION, 10000, 0);
    const entry = records.find(r => r.data[ID_FIELD] === req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    const updated = { ...entry.data, status, updatedAt: new Date().toISOString() };
    db_ops.update(COLLECTION, entry.id, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
