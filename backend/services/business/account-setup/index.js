import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getAccountSetupAgent } from '../../../agents/specialized/account-setup-agent.js';

const router = express.Router();
const COLLECTION = 'account_setups';
const ID_FIELD = 'setup_id';

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
    const byCategory = {};
    let flagged = 0;

    for (const record of all) {
      byStatus[record.status] = (byStatus[record.status] || 0) + 1;
      const cat = record.storeCategory || 'unknown';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      if (record.riskScore > 0) flagged++;
    }

    res.json({
      success: true,
      data: { total: all.length, byStatus, byCategory, flagged }
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

// POST / — Create new record + async agent evaluation with real-time TPAOR streaming
router.post('/', async (req, res) => {
  try {
    const { sellerId, bankAccount, routingNumber, bankCountry, taxId, businessName, registrationNumber, country, storeCategory } = req.body;

    const seller = await db_ops.getById('sellers', 'seller_id', sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const id = `ACCT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const correlationId = `ACCT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const record = {
      [ID_FIELD]: id,
      ...req.body,
      status: 'EVALUATING',
      riskScore: null,
      riskFactors: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db_ops.insert(COLLECTION, ID_FIELD, id, record);

    res.status(202).json({
      success: true,
      correlationId,
      entityId: id,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    console.log(`[AccountSetupService] Evaluating: ${id} (correlation: ${correlationId})`);

    const agent = getAccountSetupAgent();
    agent.reason({
      type: 'account_setup_evaluation',
      setupId: id, sellerId, bankAccount, routingNumber, bankCountry, taxId,
      businessName: businessName || seller.data.businessName,
      registrationNumber, country: country || seller.data.country,
      storeCategory, sellerData: seller.data,
      submittedAt: new Date().toISOString()
    }, {
      entityId: id, evaluationType: 'account_setup', _correlationId: correlationId
    })
      .then(async agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'REVIEW';
        const riskScore = agentResult.result?.overallRisk?.score ?? 50;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'ACCOUNT_SETUP';

        let status;
        if (decision === 'APPROVE') status = 'ACTIVE';
        else if (decision === 'REJECT') status = 'REJECTED';
        else status = 'PENDING_REVIEW';

        await db_ops.update(COLLECTION, ID_FIELD, record.id || id, {
          ...record, status, riskScore,
          riskFactors: (agentResult.result?.riskFactors || []).map(f => f.factor),
          riskAssessment: { riskScore, decision, reasoning, agentId, evaluatedAt: new Date().toISOString() },
          updatedAt: new Date().toISOString()
        });

        emitRiskEvent({
          sellerId, domain: 'account_setup',
          eventType: decision === 'APPROVE' ? 'ACCOUNT_SETUP_APPROVED' : decision === 'REJECT' ? 'ACCOUNT_SETUP_REJECTED' : 'ACCOUNT_SETUP_REVIEW',
          riskScore, metadata: { decision, entityId: id }
        });

        if (decision !== 'APPROVE') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          await db_ops.insert('cases', 'case_id', caseId, {
            caseId, checkpoint: 'ACCOUNT_SETUP', priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN', sellerId, entityId: id, entityType: 'ACCOUNT_SETUP',
            decision, riskScore, reasoning, agentId, createdAt: new Date().toISOString()
          });
        }

        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:complete', { correlationId, sellerId, entityId: id, decision, riskScore, reasoning, timestamp: new Date().toISOString() });
          }).catch(() => {});
        } catch {}

        console.log(`[AccountSetupService] Completed: ${id} → ${decision} (risk: ${riskScore})`);
      })
      .catch(async error => {
        console.error(`[AccountSetupService] Agent error for ${id}:`, error.message);
        await db_ops.update(COLLECTION, ID_FIELD, record.id || id, {
          ...record, status: 'PENDING_REVIEW', riskScore: 50,
          riskAssessment: { riskScore: 50, decision: 'REVIEW', reasoning: `Agent error — defaulting to REVIEW: ${error.message}`, agentId: 'ACCOUNT_SETUP', evaluatedAt: new Date().toISOString() },
          updatedAt: new Date().toISOString()
        });
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:error', { correlationId, sellerId, entityId: id, error: error.message, timestamp: new Date().toISOString() });
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
