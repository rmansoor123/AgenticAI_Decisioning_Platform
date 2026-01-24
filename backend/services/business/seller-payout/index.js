import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { generatePayout } from '../../../shared/synthetic-data/generators.js';

const router = express.Router();

// Get all payouts
router.get('/payouts', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status } = req.query;

    let payouts = db_ops.getAll('payouts', parseInt(limit), parseInt(offset));
    payouts = payouts.map(p => p.data);

    if (sellerId) payouts = payouts.filter(p => p.sellerId === sellerId);
    if (status) payouts = payouts.filter(p => p.status === status);

    res.json({
      success: true,
      data: payouts,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: db_ops.count('payouts')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get payout by ID
router.get('/payouts/:payoutId', (req, res) => {
  try {
    const payout = db_ops.getById('payouts', 'payout_id', req.params.payoutId);
    if (!payout) {
      return res.status(404).json({ success: false, error: 'Payout not found' });
    }
    res.json({ success: true, data: payout.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Request payout
router.post('/payouts', (req, res) => {
  try {
    const { sellerId, amount, method } = req.body;

    // Get seller info for risk assessment
    const seller = db_ops.getById('sellers', 'seller_id', sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    // Get recent payouts for velocity check
    const recentPayouts = db_ops.getAll('payouts', 1000, 0)
      .map(p => p.data)
      .filter(p => p.sellerId === sellerId);

    // Perform payout risk assessment
    const riskAssessment = performPayoutRiskAssessment({
      sellerId,
      amount,
      sellerData: seller.data,
      recentPayouts
    });

    const payout = {
      payoutId: `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      sellerId,
      amount,
      currency: 'USD',
      method: method || 'BANK_TRANSFER',
      status: riskAssessment.decision === 'HOLD' ? 'ON_HOLD' : 'PENDING',
      riskHold: riskAssessment.decision === 'HOLD',
      holdReason: riskAssessment.decision === 'HOLD' ? riskAssessment.holdReason : null,
      riskAssessment,
      bankAccount: seller.data.bankAccount || {
        last4: '****',
        bankName: 'Unknown',
        verified: false
      },
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };

    db_ops.insert('payouts', 'payout_id', payout.payoutId, payout);

    res.status(201).json({
      success: true,
      data: payout,
      riskAssessment
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update payout status
router.patch('/payouts/:payoutId/status', (req, res) => {
  try {
    const { status, reason } = req.body;
    const existing = db_ops.getById('payouts', 'payout_id', req.params.payoutId);

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

    db_ops.update('payouts', 'payout_id', req.params.payoutId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Release held payout
router.post('/payouts/:payoutId/release', (req, res) => {
  try {
    const { approvedBy, notes } = req.body;
    const existing = db_ops.getById('payouts', 'payout_id', req.params.payoutId);

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

    db_ops.update('payouts', 'payout_id', req.params.payoutId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get payouts for a seller
router.get('/sellers/:sellerId/payouts', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const payouts = db_ops.getAll('payouts', 1000, 0)
      .map(p => p.data)
      .filter(p => p.sellerId === req.params.sellerId)
      .slice(0, parseInt(limit));

    res.json({ success: true, data: payouts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get seller payout balance
router.get('/sellers/:sellerId/balance', (req, res) => {
  try {
    const sellerId = req.params.sellerId;

    // Get seller transactions (sales)
    const transactions = db_ops.getAll('transactions', 10000, 0)
      .map(t => t.data)
      .filter(t => t.sellerId === sellerId);

    // Get seller payouts
    const payouts = db_ops.getAll('payouts', 1000, 0)
      .map(p => p.data)
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
router.get('/stats', (req, res) => {
  try {
    const allPayouts = db_ops.getAll('payouts', 10000, 0).map(p => p.data);

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

// Helper function for payout risk assessment
function performPayoutRiskAssessment({ sellerId, amount, sellerData, recentPayouts }) {
  const signals = [];
  let riskScore = 0;
  let holdReason = null;

  // Check seller risk tier
  if (sellerData.riskTier === 'HIGH' || sellerData.riskTier === 'CRITICAL') {
    signals.push({ signal: 'HIGH_RISK_SELLER', weight: 30 });
    riskScore += 30;
  }

  // Check if bank is verified
  if (!sellerData.bankVerified) {
    signals.push({ signal: 'BANK_NOT_VERIFIED', weight: 40 });
    riskScore += 40;
    holdReason = 'Bank account not verified';
  }

  // Check account age
  const accountAgeDays = (new Date() - new Date(sellerData.createdAt)) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < 30) {
    signals.push({ signal: 'NEW_ACCOUNT', weight: 20 });
    riskScore += 20;
  }

  // Check payout velocity
  const last24hPayouts = recentPayouts.filter(p =>
    new Date() - new Date(p.createdAt) < 24 * 60 * 60 * 1000
  );
  if (last24hPayouts.length >= 3) {
    signals.push({ signal: 'HIGH_PAYOUT_VELOCITY', weight: 25 });
    riskScore += 25;
    holdReason = holdReason || 'Unusual payout velocity';
  }

  // Check amount threshold
  if (amount > 10000) {
    signals.push({ signal: 'HIGH_AMOUNT', weight: 15 });
    riskScore += 15;
  }

  // Check if amount exceeds seller's average
  const avgPayout = recentPayouts.length > 0
    ? recentPayouts.reduce((sum, p) => sum + p.amount, 0) / recentPayouts.length
    : amount;
  if (amount > avgPayout * 3) {
    signals.push({ signal: 'UNUSUAL_AMOUNT', weight: 20 });
    riskScore += 20;
    holdReason = holdReason || 'Amount significantly higher than usual';
  }

  // Decision
  let decision = 'APPROVE';
  if (riskScore >= 50) {
    decision = 'HOLD';
  }

  return {
    riskScore,
    signals,
    decision,
    holdReason,
    evaluatedAt: new Date().toISOString()
  };
}

export default router;
