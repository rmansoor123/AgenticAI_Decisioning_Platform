import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getReviewIntegrityAgent } from '../../../agents/specialized/review-integrity-agent.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// GET / — List review integrity checks with optional filtering
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId } = req.query;

    let records = await db_ops.getAll('review_checks') || [];

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
// GET /stats — Aggregate statistics for review integrity checks
// ---------------------------------------------------------------------------
router.get('/stats', async (req, res) => {
  try {
    const records = await db_ops.getAll('review_checks') || [];

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
// GET /:id — Retrieve a single review integrity check by ID
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const record = await db_ops.getById('review_checks', 'check_id', req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Review check not found' });
    }
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST / — Create a new review integrity check and fire-and-forget agent
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { sellerId, reviewId, reviewerAccount, rating, reviewText, purchaseDate } = req.body;

    const seller = await db_ops.getById('sellers', 'seller_id', sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const checkId = `REV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const correlationId = `REV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const record = {
      check_id: checkId,
      sellerId,
      reviewId,
      reviewerAccount,
      rating,
      reviewText,
      purchaseDate,
      status: 'EVALUATING',
      riskScore: null,
      createdAt: new Date().toISOString()
    };

    await db_ops.insert('review_checks', 'check_id', checkId, record);

    res.status(202).json({
      success: true,
      correlationId,
      checkId,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    // Fire-and-forget: run the review integrity agent
    const agent = getReviewIntegrityAgent();
    agent.reason(
      {
        type: 'review_integrity',
        sellerId,
        reviewId,
        reviewerAccount,
        rating,
        reviewText,
        purchaseDate,
        sellerData: seller.data,
        submittedAt: new Date().toISOString()
      },
      {
        entityId: checkId,
        evaluationType: 'review_integrity',
        _correlationId: correlationId
      }
    )
      .then(async agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'FLAG';
        const riskScore = agentResult.result?.overallRisk?.score ?? 75;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'review-integrity-agent';

        await db_ops.update('review_checks', 'check_id', checkId, {
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
          domain: 'review',
          eventType: `REVIEW_${decision}`,
          riskScore,
          metadata: { decision, checkId }
        });

        // Create case for non-APPROVE decisions
        if (decision !== 'APPROVE') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          await db_ops.insert('cases', 'case_id', caseId, {
            caseId,
            checkpoint: 'REVIEW_INTEGRITY',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN',
            sellerId,
            entityId: checkId,
            entityType: 'review_check',
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

        console.log(`[ReviewIntegrity] Completed: ${checkId} → ${decision} (risk: ${riskScore})`);
      })
      .catch(async error => {
        console.error(`[ReviewIntegrity] Agent error for ${checkId}:`, error.message);

        await db_ops.update('review_checks', 'check_id', checkId, {
          ...record,
          status: 'FLAG',
          riskScore: 75,
          riskAssessment: {
            riskScore: 75,
            decision: 'FLAG',
            reasoning: `Agent error: ${error.message}`,
            agentId: 'review-integrity-agent',
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
// PATCH /:id/status — Update the status of a review integrity check
// ---------------------------------------------------------------------------
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const record = await db_ops.getById('review_checks', 'check_id', req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Review check not found' });
    }

    const validStatuses = ['APPROVE', 'FLAG', 'REMOVE', 'EVALUATING'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const updated = { ...record, status, updatedAt: new Date().toISOString() };
    await db_ops.update('review_checks', 'check_id', req.params.id, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
