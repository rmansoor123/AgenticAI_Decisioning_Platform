import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getBuyerTrustAgent } from '../../../agents/specialized/buyer-trust-agent.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// GET / — List buyer trust checks with optional filtering
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId } = req.query;

    let records = db_ops.getAll('buyer_checks') || [];

    if (sellerId) {
      records = records.filter(r => r.sellerId === sellerId);
    }

    const total = records.length;
    const paginated = records
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      success: true,
      data: paginated,
      pagination: { total, limit: Number(limit), offset: Number(offset) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /stats — Aggregate statistics for buyer trust checks
// ---------------------------------------------------------------------------
router.get('/stats', async (req, res) => {
  try {
    const records = db_ops.getAll('buyer_checks') || [];

    const byStatus = records.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    const recent = records
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    res.json({
      success: true,
      stats: {
        total: records.length,
        byStatus,
        recent
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /:id — Retrieve a single buyer trust check by ID
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const record = db_ops.getById('buyer_checks', 'check_id', req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Buyer check not found' });
    }
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST / — Create a new buyer trust check and fire-and-forget agent
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { sellerId, buyerId, purchaseAmount, isFirstPurchase, chargebackHistory, disputeCount, deviceFingerprint } = req.body;

    const seller = db_ops.getById('sellers', 'seller_id', sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const checkId = `BTR-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const correlationId = `BTR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const record = {
      check_id: checkId,
      sellerId,
      buyerId,
      purchaseAmount,
      isFirstPurchase,
      chargebackHistory,
      disputeCount,
      deviceFingerprint,
      status: 'EVALUATING',
      riskScore: null,
      createdAt: new Date().toISOString()
    };

    db_ops.insert('buyer_checks', 'check_id', checkId, record);

    res.status(202).json({
      success: true,
      correlationId,
      checkId,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    // Fire-and-forget: run the buyer trust agent
    const agent = getBuyerTrustAgent();
    agent.reason(
      {
        type: 'buyer_trust',
        sellerId,
        buyerId,
        purchaseAmount,
        isFirstPurchase,
        chargebackHistory,
        disputeCount,
        deviceFingerprint,
        sellerData: seller.data,
        submittedAt: new Date().toISOString()
      },
      {
        entityId: checkId,
        evaluationType: 'buyer_trust',
        _correlationId: correlationId
      }
    )
      .then(agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'FLAG';
        const riskScore = agentResult.result?.overallRisk?.score ?? 75;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'buyer-trust-agent';

        db_ops.update('buyer_checks', 'check_id', checkId, {
          ...record,
          status: decision,
          riskScore,
          riskAssessment: {
            riskScore,
            decision,
            reasoning,
            agentId,
            evaluatedAt: new Date().toISOString()
          }
        });

        emitRiskEvent({
          sellerId,
          domain: 'buyer_trust',
          eventType: `BUYER_TRUST_${decision}`,
          riskScore,
          metadata: { decision, checkId }
        });

        // Create case for non-APPROVE decisions
        if (decision !== 'APPROVE') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          db_ops.insert('cases', 'case_id', caseId, {
            caseId,
            checkpoint: 'BUYER_TRUST',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN',
            sellerId,
            entityId: checkId,
            entityType: 'buyer_check',
            decision,
            riskScore,
            reasoning,
            agentId,
            createdAt: new Date().toISOString()
          });
        }

        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:complete', {
              correlationId,
              sellerId,
              entityId: checkId,
              decision,
              riskScore,
              reasoning,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}

        console.log(`[BuyerTrust] Completed: ${checkId} → ${decision} (risk: ${riskScore})`);
      })
      .catch(error => {
        console.error(`[BuyerTrust] Agent error for ${checkId}:`, error.message);

        db_ops.update('buyer_checks', 'check_id', checkId, {
          ...record,
          status: 'FLAG',
          riskScore: 75,
          riskAssessment: {
            riskScore: 75,
            decision: 'FLAG',
            reasoning: `Agent error: ${error.message}`,
            agentId: 'buyer-trust-agent',
            evaluatedAt: new Date().toISOString()
          }
        });

        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:error', {
              correlationId,
              sellerId,
              entityId: checkId,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}
      });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /:id/status — Update the status of a buyer trust check
// ---------------------------------------------------------------------------
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const record = db_ops.getById('buyer_checks', 'check_id', req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Buyer check not found' });
    }

    const validStatuses = ['APPROVE', 'FLAG', 'RESTRICT', 'EVALUATING'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const updated = { ...record, status, updatedAt: new Date().toISOString() };
    db_ops.update('buyer_checks', 'check_id', req.params.id, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
