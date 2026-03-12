/**
 * Payment Risk Agent
 *
 * Detects payment fraud patterns including card testing, BIN attacks, stolen card
 * velocity, 3DS bypass attempts, and virtual/prepaid card abuse.
 *
 * Decisions: APPROVE / CHALLENGE / BLOCK
 * Safe default on error: BLOCK
 * Domain weight: 0.08 (transaction)
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getThresholdManager } from '../core/threshold-manager.js';

export class PaymentRiskAgent extends BaseAgent {
  constructor() {
    super({
      agentId: 'PAYMENT_RISK',
      name: 'Payment Risk Agent',
      role: 'PAYMENT_RISK',
      capabilities: [
        'card_testing_detection',
        'bin_attack_detection',
        'stolen_card_analysis',
        'payment_security_monitoring',
        'virtual_card_tracking'
      ]
    });

    this.riskThresholds = {
      APPROVE: { max: 30 },
      CHALLENGE: { min: 31, max: 65 },
      BLOCK: { min: 66 }
    };

    this.registerTools();
    this.knowledgeBase = getKnowledgeBase();
    this.selfCorrection = createSelfCorrection(this.agentId);
    this._thresholdManager = getThresholdManager();
  }

  get autonomyThresholds() {
    return this._thresholdManager.getThresholds(this.agentId);
  }

  registerTools() {
    // Tool 1: Detect card testing — micro-transactions under $1 in rapid bursts
    this.registerTool('detect_card_testing', 'Detect micro-transaction probes under $1 in rapid succession indicating card testing', async (params) => {
      const { sellerId } = params;

      const allTxns = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId);

      const recentTxns = allTxns.filter(t =>
        (Date.now() - new Date(t.createdAt || t.timestamp)) < 60 * 60 * 1000
      );

      const microTxns = recentTxns.filter(t => (t.amount || 0) > 0 && (t.amount || 0) < 1.00);
      const uniqueCards = [...new Set(recentTxns.map(t => t.cardLast4 || t.paymentMethodId).filter(Boolean))];

      // Card testing pattern: multiple micro-transactions with different cards
      const cardTestingDetected = microTxns.length >= 3 && uniqueCards.length >= 2;
      // Aggressive probing: many micro-txns in short window
      const aggressiveProbing = microTxns.length >= 10;

      let riskScore = 0;
      if (cardTestingDetected) riskScore += 40;
      if (aggressiveProbing) riskScore += 30;
      if (uniqueCards.length > 5) riskScore += 20;

      return {
        success: true,
        data: {
          sellerId,
          microTransactions: microTxns.length,
          recentTransactions: recentTxns.length,
          uniqueCards: uniqueCards.length,
          cardTestingDetected,
          aggressiveProbing,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 2: Detect BIN attack — sequential card numbers from same BIN range
    this.registerTool('detect_bin_attack', 'Detect sequential card numbers from the same BIN range suggesting enumeration attack', async (params) => {
      const { sellerId } = params;

      const allTxns = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId &&
          (Date.now() - new Date(r.createdAt || r.timestamp)) < 24 * 60 * 60 * 1000
        );

      // Group by BIN (first 6 digits)
      const binGroups = {};
      allTxns.forEach(t => {
        const bin = (t.cardBin || t.cardNumber?.substring(0, 6) || 'unknown');
        if (!binGroups[bin]) binGroups[bin] = [];
        binGroups[bin].push(t);
      });

      const suspiciousBins = Object.entries(binGroups)
        .filter(([bin, txns]) => bin !== 'unknown' && txns.length >= 5)
        .map(([bin, txns]) => ({ bin, count: txns.length }));

      const binAttackDetected = suspiciousBins.length > 0;
      const highVolumeAttack = suspiciousBins.some(b => b.count >= 20);

      // Check for sequential last-4 patterns
      const last4Values = allTxns.map(t => parseInt(t.cardLast4)).filter(n => !isNaN(n)).sort((a, b) => a - b);
      let sequentialCount = 0;
      for (let i = 1; i < last4Values.length; i++) {
        if (last4Values[i] - last4Values[i - 1] === 1) sequentialCount++;
      }
      const sequentialDetected = sequentialCount >= 3;

      let riskScore = 0;
      if (binAttackDetected) riskScore += 35;
      if (highVolumeAttack) riskScore += 25;
      if (sequentialDetected) riskScore += 30;

      return {
        success: true,
        data: {
          sellerId,
          totalTransactions: allTxns.length,
          suspiciousBins,
          binAttackDetected,
          highVolumeAttack,
          sequentialDetected,
          sequentialCount,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 3: Check stolen card velocity — multiple cards with geographic mismatch
    this.registerTool('check_stolen_card_velocity', 'Detect multiple cards used from mismatched geographic locations', async (params) => {
      const { sellerId } = params;

      const allTxns = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId &&
          (Date.now() - new Date(r.createdAt || r.timestamp)) < 48 * 60 * 60 * 1000
        );

      const uniqueCards = [...new Set(allTxns.map(t => t.cardLast4 || t.paymentMethodId).filter(Boolean))];
      const uniqueCountries = [...new Set(allTxns.map(t => t.billingCountry || t.country).filter(Boolean))];
      const uniqueIPs = [...new Set(allTxns.map(t => t.ipAddress).filter(Boolean))];

      const multipleCards = uniqueCards.length >= 3;
      const geoMismatch = uniqueCountries.length >= 2;
      const multipleIPs = uniqueIPs.length >= 3;

      // Stolen card pattern: many cards + geo mismatch + rapid usage
      const stolenCardPattern = multipleCards && geoMismatch;
      const highCardVelocity = uniqueCards.length >= 5 && allTxns.length >= 10;

      let riskScore = 0;
      if (stolenCardPattern) riskScore += 40;
      if (highCardVelocity) riskScore += 25;
      if (multipleIPs && geoMismatch) riskScore += 20;
      if (uniqueCards.length >= 10) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          uniqueCards: uniqueCards.length,
          uniqueCountries: uniqueCountries.length,
          uniqueIPs: uniqueIPs.length,
          multipleCards,
          geoMismatch,
          stolenCardPattern,
          highCardVelocity,
          countries: uniqueCountries,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 4: Detect 3DS bypass — attempts to bypass 3D Secure authentication
    this.registerTool('detect_3ds_bypass', 'Detect patterns indicating 3D Secure authentication bypass attempts', async (params) => {
      const { sellerId } = params;

      const allTxns = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId &&
          (Date.now() - new Date(r.createdAt || r.timestamp)) < 24 * 60 * 60 * 1000
        );

      const non3dsTxns = allTxns.filter(t => t.threeDsStatus === 'not_attempted' || t.threeDsStatus === 'failed' || !t.threeDsStatus);
      const failed3ds = allTxns.filter(t => t.threeDsStatus === 'failed');
      const challenged3ds = allTxns.filter(t => t.threeDsStatus === 'challenged');

      const non3dsRatio = allTxns.length > 0 ? non3dsTxns.length / allTxns.length : 0;
      const bypassAttempted = non3dsRatio > 0.7 && allTxns.length >= 5;
      const repeatedFailures = failed3ds.length >= 3;

      // Check for merchant-initiated transactions (MIT) abuse — used to skip 3DS
      const mitTxns = allTxns.filter(t => t.initiator === 'merchant' || t.exemptionType === 'mit');
      const mitAbuse = mitTxns.length > allTxns.length * 0.5 && mitTxns.length >= 5;

      let riskScore = 0;
      if (bypassAttempted) riskScore += 35;
      if (repeatedFailures) riskScore += 30;
      if (mitAbuse) riskScore += 25;
      if (non3dsRatio > 0.9) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          totalTransactions: allTxns.length,
          non3dsTransactions: non3dsTxns.length,
          failed3ds: failed3ds.length,
          non3dsRatio: Math.round(non3dsRatio * 100) / 100,
          bypassAttempted,
          repeatedFailures,
          mitAbuse,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 5: Check virtual card velocity — prepaid/virtual card burst patterns
    this.registerTool('check_virtual_card_velocity', 'Detect bursts of prepaid or virtual card usage indicating laundering', async (params) => {
      const { sellerId } = params;

      const allTxns = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId &&
          (Date.now() - new Date(r.createdAt || r.timestamp)) < 72 * 60 * 60 * 1000
        );

      const virtualCardTxns = allTxns.filter(t =>
        t.cardType === 'prepaid' || t.cardType === 'virtual' ||
        t.paymentMethod === 'prepaid' || t.paymentMethod === 'virtual' ||
        (t.cardBin && ['4000', '5100', '4111'].some(prefix => (t.cardBin || '').startsWith(prefix)))
      );

      const virtualRatio = allTxns.length > 0 ? virtualCardTxns.length / allTxns.length : 0;
      const highVirtualVolume = virtualCardTxns.length >= 10;
      const predominantlyVirtual = virtualRatio > 0.6 && allTxns.length >= 5;

      const totalVirtualAmount = virtualCardTxns.reduce((s, t) => s + (t.amount || 0), 0);
      const highVirtualAmount = totalVirtualAmount > 5000;

      let riskScore = 0;
      if (highVirtualVolume) riskScore += 30;
      if (predominantlyVirtual) riskScore += 25;
      if (highVirtualAmount) riskScore += 25;
      if (virtualCardTxns.length >= 20) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          totalTransactions: allTxns.length,
          virtualCardTransactions: virtualCardTxns.length,
          virtualRatio: Math.round(virtualRatio * 100) / 100,
          totalVirtualAmount: Math.round(totalVirtualAmount * 100) / 100,
          highVirtualVolume,
          predominantlyVirtual,
          highVirtualAmount,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Agentic tools
    this.registerTool('search_knowledge_base', 'Search knowledge base for similar payment fraud cases', async (params) => {
      const { query, sellerId } = params;
      const results = this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve relevant payment fraud patterns from long-term memory', async (params) => {
      const { context } = params;
      const memories = this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    const { sellerId, paymentId } = input;
    this.addObservation(`Starting payment risk evaluation for seller: ${sellerId}, payment: ${paymentId || 'unknown'}`);

    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) {
      return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };
    }

    const riskIndicators = this.identifyInitialRiskIndicators(input);
    this.addHypothesis(
      `Payment risk assessment needed — ${riskIndicators.length} initial indicators`,
      CONFIDENCE.POSSIBLE
    );

    return {
      understanding: `Evaluating payment risk for seller: ${sellerId}`,
      riskIndicators,
      relevantMemory: this.retrieveRelevantMemory(input),
      availableTools: Array.from(this.tools.keys())
    };
  }

  async plan(analysis, context) {
    const llmPlan = await super.plan(analysis, context);
    if (llmPlan.llmEnhanced && llmPlan.actions.length > 0) return llmPlan;

    const input = context.input || {};
    const actions = [
      { type: 'detect_card_testing', params: { sellerId: input.sellerId } },
      { type: 'detect_bin_attack', params: { sellerId: input.sellerId } },
      { type: 'check_stolen_card_velocity', params: { sellerId: input.sellerId } },
      { type: 'detect_3ds_bypass', params: { sellerId: input.sellerId } },
      { type: 'check_virtual_card_velocity', params: { sellerId: input.sellerId } },
      { type: 'search_knowledge_base', params: { query: `payment fraud ${input.cardType || ''} ${input.sellerId || ''}`, sellerId: input.sellerId } },
      { type: 'retrieve_memory', params: { context: `payment risk ${input.paymentMethod || ''}` } }
    ];

    return {
      goal: 'Complete payment risk evaluation',
      actions,
      fallback: { type: 'default_block', reason: 'incomplete_payment_evaluation' }
    };
  }

  async observe(actions, context) {
    const safeActions = Array.isArray(actions) ? actions : [];
    const evidence = safeActions.map(a => ({
      source: a.action.type,
      data: a.result?.data,
      success: a.result?.success !== false,
      timestamp: new Date().toISOString()
    }));

    const riskFactors = this.analyzeEvidence(evidence);
    const overallRisk = this.calculateRisk(riskFactors);
    const decision = await this.generateDecision(overallRisk, riskFactors);

    for (const factor of riskFactors) {
      this.addEvidence(`Risk factor: ${factor.factor} (${factor.severity})`);
    }

    const isAutonomous = overallRisk.score < this.autonomyThresholds.ESCALATE_MIN_RISK;
    const needsHumanReview = !isAutonomous || decision.action === 'CHALLENGE';

    if (context.input?.sellerId) {
      this.selfCorrection.logPrediction(
        `PAY-${Date.now().toString(36).toUpperCase()}`,
        context.input.sellerId,
        decision.action,
        decision.confidence,
        this.generateReasoning(riskFactors, decision)
      );
    }

    this.knowledgeBase.addKnowledge('payment', [{
      _id: `PAY-${Date.now()}`,
      text: `Payment evaluation for seller ${context.input?.sellerId || 'unknown'}. Decision: ${decision.action}. Risk: ${overallRisk.score}. Factors: ${riskFactors.map(f => f.factor).join(', ')}`,
      category: 'payment', sellerId: context.input?.sellerId, domain: 'payment',
      outcome: decision.action === 'APPROVE' ? 'legitimate' : decision.action === 'BLOCK' ? 'fraud' : 'pending',
      riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true,
      evaluationId: `PAY-${Date.now().toString(36).toUpperCase()}`,
      summary: `Payment evaluation complete. ${riskFactors.length} risk factors. ${isAutonomous ? 'Autonomous.' : 'Needs review.'}`,
      evidence, riskFactors, overallRisk, decision,
      confidence: decision.confidence, isAutonomous, needsHumanReview,
      escalationReason: needsHumanReview ? `Risk score ${overallRisk.score} requires review` : null,
      selfCorrectionStats: this.selfCorrection.getAccuracy(),
      reasoning: this.generateReasoning(riskFactors, decision)
    };
  }

  identifyInitialRiskIndicators(input) {
    const indicators = [];
    if ((input.amount || 0) < 1 && (input.amount || 0) > 0) indicators.push('MICRO_TRANSACTION');
    if (input.cardType === 'prepaid' || input.cardType === 'virtual') indicators.push('PREPAID_VIRTUAL_CARD');
    if (input.threeDsStatus === 'failed') indicators.push('3DS_FAILURE');
    if (!input.billingCountry) indicators.push('NO_BILLING_COUNTRY');
    if (input.isInternational) indicators.push('INTERNATIONAL_PAYMENT');
    return indicators;
  }

  analyzeEvidence(evidence) {
    const factors = [];

    evidence.forEach(e => {
      if (!e.success || !e.data) return;

      if (e.source === 'detect_card_testing') {
        if (e.data.cardTestingDetected) factors.push({ factor: 'CARD_TESTING', severity: 'CRITICAL', score: 40 });
        if (e.data.aggressiveProbing) factors.push({ factor: 'AGGRESSIVE_PROBING', severity: 'CRITICAL', score: 30 });
      }

      if (e.source === 'detect_bin_attack') {
        if (e.data.binAttackDetected) factors.push({ factor: 'BIN_ATTACK', severity: 'CRITICAL', score: 35 });
        if (e.data.sequentialDetected) factors.push({ factor: 'SEQUENTIAL_CARDS', severity: 'HIGH', score: 30 });
      }

      if (e.source === 'check_stolen_card_velocity') {
        if (e.data.stolenCardPattern) factors.push({ factor: 'STOLEN_CARD_PATTERN', severity: 'CRITICAL', score: 40 });
        if (e.data.highCardVelocity) factors.push({ factor: 'HIGH_CARD_VELOCITY', severity: 'HIGH', score: 25 });
        if (e.data.geoMismatch) factors.push({ factor: 'GEO_MISMATCH', severity: 'HIGH', score: 20 });
      }

      if (e.source === 'detect_3ds_bypass') {
        if (e.data.bypassAttempted) factors.push({ factor: '3DS_BYPASS', severity: 'HIGH', score: 35 });
        if (e.data.repeatedFailures) factors.push({ factor: '3DS_REPEATED_FAILURES', severity: 'HIGH', score: 30 });
        if (e.data.mitAbuse) factors.push({ factor: 'MIT_ABUSE', severity: 'MEDIUM', score: 20 });
      }

      if (e.source === 'check_virtual_card_velocity') {
        if (e.data.highVirtualVolume && e.data.predominantlyVirtual) factors.push({ factor: 'VIRTUAL_CARD_ABUSE', severity: 'CRITICAL', score: 35 });
        else if (e.data.predominantlyVirtual) factors.push({ factor: 'HIGH_VIRTUAL_RATIO', severity: 'HIGH', score: 25 });
        if (e.data.highVirtualAmount) factors.push({ factor: 'HIGH_VIRTUAL_AMOUNT', severity: 'MEDIUM', score: 20 });
      }
    });

    return factors;
  }

  calculateRisk(factors) {
    const totalScore = factors.reduce((sum, f) => sum + (f.score || 0), 0);
    const normalizedScore = Math.max(0, Math.min(100, totalScore));

    return {
      score: normalizedScore,
      level: normalizedScore > 65 ? 'CRITICAL' : normalizedScore > 40 ? 'HIGH' : normalizedScore > 20 ? 'MEDIUM' : 'LOW',
      factorCount: factors.length,
      criticalFactors: factors.filter(f => f.severity === 'CRITICAL').length,
      highFactors: factors.filter(f => f.severity === 'HIGH').length
    };
  }

  async generateDecision(risk, factors) {
    if (this.llmClient?.enabled) {
      try {
        let decisionContent = '';
        try {
          const { getPromptRegistry } = await import('../core/prompt-registry.js');
          const registry = getPromptRegistry();
          const prompt = registry.getPromptById('payment-risk-decision');
          decisionContent = prompt?.content || '';
        } catch { /* fallback */ }
        const systemPrompt = decisionContent || 'You are the payment risk authority. Return ONLY valid JSON: {"action":"APPROVE|CHALLENGE|BLOCK", "confidence":0.0-1.0, "reason":"..."}';
        const userPrompt = `Risk score: ${risk.score}/100, Critical: ${risk.criticalFactors}, High: ${risk.highFactors}\nFactors: ${factors.map(f => `${f.factor} (${f.severity}, score:${f.score})`).join(', ')}`;
        const result = await this.llmClient.complete(systemPrompt, userPrompt);
        if (result?.content) {
          const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (['APPROVE', 'CHALLENGE', 'BLOCK'].includes(parsed.action)) {
              return { ...parsed, llmEnhanced: true };
            }
          }
        }
      } catch (e) { /* fallback */ }
    }

    const thresholds = this.autonomyThresholds;
    if (risk.score >= (thresholds.AUTO_REJECT_MIN_RISK || 66) || risk.criticalFactors > 0) {
      return { action: 'BLOCK', confidence: 0.90, reason: 'High risk payment indicators — blocking payment' };
    } else if (risk.score >= (thresholds.AUTO_APPROVE_MAX_RISK || 31)) {
      return { action: 'CHALLENGE', confidence: 0.75, reason: 'Moderate payment risk — additional verification required' };
    }
    return { action: 'APPROVE', confidence: 0.85, reason: 'Low payment risk — payment permitted' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## Payment Risk Summary\n\n### Risk Factors:\n${desc || '- No significant risk factors'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`.trim();
  }

  async evaluatePayment(sellerId, paymentData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, ...paymentData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getPaymentRiskAgent() {
  if (!instance) instance = new PaymentRiskAgent();
  return instance;
}

export default PaymentRiskAgent;
