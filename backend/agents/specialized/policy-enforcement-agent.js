/**
 * Policy Enforcement Agent
 *
 * Monitors and enforces platform policies by detecting metrics gaming, search
 * manipulation, repeat offenders, cross-service violations, and compliance scoring.
 *
 * Decisions: CLEAR / WARN / RESTRICT
 * Safe default on error: WARN
 * Domain weight: 0.08
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getThresholdManager } from '../core/threshold-manager.js';

export class PolicyEnforcementAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Policy Enforcement Agent',
      role: 'POLICY_ENFORCEMENT',
      agentId: 'POLICY_ENFORCEMENT',
      capabilities: [
        'metrics_gaming_detection',
        'search_manipulation_detection',
        'repeat_offender_tracking',
        'cross_service_correlation',
        'compliance_scoring'
      ]
    });

    this.riskThresholds = {
      CLEAR: { max: 30 },
      WARN: { min: 31, max: 65 },
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

  registerTools() {
    // Tool 1: Detect metrics gaming — seller gaming performance metrics via fake orders and self-purchases
    this.registerTool('detect_metrics_gaming', 'Detect seller gaming performance metrics — fake orders, self-purchases', async (params) => {
      const { sellerId } = params;

      const transactions = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      const seller = db_ops.getById('sellers', 'seller_id', sellerId);
      const sellerData = seller?.data || {};

      // Self-purchase detection — buyer IP/address matches seller
      const sellerIP = sellerData.ipAddress || sellerData.registrationIP;
      const sellerAddress = sellerData.businessAddress || sellerData.address;
      const selfPurchases = transactions.filter(t =>
        (sellerIP && t.buyerIP === sellerIP) ||
        (sellerAddress && t.shippingAddress === sellerAddress)
      );
      const selfPurchaseRate = transactions.length > 0 ? selfPurchases.length / transactions.length : 0;

      // Fake order detection — orders immediately cancelled or never shipped
      const cancelledOrders = transactions.filter(t =>
        t.status === 'CANCELLED' || t.status === 'NEVER_SHIPPED'
      );
      const cancelRate = transactions.length > 0 ? cancelledOrders.length / transactions.length : 0;

      // Round-trip transactions — same amount bought and returned repeatedly
      const amounts = transactions.map(t => t.amount).filter(Boolean);
      const amountFreq = {};
      amounts.forEach(a => { amountFreq[a] = (amountFreq[a] || 0) + 1; });
      const repeatedAmounts = Object.entries(amountFreq).filter(([, count]) => count >= 5);
      const hasRoundTrip = repeatedAmounts.length > 0;

      // Review-for-order correlation — reviews appear suspiciously close to order
      const reviewOrders = transactions.filter(t => t.reviewData && t.status !== 'COMPLETED');
      const suspiciousReviewOrders = reviewOrders.length;

      const metricsGaming = selfPurchaseRate > 0.1 || (cancelRate > 0.3 && hasRoundTrip);

      let riskScore = 0;
      if (selfPurchaseRate > 0.1) riskScore += 30;
      if (selfPurchaseRate > 0.25) riskScore += 15;
      if (cancelRate > 0.3) riskScore += 20;
      if (hasRoundTrip) riskScore += 25;
      if (suspiciousReviewOrders >= 3) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          totalTransactions: transactions.length,
          selfPurchases: selfPurchases.length,
          selfPurchaseRate: Math.round(selfPurchaseRate * 100) / 100,
          cancelledOrders: cancelledOrders.length,
          cancelRate: Math.round(cancelRate * 100) / 100,
          hasRoundTrip,
          repeatedAmountPatterns: repeatedAmounts.length,
          suspiciousReviewOrders,
          metricsGaming,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 2: Detect search manipulation — keyword stuffing and review manipulation for search rank
    this.registerTool('detect_search_manipulation', 'Detect keyword stuffing and review manipulation for search rank', async (params) => {
      const { sellerId } = params;

      const listings = (db_ops.getAll('listings', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      // Keyword stuffing — excessively long titles or descriptions with repeated keywords
      const stuffedListings = listings.filter(l => {
        const title = (l.title || '').toLowerCase();
        const description = (l.description || '').toLowerCase();
        const titleWords = title.split(/\s+/);
        const descWords = description.split(/\s+/);

        // Title over 200 chars or repeated words >30%
        const titleWordFreq = {};
        titleWords.forEach(w => { if (w.length > 3) titleWordFreq[w] = (titleWordFreq[w] || 0) + 1; });
        const maxFreq = Math.max(0, ...Object.values(titleWordFreq));
        const titleStuffed = title.length > 200 || (titleWords.length > 5 && maxFreq / titleWords.length > 0.3);

        // Description keyword density too high
        const descWordFreq = {};
        descWords.forEach(w => { if (w.length > 3) descWordFreq[w] = (descWordFreq[w] || 0) + 1; });
        const topDescFreq = Math.max(0, ...Object.values(descWordFreq));
        const descStuffed = descWords.length > 20 && topDescFreq / descWords.length > 0.2;

        return titleStuffed || descStuffed;
      });

      const stuffedRatio = listings.length > 0 ? stuffedListings.length / listings.length : 0;

      // Hidden keyword detection — special characters or invisible text
      const hiddenKeywords = listings.filter(l => {
        const text = (l.title || '') + ' ' + (l.description || '');
        return /[\u200B\u200C\u200D\uFEFF]/.test(text) || /\{.*color:\s*white/i.test(text);
      });

      // Rapid listing updates — frequently editing titles/descriptions
      const recentUpdates = listings.filter(l => {
        const updates = l.updateCount || 0;
        const age = l.createdAt ? (Date.now() - new Date(l.createdAt)) / (1000 * 60 * 60 * 24) : 30;
        return age > 0 && updates / age > 3; // More than 3 updates per day
      });

      const hasKeywordStuffing = stuffedRatio > 0.3 && stuffedListings.length >= 2;
      const hasHiddenKeywords = hiddenKeywords.length > 0;
      const hasRapidUpdates = recentUpdates.length >= 3;

      let riskScore = 0;
      if (hasKeywordStuffing) riskScore += 30;
      if (hasHiddenKeywords) riskScore += 35;
      if (hasRapidUpdates) riskScore += 20;
      if (stuffedRatio > 0.5) riskScore += 10;

      return {
        success: true,
        data: {
          sellerId,
          totalListings: listings.length,
          stuffedListings: stuffedListings.length,
          stuffedRatio: Math.round(stuffedRatio * 100) / 100,
          hiddenKeywords: hiddenKeywords.length,
          rapidUpdateListings: recentUpdates.length,
          hasKeywordStuffing,
          hasHiddenKeywords,
          hasRapidUpdates,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 3: Check repeat offender — seller with multiple prior violations escalating
    this.registerTool('check_repeat_offender', 'Check seller with multiple prior violations and escalation pattern', async (params) => {
      const { sellerId } = params;

      const riskEvents = (db_ops.getAll('risk_events', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      const cases = (db_ops.getAll('cases', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      // Count violations by severity
      const violations = riskEvents.filter(e => e.riskScore >= 50);
      const criticalViolations = riskEvents.filter(e => e.riskScore >= 86);
      const highViolations = riskEvents.filter(e => e.riskScore >= 61 && e.riskScore < 86);

      // Check for escalation pattern — increasing severity over time
      const sortedViolations = violations
        .sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt));

      let escalating = false;
      if (sortedViolations.length >= 3) {
        const recentThird = sortedViolations.slice(-Math.ceil(sortedViolations.length / 3));
        const olderThird = sortedViolations.slice(0, Math.ceil(sortedViolations.length / 3));
        const recentAvg = recentThird.reduce((s, v) => s + (v.riskScore || 0), 0) / recentThird.length;
        const olderAvg = olderThird.reduce((s, v) => s + (v.riskScore || 0), 0) / olderThird.length;
        escalating = recentAvg > olderAvg * 1.2;
      }

      // Resolved cases that were confirmed fraud
      const confirmedFraud = cases.filter(c => c.status === 'RESOLVED' && c.resolution === 'FRAUD_CONFIRMED');
      const resolvedCases = cases.filter(c => c.status === 'RESOLVED');
      const fraudRate = resolvedCases.length > 0 ? confirmedFraud.length / resolvedCases.length : 0;

      const isRepeatOffender = violations.length >= 3;
      const isSerialOffender = violations.length >= 7;

      let riskScore = 0;
      if (isSerialOffender) riskScore += 35;
      else if (isRepeatOffender) riskScore += 20;
      if (escalating) riskScore += 25;
      if (criticalViolations.length >= 2) riskScore += 20;
      if (fraudRate > 0.5 && confirmedFraud.length >= 2) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          totalViolations: violations.length,
          criticalViolations: criticalViolations.length,
          highViolations: highViolations.length,
          escalating,
          totalCases: cases.length,
          confirmedFraud: confirmedFraud.length,
          fraudRate: Math.round(fraudRate * 100) / 100,
          isRepeatOffender,
          isSerialOffender,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 4: Check cross-service correlation — policy violations across multiple services
    this.registerTool('check_cross_service_correlation', 'Detect policy violations across multiple services', async (params) => {
      const { sellerId } = params;

      const riskEvents = (db_ops.getAll('risk_events', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId && e.riskScore >= 40);

      // Group violations by domain
      const domainViolations = {};
      riskEvents.forEach(e => {
        const domain = e.domain || 'unknown';
        if (!domainViolations[domain]) domainViolations[domain] = [];
        domainViolations[domain].push(e);
      });

      const affectedDomains = Object.keys(domainViolations);
      const multiDomain = affectedDomains.length >= 3;

      // Check for correlated timing — violations in different domains within 24h
      const now = Date.now();
      const recentEvents = riskEvents.filter(e =>
        (now - new Date(e.timestamp || e.createdAt)) < 24 * 60 * 60 * 1000
      );
      const recentDomains = [...new Set(recentEvents.map(e => e.domain))];
      const correlatedBurst = recentDomains.length >= 2 && recentEvents.length >= 3;

      // Aggregate risk across domains
      const domainScores = {};
      Object.entries(domainViolations).forEach(([domain, events]) => {
        domainScores[domain] = Math.max(...events.map(e => e.riskScore || 0));
      });

      const maxDomainScore = Math.max(0, ...Object.values(domainScores));
      const avgDomainScore = Object.values(domainScores).length > 0
        ? Object.values(domainScores).reduce((s, v) => s + v, 0) / Object.values(domainScores).length
        : 0;

      let riskScore = 0;
      if (multiDomain) riskScore += 30;
      if (correlatedBurst) riskScore += 25;
      if (maxDomainScore >= 80) riskScore += 20;
      if (avgDomainScore >= 60) riskScore += 15;
      if (affectedDomains.length >= 5) riskScore += 10;

      return {
        success: true,
        data: {
          sellerId,
          totalViolations: riskEvents.length,
          affectedDomains,
          domainCount: affectedDomains.length,
          multiDomain,
          correlatedBurst,
          recentDomainViolations: recentDomains.length,
          domainScores,
          maxDomainScore,
          avgDomainScore: Math.round(avgDomainScore),
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 5: Check seller compliance score — overall compliance score based on history
    this.registerTool('check_seller_compliance_score', 'Calculate overall compliance score based on seller history', async (params) => {
      const { sellerId } = params;

      const seller = db_ops.getById('sellers', 'seller_id', sellerId);
      const sellerData = seller?.data || {};

      const riskEvents = (db_ops.getAll('risk_events', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      const cases = (db_ops.getAll('cases', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      const transactions = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      // Start with perfect score, deduct for violations
      let complianceScore = 100;

      // Deduct for risk events
      const criticalEvents = riskEvents.filter(e => e.riskScore >= 86).length;
      const highEvents = riskEvents.filter(e => e.riskScore >= 61 && e.riskScore < 86).length;
      const mediumEvents = riskEvents.filter(e => e.riskScore >= 31 && e.riskScore < 61).length;
      complianceScore -= criticalEvents * 15;
      complianceScore -= highEvents * 8;
      complianceScore -= mediumEvents * 3;

      // Deduct for unresolved cases
      const openCases = cases.filter(c => c.status === 'OPEN' || c.status === 'IN_REVIEW').length;
      complianceScore -= openCases * 10;

      // Bonus for account age and consistent behavior
      const accountAge = sellerData.createdAt
        ? (Date.now() - new Date(sellerData.createdAt)) / (1000 * 60 * 60 * 24)
        : 0;
      if (accountAge > 365) complianceScore += 10;
      if (accountAge > 180 && riskEvents.length === 0) complianceScore += 15;

      // Transaction volume bonus (active good seller)
      if (transactions.length > 50 && criticalEvents === 0) complianceScore += 5;

      complianceScore = Math.max(0, Math.min(100, Math.round(complianceScore)));

      const lowCompliance = complianceScore < 40;
      const criticalCompliance = complianceScore < 20;

      let riskScore = 0;
      if (criticalCompliance) riskScore += 40;
      else if (lowCompliance) riskScore += 25;
      if (openCases >= 3) riskScore += 20;
      if (criticalEvents >= 2) riskScore += 20;
      if (complianceScore < 60) riskScore += 10;

      return {
        success: true,
        data: {
          sellerId,
          complianceScore,
          criticalEvents,
          highEvents,
          mediumEvents,
          openCases,
          accountAgeDays: Math.round(accountAge),
          transactionCount: transactions.length,
          lowCompliance,
          criticalCompliance,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Agentic tools
    this.registerTool('search_knowledge_base', 'Search knowledge base for similar policy violation cases', async (params) => {
      const { query, sellerId } = params;
      const results = this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve relevant policy enforcement patterns from long-term memory', async (params) => {
      const { context } = params;
      const memories = this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    const { sellerId, policyData } = input;
    this.addObservation(`Starting policy enforcement evaluation for seller: ${sellerId}`);

    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) {
      return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };
    }

    const riskIndicators = this.identifyInitialRiskIndicators(input);
    this.addHypothesis(
      `Policy enforcement assessment needed — ${riskIndicators.length} initial indicators`,
      CONFIDENCE.POSSIBLE
    );

    return {
      understanding: `Evaluating policy compliance for seller: ${sellerId}`,
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
      { type: 'detect_metrics_gaming', params: { sellerId: input.sellerId } },
      { type: 'detect_search_manipulation', params: { sellerId: input.sellerId } },
      { type: 'check_repeat_offender', params: { sellerId: input.sellerId } },
      { type: 'check_cross_service_correlation', params: { sellerId: input.sellerId } },
      { type: 'check_seller_compliance_score', params: { sellerId: input.sellerId } },
      { type: 'search_knowledge_base', params: { query: `policy violation ${input.sellerId || ''}`, sellerId: input.sellerId } },
      { type: 'retrieve_memory', params: { context: `policy enforcement ${input.sellerId || ''}` } }
    ];

    return {
      goal: 'Complete policy enforcement evaluation',
      actions,
      fallback: { type: 'default_warn', reason: 'incomplete_policy_evaluation' }
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
    const needsHumanReview = !isAutonomous || decision.action === 'WARN';

    if (context.input?.sellerId) {
      this.selfCorrection.logPrediction(
        `POL-${Date.now().toString(36).toUpperCase()}`,
        context.input.sellerId,
        decision.action,
        decision.confidence,
        this.generateReasoning(riskFactors, decision)
      );
    }

    this.knowledgeBase.addKnowledge('policy_enforcement', [{
      _id: `POL-${Date.now()}`,
      text: `Policy enforcement evaluation for seller ${context.input?.sellerId || 'unknown'}. Decision: ${decision.action}. Risk: ${overallRisk.score}. Factors: ${riskFactors.map(f => f.factor).join(', ')}`,
      category: 'policy_enforcement', sellerId: context.input?.sellerId, domain: 'policy_enforcement',
      outcome: decision.action === 'CLEAR' ? 'legitimate' : decision.action === 'RESTRICT' ? 'fraud' : 'pending',
      riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true,
      evaluationId: `POL-${Date.now().toString(36).toUpperCase()}`,
      summary: `Policy enforcement evaluation complete. ${riskFactors.length} risk factors. ${isAutonomous ? 'Autonomous.' : 'Needs review.'}`,
      evidence, riskFactors, overallRisk, decision,
      confidence: decision.confidence, isAutonomous, needsHumanReview,
      escalationReason: needsHumanReview ? `Risk score ${overallRisk.score} requires review` : null,
      selfCorrectionStats: this.selfCorrection.getAccuracy(),
      reasoning: this.generateReasoning(riskFactors, decision)
    };
  }

  identifyInitialRiskIndicators(input) {
    const indicators = [];
    if (input.policyData?.priorViolations > 0) indicators.push('PRIOR_VIOLATIONS');
    if (input.policyData?.openCases > 0) indicators.push('OPEN_CASES');
    if (input.policyData?.suspendedBefore) indicators.push('PREVIOUSLY_SUSPENDED');
    if (!input.policyData) indicators.push('NO_POLICY_DATA');
    return indicators;
  }

  analyzeEvidence(evidence) {
    const factors = [];

    evidence.forEach(e => {
      if (!e.success || !e.data) return;

      if (e.source === 'detect_metrics_gaming') {
        if (e.data.metricsGaming) factors.push({ factor: 'METRICS_GAMING_DETECTED', severity: 'CRITICAL', score: 40 });
        if (e.data.selfPurchaseRate > 0.1) factors.push({ factor: 'SELF_PURCHASE_PATTERN', severity: 'HIGH', score: 30 });
        if (e.data.hasRoundTrip) factors.push({ factor: 'ROUND_TRIP_TRANSACTIONS', severity: 'HIGH', score: 25 });
        if (e.data.cancelRate > 0.3) factors.push({ factor: 'HIGH_CANCEL_RATE', severity: 'MEDIUM', score: 15 });
      }

      if (e.source === 'detect_search_manipulation') {
        if (e.data.hasHiddenKeywords) factors.push({ factor: 'HIDDEN_KEYWORDS', severity: 'CRITICAL', score: 35 });
        if (e.data.hasKeywordStuffing) factors.push({ factor: 'KEYWORD_STUFFING', severity: 'HIGH', score: 25 });
        if (e.data.hasRapidUpdates) factors.push({ factor: 'RAPID_LISTING_UPDATES', severity: 'MEDIUM', score: 15 });
      }

      if (e.source === 'check_repeat_offender') {
        if (e.data.isSerialOffender) factors.push({ factor: 'SERIAL_OFFENDER', severity: 'CRITICAL', score: 40 });
        else if (e.data.isRepeatOffender) factors.push({ factor: 'REPEAT_OFFENDER', severity: 'HIGH', score: 25 });
        if (e.data.escalating) factors.push({ factor: 'ESCALATING_VIOLATIONS', severity: 'HIGH', score: 25 });
        if (e.data.fraudRate > 0.5) factors.push({ factor: 'HIGH_FRAUD_RATE', severity: 'CRITICAL', score: 30 });
      }

      if (e.source === 'check_cross_service_correlation') {
        if (e.data.multiDomain) factors.push({ factor: 'MULTI_DOMAIN_VIOLATIONS', severity: 'CRITICAL', score: 35 });
        if (e.data.correlatedBurst) factors.push({ factor: 'CORRELATED_VIOLATION_BURST', severity: 'HIGH', score: 25 });
        if (e.data.maxDomainScore >= 80) factors.push({ factor: 'CRITICAL_DOMAIN_SCORE', severity: 'HIGH', score: 20 });
      }

      if (e.source === 'check_seller_compliance_score') {
        if (e.data.criticalCompliance) factors.push({ factor: 'CRITICAL_COMPLIANCE_SCORE', severity: 'CRITICAL', score: 40 });
        else if (e.data.lowCompliance) factors.push({ factor: 'LOW_COMPLIANCE_SCORE', severity: 'HIGH', score: 25 });
        if (e.data.openCases >= 3) factors.push({ factor: 'MANY_OPEN_CASES', severity: 'MEDIUM', score: 15 });
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
          const prompt = registry.getPromptById('policy-enforcement-decision');
          decisionContent = prompt?.content || '';
        } catch { /* fallback */ }
        const systemPrompt = decisionContent || 'You are the policy enforcement authority. Return ONLY valid JSON: {"action":"CLEAR|WARN|RESTRICT", "confidence":0.0-1.0, "reason":"..."}';
        const userPrompt = `Risk score: ${risk.score}/100, Critical: ${risk.criticalFactors}, High: ${risk.highFactors}\nFactors: ${factors.map(f => `${f.factor} (${f.severity}, score:${f.score})`).join(', ')}`;
        const result = await this.llmClient.complete(systemPrompt, userPrompt);
        if (result?.content) {
          const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (['CLEAR', 'WARN', 'RESTRICT'].includes(parsed.action)) {
              return { ...parsed, llmEnhanced: true };
            }
          }
        }
      } catch (e) { /* fallback */ }
    }

    const thresholds = this.autonomyThresholds;
    if (risk.score >= (thresholds.AUTO_REJECT_MIN_RISK || 66) || risk.criticalFactors > 0) {
      return { action: 'RESTRICT', confidence: 0.90, reason: 'Severe policy violations detected — restricting seller activity' };
    } else if (risk.score >= (thresholds.AUTO_APPROVE_MAX_RISK || 31)) {
      return { action: 'WARN', confidence: 0.75, reason: 'Moderate policy concerns — issuing warning' };
    }
    return { action: 'CLEAR', confidence: 0.85, reason: 'No significant policy violations — seller in compliance' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## Policy Enforcement Summary\n\n### Risk Factors:\n${desc || '- No significant risk factors'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`.trim();
  }

  async evaluatePolicy(sellerId, policyData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, policyData, ...policyData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getPolicyEnforcementAgent() {
  if (!instance) instance = new PolicyEnforcementAgent();
  return instance;
}

export default PolicyEnforcementAgent;
