import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getProfileMutationAgent } from '../../../agents/specialized/profile-mutation-agent.js';

const router = express.Router();
const COLLECTION = 'profile_updates';
const ID_FIELD = 'update_id';

// GET / — List with filters/pagination (includes updateType filter)
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status, updateType } = req.query;
    let records = (await db_ops.getAll(COLLECTION, parseInt(limit), parseInt(offset))).map(r => r.data);
    if (sellerId) records = records.filter(r => r.sellerId === sellerId);
    if (status) records = records.filter(r => r.status === status);
    if (updateType) records = records.filter(r => r.updateType === updateType);
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

// POST / — Create profile update, async fire-and-forget with real-time TPAOR streaming
router.post('/', async (req, res) => {
  try {
    const id = `PROF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const correlationId = `PROF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Store record immediately with EVALUATING status
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
      updateId: id,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    // Fire-and-forget: run ProfileMutationAgent asynchronously
    console.log(`[ProfileUpdatesService] Evaluating profile update: ${id} (correlation: ${correlationId})`);

    const agent = getProfileMutationAgent();
    agent.reason({
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
      evaluationType: 'profile_mutation',
      _correlationId: correlationId
    })
      .then(async agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'STEP_UP';
        const riskScore = agentResult.result?.overallRisk?.score ?? 50;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'PROFILE_MUTATION';
        const riskFactors = agentResult.result?.riskFactors?.map(f => f.factor) || [];

        // Map decision to status
        let status;
        if (decision === 'ALLOW') status = 'APPROVED';
        else if (decision === 'LOCK') status = 'LOCKED';
        else status = 'STEP_UP_REQUIRED';

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
          domain: 'profile_updates',
          eventType: decision === 'ALLOW' ? 'PROFILE_UPDATE_APPROVED' : decision === 'LOCK' ? 'PROFILE_UPDATE_LOCKED' : 'PROFILE_UPDATE_STEP_UP',
          entityId: id, sellerId: req.body.sellerId,
          riskScore: decision === 'ALLOW' ? 0 : riskScore,
          metadata: { decision, updateType: req.body.updateType }
        });

        // On LOCK: update seller status
        if (decision === 'LOCK' && req.body.sellerId) {
          const seller = await db_ops.getById('sellers', 'seller_id', req.body.sellerId);
          if (seller) {
            await db_ops.update('sellers', 'seller_id', req.body.sellerId, {
              ...seller.data, status: 'UNDER_REVIEW', lockReason: reasoning, lockedAt: new Date().toISOString()
            });
          }
        }

        // Create case on STEP_UP or LOCK
        if (decision === 'STEP_UP' || decision === 'LOCK') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          await db_ops.insert('cases', 'case_id', caseId, {
            caseId, checkpoint: 'PROFILE_UPDATE',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN', sellerId: req.body.sellerId, entityId: id, entityType: 'PROFILE_UPDATE',
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

        console.log(`[ProfileUpdatesService] Completed: ${id} → ${decision} (risk: ${riskScore})`);
      })
      .catch(async error => {
        console.error(`[ProfileUpdatesService] Agent error for ${id}:`, error.message);
        await db_ops.update(COLLECTION, ID_FIELD, id, {
          ...record,
          status: 'STEP_UP_REQUIRED',
          riskScore: 50,
          riskAssessment: { decision: 'STEP_UP', riskScore: 50, reasoning: `Agent error: ${error.message}`, agentId: 'PROFILE_MUTATION', evaluatedAt: new Date().toISOString() },
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
