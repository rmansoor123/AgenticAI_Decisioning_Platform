/**
 * Pricing Risk Agent
 *
 * Evaluates pricing changes for fraud signals including below-cost pricing,
 * price manipulation, arbitrage patterns, category price stats, and change velocity.
 *
 * Decisions: APPROVE / FLAG / REJECT
 * Safe default on error: FLAG
 * Domain weight: 0.08
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getThresholdManager } from '../core/threshold-manager.js';

export class PricingRiskAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Pricing Risk Agent',
      role: 'PRICING_RISK',
      agentId: 'PRICING_RISK',
      capabilities: [
        'below_cost_detection',
        'price_manipulation_detection',
        'arbitrage_pattern_analysis',
        'category_price_analysis',
        'price_change_velocity_monitoring'
      ]
    });

    this.riskThresholds = { APPROVE: { max: 30 }, FLAG: { min: 31, max: 60 }, REJECT: { min: 61 } };
    this.registerTools();
    this.knowledgeBase = getKnowledgeBase();
    this.selfCorrection = createSelfCorrection(this.agentId);
    this._thresholdManager = getThresholdManager();
  }

  get autonomyThresholds() { return this._thresholdManager.getThresholds(this.agentId); }

  async registerTools() {
    this.registerTool('detect_below_cost_pricing', 'Detect price below category median * 0.3', async (params) => {
      const { price, category } = params;
      const listings = (await db_ops.getAll('listings', 10000, 0) || [])
        .map(l => l.data).filter(l => l.category === category && l.price > 0);
      const prices = listings.map(l => l.price).sort((a, b) => a - b);
      const median = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 100;
      const threshold = median * 0.3;
      const isBelowCost = price != null && price < threshold;

      return {
        success: true,
        data: {
          price, categoryMedian: Math.round(median * 100) / 100, threshold: Math.round(threshold * 100) / 100,
          isBelowCost, priceToMedianRatio: median > 0 ? Math.round((price / median) * 100) / 100 : null,
          sampleSize: prices.length,
          riskScore: isBelowCost ? 40 : 0,
          riskLevel: isBelowCost ? 'HIGH' : 'LOW'
        }
      };
    });

    this.registerTool('detect_price_manipulation', 'Detect frequent changes and coordinated patterns', async (params) => {
      const { sellerId, listingId } = params;
      const pricingRecords = (await db_ops.getAll('pricing_records', 10000, 0) || [])
        .map(r => r.data).filter(r => r.sellerId === sellerId);
      const now = Date.now();
      const changes24h = pricingRecords.filter(r => now - new Date(r.createdAt) < 86400000).length;
      const changes7d = pricingRecords.filter(r => now - new Date(r.createdAt) < 604800000).length;

      const frequentChanges = changes24h > 10;
      const excessiveChanges = changes7d > 50;

      // Check for coordinated patterns (multiple listings changed at same time)
      const recentChanges = pricingRecords.filter(r => now - new Date(r.createdAt) < 3600000);
      const uniqueListings = [...new Set(recentChanges.map(r => r.listingId).filter(Boolean))];
      const coordinatedPattern = uniqueListings.length > 5;

      return {
        success: true,
        data: {
          changes24h, changes7d, frequentChanges, excessiveChanges, coordinatedPattern,
          uniqueListingsChanged1h: uniqueListings.length,
          riskScore: (frequentChanges ? 25 : 0) + (excessiveChanges ? 20 : 0) + (coordinatedPattern ? 30 : 0),
          riskLevel: coordinatedPattern ? 'CRITICAL' : frequentChanges ? 'HIGH' : 'LOW'
        }
      };
    });

    this.registerTool('check_arbitrage_patterns', 'Detect cross-marketplace price exploitation', async (params) => {
      const { sellerId, price, category } = params;
      // Check if seller has multiple listings with extreme price variance
      const sellerListings = (await db_ops.getAll('listings', 10000, 0) || [])
        .map(l => l.data).filter(l => l.sellerId === sellerId && l.category === category);
      const prices = sellerListings.map(l => l.price).filter(p => p > 0);

      if (prices.length < 2) return { success: true, data: { arbitrageDetected: false, riskScore: 0, riskLevel: 'LOW' } };

      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const priceSpread = maxPrice / minPrice;
      const arbitrageDetected = priceSpread > 5;

      return {
        success: true,
        data: {
          priceSpread: Math.round(priceSpread * 100) / 100, maxPrice, minPrice,
          listingsAnalyzed: prices.length, arbitrageDetected,
          riskScore: arbitrageDetected ? 30 : priceSpread > 3 ? 15 : 0,
          riskLevel: arbitrageDetected ? 'HIGH' : priceSpread > 3 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    this.registerTool('get_category_price_stats', 'Get median/mean/stddev from listings for category', async (params) => {
      const { category, price } = params;
      const listings = (await db_ops.getAll('listings', 10000, 0) || [])
        .map(l => l.data).filter(l => l.category === category && l.price > 0);
      const prices = listings.map(l => l.price);

      if (prices.length === 0) return { success: true, data: { category, sampleSize: 0, riskScore: 0, riskLevel: 'LOW' } };

      const sorted = [...prices].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
      const variance = prices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / prices.length;
      const stddev = Math.sqrt(variance);
      const zScore = stddev > 0 && price != null ? (price - mean) / stddev : 0;
      const isOutlier = Math.abs(zScore) > 3;

      return {
        success: true,
        data: {
          category, sampleSize: prices.length,
          median: Math.round(median * 100) / 100, mean: Math.round(mean * 100) / 100,
          stddev: Math.round(stddev * 100) / 100, zScore: Math.round(zScore * 100) / 100,
          isOutlier, currentPrice: price,
          riskScore: isOutlier ? 25 : Math.abs(zScore) > 2 ? 10 : 0,
          riskLevel: isOutlier ? 'HIGH' : Math.abs(zScore) > 2 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    this.registerTool('check_price_change_velocity', 'Check frequency and magnitude of price changes', async (params) => {
      const { sellerId } = params;
      const records = (await db_ops.getAll('pricing_records', 10000, 0) || [])
        .map(r => r.data).filter(r => r.sellerId === sellerId);
      const now = Date.now();
      const recent = records.filter(r => now - new Date(r.createdAt) < 86400000);

      // Calculate magnitude of changes
      const magnitudes = recent.map(r => {
        if (r.previousPrice && r.price) return Math.abs(r.price - r.previousPrice) / r.previousPrice;
        return 0;
      }).filter(m => m > 0);

      const avgMagnitude = magnitudes.length > 0 ? magnitudes.reduce((s, m) => s + m, 0) / magnitudes.length : 0;
      const highVelocity = recent.length > 15;
      const largeMagnitude = avgMagnitude > 0.5;

      return {
        success: true,
        data: {
          changes24h: recent.length, avgMagnitude: Math.round(avgMagnitude * 100) / 100,
          highVelocity, largeMagnitude,
          riskScore: (highVelocity ? 20 : 0) + (largeMagnitude ? 25 : 0),
          riskLevel: highVelocity && largeMagnitude ? 'CRITICAL' : highVelocity || largeMagnitude ? 'HIGH' : 'LOW'
        }
      };
    });

    this.registerTool('search_knowledge_base', 'Search KB for similar pricing cases', async (params) => {
      const { query, sellerId } = params;
      const results = await this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve pricing risk patterns from memory', async (params) => {
      const { context } = params;
      const memories = await this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    this.addObservation(`Starting pricing risk evaluation for seller: ${input.sellerId}`);
    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };
    return { understanding: 'Evaluating pricing risk', riskIndicators: this.identifyInitialRiskIndicators(input), relevantMemory: this.retrieveRelevantMemory(input), availableTools: Array.from(this.tools.keys()) };
  }

  async plan(analysis, context) {
    const llmPlan = await super.plan(analysis, context);
    if (llmPlan.llmEnhanced && llmPlan.actions.length > 0) return llmPlan;
    const input = context.input || {};
    return {
      goal: 'Complete pricing risk evaluation',
      actions: [
        { type: 'detect_below_cost_pricing', params: { price: input.newPrice || input.price, category: input.category } },
        { type: 'detect_price_manipulation', params: { sellerId: input.sellerId, listingId: input.listingId } },
        { type: 'check_arbitrage_patterns', params: { sellerId: input.sellerId, price: input.newPrice || input.price, category: input.category } },
        { type: 'get_category_price_stats', params: { category: input.category, price: input.newPrice || input.price } },
        { type: 'check_price_change_velocity', params: { sellerId: input.sellerId } },
        { type: 'search_knowledge_base', params: { query: `pricing risk ${input.category || ''} ${input.sellerId || ''}`, sellerId: input.sellerId } },
        { type: 'retrieve_memory', params: { context: 'pricing risk patterns' } }
      ],
      fallback: { type: 'default_flag', reason: 'incomplete_pricing_evaluation' }
    };
  }

  async observe(actions, context) {
    const safeActions = Array.isArray(actions) ? actions : [];
    const evidence = safeActions.map(a => ({ source: a.action.type, data: a.result?.data, success: a.result?.success !== false, timestamp: new Date().toISOString() }));
    const riskFactors = this.analyzeEvidence(evidence);
    const overallRisk = this.calculateRisk(riskFactors);
    const decision = await this.generateDecision(overallRisk, riskFactors);
    for (const f of riskFactors) this.addEvidence(`Risk factor: ${f.factor} (${f.severity})`);
    const isAutonomous = overallRisk.score < this.autonomyThresholds.ESCALATE_MIN_RISK;

    if (context.input?.sellerId) {
      this.selfCorrection.logPrediction(`PRC-${Date.now().toString(36).toUpperCase()}`, context.input.sellerId, decision.action, decision.confidence, this.generateReasoning(riskFactors, decision));
    }
    this.knowledgeBase.addKnowledge('pricing', [{
      _id: `PRC-${Date.now()}`, text: `Pricing eval for ${context.input?.sellerId}. Decision: ${decision.action}. Risk: ${overallRisk.score}.`,
      category: 'pricing', sellerId: context.input?.sellerId, domain: 'pricing', riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true, evaluationId: `PRC-${Date.now().toString(36).toUpperCase()}`,
      summary: `Pricing evaluation complete. ${riskFactors.length} risk factors.`,
      evidence, riskFactors, overallRisk, decision, confidence: decision.confidence,
      isAutonomous, needsHumanReview: !isAutonomous || decision.action === 'FLAG',
      reasoning: this.generateReasoning(riskFactors, decision)
    };
  }

  identifyInitialRiskIndicators(input) {
    const i = [];
    if (!input.category) i.push('NO_CATEGORY');
    if (!input.newPrice && !input.price) i.push('NO_PRICE');
    return i;
  }

  analyzeEvidence(evidence) {
    const factors = [];
    evidence.forEach(e => {
      if (!e.success || !e.data) return;
      if (e.source === 'detect_below_cost_pricing' && e.data.isBelowCost) factors.push({ factor: 'BELOW_COST_PRICING', severity: 'HIGH', score: 40 });
      if (e.source === 'detect_price_manipulation' && e.data.coordinatedPattern) factors.push({ factor: 'COORDINATED_MANIPULATION', severity: 'CRITICAL', score: 35 });
      if (e.source === 'detect_price_manipulation' && e.data.frequentChanges) factors.push({ factor: 'FREQUENT_PRICE_CHANGES', severity: 'HIGH', score: 25 });
      if (e.source === 'check_arbitrage_patterns' && e.data.arbitrageDetected) factors.push({ factor: 'ARBITRAGE_PATTERN', severity: 'HIGH', score: 30 });
      if (e.source === 'get_category_price_stats' && e.data.isOutlier) factors.push({ factor: 'PRICE_OUTLIER', severity: 'MEDIUM', score: 25 });
      if (e.source === 'check_price_change_velocity' && e.data.highVelocity) factors.push({ factor: 'HIGH_CHANGE_VELOCITY', severity: 'HIGH', score: 20 });
      if (e.source === 'check_price_change_velocity' && e.data.largeMagnitude) factors.push({ factor: 'LARGE_PRICE_SWINGS', severity: 'HIGH', score: 25 });
    });
    return factors;
  }

  calculateRisk(factors) {
    const s = Math.max(0, Math.min(100, factors.reduce((sum, f) => sum + (f.score || 0), 0)));
    return { score: s, level: s > 60 ? 'HIGH' : s > 30 ? 'MEDIUM' : 'LOW', factorCount: factors.length, criticalFactors: factors.filter(f => f.severity === 'CRITICAL').length, highFactors: factors.filter(f => f.severity === 'HIGH').length };
  }

  async generateDecision(risk, factors) {
    if (this.llmClient?.enabled) {
      try {
        const result = await this.llmClient.complete('You are the pricing risk authority. Return ONLY JSON: {"action":"APPROVE|FLAG|REJECT","confidence":0.0-1.0,"reason":"..."}', `Risk: ${risk.score}/100, Critical: ${risk.criticalFactors}\nFactors: ${factors.map(f => f.factor).join(', ')}`);
        if (result?.content) { const m = result.content.match(/\{[\s\S]*?\}/); if (m) { const p = JSON.parse(m[0]); if (['APPROVE', 'FLAG', 'REJECT'].includes(p.action)) return { ...p, llmEnhanced: true }; } }
      } catch (e) { /* fallback */ }
    }
    if (risk.score >= 61 || risk.criticalFactors > 0) return { action: 'REJECT', confidence: 0.90, reason: 'High pricing risk — rejecting' };
    if (risk.score >= 31) return { action: 'FLAG', confidence: 0.75, reason: 'Moderate pricing risk — flagged' };
    return { action: 'APPROVE', confidence: 0.85, reason: 'Low pricing risk — approved' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## Pricing Risk Summary\n\n### Risk Factors:\n${desc || '- None'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`;
  }

  async evaluatePricing(sellerId, pricingData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, ...pricingData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getPricingRiskAgent() {
  if (!instance) instance = new PricingRiskAgent();
  return instance;
}

export default PricingRiskAgent;
