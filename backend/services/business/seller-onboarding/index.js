import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { generateSeller } from '../../../shared/synthetic-data/generators.js';

const router = express.Router();

// Get all sellers with pagination and filters
router.get('/sellers', (req, res) => {
  try {
    const { limit = 50, offset = 0, status, riskTier, country } = req.query;

    let sellers = db_ops.getAll('sellers', parseInt(limit), parseInt(offset));
    sellers = sellers.map(s => s.data);

    // Apply filters
    if (status) {
      sellers = sellers.filter(s => s.status === status);
    }
    if (riskTier) {
      sellers = sellers.filter(s => s.riskTier === riskTier);
    }
    if (country) {
      sellers = sellers.filter(s => s.country === country);
    }

    res.json({
      success: true,
      data: sellers,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: db_ops.count('sellers')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get seller by ID
router.get('/sellers/:sellerId', (req, res) => {
  try {
    const seller = db_ops.getById('sellers', 'seller_id', req.params.sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }
    res.json({ success: true, data: seller.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new seller (onboarding)
router.post('/sellers', (req, res) => {
  try {
    const sellerData = req.body.sellerId ? req.body : generateSeller();

    // Perform risk assessment during onboarding
    const riskAssessment = performOnboardingRiskAssessment(sellerData);
    sellerData.onboardingRiskAssessment = riskAssessment;

    if (riskAssessment.decision === 'REJECT') {
      sellerData.status = 'BLOCKED';
    } else if (riskAssessment.decision === 'REVIEW') {
      sellerData.status = 'UNDER_REVIEW';
    } else {
      sellerData.status = 'PENDING';
    }

    db_ops.insert('sellers', 'seller_id', sellerData.sellerId, sellerData);

    res.status(201).json({
      success: true,
      data: sellerData,
      riskAssessment
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update seller
router.put('/sellers/:sellerId', (req, res) => {
  try {
    const existing = db_ops.getById('sellers', 'seller_id', req.params.sellerId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const updated = { ...existing.data, ...req.body, updatedAt: new Date().toISOString() };
    db_ops.update('sellers', 'seller_id', req.params.sellerId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update seller status
router.patch('/sellers/:sellerId/status', (req, res) => {
  try {
    const { status, reason } = req.body;
    const existing = db_ops.getById('sellers', 'seller_id', req.params.sellerId);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const updated = {
      ...existing.data,
      status,
      statusHistory: [
        ...(existing.data.statusHistory || []),
        { from: existing.data.status, to: status, reason, timestamp: new Date().toISOString() }
      ],
      updatedAt: new Date().toISOString()
    };

    db_ops.update('sellers', 'seller_id', req.params.sellerId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get seller KYC status
router.get('/sellers/:sellerId/kyc', (req, res) => {
  try {
    const seller = db_ops.getById('sellers', 'seller_id', req.params.sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    res.json({
      success: true,
      data: {
        sellerId: seller.data.sellerId,
        kycVerified: seller.data.kycVerified,
        bankVerified: seller.data.bankVerified,
        verificationDetails: {
          identityCheck: seller.data.kycVerified ? 'PASSED' : 'PENDING',
          addressCheck: seller.data.kycVerified ? 'PASSED' : 'PENDING',
          bankAccountCheck: seller.data.bankVerified ? 'PASSED' : 'PENDING',
          sanctionsCheck: 'PASSED',
          pepCheck: 'PASSED'
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get onboarding statistics
router.get('/stats', (req, res) => {
  try {
    const allSellers = db_ops.getAll('sellers', 10000, 0).map(s => s.data);

    const stats = {
      total: allSellers.length,
      byStatus: {},
      byRiskTier: {},
      byCountry: {},
      recentOnboardings: allSellers
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10)
        .map(s => ({
          sellerId: s.sellerId,
          businessName: s.businessName,
          status: s.status,
          riskTier: s.riskTier,
          createdAt: s.createdAt
        }))
    };

    allSellers.forEach(s => {
      stats.byStatus[s.status] = (stats.byStatus[s.status] || 0) + 1;
      stats.byRiskTier[s.riskTier] = (stats.byRiskTier[s.riskTier] || 0) + 1;
      stats.byCountry[s.country] = (stats.byCountry[s.country] || 0) + 1;
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function for onboarding risk assessment
function performOnboardingRiskAssessment(seller) {
  const signals = [];
  let riskScore = 0;

  // Check various risk factors
  if (!seller.kycVerified) {
    signals.push({ signal: 'KYC_NOT_VERIFIED', weight: 20 });
    riskScore += 20;
  }

  if (!seller.bankVerified) {
    signals.push({ signal: 'BANK_NOT_VERIFIED', weight: 15 });
    riskScore += 15;
  }

  if (['NG', 'RO', 'UA', 'PK'].includes(seller.country)) {
    signals.push({ signal: 'HIGH_RISK_COUNTRY', weight: 25 });
    riskScore += 25;
  }

  // Email domain check
  const emailDomain = seller.email?.split('@')[1];
  if (emailDomain && ['tempmail.com', 'guerrillamail.com', '10minutemail.com'].includes(emailDomain)) {
    signals.push({ signal: 'DISPOSABLE_EMAIL', weight: 30 });
    riskScore += 30;
  }

  // Decision logic
  let decision = 'APPROVE';
  if (riskScore >= 50) {
    decision = 'REJECT';
  } else if (riskScore >= 25) {
    decision = 'REVIEW';
  }

  return {
    riskScore,
    signals,
    decision,
    evaluatedAt: new Date().toISOString()
  };
}

export default router;
