import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getBehavioralAnalyticsAgent } from '../../../agents/specialized/behavioral-analytics-agent.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// GET / — List behavioral analytics checks with optional filtering
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId } = req.query;

    let records = db_ops.getAll('behavior_checks') || [];

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
// GET /stats — Aggregate statistics for behavioral analytics checks
// ---------------------------------------------------------------------------
router.get('/stats', async (req, res) => {
  try {
    const records = db_ops.getAll('behavior_checks') || [];

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
// GET /:id — Retrieve a single behavioral analytics check by ID
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const record = db_ops.getById('behavior_checks', 'check_id', req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Behavior check not found' });
    }
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST / — Create a new behavioral analytics check and fire-and-forget agent
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { sellerId, sessionId, clickRate, typingSpeed, browsingRatio, deviceFingerprint, actionTimestamps } = req.body;

    const seller = db_ops.getById('sellers', 'seller_id', sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const checkId = `BHV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const correlationId = `BHV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const record = {
      check_id: checkId,
      sellerId,
      sessionId,
      clickRate,
      typingSpeed,
      browsingRatio,
      deviceFingerprint,
      actionTimestamps,
      status: 'EVALUATING',
      riskScore: null,
      createdAt: new Date().toISOString()
    };

    db_ops.insert('behavior_checks', 'check_id', checkId, record);

    res.status(202).json({
      success: true,
      correlationId,
      checkId,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    // Fire-and-forget: run the behavioral analytics agent
    const agent = getBehavioralAnalyticsAgent();
    agent.reason(
      {
        type: 'behavioral_analytics',
        sellerId,
        sessionId,
        clickRate,
        typingSpeed,
        browsingRatio,
        deviceFingerprint,
        actionTimestamps,
        sellerData: seller.data,
        submittedAt: new Date().toISOString()
      },
      {
        entityId: checkId,
        evaluationType: 'behavioral_analytics',
        _correlationId: correlationId
      }
    )
      .then(agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'FLAG';
        const riskScore = agentResult.result?.overallRisk?.score ?? 75;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'behavioral-analytics-agent';

        db_ops.update('behavior_checks', 'check_id', checkId, {
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
          domain: 'behavioral',
          eventType: `BEHAVIORAL_${decision}`,
          riskScore,
          metadata: { decision, checkId }
        });

        // Create case for non-NORMAL decisions
        if (decision !== 'NORMAL') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          db_ops.insert('cases', 'case_id', caseId, {
            caseId,
            checkpoint: 'BEHAVIORAL_ANALYTICS',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN',
            sellerId,
            entityId: checkId,
            entityType: 'behavior_check',
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

        console.log(`[BehavioralAnalytics] Completed: ${checkId} → ${decision} (risk: ${riskScore})`);
      })
      .catch(error => {
        console.error(`[BehavioralAnalytics] Agent error for ${checkId}:`, error.message);

        db_ops.update('behavior_checks', 'check_id', checkId, {
          ...record,
          status: 'FLAG',
          riskScore: 75,
          riskAssessment: {
            riskScore: 75,
            decision: 'FLAG',
            reasoning: `Agent error: ${error.message}`,
            agentId: 'behavioral-analytics-agent',
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
// PATCH /:id/status — Update the status of a behavioral analytics check
// ---------------------------------------------------------------------------
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const record = db_ops.getById('behavior_checks', 'check_id', req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Behavior check not found' });
    }

    const validStatuses = ['NORMAL', 'FLAG', 'CHALLENGE', 'EVALUATING'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const updated = { ...record, status, updatedAt: new Date().toISOString() };
    db_ops.update('behavior_checks', 'check_id', req.params.id, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
