/**
 * Shipping Risk Agent
 *
 * Evaluates shipping-related fraud signals including address mismatches,
 * freight forwarding, shipping velocity, empty box patterns, and carrier risk.
 *
 * Decisions: APPROVE / FLAG / HOLD
 * Safe default on error: FLAG
 * Domain weight: 0.10
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getThresholdManager } from '../core/threshold-manager.js';

export class ShippingRiskAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Shipping Risk Agent',
      role: 'SHIPPING_RISK',
      agentId: 'SHIPPING_RISK',
      capabilities: [
        'address_mismatch_detection',
        'freight_forwarding_detection',
        'shipping_velocity_analysis',
        'empty_box_detection',
        'carrier_risk_profiling'
      ]
    });

    this.riskThresholds = {
      APPROVE: { max: 30 },
      FLAG: { min: 31, max: 60 },
      HOLD: { min: 61 }
    };

    this.registerTools();
    this.knowledgeBase = getKnowledgeBase();
    this.selfCorrection = createSelfCorrection(this.agentId);
    this._thresholdManager = getThresholdManager();
  }

  get autonomyThresholds() {
    return this._thresholdManager.getThresholds(this.agentId);
  }

  async registerTools() {
    // Tool 1: Check address mismatch
    this.registerTool('check_address_mismatch', 'Check destination vs seller registered address', async (params) => {
      const { sellerId, destinationAddress } = params;
      const seller = await db_ops.getById('sellers', 'seller_id', sellerId);
      const sellerCountry = seller?.data?.country || seller?.data?.address?.country || 'US';
      const destCountry = destinationAddress?.country || 'US';
      const countryMismatch = sellerCountry !== destCountry;

      return {
        success: true,
        data: {
          sellerCountry, destinationCountry: destCountry, countryMismatch,
          riskScore: countryMismatch ? 30 : 0,
          riskLevel: countryMismatch ? 'HIGH' : 'LOW'
        }
      };
    });

    // Tool 2: Detect freight forwarding
    this.registerTool('detect_freight_forwarding', 'Detect known freight forwarder address patterns', async (params) => {
      const { destinationAddress } = params;
      const addr = (destinationAddress?.street || '').toLowerCase();
      const freightKeywords = ['shipito', 'myus', 'viabox', 'stackry', 'forward2me', 'suite', 'mailbox', 'pmb'];
      const isFreightForwarder = freightKeywords.some(kw => addr.includes(kw));
      const isPoBox = addr.includes('po box') || addr.includes('p.o. box');

      return {
        success: true,
        data: {
          isFreightForwarder, isPoBox,
          matchedKeywords: freightKeywords.filter(kw => addr.includes(kw)),
          riskScore: isFreightForwarder ? 40 : isPoBox ? 15 : 0,
          riskLevel: isFreightForwarder ? 'HIGH' : isPoBox ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 3: Check shipping velocity
    this.registerTool('check_shipping_velocity', 'Check shipment count in 1h/24h/7d windows', async (params) => {
      const { sellerId } = params;
      const shipments = (await db_ops.getAll('shipments', 10000, 0) || [])
        .map(s => s.data).filter(s => s.sellerId === sellerId);
      const now = Date.now();
      const counts = {
        '1h': shipments.filter(s => now - new Date(s.createdAt) < 3600000).length,
        '24h': shipments.filter(s => now - new Date(s.createdAt) < 86400000).length,
        '7d': shipments.filter(s => now - new Date(s.createdAt) < 604800000).length
      };
      const spike1h = counts['1h'] > 20;
      const spike24h = counts['24h'] > 100;
      let riskScore = 0;
      if (spike1h) riskScore += 35;
      if (spike24h) riskScore += 25;

      return {
        success: true,
        data: { counts, spike1h, spike24h, riskScore: Math.min(riskScore, 60), riskLevel: spike1h ? 'CRITICAL' : spike24h ? 'HIGH' : 'LOW' }
      };
    });

    // Tool 4: Check empty box pattern
    this.registerTool('check_empty_box_pattern', 'Check weight vs category average for empty box fraud', async (params) => {
      const { weight, category } = params;
      const categoryAverages = {
        'Electronics': 2.5, 'Clothing': 0.8, 'Books': 1.2, 'Home': 3.0,
        'Toys': 1.5, 'Sports': 2.0, 'Jewelry': 0.3, 'default': 1.5
      };
      const avgWeight = categoryAverages[category] || categoryAverages['default'];
      const ratio = weight ? weight / avgWeight : 1;
      const suspiciouslyLight = ratio < 0.2;
      const unusuallyHeavy = ratio > 5;

      return {
        success: true,
        data: {
          declaredWeight: weight, categoryAverage: avgWeight, ratio: Math.round(ratio * 100) / 100,
          suspiciouslyLight, unusuallyHeavy,
          riskScore: suspiciouslyLight ? 30 : unusuallyHeavy ? 15 : 0,
          riskLevel: suspiciouslyLight ? 'HIGH' : unusuallyHeavy ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 5: Get carrier risk profile
    this.registerTool('get_carrier_risk_profile', 'Evaluate carrier trust and tracking anomalies', async (params) => {
      const { carrier, sellerId } = params;
      const trustedCarriers = ['UPS', 'FEDEX', 'USPS', 'DHL'];
      const isTrusted = trustedCarriers.includes((carrier || '').toUpperCase());

      const sellerShipments = (await db_ops.getAll('shipments', 10000, 0) || [])
        .map(s => s.data).filter(s => s.sellerId === sellerId);
      const withTracking = sellerShipments.filter(s => s.trackingNumber).length;
      const trackingRate = sellerShipments.length > 0 ? withTracking / sellerShipments.length : 1;

      return {
        success: true,
        data: {
          carrier, isTrustedCarrier: isTrusted, trackingRate: Math.round(trackingRate * 100) / 100,
          totalShipments: sellerShipments.length,
          riskScore: !isTrusted ? 20 : trackingRate < 0.5 ? 15 : 0,
          riskLevel: !isTrusted ? 'MEDIUM' : trackingRate < 0.5 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    this.registerTool('search_knowledge_base', 'Search knowledge base for similar shipping cases', async (params) => {
      const { query, sellerId } = params;
      const results = await this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve shipping fraud patterns from memory', async (params) => {
      const { context } = params;
      const memories = await this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    const { sellerId } = input;
    this.addObservation(`Starting shipping risk evaluation for seller: ${sellerId}`);
    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };

    return {
      understanding: 'Evaluating shipping risk for shipment',
      riskIndicators: this.identifyInitialRiskIndicators(input),
      relevantMemory: this.retrieveRelevantMemory(input),
      availableTools: Array.from(this.tools.keys())
    };
  }

  async plan(analysis, context) {
    const llmPlan = await super.plan(analysis, context);
    if (llmPlan.llmEnhanced && llmPlan.actions.length > 0) return llmPlan;

    const input = context.input || {};
    return {
      goal: 'Complete shipping risk evaluation',
      actions: [
        { type: 'check_address_mismatch', params: { sellerId: input.sellerId, destinationAddress: input.address || input.destination } },
        { type: 'detect_freight_forwarding', params: { destinationAddress: input.address || input.destination } },
        { type: 'check_shipping_velocity', params: { sellerId: input.sellerId } },
        { type: 'check_empty_box_pattern', params: { weight: input.weight, category: input.category } },
        { type: 'get_carrier_risk_profile', params: { carrier: input.carrier, sellerId: input.sellerId } },
        { type: 'search_knowledge_base', params: { query: `shipping risk ${input.sellerId || ''}`, sellerId: input.sellerId } },
        { type: 'retrieve_memory', params: { context: 'shipping risk patterns' } }
      ],
      fallback: { type: 'default_flag', reason: 'incomplete_shipping_evaluation' }
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
    const needsHumanReview = !isAutonomous || decision.action === 'FLAG';

    if (context.input?.sellerId) {
      this.selfCorrection.logPrediction(`SHP-${Date.now().toString(36).toUpperCase()}`, context.input.sellerId, decision.action, decision.confidence, this.generateReasoning(riskFactors, decision));
    }

    this.knowledgeBase.addKnowledge('shipping', [{
      _id: `SHP-${Date.now()}`, text: `Shipping eval for ${context.input?.sellerId}. Decision: ${decision.action}. Risk: ${overallRisk.score}.`,
      category: 'shipping', sellerId: context.input?.sellerId, domain: 'shipping',
      outcome: decision.action === 'APPROVE' ? 'legitimate' : 'pending', riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true, evaluationId: `SHP-${Date.now().toString(36).toUpperCase()}`,
      summary: `Shipping evaluation complete. ${riskFactors.length} risk factors.`,
      evidence, riskFactors, overallRisk, decision,
      confidence: decision.confidence, isAutonomous, needsHumanReview,
      reasoning: this.generateReasoning(riskFactors, decision)
    };
  }

  identifyInitialRiskIndicators(input) {
    const indicators = [];
    if (!input.carrier) indicators.push('NO_CARRIER');
    if (!input.address && !input.destination) indicators.push('NO_DESTINATION');
    return indicators;
  }

  analyzeEvidence(evidence) {
    const factors = [];
    evidence.forEach(e => {
      if (!e.success || !e.data) return;
      if (e.source === 'check_address_mismatch' && e.data.countryMismatch) factors.push({ factor: 'ADDRESS_COUNTRY_MISMATCH', severity: 'HIGH', score: 30 });
      if (e.source === 'detect_freight_forwarding' && e.data.isFreightForwarder) factors.push({ factor: 'FREIGHT_FORWARDER', severity: 'CRITICAL', score: 40 });
      if (e.source === 'detect_freight_forwarding' && e.data.isPoBox) factors.push({ factor: 'PO_BOX_DESTINATION', severity: 'MEDIUM', score: 15 });
      if (e.source === 'check_shipping_velocity' && e.data.spike1h) factors.push({ factor: 'SHIPPING_VELOCITY_SPIKE_1H', severity: 'CRITICAL', score: 35 });
      if (e.source === 'check_shipping_velocity' && e.data.spike24h) factors.push({ factor: 'SHIPPING_VELOCITY_SPIKE_24H', severity: 'HIGH', score: 25 });
      if (e.source === 'check_empty_box_pattern' && e.data.suspiciouslyLight) factors.push({ factor: 'EMPTY_BOX_SUSPECTED', severity: 'HIGH', score: 30 });
      if (e.source === 'get_carrier_risk_profile' && !e.data.isTrustedCarrier) factors.push({ factor: 'UNTRUSTED_CARRIER', severity: 'MEDIUM', score: 20 });
      if (e.source === 'get_carrier_risk_profile' && e.data.trackingRate < 0.5) factors.push({ factor: 'LOW_TRACKING_RATE', severity: 'MEDIUM', score: 15 });
    });
    return factors;
  }

  calculateRisk(factors) {
    const totalScore = Math.max(0, Math.min(100, factors.reduce((s, f) => s + (f.score || 0), 0)));
    return {
      score: totalScore,
      level: totalScore > 60 ? 'HIGH' : totalScore > 30 ? 'MEDIUM' : 'LOW',
      factorCount: factors.length,
      criticalFactors: factors.filter(f => f.severity === 'CRITICAL').length,
      highFactors: factors.filter(f => f.severity === 'HIGH').length
    };
  }

  async generateDecision(risk, factors) {
    if (this.llmClient?.enabled) {
      try {
        const systemPrompt = 'You are the shipping risk authority. Return ONLY valid JSON: {"action":"APPROVE|FLAG|HOLD", "confidence":0.0-1.0, "reason":"..."}';
        const userPrompt = `Risk score: ${risk.score}/100, Critical: ${risk.criticalFactors}, High: ${risk.highFactors}\nFactors: ${factors.map(f => `${f.factor} (${f.severity})`).join(', ')}`;
        const result = await this.llmClient.complete(systemPrompt, userPrompt);
        if (result?.content) {
          const m = result.content.match(/\{[\s\S]*?\}/);
          if (m) { const p = JSON.parse(m[0]); if (['APPROVE', 'FLAG', 'HOLD'].includes(p.action)) return { ...p, llmEnhanced: true }; }
        }
      } catch (e) { /* fallback */ }
    }

    if (risk.score >= 61 || risk.criticalFactors > 0) return { action: 'HOLD', confidence: 0.90, reason: 'High shipping risk — holding for review' };
    if (risk.score >= 31) return { action: 'FLAG', confidence: 0.75, reason: 'Moderate shipping risk — flagged for review' };
    return { action: 'APPROVE', confidence: 0.85, reason: 'Low shipping risk — approved' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## Shipping Risk Summary\n\n### Risk Factors:\n${desc || '- None'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`;
  }

  async evaluateShipment(sellerId, shipmentData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, ...shipmentData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getShippingRiskAgent() {
  if (!instance) instance = new ShippingRiskAgent();
  return instance;
}

export default ShippingRiskAgent;
