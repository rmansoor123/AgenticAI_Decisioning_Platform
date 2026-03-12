import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getPaymentRiskAgent } from '../../../agents/specialized/payment-risk-agent.js';

const router = express.Router();

// Get all payments
router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status, paymentType } = req.query;

    let payments = db_ops.getAll('payments', parseInt(limit), parseInt(offset));
    payments = payments.map(p => p.data);

    if (sellerId) payments = payments.filter(p => p.sellerId === sellerId);
    if (status) payments = payments.filter(p => p.status === status);
    if (paymentType) payments = payments.filter(p => p.paymentType === paymentType);

    res.json({
      success: true,
      data: payments,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: db_ops.count('payments')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get payment statistics
router.get('/stats', (req, res) => {
  try {
    const allPayments = db_ops.getAll('payments', 10000, 0).map(p => p.data);

    const stats = {
      total: allPayments.length,
      byStatus: {},
      byPaymentType: {},
      byCurrency: {},
      last24Hours: {
        total: 0,
        blocked: 0,
        challenged: 0,
        totalAmount: 0
      },
      totalAmount: 0
    };

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    allPayments.forEach(p => {
      stats.byStatus[p.status] = (stats.byStatus[p.status] || 0) + 1;
      if (p.paymentType) stats.byPaymentType[p.paymentType] = (stats.byPaymentType[p.paymentType] || 0) + 1;
      if (p.currency) stats.byCurrency[p.currency] = (stats.byCurrency[p.currency] || 0) + 1;
      stats.totalAmount += p.amount || 0;

      if (new Date(p.createdAt) > oneDayAgo) {
        stats.last24Hours.total++;
        stats.last24Hours.totalAmount += p.amount || 0;
        if (p.status === 'BLOCK') stats.last24Hours.blocked++;
        if (p.status === 'CHALLENGE') stats.last24Hours.challenged++;
      }
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get payment by ID
router.get('/:id', (req, res) => {
  try {
    const payment = db_ops.getById('payments', 'payment_id', req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }
    res.json({ success: true, data: payment.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create payment and evaluate risk
router.post('/', async (req, res) => {
  try {
    const { sellerId, amount, cardBin, cardLast4, paymentType, currency, billingCountry, deviceFingerprint } = req.body;

    const seller = db_ops.getById('sellers', 'seller_id', sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const correlationId = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const record = {
      paymentId,
      sellerId,
      amount,
      cardBin,
      cardLast4,
      paymentType,
      currency,
      billingCountry,
      deviceFingerprint,
      status: 'EVALUATING',
      riskScore: null,
      riskLevel: null,
      createdAt: new Date().toISOString()
    };

    db_ops.insert('payments', 'payment_id', paymentId, record);

    res.status(202).json({
      success: true,
      correlationId,
      paymentId,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    // Fire-and-forget: run PaymentRiskAgent asynchronously
    console.log(`[PaymentService] Evaluating payment: ${paymentId} (correlation: ${correlationId})`);

    const agent = getPaymentRiskAgent();
    agent.reason({
      type: 'payment_risk',
      paymentId,
      sellerId,
      amount,
      cardBin,
      cardLast4,
      paymentType,
      currency,
      billingCountry,
      deviceFingerprint,
      sellerData: seller.data,
      submittedAt: new Date().toISOString()
    }, {
      entityId: paymentId,
      evaluationType: 'payment_risk',
      _correlationId: correlationId
    })
      .then(agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'BLOCK';
        const riskScore = agentResult.result?.overallRisk?.score ?? 75;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'PAYMENT_RISK';

        const riskLevel = riskScore >= 66 ? 'CRITICAL' : riskScore >= 40 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW';

        db_ops.update('payments', 'payment_id', paymentId, {
          ...record,
          status: decision,
          riskScore,
          riskLevel,
          riskAssessment: { riskScore, decision, reasoning, agentId, evaluatedAt: new Date().toISOString() }
        });

        emitRiskEvent({
          sellerId, domain: 'payment',
          eventType: decision === 'APPROVE' ? 'PAYMENT_APPROVED' : decision === 'CHALLENGE' ? 'PAYMENT_CHALLENGED' : 'PAYMENT_BLOCKED',
          riskScore, metadata: { decision, paymentId, amount, paymentType, currency }
        });

        if (decision !== 'APPROVE') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          const caseData = {
            caseId, checkpoint: 'PAYMENT_RISK',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN', sellerId, entityId: paymentId, entityType: 'PAYMENT',
            decision, riskScore, reasoning, agentId, createdAt: new Date().toISOString()
          };
          db_ops.insert('cases', 'case_id', caseId, caseData);
        }

        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:complete', {
              correlationId, sellerId, entityId: paymentId, decision, riskScore, reasoning,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}

        console.log(`[PaymentService] Completed: ${paymentId} → ${decision} (risk: ${riskScore})`);
      })
      .catch(error => {
        console.error(`[PaymentService] Agent error for ${paymentId}:`, error.message);
        db_ops.update('payments', 'payment_id', paymentId, {
          ...record,
          status: 'BLOCK',
          riskScore: 75,
          riskLevel: 'HIGH',
          riskAssessment: { riskScore: 75, decision: 'BLOCK', reasoning: `Agent error — defaulting to BLOCK: ${error.message}`, agentId: 'PAYMENT_RISK', evaluatedAt: new Date().toISOString() }
        });
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:error', {
              correlationId, sellerId, entityId: paymentId, error: error.message,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}
      });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update payment status
router.patch('/:id/status', (req, res) => {
  try {
    const { status, reason } = req.body;
    const payment = db_ops.getById('payments', 'payment_id', req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    const validStatuses = ['APPROVE', 'CHALLENGE', 'BLOCK', 'EVALUATING'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    db_ops.update('payments', 'payment_id', req.params.id, {
      ...payment.data,
      status,
      statusReason: reason,
      statusUpdatedAt: new Date().toISOString()
    });

    res.json({ success: true, data: { paymentId: req.params.id, status, updatedAt: new Date().toISOString() } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
