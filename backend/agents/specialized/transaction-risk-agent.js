/**
 * Transaction Risk Agent
 *
 * Detects fraudulent transaction patterns including shill bidding, wash trading,
 * off-platform diversion, gift card laundering, and velocity anomalies.
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

export class TransactionRiskAgent extends BaseAgent {
  constructor() {
    super({
      agentId: 'TRANSACTION_RISK',
      name: 'Transaction Risk Agent',
      role: 'TRANSACTION_RISK',
      capabilities: [
        'transaction_velocity_analysis',
        'shill_bidding_detection',
        'wash_trading_detection',
        'off_platform_detection',
        'gift_card_monitoring'
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

  async registerTools() {
    // Tool 1: Check transaction velocity for a seller in 1h and 24h windows
    this.registerTool('check_transaction_velocity', 'Count transactions in 1h/24h windows and detect checkout bursts', async (params) => {
      const { sellerId } = params;

      const allTxns = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId);

      const now = Date.now();
      const oneHour = allTxns.filter(t => now - new Date(t.createdAt || t.timestamp) < 60 * 60 * 1000);
      const twentyFourHour = allTxns.filter(t => now - new Date(t.createdAt || t.timestamp) < 24 * 60 * 60 * 1000);

      const avgAmount24h = twentyFourHour.length > 0
        ? twentyFourHour.reduce((s, t) => s + (t.amount || 0), 0) / twentyFourHour.length
        : 0;

      // Checkout burst: more than 20 transactions in 1 hour
      const checkoutBurst = oneHour.length > 20;
      // High daily volume: more than 200 in 24 hours
      const highDailyVolume = twentyFourHour.length > 200;

      let riskScore = 0;
      if (checkoutBurst) riskScore += 35;
      if (highDailyVolume) riskScore += 25;
      if (oneHour.length > 50) riskScore += 20;

      return {
        success: true,
        data: {
          sellerId,
          oneHourCount: oneHour.length,
          twentyFourHourCount: twentyFourHour.length,
          avgAmount24h: Math.round(avgAmount24h * 100) / 100,
          checkoutBurst,
          highDailyVolume,
          riskScore: Math.min(riskScore, 80),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 2: Detect shill bidding — buyer and seller connected via shared attributes
    this.registerTool('detect_shill_bidding', 'Check if buyer and seller share IPs, devices, or accounts suggesting collusion', async (params) => {
      const { sellerId, buyerId } = params;

      const allTxns = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data);

      const sellerTxns = allTxns.filter(t => t.sellerId === sellerId);
      const buyerTxns = allTxns.filter(t => t.buyerId === buyerId);

      const sellerIPs = new Set(sellerTxns.map(t => t.ipAddress).filter(Boolean));
      const buyerIPs = new Set(buyerTxns.map(t => t.ipAddress).filter(Boolean));
      const sharedIPs = [...sellerIPs].filter(ip => buyerIPs.has(ip));

      const sellerDevices = new Set(sellerTxns.map(t => t.deviceFingerprint).filter(Boolean));
      const buyerDevices = new Set(buyerTxns.map(t => t.deviceFingerprint).filter(Boolean));
      const sharedDevices = [...sellerDevices].filter(d => buyerDevices.has(d));

      // Repeated bidding: same buyer bought from same seller more than 5 times
      const repeatedPurchases = allTxns.filter(t => t.sellerId === sellerId && t.buyerId === buyerId).length;
      const repeatedBidding = repeatedPurchases > 5;

      const shillDetected = sharedIPs.length > 0 || sharedDevices.length > 0 || repeatedBidding;

      let riskScore = 0;
      if (sharedIPs.length > 0) riskScore += 35;
      if (sharedDevices.length > 0) riskScore += 40;
      if (repeatedBidding) riskScore += 20;

      return {
        success: true,
        data: {
          sellerId,
          buyerId,
          sharedIPs,
          sharedDevices,
          repeatedPurchases,
          repeatedBidding,
          shillDetected,
          riskScore: Math.min(riskScore, 90),
          riskLevel: shillDetected ? 'CRITICAL' : 'LOW'
        }
      };
    });

    // Tool 3: Check wash trading — circular transaction patterns
    this.registerTool('check_wash_trading', 'Detect circular transaction patterns where funds cycle between accounts', async (params) => {
      const { sellerId } = params;

      const allTxns = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => (Date.now() - new Date(r.createdAt || r.timestamp)) < 30 * 24 * 60 * 60 * 1000);

      // Find buyers who purchased from this seller
      const buyers = [...new Set(allTxns.filter(t => t.sellerId === sellerId).map(t => t.buyerId).filter(Boolean))];

      // Check if any of those buyers also sold back to this seller (circular)
      const circularPartners = buyers.filter(buyerId =>
        allTxns.some(t => t.sellerId === buyerId && t.buyerId === sellerId)
      );

      // Check for near-identical amounts (round-tripping)
      const sellerOutbound = allTxns.filter(t => t.sellerId === sellerId);
      const sellerInbound = allTxns.filter(t => t.buyerId === sellerId);
      const matchingAmounts = sellerOutbound.filter(out =>
        sellerInbound.some(inb => Math.abs((out.amount || 0) - (inb.amount || 0)) < 1)
      );

      const washTradingDetected = circularPartners.length > 0;
      const roundTripping = matchingAmounts.length >= 3;

      let riskScore = 0;
      if (washTradingDetected) riskScore += 40;
      if (circularPartners.length > 2) riskScore += 20;
      if (roundTripping) riskScore += 25;

      return {
        success: true,
        data: {
          sellerId,
          circularPartners,
          circularPartnerCount: circularPartners.length,
          matchingAmountPairs: matchingAmounts.length,
          washTradingDetected,
          roundTripping,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 4: Detect off-platform diversion — contact info in messages
    this.registerTool('detect_off_platform_diversion', 'Check for email addresses, phone numbers, or URLs in transaction messages', async (params) => {
      const { sellerId } = params;

      const allTxns = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId);

      const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
      const phonePattern = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
      const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/i;

      let emailCount = 0;
      let phoneCount = 0;
      let urlCount = 0;

      allTxns.forEach(t => {
        const text = [t.description, t.message, t.notes, t.itemDescription].filter(Boolean).join(' ');
        if (emailPattern.test(text)) emailCount++;
        if (phonePattern.test(text)) phoneCount++;
        if (urlPattern.test(text)) urlCount++;
      });

      const totalDiversions = emailCount + phoneCount + urlCount;
      const diversionDetected = totalDiversions >= 2;

      let riskScore = 0;
      if (emailCount > 0) riskScore += 20;
      if (phoneCount > 0) riskScore += 20;
      if (urlCount > 0) riskScore += 25;
      if (totalDiversions >= 5) riskScore += 20;

      return {
        success: true,
        data: {
          sellerId,
          emailMentions: emailCount,
          phoneMentions: phoneCount,
          urlMentions: urlCount,
          totalDiversions,
          diversionDetected,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 40 ? 'CRITICAL' : riskScore >= 20 ? 'HIGH' : riskScore >= 10 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 5: Check gift card laundering — high-value gift card purchase patterns
    this.registerTool('check_gift_card_laundering', 'Detect high-value gift card purchases and rapid redemption patterns', async (params) => {
      const { sellerId } = params;

      const allTxns = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId);

      const giftCardTxns = allTxns.filter(t =>
        (t.category || '').toLowerCase().includes('gift') ||
        (t.itemType || '').toLowerCase().includes('gift') ||
        (t.description || '').toLowerCase().includes('gift card')
      );

      const recentGiftCards = giftCardTxns.filter(t =>
        (Date.now() - new Date(t.createdAt || t.timestamp)) < 7 * 24 * 60 * 60 * 1000
      );

      const totalGiftCardValue = recentGiftCards.reduce((s, t) => s + (t.amount || 0), 0);
      const highValue = totalGiftCardValue > 5000;
      const highVolume = recentGiftCards.length > 10;

      // Check for round amounts (common in laundering)
      const roundAmounts = recentGiftCards.filter(t => (t.amount || 0) % 50 === 0).length;
      const mostlyRoundAmounts = recentGiftCards.length > 0 && (roundAmounts / recentGiftCards.length) > 0.7;

      let riskScore = 0;
      if (highValue) riskScore += 30;
      if (highVolume) riskScore += 25;
      if (mostlyRoundAmounts) riskScore += 20;
      if (totalGiftCardValue > 10000) riskScore += 20;

      return {
        success: true,
        data: {
          sellerId,
          giftCardTransactions: recentGiftCards.length,
          totalGiftCardValue: Math.round(totalGiftCardValue * 100) / 100,
          highValue,
          highVolume,
          roundAmountRatio: recentGiftCards.length > 0 ? Math.round((roundAmounts / recentGiftCards.length) * 100) / 100 : 0,
          mostlyRoundAmounts,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Agentic tools
    this.registerTool('search_knowledge_base', 'Search knowledge base for similar transaction fraud cases', async (params) => {
      const { query, sellerId } = params;
      const results = await this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve relevant transaction fraud patterns from long-term memory', async (params) => {
      const { context } = params;
      const memories = await this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    const { sellerId, transactionId } = input;
    this.addObservation(`Starting transaction risk evaluation for seller: ${sellerId}, txn: ${transactionId || 'unknown'}`);

    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) {
      return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };
    }

    const riskIndicators = this.identifyInitialRiskIndicators(input);
    this.addHypothesis(
      `Transaction risk assessment needed — ${riskIndicators.length} initial indicators`,
      CONFIDENCE.POSSIBLE
    );

    return {
      understanding: `Evaluating transaction risk for seller: ${sellerId}`,
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
      { type: 'check_transaction_velocity', params: { sellerId: input.sellerId } },
      { type: 'detect_shill_bidding', params: { sellerId: input.sellerId, buyerId: input.buyerId } },
      { type: 'check_wash_trading', params: { sellerId: input.sellerId } },
      { type: 'detect_off_platform_diversion', params: { sellerId: input.sellerId } },
      { type: 'check_gift_card_laundering', params: { sellerId: input.sellerId } },
      { type: 'search_knowledge_base', params: { query: `transaction fraud ${input.sellerId || ''}`, sellerId: input.sellerId } },
      { type: 'retrieve_memory', params: { context: `transaction risk ${input.category || ''}` } }
    ];

    return {
      goal: 'Complete transaction risk evaluation',
      actions,
      fallback: { type: 'default_block', reason: 'incomplete_transaction_evaluation' }
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
        `TXN-${Date.now().toString(36).toUpperCase()}`,
        context.input.sellerId,
        decision.action,
        decision.confidence,
        this.generateReasoning(riskFactors, decision)
      );
    }

    this.knowledgeBase.addKnowledge('transaction', [{
      _id: `TXN-${Date.now()}`,
      text: `Transaction evaluation for seller ${context.input?.sellerId || 'unknown'}. Decision: ${decision.action}. Risk: ${overallRisk.score}. Factors: ${riskFactors.map(f => f.factor).join(', ')}`,
      category: 'transaction', sellerId: context.input?.sellerId, domain: 'transaction',
      outcome: decision.action === 'APPROVE' ? 'legitimate' : decision.action === 'BLOCK' ? 'fraud' : 'pending',
      riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true,
      evaluationId: `TXN-${Date.now().toString(36).toUpperCase()}`,
      summary: `Transaction evaluation complete. ${riskFactors.length} risk factors. ${isAutonomous ? 'Autonomous.' : 'Needs review.'}`,
      evidence, riskFactors, overallRisk, decision,
      confidence: decision.confidence, isAutonomous, needsHumanReview,
      escalationReason: needsHumanReview ? `Risk score ${overallRisk.score} requires review` : null,
      selfCorrectionStats: this.selfCorrection.getAccuracy(),
      reasoning: this.generateReasoning(riskFactors, decision)
    };
  }

  identifyInitialRiskIndicators(input) {
    const indicators = [];
    if (!input.buyerId) indicators.push('NO_BUYER_ID');
    if (!input.amount && input.amount !== 0) indicators.push('NO_AMOUNT');
    if ((input.amount || 0) > 10000) indicators.push('HIGH_VALUE_TRANSACTION');
    if ((input.category || '').toLowerCase().includes('gift')) indicators.push('GIFT_CARD_CATEGORY');
    if (!input.deviceFingerprint) indicators.push('NO_DEVICE_FINGERPRINT');
    return indicators;
  }

  analyzeEvidence(evidence) {
    const factors = [];

    evidence.forEach(e => {
      if (!e.success || !e.data) return;

      if (e.source === 'check_transaction_velocity') {
        if (e.data.checkoutBurst) factors.push({ factor: 'CHECKOUT_BURST', severity: 'CRITICAL', score: 35 });
        if (e.data.highDailyVolume) factors.push({ factor: 'HIGH_VELOCITY', severity: 'HIGH', score: 25 });
      }

      if (e.source === 'detect_shill_bidding') {
        if (e.data.shillDetected) factors.push({ factor: 'SHILL_BIDDING', severity: 'CRITICAL', score: 40 });
        if (e.data.repeatedBidding) factors.push({ factor: 'REPEATED_BUYER_PATTERN', severity: 'HIGH', score: 20 });
      }

      if (e.source === 'check_wash_trading') {
        if (e.data.washTradingDetected) factors.push({ factor: 'WASH_TRADING', severity: 'CRITICAL', score: 40 });
        if (e.data.roundTripping) factors.push({ factor: 'ROUND_TRIP_AMOUNTS', severity: 'HIGH', score: 25 });
      }

      if (e.source === 'detect_off_platform_diversion') {
        if (e.data.diversionDetected) factors.push({ factor: 'OFF_PLATFORM_DIVERSION', severity: 'HIGH', score: 30 });
        if (e.data.urlMentions > 0) factors.push({ factor: 'URL_IN_MESSAGES', severity: 'MEDIUM', score: 15 });
      }

      if (e.source === 'check_gift_card_laundering') {
        if (e.data.highValue && e.data.highVolume) factors.push({ factor: 'GIFT_CARD_LAUNDERING', severity: 'CRITICAL', score: 40 });
        else if (e.data.highValue) factors.push({ factor: 'HIGH_VALUE_GIFT_CARDS', severity: 'HIGH', score: 25 });
        if (e.data.mostlyRoundAmounts) factors.push({ factor: 'ROUND_GIFT_AMOUNTS', severity: 'MEDIUM', score: 15 });
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
          const prompt = registry.getPromptById('transaction-risk-decision');
          decisionContent = prompt?.content || '';
        } catch { /* fallback */ }
        const systemPrompt = decisionContent || 'You are the transaction risk authority. Return ONLY valid JSON: {"action":"APPROVE|CHALLENGE|BLOCK", "confidence":0.0-1.0, "reason":"..."}';
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
      return { action: 'BLOCK', confidence: 0.90, reason: 'High risk transaction indicators — blocking transaction' };
    } else if (risk.score >= (thresholds.AUTO_APPROVE_MAX_RISK || 31)) {
      return { action: 'CHALLENGE', confidence: 0.75, reason: 'Moderate transaction risk — additional verification required' };
    }
    return { action: 'APPROVE', confidence: 0.85, reason: 'Low transaction risk — transaction permitted' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## Transaction Risk Summary\n\n### Risk Factors:\n${desc || '- No significant risk factors'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`.trim();
  }

  async evaluateTransaction(sellerId, transactionData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, ...transactionData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getTransactionRiskAgent() {
  if (!instance) instance = new TransactionRiskAgent();
  return instance;
}

export default TransactionRiskAgent;
