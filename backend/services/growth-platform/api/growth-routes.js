/**
 * Growth & Engagement Platform API Routes
 */
import express from 'express';
import { getGrowthAnalyticsAgent } from '../agents/GrowthAnalyticsAgent.js';
import { getChurnPredictionAgent } from '../agents/ChurnPredictionAgent.js';
import { getProductAdoptionAgent } from '../agents/ProductAdoptionAgent.js';
import { getPersonalizationEngine } from '../agents/PersonalizationEngine.js';
import { getRetentionCampaignAgent } from '../agents/RetentionCampaignAgent.js';

const router = express.Router();

// ─── Analytics ───────────────────────────────────────────────────────────────

router.get('/analytics/overview', async (req, res) => {
  try {
    const agent = getGrowthAnalyticsAgent();
    const result = await agent.execute('OVERVIEW');
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics/cohorts', async (req, res) => {
  try {
    const agent = getGrowthAnalyticsAgent();
    const result = await agent.execute('COHORT');
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics/engagement', async (req, res) => {
  try {
    const agent = getGrowthAnalyticsAgent();
    const result = await agent.execute('ENGAGEMENT_SCORES');
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Churn Prediction ────────────────────────────────────────────────────────

router.get('/churn/:sellerId', async (req, res) => {
  try {
    const agent = getChurnPredictionAgent();
    const result = await agent.predict({ sellerId: req.params.sellerId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/churn/batch', async (req, res) => {
  try {
    const { sellerIds } = req.body;
    if (!Array.isArray(sellerIds) || sellerIds.length === 0) {
      return res.status(400).json({ success: false, error: 'sellerIds array required' });
    }
    const agent = getChurnPredictionAgent();
    const results = await agent.batchPredict(sellerIds.slice(0, 20));
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Product Adoption ────────────────────────────────────────────────────────

router.get('/adoption/:sellerId', async (req, res) => {
  try {
    const agent = getProductAdoptionAgent();
    const result = await agent.evaluate({ sellerId: req.params.sellerId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Personalization ─────────────────────────────────────────────────────────

router.get('/personalize/:sellerId', async (req, res) => {
  try {
    const engine = getPersonalizationEngine();
    const result = await engine.personalize({ sellerId: req.params.sellerId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/personalize', async (req, res) => {
  try {
    const { sellerIds } = req.body;
    if (!Array.isArray(sellerIds) || sellerIds.length === 0) {
      return res.status(400).json({ success: false, error: 'sellerIds array required' });
    }
    const engine = getPersonalizationEngine();
    const results = await engine.batchPersonalize(sellerIds.slice(0, 20));
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Retention Campaigns ─────────────────────────────────────────────────────

router.post('/campaigns/trigger', async (req, res) => {
  try {
    const { sellerId } = req.body;
    if (!sellerId) {
      return res.status(400).json({ success: false, error: 'sellerId required' });
    }
    const agent = getRetentionCampaignAgent();
    const result = await agent.trigger({ sellerId });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/campaigns/templates', async (req, res) => {
  try {
    const agent = getRetentionCampaignAgent();
    const templates = agent.getTemplates();
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/campaigns/active', async (req, res) => {
  try {
    const agent = getRetentionCampaignAgent();
    const campaigns = agent.getActiveCampaigns();
    res.json({ success: true, data: campaigns });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Stats ───────────────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const analytics = getGrowthAnalyticsAgent().getStats();
    const churn = getChurnPredictionAgent().getStats();
    const adoption = getProductAdoptionAgent().getStats();
    const personalization = getPersonalizationEngine().getStats();
    const campaigns = getRetentionCampaignAgent().getStats();

    res.json({
      success: true,
      data: {
        analytics,
        churn,
        adoption,
        personalization,
        campaigns,
        agents: 5,
        status: 'ACTIVE',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
