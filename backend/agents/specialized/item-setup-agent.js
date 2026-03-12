/**
 * Item Setup Agent
 *
 * Evaluates item listings during setup for restricted categories, weight anomalies,
 * duplicate products, compliance data, and seller item patterns.
 *
 * Decisions: APPROVE / FLAG / REJECT
 * Safe default on error: FLAG
 * Domain weight: 0.07
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getThresholdManager } from '../core/threshold-manager.js';

export class ItemSetupAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Item Setup Agent',
      role: 'ITEM_SETUP',
      agentId: 'ITEM_SETUP',
      capabilities: [
        'restricted_category_check',
        'weight_anomaly_detection',
        'duplicate_product_detection',
        'compliance_verification',
        'seller_item_pattern_analysis'
      ]
    });

    this.riskThresholds = { APPROVE: { max: 30 }, FLAG: { min: 31, max: 60 }, REJECT: { min: 61 } };
    this.registerTools();
    this.knowledgeBase = getKnowledgeBase();
    this.selfCorrection = createSelfCorrection(this.agentId);
    this._thresholdManager = getThresholdManager();
  }

  get autonomyThresholds() { return this._thresholdManager.getThresholds(this.agentId); }

  registerTools() {
    this.registerTool('check_restricted_category', 'Check for prohibited/restricted item categories', async (params) => {
      const { category } = params;
      const prohibited = ['WEAPONS', 'DRUGS', 'COUNTERFEIT', 'STOLEN_GOODS', 'HUMAN_ORGANS'];
      const restricted = ['ALCOHOL', 'TOBACCO', 'PHARMACEUTICALS', 'ADULT_CONTENT', 'GAMBLING', 'CRYPTO', 'HAZARDOUS_MATERIALS'];
      const cat = (category || '').toUpperCase();
      const isProhibited = prohibited.includes(cat);
      const isRestricted = restricted.includes(cat);
      return {
        success: true,
        data: {
          category, isProhibited, isRestricted, requiresLicense: isRestricted,
          riskScore: isProhibited ? 80 : isRestricted ? 30 : 0,
          riskLevel: isProhibited ? 'CRITICAL' : isRestricted ? 'HIGH' : 'LOW'
        }
      };
    });

    this.registerTool('detect_weight_anomaly', 'Check weight vs category norms', async (params) => {
      const { weight, category } = params;
      const norms = { 'Electronics': { min: 0.1, max: 30 }, 'Clothing': { min: 0.05, max: 5 }, 'Books': { min: 0.1, max: 10 }, 'Jewelry': { min: 0.01, max: 1 }, 'Home': { min: 0.1, max: 50 }, 'default': { min: 0.05, max: 30 } };
      const norm = norms[category] || norms['default'];
      const isAnomaly = weight != null && (weight < norm.min * 0.1 || weight > norm.max * 3);
      return {
        success: true,
        data: {
          declaredWeight: weight, categoryNorm: norm, isAnomaly,
          riskScore: isAnomaly ? 20 : 0,
          riskLevel: isAnomaly ? 'MEDIUM' : 'LOW'
        }
      };
    });

    this.registerTool('check_duplicate_product', 'Check title similarity against removed items using Jaccard', async (params) => {
      const { title, sellerId } = params;
      if (!title) return { success: true, data: { duplicateFound: false, riskScore: 0, riskLevel: 'LOW' } };

      const removedItems = (db_ops.getAll('item_setups', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.status === 'REJECTED' || r.status === 'REMOVED');

      const titleWords = new Set(title.toLowerCase().split(/\s+/));
      let bestMatch = 0;
      let matchedTitle = null;

      for (const item of removedItems) {
        if (!item.title) continue;
        const itemWords = new Set(item.title.toLowerCase().split(/\s+/));
        const intersection = [...titleWords].filter(w => itemWords.has(w)).length;
        const union = new Set([...titleWords, ...itemWords]).size;
        const jaccard = union > 0 ? intersection / union : 0;
        if (jaccard > bestMatch) { bestMatch = jaccard; matchedTitle = item.title; }
      }

      const isDuplicate = bestMatch > 0.7;
      return {
        success: true,
        data: {
          isDuplicate, similarity: Math.round(bestMatch * 100) / 100,
          matchedTitle: isDuplicate ? matchedTitle : null,
          riskScore: isDuplicate ? 35 : bestMatch > 0.5 ? 15 : 0,
          riskLevel: isDuplicate ? 'HIGH' : bestMatch > 0.5 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    this.registerTool('verify_compliance_data', 'Check required certifications per category', async (params) => {
      const { category, complianceData } = params;
      const requiresCert = ['Electronics', 'Pharmaceuticals', 'Food', 'Toys', 'Cosmetics'];
      const needsCert = requiresCert.includes(category);
      const hasCert = complianceData && Object.keys(complianceData).length > 0;
      const missingCompliance = needsCert && !hasCert;

      return {
        success: true,
        data: {
          category, requiresCertification: needsCert, hasCompliance: hasCert, missingCompliance,
          riskScore: missingCompliance ? 25 : 0,
          riskLevel: missingCompliance ? 'HIGH' : 'LOW'
        }
      };
    });

    this.registerTool('get_seller_item_pattern', 'Analyze item listing velocity and category diversity', async (params) => {
      const { sellerId } = params;
      const items = (db_ops.getAll('item_setups', 10000, 0) || [])
        .map(r => r.data).filter(r => r.sellerId === sellerId);
      const now = Date.now();
      const last24h = items.filter(i => now - new Date(i.createdAt) < 86400000).length;
      const last7d = items.filter(i => now - new Date(i.createdAt) < 604800000).length;
      const categories = [...new Set(items.map(i => i.category).filter(Boolean))];

      const velocitySpike = last24h > 50;
      const highDiversity = categories.length > 10;

      return {
        success: true,
        data: {
          totalItems: items.length, last24h, last7d, uniqueCategories: categories.length,
          velocitySpike, highDiversity,
          riskScore: (velocitySpike ? 25 : 0) + (highDiversity ? 15 : 0),
          riskLevel: velocitySpike ? 'HIGH' : highDiversity ? 'MEDIUM' : 'LOW'
        }
      };
    });

    this.registerTool('search_knowledge_base', 'Search KB for similar item setup cases', async (params) => {
      const { query, sellerId } = params;
      const results = this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve item setup patterns from memory', async (params) => {
      const { context } = params;
      const memories = this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    this.addObservation(`Starting item setup evaluation for seller: ${input.sellerId}`);
    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };
    return { understanding: 'Evaluating item setup risk', riskIndicators: this.identifyInitialRiskIndicators(input), relevantMemory: this.retrieveRelevantMemory(input), availableTools: Array.from(this.tools.keys()) };
  }

  async plan(analysis, context) {
    const llmPlan = await super.plan(analysis, context);
    if (llmPlan.llmEnhanced && llmPlan.actions.length > 0) return llmPlan;
    const input = context.input || {};
    return {
      goal: 'Complete item setup risk evaluation',
      actions: [
        { type: 'check_restricted_category', params: { category: input.category } },
        { type: 'detect_weight_anomaly', params: { weight: input.weight, category: input.category } },
        { type: 'check_duplicate_product', params: { title: input.title, sellerId: input.sellerId } },
        { type: 'verify_compliance_data', params: { category: input.category, complianceData: input.complianceData } },
        { type: 'get_seller_item_pattern', params: { sellerId: input.sellerId } },
        { type: 'search_knowledge_base', params: { query: `item setup ${input.category || ''} ${input.sellerId || ''}`, sellerId: input.sellerId } },
        { type: 'retrieve_memory', params: { context: 'item setup risk patterns' } }
      ],
      fallback: { type: 'default_flag', reason: 'incomplete_item_evaluation' }
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
      this.selfCorrection.logPrediction(`ITEM-${Date.now().toString(36).toUpperCase()}`, context.input.sellerId, decision.action, decision.confidence, this.generateReasoning(riskFactors, decision));
    }
    this.knowledgeBase.addKnowledge('item_setup', [{
      _id: `ITEM-${Date.now()}`, text: `Item setup eval for ${context.input?.sellerId}. Decision: ${decision.action}. Risk: ${overallRisk.score}.`,
      category: 'item_setup', sellerId: context.input?.sellerId, domain: 'item_setup', riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true, evaluationId: `ITEM-${Date.now().toString(36).toUpperCase()}`,
      summary: `Item setup evaluation complete. ${riskFactors.length} risk factors.`,
      evidence, riskFactors, overallRisk, decision, confidence: decision.confidence,
      isAutonomous, needsHumanReview: !isAutonomous || decision.action === 'FLAG',
      reasoning: this.generateReasoning(riskFactors, decision)
    };
  }

  identifyInitialRiskIndicators(input) {
    const i = [];
    if (!input.category) i.push('NO_CATEGORY');
    if (!input.title) i.push('NO_TITLE');
    if (!input.weight) i.push('NO_WEIGHT');
    return i;
  }

  analyzeEvidence(evidence) {
    const factors = [];
    evidence.forEach(e => {
      if (!e.success || !e.data) return;
      if (e.source === 'check_restricted_category' && e.data.isProhibited) factors.push({ factor: 'PROHIBITED_CATEGORY', severity: 'CRITICAL', score: 80 });
      if (e.source === 'check_restricted_category' && e.data.isRestricted) factors.push({ factor: 'RESTRICTED_CATEGORY', severity: 'HIGH', score: 30 });
      if (e.source === 'detect_weight_anomaly' && e.data.isAnomaly) factors.push({ factor: 'WEIGHT_ANOMALY', severity: 'MEDIUM', score: 20 });
      if (e.source === 'check_duplicate_product' && e.data.isDuplicate) factors.push({ factor: 'DUPLICATE_OF_REMOVED_ITEM', severity: 'HIGH', score: 35 });
      if (e.source === 'verify_compliance_data' && e.data.missingCompliance) factors.push({ factor: 'MISSING_COMPLIANCE', severity: 'HIGH', score: 25 });
      if (e.source === 'get_seller_item_pattern' && e.data.velocitySpike) factors.push({ factor: 'ITEM_VELOCITY_SPIKE', severity: 'HIGH', score: 25 });
      if (e.source === 'get_seller_item_pattern' && e.data.highDiversity) factors.push({ factor: 'HIGH_CATEGORY_DIVERSITY', severity: 'MEDIUM', score: 15 });
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
        const result = await this.llmClient.complete('You are the item setup authority. Return ONLY JSON: {"action":"APPROVE|FLAG|REJECT","confidence":0.0-1.0,"reason":"..."}', `Risk: ${risk.score}/100, Critical: ${risk.criticalFactors}\nFactors: ${factors.map(f => f.factor).join(', ')}`);
        if (result?.content) { const m = result.content.match(/\{[\s\S]*?\}/); if (m) { const p = JSON.parse(m[0]); if (['APPROVE', 'FLAG', 'REJECT'].includes(p.action)) return { ...p, llmEnhanced: true }; } }
      } catch (e) { /* fallback */ }
    }
    if (risk.score >= 61 || risk.criticalFactors > 0) return { action: 'REJECT', confidence: 0.90, reason: 'High risk item — rejecting' };
    if (risk.score >= 31) return { action: 'FLAG', confidence: 0.75, reason: 'Moderate risk — flagged for review' };
    return { action: 'APPROVE', confidence: 0.85, reason: 'Low risk item setup — approved' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## Item Setup Summary\n\n### Risk Factors:\n${desc || '- None'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`;
  }

  async evaluateItem(sellerId, itemData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, ...itemData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getItemSetupAgent() {
  if (!instance) instance = new ItemSetupAgent();
  return instance;
}

export default ItemSetupAgent;
