import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getProfileMutationAgent } from '../../../agents/specialized/profile-mutation-agent.js';

const router = express.Router();
const COLLECTION = 'profile_updates';
const ID_FIELD = 'update_id';

// GET / — List with filters/pagination (includes updateType filter)
router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status, updateType } = req.query;
    let records = db_ops.getAll(COLLECTION, parseInt(limit), parseInt(offset)).map(r => r.data);
    if (sellerId) records = records.filter(r => r.sellerId === sellerId);
    if (status) records = records.filter(r => r.status === status);
    if (updateType) records = records.filter(r => r.updateType === updateType);
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
    const byType = {};
    let flagged = 0;

    for (const record of all) {
      byStatus[record.status] = (byStatus[record.status] || 0) + 1;
      const ut = record.updateType || 'unknown';
      byType[ut] = (byType[ut] || 0) + 1;
      if (record.riskScore > 0) flagged++;
    }

    res.json({
      success: true,
      data: { total: all.length, byStatus, byType, flagged }
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

// POST / — Create profile update, run ProfileMutationAgent
router.post('/', async (req, res) => {
  try {
    const id = `PROF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Run ProfileMutationAgent
    let decision = 'STEP_UP';
    let riskScore = 50;
    let reasoning = 'Default step-up — agent evaluation pending';
    let agentId = 'PROFILE_MUTATION';
    let riskFactors = [];

    try {
      const agent = getProfileMutationAgent();
      const agentResult = await agent.reason({
        type: 'profile_mutation_evaluation',
        updateId: id,
        sellerId: req.body.sellerId,
        updateType: req.body.updateType,
        changes: req.body.changes,
        openDispute: req.body.openDispute,
        newDevice: req.body.newDevice,
        emailDomainDowngrade: req.body.emailDomainDowngrade,
        submittedAt: new Date().toISOString()
      }, {
        entityId: id,
        evaluationType: 'profile_mutation'
      });

      const rec = agentResult.result?.recommendation || agentResult.result?.decision;
      decision = rec?.action || 'STEP_UP';
      riskScore = agentResult.result?.overallRisk?.score ?? 50;
      reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
      agentId = agentResult.result?.agentId || 'PROFILE_MUTATION';
      riskFactors = agentResult.result?.riskFactors?.map(f => f.factor) || [];
    } catch (agentError) {
      console.error(`[ProfileUpdatesService] Agent error for ${id}:`, agentError.message);
      decision = 'STEP_UP';
      riskScore = 50;
      reasoning = `Agent error — defaulting to STEP_UP: ${agentError.message}`;
    }

    // Map decision to status
    let status;
    if (decision === 'ALLOW') status = 'APPROVED';
    else if (decision === 'LOCK') status = 'LOCKED';
    else status = 'STEP_UP_REQUIRED'; // STEP_UP

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
      domain: 'profile_updates',
      eventType: decision === 'ALLOW' ? 'PROFILE_UPDATE_APPROVED' : decision === 'LOCK' ? 'PROFILE_UPDATE_LOCKED' : 'PROFILE_UPDATE_STEP_UP',
      entityId: id,
      sellerId: req.body.sellerId,
      riskScore: decision === 'ALLOW' ? 0 : riskScore,
      metadata: { decision, updateType: req.body.updateType }
    });

    // On LOCK: update seller status to UNDER_REVIEW
    if (decision === 'LOCK' && req.body.sellerId) {
      const seller = db_ops.getById('sellers', 'seller_id', req.body.sellerId);
      if (seller) {
        db_ops.update('sellers', 'seller_id', req.body.sellerId, {
          ...seller.data,
          status: 'UNDER_REVIEW',
          lockReason: reasoning,
          lockedAt: new Date().toISOString()
        });
      }
    }

    // Create case on STEP_UP or LOCK
    if (decision === 'STEP_UP' || decision === 'LOCK') {
      const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
      db_ops.insert('cases', 'case_id', caseId, {
        caseId,
        checkpoint: 'PROFILE_UPDATE',
        priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
        status: 'OPEN',
        sellerId: req.body.sellerId,
        entityId: id,
        entityType: 'PROFILE_UPDATE',
        decision,
        riskScore,
        reasoning,
        agentId,
        createdAt: new Date().toISOString()
      });
    }

    console.log(`[ProfileUpdatesService] ${id} → ${decision} (risk: ${riskScore})`);

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
