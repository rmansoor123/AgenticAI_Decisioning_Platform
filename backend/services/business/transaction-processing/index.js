import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getTransactionRiskAgent } from '../../../agents/specialized/transaction-risk-agent.js';

const router = express.Router();

// Get all transactions
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status, riskLevel } = req.query;

    let transactions = await db_ops.getAll('transactions', parseInt(limit), parseInt(offset));
    transactions = transactions.map(t => t.data);

    if (sellerId) transactions = transactions.filter(t => t.sellerId === sellerId);
    if (status) transactions = transactions.filter(t => t.status === status);
    if (riskLevel) transactions = transactions.filter(t => t.riskLevel === riskLevel);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: await db_ops.count('transactions')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get transaction statistics
router.get('/stats', async (req, res) => {
  try {
    const allTransactions = (await db_ops.getAll('transactions', 10000, 0)).map(t => t.data);

    const stats = {
      total: allTransactions.length,
      byStatus: {},
      byRiskLevel: {},
      byPaymentMethod: {},
      last24Hours: {
        total: 0,
        blocked: 0,
        challenged: 0,
        totalAmount: 0
      },
      totalAmount: 0
    };

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    allTransactions.forEach(t => {
      stats.byStatus[t.status] = (stats.byStatus[t.status] || 0) + 1;
      if (t.riskLevel) stats.byRiskLevel[t.riskLevel] = (stats.byRiskLevel[t.riskLevel] || 0) + 1;
      if (t.paymentMethod) stats.byPaymentMethod[t.paymentMethod] = (stats.byPaymentMethod[t.paymentMethod] || 0) + 1;
      stats.totalAmount += t.amount || 0;

      if (new Date(t.createdAt) > oneDayAgo) {
        stats.last24Hours.total++;
        stats.last24Hours.totalAmount += t.amount || 0;
        if (t.status === 'BLOCK') stats.last24Hours.blocked++;
        if (t.status === 'CHALLENGE') stats.last24Hours.challenged++;
      }
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get transaction by ID
router.get('/:id', async (req, res) => {
  try {
    const transaction = await db_ops.getById('transactions', 'transaction_id', req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }
    res.json({ success: true, data: transaction.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create transaction and evaluate risk
router.post('/', async (req, res) => {
  try {
    const { sellerId, amount, buyerId, paymentMethod, itemId, shippingAddress, deviceFingerprint } = req.body;

    const seller = await db_ops.getById('sellers', 'seller_id', sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const correlationId = `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const record = {
      transactionId,
      sellerId,
      amount,
      buyerId,
      paymentMethod,
      itemId,
      shippingAddress,
      deviceFingerprint,
      status: 'EVALUATING',
      riskScore: null,
      riskLevel: null,
      createdAt: new Date().toISOString()
    };

    await db_ops.insert('transactions', 'transaction_id', transactionId, record);

    res.status(202).json({
      success: true,
      correlationId,
      transactionId,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    // Fire-and-forget: run TransactionRiskAgent asynchronously
    console.log(`[TransactionService] Evaluating transaction: ${transactionId} (correlation: ${correlationId})`);

    const agent = getTransactionRiskAgent();
    agent.reason({
      type: 'transaction_risk',
      transactionId,
      sellerId,
      amount,
      buyerId,
      paymentMethod,
      itemId,
      shippingAddress,
      deviceFingerprint,
      sellerData: seller.data,
      submittedAt: new Date().toISOString()
    }, {
      entityId: transactionId,
      evaluationType: 'transaction_risk',
      _correlationId: correlationId
    })
      .then(async agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'BLOCK';
        const riskScore = agentResult.result?.overallRisk?.score ?? 75;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'TRANSACTION_RISK';

        const riskLevel = riskScore >= 66 ? 'CRITICAL' : riskScore >= 40 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW';

        await db_ops.update('transactions', 'transaction_id', transactionId, {
          ...record,
          status: decision,
          riskScore,
          riskLevel,
          riskAssessment: { riskScore, decision, reasoning, agentId, evaluatedAt: new Date().toISOString() }
        });

        emitRiskEvent({
          sellerId, domain: 'transaction',
          eventType: decision === 'APPROVE' ? 'TRANSACTION_APPROVED' : decision === 'CHALLENGE' ? 'TRANSACTION_CHALLENGED' : 'TRANSACTION_BLOCKED',
          riskScore, metadata: { decision, transactionId, amount, paymentMethod }
        });

        if (decision !== 'APPROVE') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          const caseData = {
            caseId, checkpoint: 'TRANSACTION_RISK',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN', sellerId, entityId: transactionId, entityType: 'TRANSACTION',
            decision, riskScore, reasoning, agentId, createdAt: new Date().toISOString()
          };
          await db_ops.insert('cases', 'case_id', caseId, caseData);
        }

        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:complete', {
              correlationId, sellerId, entityId: transactionId, decision, riskScore, reasoning,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}

        console.log(`[TransactionService] Completed: ${transactionId} → ${decision} (risk: ${riskScore})`);
      })
      .catch(async error => {
        console.error(`[TransactionService] Agent error for ${transactionId}:`, error.message);
        await db_ops.update('transactions', 'transaction_id', transactionId, {
          ...record,
          status: 'BLOCK',
          riskScore: 75,
          riskLevel: 'HIGH',
          riskAssessment: { riskScore: 75, decision: 'BLOCK', reasoning: `Agent error — defaulting to BLOCK: ${error.message}`, agentId: 'TRANSACTION_RISK', evaluatedAt: new Date().toISOString() }
        });
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:error', {
              correlationId, sellerId, entityId: transactionId, error: error.message,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}
      });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update transaction status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, reason } = req.body;
    const transaction = await db_ops.getById('transactions', 'transaction_id', req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    const validStatuses = ['APPROVE', 'CHALLENGE', 'BLOCK', 'EVALUATING'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    await db_ops.update('transactions', 'transaction_id', req.params.id, {
      ...transaction.data,
      status,
      statusReason: reason,
      statusUpdatedAt: new Date().toISOString()
    });

    res.json({ success: true, data: { transactionId: req.params.id, status, updatedAt: new Date().toISOString() } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
