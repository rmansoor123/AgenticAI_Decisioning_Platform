import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { generatePayout } from '../../../shared/synthetic-data/generators.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getPayoutRiskAgent } from '../../../agents/specialized/payout-risk-agent.js';

const router = express.Router();

// Get all payouts
router.get('/payouts', async (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status } = req.query;

    let payouts = await db_ops.getAll('payouts', parseInt(limit), parseInt(offset));
    payouts = payouts.map(p => p.data);

    if (sellerId) payouts = payouts.filter(p => p.sellerId === sellerId);
    if (status) payouts = payouts.filter(p => p.status === status);

    res.json({
      success: true,
      data: payouts,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: await db_ops.count('payouts')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get payout by ID
router.get('/payouts/:payoutId', async (req, res) => {
  try {
    const payout = await db_ops.getById('payouts', 'payout_id', req.params.payoutId);
    if (!payout) {
      return res.status(404).json({ success: false, error: 'Payout not found' });
    }
    res.json({ success: true, data: payout.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Request payout — async fire-and-forget with real-time TPAOR streaming
router.post('/payouts', async (req, res) => {
  try {
    const { sellerId, amount, method } = req.body;

    // Get seller info
    const seller = await db_ops.getById('sellers', 'seller_id', sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const payoutId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const correlationId = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Create payout immediately with EVALUATING status
    const payout = {
      payoutId,
      sellerId,
      amount,
      currency: 'USD',
      method: method || 'BANK_TRANSFER',
      status: 'EVALUATING',
      riskHold: false,
      holdReason: null,
      riskAssessment: null,
      bankAccount: seller.data.bankAccount || {
        last4: '****',
        bankName: 'Unknown',
        verified: false
      },
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };

    await db_ops.insert('payouts', 'payout_id', payout.payoutId, payout);

    // Return HTTP 202 immediately
    res.status(202).json({
      success: true,
      correlationId,
      payoutId,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    // Fire-and-forget: run PayoutRiskAgent asynchronously
    console.log(`[PayoutService] Evaluating payout: ${payoutId} (correlation: ${correlationId})`);

    const recentPayouts = (await db_ops.getAll('payouts', 1000, 0)).map(p => p.data)
      .filter(p => p.sellerId === sellerId);

    const agent = getPayoutRiskAgent();
    agent.reason({
      type: 'payout_risk_evaluation',
      payoutId,
      sellerId,
      amount,
      method: method || 'BANK_TRANSFER',
      sellerData: seller.data,
      recentPayouts,
      submittedAt: new Date().toISOString()
    }, {
      entityId: payoutId,
      evaluationType: 'payout_risk',
      _correlationId: correlationId
    })
      .then(async agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'HOLD';
        const riskScore = agentResult.result?.overallRisk?.score ?? 50;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'PAYOUT_RISK';

        // Map decision to status
        let payoutStatus;
        if (decision === 'APPROVE') payoutStatus = 'PENDING';
        else if (decision === 'REJECT') payoutStatus = 'REJECTED';
        else payoutStatus = 'ON_HOLD';

        // Update payout with final decision
        await db_ops.update('payouts', 'payout_id', payoutId, {
          ...payout,
          status: payoutStatus,
          riskHold: payoutStatus === 'ON_HOLD',
          holdReason: payoutStatus !== 'PENDING' ? reasoning : null,
          riskAssessment: { riskScore, decision, reasoning, agentId, evaluatedAt: new Date().toISOString() }
        });

        // Emit risk event
        emitRiskEvent({
          sellerId, domain: 'payout',
          eventType: decision === 'APPROVE' ? 'PAYOUT_APPROVED' : decision === 'REJECT' ? 'PAYOUT_REJECTED' : 'PAYOUT_HELD',
          riskScore, metadata: { amount, decision, payoutId }
        });

        // Create case on HOLD or REJECT
        if (decision === 'HOLD' || decision === 'REJECT') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          const caseData = {
            caseId, checkpoint: 'PAYOUT_RISK',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN', sellerId, entityId: payoutId, entityType: 'PAYOUT',
            decision, riskScore, reasoning, agentId, createdAt: new Date().toISOString()
          };
          await db_ops.insert('cases', 'case_id', caseId, caseData);
          triageCase(caseData).catch(() => {});
        }

        // Emit completion event with correlationId
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:complete', {
              correlationId, sellerId, entityId: payoutId, decision, riskScore, reasoning,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}

        console.log(`[PayoutService] Completed: ${payoutId} → ${decision} (risk: ${riskScore})`);
      })
      .catch(async error => {
        console.error(`[PayoutService] Agent error for ${payoutId}:`, error.message);
        // Default to HOLD on error
        await db_ops.update('payouts', 'payout_id', payoutId, {
          ...payout,
          status: 'ON_HOLD',
          riskHold: true,
          holdReason: `Agent error — defaulting to HOLD: ${error.message}`,
          riskAssessment: { riskScore: 50, decision: 'HOLD', reasoning: `Agent error: ${error.message}`, agentId: 'PAYOUT_RISK', evaluatedAt: new Date().toISOString() }
        });
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:error', {
              correlationId, sellerId, entityId: payoutId, error: error.message,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}
      });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update payout status
router.patch('/payouts/:payoutId/status', async (req, res) => {
  try {
    const { status, reason } = req.body;
    const existing = await db_ops.getById('payouts', 'payout_id', req.params.payoutId);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Payout not found' });
    }

    const updated = {
      ...existing.data,
      status,
      statusHistory: [
        ...(existing.data.statusHistory || []),
        { from: existing.data.status, to: status, reason, timestamp: new Date().toISOString() }
      ]
    };

    if (status === 'COMPLETED') {
      updated.completedAt = new Date().toISOString();
    }

    await db_ops.update('payouts', 'payout_id', req.params.payoutId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Release held payout
router.post('/payouts/:payoutId/release', async (req, res) => {
  try {
    const { approvedBy, notes } = req.body;
    const existing = await db_ops.getById('payouts', 'payout_id', req.params.payoutId);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Payout not found' });
    }

    if (existing.data.status !== 'ON_HOLD') {
      return res.status(400).json({ success: false, error: 'Payout is not on hold' });
    }

    const updated = {
      ...existing.data,
      status: 'PROCESSING',
      riskHold: false,
      releaseInfo: {
        approvedBy,
        notes,
        releasedAt: new Date().toISOString()
      }
    };

    await db_ops.update('payouts', 'payout_id', req.params.payoutId, updated);

    // Emit positive risk event for payout release
    emitRiskEvent({
      sellerId: existing.data.sellerId, domain: 'payout', eventType: 'PAYOUT_RELEASED',
      riskScore: -20, metadata: { approvedBy: req.body.approvedBy }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get payouts for a seller
router.get('/sellers/:sellerId/payouts', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const payouts = (await db_ops.getAll('payouts', 1000, 0)).map(p => p.data)
      .filter(p => p.sellerId === req.params.sellerId)
      .slice(0, parseInt(limit));

    res.json({ success: true, data: payouts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get seller payout balance
router.get('/sellers/:sellerId/balance', async (req, res) => {
  try {
    const sellerId = req.params.sellerId;

    const transactions = (await db_ops.getAll('transactions', 10000, 0)).map(t => t.data)
      .filter(t => t.sellerId === sellerId);

    const payouts = (await db_ops.getAll('payouts', 1000, 0)).map(p => p.data)
      .filter(p => p.sellerId === sellerId);

    const salesTotal = transactions
      .filter(t => t.type === 'SALE' && t.decision === 'APPROVED')
      .reduce((sum, t) => sum + t.amount, 0);

    const refundsTotal = transactions
      .filter(t => t.type === 'REFUND')
      .reduce((sum, t) => sum + t.amount, 0);

    const paidOutTotal = payouts
      .filter(p => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.amount, 0);

    const pendingPayouts = payouts
      .filter(p => ['PENDING', 'PROCESSING'].includes(p.status))
      .reduce((sum, p) => sum + p.amount, 0);

    const heldPayouts = payouts
      .filter(p => p.status === 'ON_HOLD')
      .reduce((sum, p) => sum + p.amount, 0);

    res.json({
      success: true,
      data: {
        sellerId,
        availableBalance: salesTotal - refundsTotal - paidOutTotal - pendingPayouts - heldPayouts,
        pendingBalance: pendingPayouts,
        heldBalance: heldPayouts,
        totalEarnings: salesTotal,
        totalRefunds: refundsTotal,
        totalPaidOut: paidOutTotal
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Payout statistics
router.get('/stats', async (req, res) => {
  try {
    const allPayouts = (await db_ops.getAll('payouts', 10000, 0)).map(p => p.data);

    const stats = {
      total: allPayouts.length,
      totalAmount: allPayouts.reduce((sum, p) => sum + p.amount, 0),
      byStatus: {},
      byMethod: {},
      heldPayouts: {
        count: 0,
        amount: 0,
        reasons: {}
      },
      last24Hours: {
        count: 0,
        amount: 0
      }
    };

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    allPayouts.forEach(p => {
      stats.byStatus[p.status] = (stats.byStatus[p.status] || 0) + 1;
      stats.byMethod[p.method] = (stats.byMethod[p.method] || 0) + 1;

      if (p.status === 'ON_HOLD') {
        stats.heldPayouts.count++;
        stats.heldPayouts.amount += p.amount;
        if (p.holdReason) {
          stats.heldPayouts.reasons[p.holdReason] = (stats.heldPayouts.reasons[p.holdReason] || 0) + 1;
        }
      }

      if (new Date(p.createdAt) > oneDayAgo) {
        stats.last24Hours.count++;
        stats.last24Hours.amount += p.amount;
      }
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Non-blocking AlertTriageAgent call for case prioritization
async function triageCase(caseData) {
  try {
    const { default: AlertTriageAgent } = await import('../../../agents/specialized/alert-triage-agent.js');
    const { alertTriage } = await import('../../../agents/index.js');
    const result = await alertTriage.reason(caseData, { evaluationType: 'case_triage' });
    const updatedPriority = result.result?.recommendation?.priority || result.result?.decision?.priority;
    const assignedTeam = result.result?.recommendation?.assignedTeam || result.result?.decision?.assignedTeam;
    if (updatedPriority || assignedTeam) {
      const updates = {};
      if (updatedPriority) updates.priority = updatedPriority;
      if (assignedTeam) updates.assignedTeam = assignedTeam;
      updates.triageResult = { agentId: 'ALERT_TRIAGE', evaluatedAt: new Date().toISOString() };
      await db_ops.update('cases', 'case_id', caseData.caseId, { ...caseData, ...updates });
    }
  } catch (err) {
    console.warn(`[PayoutService] Case triage failed for ${caseData.caseId}:`, err.message);
  }
}

export default router;
