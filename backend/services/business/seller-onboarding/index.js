import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { generateSeller } from '../../../shared/synthetic-data/generators.js';
import { sellerOnboarding } from '../../../agents/index.js';
import { createTestSellersWithConnections } from './test-connections.js';

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

// Create new seller (onboarding) - Now uses Agentic AI
router.post('/sellers', async (req, res) => {
  try {
    const sellerData = req.body.sellerId ? req.body : generateSeller();
    const sellerId = sellerData.sellerId || `SLR-${Date.now().toString(36).toUpperCase()}`;
    sellerData.sellerId = sellerId;

    // Use Agentic AI for comprehensive onboarding evaluation
    console.log(`[Onboarding Agent] Evaluating seller: ${sellerId}`);
    const agentResult = await sellerOnboarding.evaluateSeller(sellerId, sellerData);

    // Extract decision from agent result
    const decision = agentResult.result?.decision || { action: 'REVIEW', confidence: 0.5 };
    const riskAssessment = {
      riskScore: agentResult.result?.overallRisk?.score || 50,
      signals: agentResult.result?.riskFactors || [],
      decision: decision.action,
      confidence: decision.confidence,
      reasoning: agentResult.result?.reasoning,
      evaluatedAt: new Date().toISOString(),
      agentEvaluation: {
        agentId: sellerOnboarding.agentId,
        agentName: sellerOnboarding.name,
        evidenceGathered: agentResult.result?.evidence?.length || 0,
        riskFactors: agentResult.result?.riskFactors?.length || 0,
        chainOfThought: agentResult.chainOfThought
      }
    };

    sellerData.onboardingRiskAssessment = riskAssessment;

    // Set status based on agent decision
    if (decision.action === 'REJECT') {
      sellerData.status = 'BLOCKED';
    } else if (decision.action === 'REVIEW') {
      sellerData.status = 'UNDER_REVIEW';
    } else if (decision.action === 'APPROVE') {
      sellerData.status = 'PENDING'; // Will be activated after final checks
    } else {
      sellerData.status = 'UNDER_REVIEW'; // Default to review if uncertain
    }

    // Store seller
    db_ops.insert('sellers', 'seller_id', sellerId, sellerData);

    res.status(201).json({
      success: true,
      data: sellerData,
      riskAssessment,
      agentEvaluation: {
        agentId: sellerOnboarding.agentId,
        decision: decision.action,
        confidence: decision.confidence,
        reasoning: decision.reason
      }
    });
  } catch (error) {
    console.error('Onboarding error:', error);
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

// Legacy helper function (kept for backward compatibility, but agent is used instead)
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

// New endpoint to get agent evaluation details
router.get('/sellers/:sellerId/agent-evaluation', async (req, res) => {
  try {
    const seller = db_ops.getById('sellers', 'seller_id', req.params.sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const evaluation = seller.data.onboardingRiskAssessment?.agentEvaluation;
    if (!evaluation) {
      return res.status(404).json({ success: false, error: 'Agent evaluation not found' });
    }

    res.json({
      success: true,
      data: {
        sellerId: seller.data.sellerId,
        evaluation,
        riskAssessment: seller.data.onboardingRiskAssessment
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
      byDecision: {},
      recent: allSellers
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 10)
    };

    allSellers.forEach(seller => {
      // Count by status
      const status = seller.status || 'PENDING';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      // Count by risk tier
      const riskTier = seller.riskTier || 'MEDIUM';
      stats.byRiskTier[riskTier] = (stats.byRiskTier[riskTier] || 0) + 1;

      // Count by agent decision
      const decision = seller.onboardingRiskAssessment?.decision || 'PENDING';
      stats.byDecision[decision] = (stats.byDecision[decision] || 0) + 1;
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create test sellers with intentional connections for network analysis
router.post('/test/connections', async (req, res) => {
  try {
    const sellers = await createTestSellersWithConnections();
    res.json({
      success: true,
      message: `Created ${sellers.length} test sellers with intentional connections`,
      data: sellers.map(s => ({
        sellerId: s.sellerId,
        businessName: s.businessName,
        email: s.email,
        phone: s.phone,
        ipAddress: s.ipAddress
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
