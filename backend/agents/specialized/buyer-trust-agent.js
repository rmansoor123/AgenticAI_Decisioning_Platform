/**
 * Buyer Trust Agent
 *
 * Evaluates buyer trustworthiness by analyzing first-purchase risk, chargeback
 * history, multi-account patterns, dispute ratios, and purchase velocity.
 *
 * Decisions: APPROVE / FLAG / RESTRICT
 * Safe default on error: FLAG
 * Domain weight: 0.08
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getThresholdManager } from '../core/threshold-manager.js';

export class BuyerTrustAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Buyer Trust Agent',
      role: 'BUYER_TRUST',
      agentId: 'BUYER_TRUST',
      capabilities: [
        'first_purchase_analysis',
        'chargeback_monitoring',
        'multi_account_detection',
        'dispute_analysis',
        'velocity_tracking'
      ]
    });

    this.riskThresholds = {
      APPROVE: { max: 30 },
      FLAG: { min: 31, max: 65 },
      RESTRICT: { min: 66 }
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
    // Tool 1: Check first purchase risk — new buyer with high value first purchase
    this.registerTool('check_first_purchase_risk', 'Analyze new buyer + high value first purchase risk', async (params) => {
      const { sellerId, buyerData } = params;

      const buyerId = buyerData?.buyerId;
      const allTransactions = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.buyerId === buyerId);

      const isFirstPurchase = allTransactions.length <= 1;
      const currentAmount = buyerData?.amount || 0;

      // Account age analysis
      const accountCreated = buyerData?.accountCreatedAt ? new Date(buyerData.accountCreatedAt) : null;
      const accountAgeDays = accountCreated ? (Date.now() - accountCreated) / (1000 * 60 * 60 * 24) : null;
      const isNewAccount = accountAgeDays !== null && accountAgeDays < 7;

      // High value threshold — first purchase over $500 is suspicious
      const isHighValue = currentAmount > 500;
      const isVeryHighValue = currentAmount > 2000;

      // Check if buyer has completed profile
      const hasVerifiedEmail = buyerData?.emailVerified !== false;
      const hasVerifiedPhone = buyerData?.phoneVerified !== false;
      const hasShippingAddress = !!buyerData?.shippingAddress;
      const profileCompleteness = [hasVerifiedEmail, hasVerifiedPhone, hasShippingAddress].filter(Boolean).length / 3;

      const highRiskFirstPurchase = isFirstPurchase && isHighValue && isNewAccount;

      let riskScore = 0;
      if (isFirstPurchase && isHighValue) riskScore += 25;
      if (isFirstPurchase && isVeryHighValue) riskScore += 20;
      if (isNewAccount) riskScore += 15;
      if (profileCompleteness < 0.5) riskScore += 15;
      if (highRiskFirstPurchase) riskScore += 10;

      return {
        success: true,
        data: {
          buyerId,
          isFirstPurchase,
          currentAmount,
          accountAgeDays: accountAgeDays !== null ? Math.round(accountAgeDays) : null,
          isNewAccount,
          isHighValue,
          isVeryHighValue,
          profileCompleteness: Math.round(profileCompleteness * 100) / 100,
          highRiskFirstPurchase,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 2: Check chargeback history — buyer chargeback/dispute rate
    this.registerTool('check_chargeback_history', 'Analyze buyer chargeback and dispute rate', async (params) => {
      const { sellerId, buyerData } = params;

      const buyerId = buyerData?.buyerId;
      const allTransactions = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.buyerId === buyerId);

      const chargebacks = allTransactions.filter(t => t.status === 'CHARGEBACK' || t.chargedBack);
      const disputes = allTransactions.filter(t => t.status === 'DISPUTED' || t.disputed);

      const chargebackRate = allTransactions.length > 0 ? chargebacks.length / allTransactions.length : 0;
      const disputeRate = allTransactions.length > 0 ? disputes.length / allTransactions.length : 0;

      // Recent chargebacks are more concerning
      const now = Date.now();
      const recentChargebacks = chargebacks.filter(t =>
        (now - new Date(t.timestamp || t.createdAt)) < 90 * 24 * 60 * 60 * 1000
      );

      // Total chargeback amount
      const chargebackAmount = chargebacks.reduce((sum, t) => sum + (t.amount || 0), 0);
      const totalAmount = allTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
      const chargebackAmountRate = totalAmount > 0 ? chargebackAmount / totalAmount : 0;

      const highChargebackRate = chargebackRate > 0.05 && chargebacks.length >= 2;
      const serialChargeback = chargebacks.length >= 5;
      const recentChargebackSpike = recentChargebacks.length >= 3;

      let riskScore = 0;
      if (highChargebackRate) riskScore += 30;
      if (serialChargeback) riskScore += 25;
      if (recentChargebackSpike) riskScore += 20;
      if (chargebackAmountRate > 0.1) riskScore += 15;
      if (disputeRate > 0.15) riskScore += 10;

      return {
        success: true,
        data: {
          buyerId,
          totalTransactions: allTransactions.length,
          chargebacks: chargebacks.length,
          disputes: disputes.length,
          chargebackRate: Math.round(chargebackRate * 1000) / 1000,
          disputeRate: Math.round(disputeRate * 1000) / 1000,
          recentChargebacks: recentChargebacks.length,
          chargebackAmount,
          chargebackAmountRate: Math.round(chargebackAmountRate * 100) / 100,
          highChargebackRate,
          serialChargeback,
          recentChargebackSpike,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 3: Detect multi-account buyer — shared device/IP/address across buyer accounts
    this.registerTool('detect_multi_account_buyer', 'Detect shared device/IP/address across buyer accounts', async (params) => {
      const { sellerId, buyerData } = params;

      const buyerId = buyerData?.buyerId;
      const buyerIP = buyerData?.ipAddress;
      const buyerDevice = buyerData?.deviceFingerprint;
      const buyerAddress = buyerData?.shippingAddress;

      // Find other buyers sharing same IP
      const allTransactions = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data);

      const sameIPBuyers = buyerIP
        ? [...new Set(allTransactions.filter(t => t.buyerIP === buyerIP && t.buyerId !== buyerId).map(t => t.buyerId).filter(Boolean))]
        : [];

      // Find other buyers sharing same device fingerprint
      const atoEvents = (await db_ops.getAll('ato_events', 10000, 0) || [])
        .map(e => e.data);

      const sameDeviceBuyers = buyerDevice
        ? [...new Set(atoEvents.filter(e => e.deviceInfo?.fingerprint === buyerDevice && e.sellerId !== buyerId).map(e => e.sellerId).filter(Boolean))]
        : [];

      // Find other buyers sharing same shipping address
      const sameAddressBuyers = buyerAddress
        ? [...new Set(allTransactions.filter(t => t.shippingAddress === buyerAddress && t.buyerId !== buyerId).map(t => t.buyerId).filter(Boolean))]
        : [];

      const sharedIP = sameIPBuyers.length > 0;
      const sharedDevice = sameDeviceBuyers.length > 0;
      const sharedAddress = sameAddressBuyers.length > 0;

      // Multi-account confirmed when 2+ signals overlap
      const overlapSignals = [sharedIP, sharedDevice, sharedAddress].filter(Boolean).length;
      const multiAccountLikely = overlapSignals >= 2;
      const multiAccountConfirmed = overlapSignals >= 3;

      let riskScore = 0;
      if (sharedIP) riskScore += 15;
      if (sharedDevice) riskScore += 25;
      if (sharedAddress) riskScore += 20;
      if (multiAccountLikely) riskScore += 15;
      if (multiAccountConfirmed) riskScore += 10;

      return {
        success: true,
        data: {
          buyerId,
          sameIPBuyers: sameIPBuyers.length,
          sameDeviceBuyers: sameDeviceBuyers.length,
          sameAddressBuyers: sameAddressBuyers.length,
          sharedIP,
          sharedDevice,
          sharedAddress,
          overlapSignals,
          multiAccountLikely,
          multiAccountConfirmed,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 4: Check dispute ratio — dispute-to-purchase ratio above threshold
    this.registerTool('check_dispute_ratio', 'Analyze dispute-to-purchase ratio above threshold', async (params) => {
      const { sellerId, buyerData } = params;

      const buyerId = buyerData?.buyerId;
      const allTransactions = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.buyerId === buyerId);

      const disputes = allTransactions.filter(t =>
        t.status === 'DISPUTED' || t.disputed || t.status === 'CHARGEBACK' || t.chargedBack
      );

      const totalPurchases = allTransactions.length;
      const totalDisputes = disputes.length;
      const disputeRatio = totalPurchases > 0 ? totalDisputes / totalPurchases : 0;

      // Time-based analysis — escalating dispute frequency
      const now = Date.now();
      const windows = {
        '30d': disputes.filter(d => (now - new Date(d.timestamp || d.createdAt)) < 30 * 24 * 60 * 60 * 1000),
        '90d': disputes.filter(d => (now - new Date(d.timestamp || d.createdAt)) < 90 * 24 * 60 * 60 * 1000),
        '365d': disputes.filter(d => (now - new Date(d.timestamp || d.createdAt)) < 365 * 24 * 60 * 60 * 1000)
      };

      const monthlyRate30d = windows['30d'].length;
      const monthlyRate90d = windows['90d'].length / 3;
      const escalating = monthlyRate30d > monthlyRate90d * 1.5 && monthlyRate30d >= 2;

      // Category analysis — disputes concentrated on specific item types
      const disputeCategories = disputes.map(d => d.category).filter(Boolean);
      const categoryFreq = {};
      disputeCategories.forEach(c => { categoryFreq[c] = (categoryFreq[c] || 0) + 1; });
      const concentratedCategory = Object.values(categoryFreq).some(c => c >= 3);

      const highDisputeRatio = disputeRatio > 0.1 && totalDisputes >= 3;
      const extremeDisputeRatio = disputeRatio > 0.3 && totalDisputes >= 5;

      let riskScore = 0;
      if (extremeDisputeRatio) riskScore += 35;
      else if (highDisputeRatio) riskScore += 25;
      if (escalating) riskScore += 20;
      if (concentratedCategory) riskScore += 15;
      if (monthlyRate30d >= 3) riskScore += 15;

      return {
        success: true,
        data: {
          buyerId,
          totalPurchases,
          totalDisputes,
          disputeRatio: Math.round(disputeRatio * 1000) / 1000,
          monthlyRate30d,
          monthlyRate90d: Math.round(monthlyRate90d * 100) / 100,
          escalating,
          concentratedCategory,
          highDisputeRatio,
          extremeDisputeRatio,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 5: Check buyer velocity — purchase velocity anomaly, too many orders in short time
    this.registerTool('check_buyer_velocity', 'Detect purchase velocity anomaly — too many orders in short time', async (params) => {
      const { sellerId, buyerData } = params;

      const buyerId = buyerData?.buyerId;
      const allTransactions = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.buyerId === buyerId);

      const now = Date.now();
      const windows = {
        '1h': allTransactions.filter(t => (now - new Date(t.timestamp || t.createdAt)) < 60 * 60 * 1000),
        '24h': allTransactions.filter(t => (now - new Date(t.timestamp || t.createdAt)) < 24 * 60 * 60 * 1000),
        '7d': allTransactions.filter(t => (now - new Date(t.timestamp || t.createdAt)) < 7 * 24 * 60 * 60 * 1000)
      };

      // High velocity thresholds
      const rapidPurchasing = windows['1h'].length >= 5;
      const highDailyVolume = windows['24h'].length >= 20;
      const highWeeklyVolume = windows['7d'].length >= 50;

      // Amount velocity — total spend in short windows
      const hourlySpend = windows['1h'].reduce((s, t) => s + (t.amount || 0), 0);
      const dailySpend = windows['24h'].reduce((s, t) => s + (t.amount || 0), 0);
      const highHourlySpend = hourlySpend > 5000;
      const highDailySpend = dailySpend > 20000;

      // Identical purchases — same item bought multiple times
      const itemCounts = {};
      windows['24h'].forEach(t => {
        const item = t.itemId || t.listingId;
        if (item) itemCounts[item] = (itemCounts[item] || 0) + 1;
      });
      const duplicatePurchases = Object.values(itemCounts).filter(c => c >= 3).length;
      const hasDuplicates = duplicatePurchases > 0;

      let riskScore = 0;
      if (rapidPurchasing) riskScore += 30;
      if (highDailyVolume) riskScore += 20;
      if (highWeeklyVolume) riskScore += 10;
      if (highHourlySpend) riskScore += 20;
      if (highDailySpend) riskScore += 15;
      if (hasDuplicates) riskScore += 15;

      return {
        success: true,
        data: {
          buyerId,
          purchases1h: windows['1h'].length,
          purchases24h: windows['24h'].length,
          purchases7d: windows['7d'].length,
          hourlySpend,
          dailySpend,
          rapidPurchasing,
          highDailyVolume,
          highHourlySpend,
          highDailySpend,
          duplicatePurchases,
          hasDuplicates,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Agentic tools
    this.registerTool('search_knowledge_base', 'Search knowledge base for similar buyer fraud cases', async (params) => {
      const { query, sellerId } = params;
      const results = await this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve relevant buyer fraud patterns from long-term memory', async (params) => {
      const { context } = params;
      const memories = await this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    const { sellerId, buyerData } = input;
    this.addObservation(`Starting buyer trust evaluation for seller: ${sellerId}, buyer: ${buyerData?.buyerId || 'unknown'}`);

    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) {
      return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };
    }

    const riskIndicators = this.identifyInitialRiskIndicators(input);
    this.addHypothesis(
      `Buyer trust assessment needed — ${riskIndicators.length} initial indicators`,
      CONFIDENCE.POSSIBLE
    );

    return {
      understanding: `Evaluating buyer trust for buyer: ${buyerData?.buyerId || 'unknown'}`,
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
      { type: 'check_first_purchase_risk', params: { sellerId: input.sellerId, buyerData: input.buyerData } },
      { type: 'check_chargeback_history', params: { sellerId: input.sellerId, buyerData: input.buyerData } },
      { type: 'detect_multi_account_buyer', params: { sellerId: input.sellerId, buyerData: input.buyerData } },
      { type: 'check_dispute_ratio', params: { sellerId: input.sellerId, buyerData: input.buyerData } },
      { type: 'check_buyer_velocity', params: { sellerId: input.sellerId, buyerData: input.buyerData } },
      { type: 'search_knowledge_base', params: { query: `buyer fraud ${input.buyerData?.buyerId || ''} ${input.sellerId || ''}`, sellerId: input.sellerId } },
      { type: 'retrieve_memory', params: { context: `buyer trust ${input.buyerData?.buyerId || ''}` } }
    ];

    return {
      goal: 'Complete buyer trust evaluation',
      actions,
      fallback: { type: 'default_flag', reason: 'incomplete_buyer_evaluation' }
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
    const needsHumanReview = !isAutonomous || decision.action === 'FLAG';

    if (context.input?.sellerId) {
      this.selfCorrection.logPrediction(
        `BYR-${Date.now().toString(36).toUpperCase()}`,
        context.input.sellerId,
        decision.action,
        decision.confidence,
        this.generateReasoning(riskFactors, decision)
      );
    }

    this.knowledgeBase.addKnowledge('buyer_trust', [{
      _id: `BYR-${Date.now()}`,
      text: `Buyer trust evaluation for seller ${context.input?.sellerId || 'unknown'}, buyer ${context.input?.buyerData?.buyerId || 'unknown'}. Decision: ${decision.action}. Risk: ${overallRisk.score}. Factors: ${riskFactors.map(f => f.factor).join(', ')}`,
      category: 'buyer_trust', sellerId: context.input?.sellerId, domain: 'buyer_trust',
      outcome: decision.action === 'APPROVE' ? 'legitimate' : decision.action === 'RESTRICT' ? 'fraud' : 'pending',
      riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true,
      evaluationId: `BYR-${Date.now().toString(36).toUpperCase()}`,
      summary: `Buyer trust evaluation complete. ${riskFactors.length} risk factors. ${isAutonomous ? 'Autonomous.' : 'Needs review.'}`,
      evidence, riskFactors, overallRisk, decision,
      confidence: decision.confidence, isAutonomous, needsHumanReview,
      escalationReason: needsHumanReview ? `Risk score ${overallRisk.score} requires review` : null,
      selfCorrectionStats: this.selfCorrection.getAccuracy(),
      reasoning: this.generateReasoning(riskFactors, decision)
    };
  }

  identifyInitialRiskIndicators(input) {
    const indicators = [];
    if (!input.buyerData) indicators.push('NO_BUYER_DATA');
    if (input.buyerData?.amount > 2000) indicators.push('HIGH_VALUE_TRANSACTION');
    if (input.buyerData?.accountCreatedAt) {
      const ageDays = (Date.now() - new Date(input.buyerData.accountCreatedAt)) / (1000 * 60 * 60 * 24);
      if (ageDays < 7) indicators.push('NEW_BUYER_ACCOUNT');
    }
    if (input.buyerData?.chargedBack) indicators.push('PRIOR_CHARGEBACK');
    return indicators;
  }

  analyzeEvidence(evidence) {
    const factors = [];

    evidence.forEach(e => {
      if (!e.success || !e.data) return;

      if (e.source === 'check_first_purchase_risk') {
        if (e.data.highRiskFirstPurchase) factors.push({ factor: 'HIGH_RISK_FIRST_PURCHASE', severity: 'CRITICAL', score: 35 });
        else if (e.data.isFirstPurchase && e.data.isHighValue) factors.push({ factor: 'HIGH_VALUE_FIRST_PURCHASE', severity: 'HIGH', score: 25 });
        if (e.data.isNewAccount) factors.push({ factor: 'NEW_ACCOUNT', severity: 'MEDIUM', score: 15 });
        if (e.data.profileCompleteness < 0.5) factors.push({ factor: 'INCOMPLETE_PROFILE', severity: 'MEDIUM', score: 10 });
      }

      if (e.source === 'check_chargeback_history') {
        if (e.data.serialChargeback) factors.push({ factor: 'SERIAL_CHARGEBACK', severity: 'CRITICAL', score: 40 });
        else if (e.data.highChargebackRate) factors.push({ factor: 'HIGH_CHARGEBACK_RATE', severity: 'HIGH', score: 30 });
        if (e.data.recentChargebackSpike) factors.push({ factor: 'RECENT_CHARGEBACK_SPIKE', severity: 'HIGH', score: 25 });
      }

      if (e.source === 'detect_multi_account_buyer') {
        if (e.data.multiAccountConfirmed) factors.push({ factor: 'MULTI_ACCOUNT_CONFIRMED', severity: 'CRITICAL', score: 40 });
        else if (e.data.multiAccountLikely) factors.push({ factor: 'MULTI_ACCOUNT_SUSPECTED', severity: 'HIGH', score: 25 });
        if (e.data.sharedDevice) factors.push({ factor: 'SHARED_DEVICE', severity: 'MEDIUM', score: 15 });
      }

      if (e.source === 'check_dispute_ratio') {
        if (e.data.extremeDisputeRatio) factors.push({ factor: 'EXTREME_DISPUTE_RATIO', severity: 'CRITICAL', score: 35 });
        else if (e.data.highDisputeRatio) factors.push({ factor: 'HIGH_DISPUTE_RATIO', severity: 'HIGH', score: 25 });
        if (e.data.escalating) factors.push({ factor: 'ESCALATING_DISPUTES', severity: 'HIGH', score: 20 });
      }

      if (e.source === 'check_buyer_velocity') {
        if (e.data.rapidPurchasing) factors.push({ factor: 'RAPID_PURCHASING', severity: 'CRITICAL', score: 30 });
        if (e.data.highHourlySpend) factors.push({ factor: 'HIGH_HOURLY_SPEND', severity: 'HIGH', score: 20 });
        if (e.data.hasDuplicates) factors.push({ factor: 'DUPLICATE_PURCHASES', severity: 'MEDIUM', score: 15 });
        if (e.data.highDailyVolume) factors.push({ factor: 'HIGH_DAILY_VOLUME', severity: 'MEDIUM', score: 15 });
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
          const prompt = registry.getPromptById('buyer-trust-decision');
          decisionContent = prompt?.content || '';
        } catch { /* fallback */ }
        const systemPrompt = decisionContent || 'You are the buyer trust authority. Return ONLY valid JSON: {"action":"APPROVE|FLAG|RESTRICT", "confidence":0.0-1.0, "reason":"..."}';
        const userPrompt = `Risk score: ${risk.score}/100, Critical: ${risk.criticalFactors}, High: ${risk.highFactors}\nFactors: ${factors.map(f => `${f.factor} (${f.severity}, score:${f.score})`).join(', ')}`;
        const result = await this.llmClient.complete(systemPrompt, userPrompt);
        if (result?.content) {
          const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (['APPROVE', 'FLAG', 'RESTRICT'].includes(parsed.action)) {
              return { ...parsed, llmEnhanced: true };
            }
          }
        }
      } catch (e) { /* fallback */ }
    }

    const thresholds = this.autonomyThresholds;
    if (risk.score >= (thresholds.AUTO_REJECT_MIN_RISK || 66) || risk.criticalFactors > 0) {
      return { action: 'RESTRICT', confidence: 0.90, reason: 'High risk buyer indicators — restricting account activity' };
    } else if (risk.score >= (thresholds.AUTO_APPROVE_MAX_RISK || 31)) {
      return { action: 'FLAG', confidence: 0.75, reason: 'Moderate buyer risk — flagging for additional verification' };
    }
    return { action: 'APPROVE', confidence: 0.85, reason: 'Low buyer risk — transaction approved' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## Buyer Trust Summary\n\n### Risk Factors:\n${desc || '- No significant risk factors'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`.trim();
  }

  async evaluateBuyer(sellerId, buyerData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, buyerData, ...buyerData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getBuyerTrustAgent() {
  if (!instance) instance = new BuyerTrustAgent();
  return instance;
}

export default BuyerTrustAgent;
