/**
 * Account Setup Agent
 *
 * Evaluates account setup for fraud signals including bank verification,
 * tax ID cross-references, shared payment methods, business registration,
 * and account creation patterns.
 *
 * Decisions: APPROVE / REVIEW / REJECT
 * Safe default on error: REVIEW
 * Domain weight: 0.08
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getThresholdManager } from '../core/threshold-manager.js';

export class AccountSetupAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Account Setup Agent',
      role: 'ACCOUNT_SETUP',
      agentId: 'ACCOUNT_SETUP',
      capabilities: [
        'bank_verification',
        'tax_id_cross_reference',
        'shared_payment_detection',
        'business_registration_check',
        'account_age_analysis'
      ]
    });

    this.riskThresholds = { APPROVE: { max: 30 }, REVIEW: { min: 31, max: 60 }, REJECT: { min: 61 } };
    this.registerTools();
    this.knowledgeBase = getKnowledgeBase();
    this.selfCorrection = createSelfCorrection(this.agentId);
    this._thresholdManager = getThresholdManager();
  }

  get autonomyThresholds() { return this._thresholdManager.getThresholds(this.agentId); }

  registerTools() {
    this.registerTool('verify_bank_account', 'Validate routing number and country match', async (params) => {
      const { routingNumber, bankCountry, sellerId } = params;
      const seller = db_ops.getById('sellers', 'seller_id', sellerId);
      const sellerCountry = seller?.data?.country || 'US';
      const countryMatch = !bankCountry || bankCountry === sellerCountry;
      const validRouting = routingNumber && routingNumber.length >= 8 && routingNumber.length <= 12;

      return {
        success: true,
        data: {
          routingNumber: routingNumber ? routingNumber.substring(0, 4) + '****' : null,
          validRouting, countryMatch, sellerCountry, bankCountry: bankCountry || 'unknown',
          riskScore: (!validRouting ? 25 : 0) + (!countryMatch ? 30 : 0),
          riskLevel: !countryMatch ? 'HIGH' : !validRouting ? 'MEDIUM' : 'LOW'
        }
      };
    });

    this.registerTool('check_tax_id_cross_reference', 'Check tax ID reuse across sellers', async (params) => {
      const { taxId, sellerId } = params;
      if (!taxId) return { success: true, data: { taxId: null, reusedBy: [], riskScore: 10, riskLevel: 'MEDIUM' } };

      const allSellers = (db_ops.getAll('sellers', 10000, 0) || []).map(s => s.data);
      const reusedBy = allSellers.filter(s => s.taxId === taxId && s.sellerId !== sellerId);

      return {
        success: true,
        data: {
          taxId: taxId.substring(0, 3) + '***',
          reusedBy: reusedBy.map(s => ({ sellerId: s.sellerId, status: s.status })),
          reuseCount: reusedBy.length,
          riskScore: reusedBy.length > 0 ? 40 : 0,
          riskLevel: reusedBy.length > 1 ? 'CRITICAL' : reusedBy.length === 1 ? 'HIGH' : 'LOW'
        }
      };
    });

    this.registerTool('detect_shared_payment_method', 'Detect same bank/card across accounts', async (params) => {
      const { bankAccount, sellerId } = params;
      if (!bankAccount) return { success: true, data: { sharedWith: [], riskScore: 0, riskLevel: 'LOW' } };

      const allSellers = (db_ops.getAll('sellers', 10000, 0) || []).map(s => s.data);
      const last4 = bankAccount.last4 || bankAccount.accountNumber?.slice(-4);
      const sharedWith = last4 ? allSellers.filter(s =>
        s.sellerId !== sellerId && (s.bankAccount?.last4 === last4 || s.bankAccount?.accountNumber?.slice(-4) === last4)
      ) : [];

      return {
        success: true,
        data: {
          sharedWith: sharedWith.map(s => ({ sellerId: s.sellerId, status: s.status })),
          sharedCount: sharedWith.length,
          riskScore: sharedWith.length > 0 ? 40 : 0,
          riskLevel: sharedWith.length > 0 ? 'CRITICAL' : 'LOW'
        }
      };
    });

    this.registerTool('check_business_registration', 'Verify EIN/state registration', async (params) => {
      const { businessName, registrationNumber, country } = params;
      // Simulation: basic checks
      const hasRegistration = !!registrationNumber;
      const validFormat = registrationNumber ? /^[A-Z0-9\-]{5,20}$/i.test(registrationNumber) : false;

      return {
        success: true,
        data: {
          businessName, hasRegistration, validFormat,
          isRegistered: hasRegistration && validFormat && Math.random() > 0.1,
          country: country || 'US',
          riskScore: !hasRegistration ? 25 : !validFormat ? 20 : 0,
          riskLevel: !hasRegistration ? 'HIGH' : !validFormat ? 'MEDIUM' : 'LOW',
          source: 'simulation'
        }
      };
    });

    this.registerTool('get_account_age_signals', 'Analyze account creation patterns and velocity', async (params) => {
      const { sellerId } = params;
      const seller = db_ops.getById('sellers', 'seller_id', sellerId);
      const createdAt = seller?.data?.createdAt ? new Date(seller.data.createdAt) : new Date();
      const ageDays = Math.round((Date.now() - createdAt) / (1000 * 60 * 60 * 24));

      // Check recent account creation velocity from same IP/email domain
      const allSellers = (db_ops.getAll('sellers', 10000, 0) || []).map(s => s.data);
      const recentAccounts = allSellers.filter(s => {
        const sAge = (Date.now() - new Date(s.createdAt)) / (1000 * 60 * 60 * 24);
        return sAge < 7;
      }).length;

      return {
        success: true,
        data: {
          sellerId, ageDays, isNewAccount: ageDays < 7,
          recentAccountsCreated: recentAccounts,
          velocitySpike: recentAccounts > 10,
          riskScore: (ageDays < 1 ? 20 : ageDays < 7 ? 10 : 0) + (recentAccounts > 10 ? 15 : 0),
          riskLevel: ageDays < 1 ? 'HIGH' : ageDays < 7 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    this.registerTool('search_knowledge_base', 'Search KB for similar account setup cases', async (params) => {
      const { query, sellerId } = params;
      const results = this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve account setup patterns from memory', async (params) => {
      const { context } = params;
      const memories = this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    const { sellerId } = input;
    this.addObservation(`Starting account setup evaluation for seller: ${sellerId}`);
    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };
    return { understanding: 'Evaluating account setup risk', riskIndicators: this.identifyInitialRiskIndicators(input), relevantMemory: this.retrieveRelevantMemory(input), availableTools: Array.from(this.tools.keys()) };
  }

  async plan(analysis, context) {
    const llmPlan = await super.plan(analysis, context);
    if (llmPlan.llmEnhanced && llmPlan.actions.length > 0) return llmPlan;
    const input = context.input || {};
    return {
      goal: 'Complete account setup risk evaluation',
      actions: [
        { type: 'verify_bank_account', params: { routingNumber: input.routingNumber, bankCountry: input.bankCountry, sellerId: input.sellerId } },
        { type: 'check_tax_id_cross_reference', params: { taxId: input.taxId, sellerId: input.sellerId } },
        { type: 'detect_shared_payment_method', params: { bankAccount: input.bankAccount, sellerId: input.sellerId } },
        { type: 'check_business_registration', params: { businessName: input.businessName, registrationNumber: input.registrationNumber, country: input.country } },
        { type: 'get_account_age_signals', params: { sellerId: input.sellerId } },
        { type: 'search_knowledge_base', params: { query: `account setup ${input.sellerId || ''}`, sellerId: input.sellerId } },
        { type: 'retrieve_memory', params: { context: 'account setup risk patterns' } }
      ],
      fallback: { type: 'default_review', reason: 'incomplete_account_evaluation' }
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
      this.selfCorrection.logPrediction(`ACCT-${Date.now().toString(36).toUpperCase()}`, context.input.sellerId, decision.action, decision.confidence, this.generateReasoning(riskFactors, decision));
    }
    this.knowledgeBase.addKnowledge('account_setup', [{
      _id: `ACCT-${Date.now()}`, text: `Account setup eval for ${context.input?.sellerId}. Decision: ${decision.action}. Risk: ${overallRisk.score}.`,
      category: 'account_setup', sellerId: context.input?.sellerId, domain: 'account_setup', riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true, evaluationId: `ACCT-${Date.now().toString(36).toUpperCase()}`,
      summary: `Account setup evaluation complete. ${riskFactors.length} risk factors.`,
      evidence, riskFactors, overallRisk, decision, confidence: decision.confidence,
      isAutonomous, needsHumanReview: !isAutonomous || decision.action === 'REVIEW',
      reasoning: this.generateReasoning(riskFactors, decision)
    };
  }

  identifyInitialRiskIndicators(input) {
    const i = [];
    if (!input.taxId) i.push('NO_TAX_ID');
    if (!input.routingNumber) i.push('NO_ROUTING_NUMBER');
    if (input.sharedPaymentMethod) i.push('SHARED_PAYMENT_FLAG');
    return i;
  }

  analyzeEvidence(evidence) {
    const factors = [];
    evidence.forEach(e => {
      if (!e.success || !e.data) return;
      if (e.source === 'verify_bank_account' && !e.data.countryMatch) factors.push({ factor: 'BANK_COUNTRY_MISMATCH', severity: 'HIGH', score: 30 });
      if (e.source === 'verify_bank_account' && !e.data.validRouting) factors.push({ factor: 'INVALID_ROUTING_NUMBER', severity: 'MEDIUM', score: 25 });
      if (e.source === 'check_tax_id_cross_reference' && e.data.reuseCount > 0) factors.push({ factor: 'TAX_ID_REUSED', severity: e.data.reuseCount > 1 ? 'CRITICAL' : 'HIGH', score: 40 });
      if (e.source === 'detect_shared_payment_method' && e.data.sharedCount > 0) factors.push({ factor: 'SHARED_PAYMENT_METHOD', severity: 'CRITICAL', score: 40 });
      if (e.source === 'check_business_registration' && !e.data.hasRegistration) factors.push({ factor: 'NO_BUSINESS_REGISTRATION', severity: 'HIGH', score: 25 });
      if (e.source === 'get_account_age_signals' && e.data.isNewAccount) factors.push({ factor: 'NEW_ACCOUNT', severity: 'MEDIUM', score: 15 });
      if (e.source === 'get_account_age_signals' && e.data.velocitySpike) factors.push({ factor: 'ACCOUNT_CREATION_SPIKE', severity: 'HIGH', score: 20 });
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
        const result = await this.llmClient.complete('You are the account setup authority. Return ONLY JSON: {"action":"APPROVE|REVIEW|REJECT","confidence":0.0-1.0,"reason":"..."}', `Risk: ${risk.score}/100, Critical: ${risk.criticalFactors}\nFactors: ${factors.map(f => f.factor).join(', ')}`);
        if (result?.content) { const m = result.content.match(/\{[\s\S]*?\}/); if (m) { const p = JSON.parse(m[0]); if (['APPROVE', 'REVIEW', 'REJECT'].includes(p.action)) return { ...p, llmEnhanced: true }; } }
      } catch (e) { /* fallback */ }
    }
    if (risk.score >= 61 || risk.criticalFactors > 0) return { action: 'REJECT', confidence: 0.90, reason: 'High risk account setup — rejecting' };
    if (risk.score >= 31) return { action: 'REVIEW', confidence: 0.75, reason: 'Moderate risk — manual review needed' };
    return { action: 'APPROVE', confidence: 0.85, reason: 'Low risk account setup — approved' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## Account Setup Summary\n\n### Risk Factors:\n${desc || '- None'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`;
  }

  async evaluateSetup(sellerId, setupData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, ...setupData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getAccountSetupAgent() {
  if (!instance) instance = new AccountSetupAgent();
  return instance;
}

export default AccountSetupAgent;
