/**
 * Financial Platform API Routes
 */
import express from 'express';
import { getDbOps } from '../../../shared/common/database-factory.js';
import { getUnderwritingAgent } from '../agents/UnderwritingAgent.js';
import { getCreditLineAgent } from '../agents/CreditLineAgent.js';
import { getPayoutReleaseAgent } from '../agents/PayoutReleaseAgent.js';
import { getCashFlowForecastAgent } from '../agents/CashFlowForecastAgent.js';
import { getLoanServicingAgent } from '../agents/LoanServicingAgent.js';
import { SellerFinancialProfile } from '../models/SellerFinancialProfile.js';
import { getLedger } from '../services/ledger.js';
import { getPaymentProcessor } from '../services/payment-processor.js';
import { getAllRules } from '../rules/credit-policies.js';

const router = express.Router();

// POST /underwrite — trigger underwriting
router.post('/underwrite', async (req, res) => {
  try {
    const agent = getUnderwritingAgent();
    const result = await agent.evaluate(req.body);

    // Record in ledger
    if (result.creditApproved) {
      const ledger = getLedger();
      await ledger.record({
        sellerId: result.sellerId,
        type: 'CREDIT',
        amount: result.creditLimit,
        description: `Credit line approved: $${result.creditLimit.toLocaleString()} at Tier ${result.interestRateTier}`,
        reference: result.decisionId
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /credit/adjust — adjust credit line
router.post('/credit/adjust', async (req, res) => {
  try {
    const agent = getCreditLineAgent();
    const result = await agent.evaluate(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /payout/request — submit payout through fraud-aware gating
router.post('/payout/request', async (req, res) => {
  try {
    const agent = getPayoutReleaseAgent();
    const result = await agent.evaluate(req.body);

    if (result.releaseApproved) {
      const processor = getPaymentProcessor();
      const payment = await processor.capture({
        amount: result.payoutAmount,
        method: 'BANK_TRANSFER',
        sellerId: result.sellerId
      });
      result.paymentProcessing = payment;

      const ledger = getLedger();
      await ledger.record({
        sellerId: result.sellerId,
        type: 'PAYOUT',
        amount: result.payoutAmount,
        description: `Payout released: $${result.payoutAmount.toLocaleString()}`,
        reference: payment.transactionId
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /seller/:id/credit — credit status
router.get('/seller/:sellerId/credit', async (req, res) => {
  try {
    const profile = await SellerFinancialProfile.getProfile(req.params.sellerId);
    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /seller/:id/forecast — 30d cash flow forecast
router.get('/seller/:sellerId/forecast', async (req, res) => {
  try {
    const agent = getCashFlowForecastAgent();
    const result = await agent.evaluate({ sellerId: req.params.sellerId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /loan/service — process loan repayment
router.post('/loan/service', async (req, res) => {
  try {
    const agent = getLoanServicingAgent();
    const result = await agent.evaluate(req.body);

    if (result.paymentAmount > 0) {
      const ledger = getLedger();
      await ledger.record({
        sellerId: result.sellerId,
        type: 'LOAN_REPAYMENT',
        amount: result.paymentAmount,
        description: `Loan repayment: $${result.paymentAmount.toFixed(2)} for ${result.loanId}`,
        reference: result.loanId
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /profiles — all seller financial profiles (summary)
router.get('/profiles', async (req, res) => {
  try {
    const profiles = await SellerFinancialProfile.getAllProfiles();
    res.json({ success: true, data: profiles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /rules — all financial policy rules
router.get('/rules', async (req, res) => {
  try {
    const rules = getAllRules();
    res.json({ success: true, data: rules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /ledger/:sellerId — seller ledger entries
router.get('/ledger/:sellerId', async (req, res) => {
  try {
    const ledger = getLedger();
    const entries = await ledger.getSellerLedger(req.params.sellerId);
    res.json({ success: true, data: entries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats — overall financial platform stats
router.get('/stats', async (req, res) => {
  try {
    const underwriting = getUnderwritingAgent().getStats();
    const creditLine = getCreditLineAgent().getStats();
    const payoutRelease = getPayoutReleaseAgent().getStats();
    const forecast = getCashFlowForecastAgent().getStats();
    const loanServicing = getLoanServicingAgent().getStats();
    const ledger = await getLedger().getStats();
    const processor = getPaymentProcessor().getStats();

    res.json({
      success: true,
      data: {
        underwriting, creditLine, payoutRelease,
        forecast, loanServicing, ledger, processor
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
