/**
 * Review Integrity Agent
 *
 * Detects fraudulent review activity by analyzing incentivized reviews, feedback
 * manipulation, review bombing, paid reviews, and timing anomalies.
 *
 * Decisions: APPROVE / FLAG / REMOVE
 * Safe default on error: FLAG
 * Domain weight: 0.07
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getThresholdManager } from '../core/threshold-manager.js';

export class ReviewIntegrityAgent extends BaseAgent {
  constructor() {
    super({
      agentId: 'REVIEW_INTEGRITY',
      name: 'Review Integrity Agent',
      role: 'REVIEW_INTEGRITY',
      capabilities: [
        'incentivized_review_detection',
        'feedback_manipulation_analysis',
        'review_bombing_detection',
        'paid_review_detection',
        'timing_anomaly_analysis'
      ]
    });

    this.riskThresholds = {
      APPROVE: { max: 30 },
      FLAG: { min: 31, max: 65 },
      REMOVE: { min: 66 }
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
    // Tool 1: Detect incentivized reviews — review seeding from new accounts with timing clusters
    this.registerTool('detect_incentivized_reviews', 'Detect review seeding patterns — timing clusters from new accounts', async (params) => {
      const { sellerId } = params;

      const allReviews = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId && e.reviewData);

      if (allReviews.length === 0) {
        return {
          success: true,
          data: {
            sellerId,
            incentivizedReviews: false,
            reviewCount: 0,
            riskScore: 0,
            riskLevel: 'LOW',
            reason: 'No reviews found for seller'
          }
        };
      }

      // Check for clusters of reviews from new accounts
      const now = Date.now();
      const recentReviews = allReviews.filter(r =>
        (now - new Date(r.reviewData?.timestamp || r.createdAt)) < 7 * 24 * 60 * 60 * 1000
      );

      const newAccountReviews = recentReviews.filter(r => {
        const accountAge = r.reviewData?.reviewerAccountAgeDays || 365;
        return accountAge < 30;
      });

      const newAccountRatio = recentReviews.length > 0 ? newAccountReviews.length / recentReviews.length : 0;

      // Check timing clusters — multiple reviews within 1-hour windows
      const timestamps = recentReviews.map(r => new Date(r.reviewData?.timestamp || r.createdAt).getTime()).sort();
      let clusterCount = 0;
      for (let i = 1; i < timestamps.length; i++) {
        if (timestamps[i] - timestamps[i - 1] < 60 * 60 * 1000) clusterCount++;
      }

      const hasTimingClusters = clusterCount >= 3;
      const highNewAccountRatio = newAccountRatio > 0.6;
      const incentivizedLikely = hasTimingClusters && highNewAccountRatio;

      let riskScore = 0;
      if (highNewAccountRatio) riskScore += 25;
      if (hasTimingClusters) riskScore += 30;
      if (incentivizedLikely) riskScore += 15;
      if (newAccountReviews.length > 10) riskScore += 10;

      return {
        success: true,
        data: {
          sellerId,
          totalReviews: allReviews.length,
          recentReviews: recentReviews.length,
          newAccountReviews: newAccountReviews.length,
          newAccountRatio: Math.round(newAccountRatio * 100) / 100,
          timingClusters: clusterCount,
          hasTimingClusters,
          highNewAccountRatio,
          incentivizedLikely,
          riskScore: Math.min(riskScore, 80),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 2: Detect feedback manipulation — coordinated positive/negative review patterns
    this.registerTool('detect_feedback_manipulation', 'Detect coordinated positive/negative review patterns', async (params) => {
      const { sellerId } = params;

      const allReviews = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId && e.reviewData);

      const positiveReviews = allReviews.filter(r => (r.reviewData?.rating || 3) >= 4);
      const negativeReviews = allReviews.filter(r => (r.reviewData?.rating || 3) <= 2);

      const positiveRatio = allReviews.length > 0 ? positiveReviews.length / allReviews.length : 0;
      const negativeRatio = allReviews.length > 0 ? negativeReviews.length / allReviews.length : 0;

      // Check for suspicious positive skew (>95% 5-star with >20 reviews)
      const suspiciousPositiveSkew = positiveRatio > 0.95 && allReviews.length > 20;

      // Check for coordinated negative campaign (>60% 1-star in last 48h)
      const now = Date.now();
      const last48h = allReviews.filter(r =>
        (now - new Date(r.reviewData?.timestamp || r.createdAt)) < 48 * 60 * 60 * 1000
      );
      const recentNegative = last48h.filter(r => (r.reviewData?.rating || 3) <= 2);
      const recentNegativeRatio = last48h.length > 0 ? recentNegative.length / last48h.length : 0;
      const coordinatedNegative = recentNegativeRatio > 0.6 && last48h.length >= 5;

      // Check for reviewer overlap — same reviewers across sellers
      const reviewerIds = allReviews.map(r => r.reviewData?.reviewerId).filter(Boolean);
      const uniqueReviewers = [...new Set(reviewerIds)];
      const lowReviewerDiversity = uniqueReviewers.length < allReviews.length * 0.7 && allReviews.length > 10;

      let riskScore = 0;
      if (suspiciousPositiveSkew) riskScore += 30;
      if (coordinatedNegative) riskScore += 35;
      if (lowReviewerDiversity) riskScore += 20;
      if (recentNegativeRatio > 0.4 && last48h.length >= 3) riskScore += 10;

      return {
        success: true,
        data: {
          sellerId,
          totalReviews: allReviews.length,
          positiveRatio: Math.round(positiveRatio * 100) / 100,
          negativeRatio: Math.round(negativeRatio * 100) / 100,
          suspiciousPositiveSkew,
          coordinatedNegative,
          recentNegativeRatio: Math.round(recentNegativeRatio * 100) / 100,
          uniqueReviewers: uniqueReviewers.length,
          lowReviewerDiversity,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 3: Detect review bombing — sudden spike of negative reviews from connected accounts
    this.registerTool('detect_review_bombing', 'Detect sudden spike of negative reviews on a seller from connected accounts', async (params) => {
      const { sellerId } = params;

      const allReviews = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId && e.reviewData);

      const now = Date.now();
      const windows = {
        '24h': allReviews.filter(r => (now - new Date(r.reviewData?.timestamp || r.createdAt)) < 24 * 60 * 60 * 1000),
        '7d': allReviews.filter(r => (now - new Date(r.reviewData?.timestamp || r.createdAt)) < 7 * 24 * 60 * 60 * 1000),
        '30d': allReviews.filter(r => (now - new Date(r.reviewData?.timestamp || r.createdAt)) < 30 * 24 * 60 * 60 * 1000)
      };

      const negativeIn24h = windows['24h'].filter(r => (r.reviewData?.rating || 3) <= 2).length;
      const avgDailyNeg30d = windows['30d'].length > 0
        ? windows['30d'].filter(r => (r.reviewData?.rating || 3) <= 2).length / 30
        : 0;

      // Spike detection: 5x average daily negatives in 24h
      const isSpike = avgDailyNeg30d > 0 && negativeIn24h > avgDailyNeg30d * 5;
      const absoluteSpike = negativeIn24h >= 10;

      // Check for connected accounts — shared IPs among reviewers
      const reviewerIPs = windows['24h'].map(r => r.reviewData?.reviewerIP).filter(Boolean);
      const uniqueIPs = [...new Set(reviewerIPs)];
      const ipOverlap = reviewerIPs.length > 0 && uniqueIPs.length < reviewerIPs.length * 0.5;

      // Check for similar review text patterns
      const reviewTexts = windows['24h'].map(r => r.reviewData?.text || '').filter(t => t.length > 10);
      let similarTextCount = 0;
      for (let i = 0; i < reviewTexts.length; i++) {
        for (let j = i + 1; j < reviewTexts.length; j++) {
          const words1 = new Set(reviewTexts[i].toLowerCase().split(/\s+/));
          const words2 = new Set(reviewTexts[j].toLowerCase().split(/\s+/));
          const intersection = [...words1].filter(w => words2.has(w));
          if (intersection.length / Math.max(words1.size, words2.size) > 0.7) similarTextCount++;
        }
      }

      const hasSimilarTexts = similarTextCount >= 3;
      const reviewBombingDetected = (isSpike || absoluteSpike) && (ipOverlap || hasSimilarTexts);

      let riskScore = 0;
      if (isSpike) riskScore += 30;
      if (absoluteSpike) riskScore += 20;
      if (ipOverlap) riskScore += 25;
      if (hasSimilarTexts) riskScore += 20;

      return {
        success: true,
        data: {
          sellerId,
          negativeIn24h,
          avgDailyNeg30d: Math.round(avgDailyNeg30d * 100) / 100,
          isSpike,
          absoluteSpike,
          ipOverlap,
          hasSimilarTexts,
          reviewBombingDetected,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 4: Detect paid reviews — generic language, identical phrases, reviewer overlap
    this.registerTool('detect_paid_reviews', 'Detect paid reviews via generic language, identical phrases, reviewer overlap', async (params) => {
      const { sellerId } = params;

      const allReviews = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId && e.reviewData);

      // Generic language detection — short reviews with generic praise
      const genericPhrases = ['great product', 'highly recommend', 'amazing quality', 'fast shipping', 'love it', 'perfect', 'excellent', 'best ever', 'five stars', '5 stars'];
      const genericReviews = allReviews.filter(r => {
        const text = (r.reviewData?.text || '').toLowerCase();
        return text.length < 100 && genericPhrases.some(p => text.includes(p));
      });

      const genericRatio = allReviews.length > 0 ? genericReviews.length / allReviews.length : 0;

      // Identical phrase detection
      const reviewTexts = allReviews.map(r => (r.reviewData?.text || '').toLowerCase().trim()).filter(t => t.length > 0);
      const textFrequency = {};
      reviewTexts.forEach(t => { textFrequency[t] = (textFrequency[t] || 0) + 1; });
      const duplicateTexts = Object.entries(textFrequency).filter(([, count]) => count > 1);
      const hasDuplicates = duplicateTexts.length > 0;
      const duplicateCount = duplicateTexts.reduce((sum, [, count]) => sum + count, 0);

      // Reviewer overlap with other sellers
      const reviewerIds = allReviews.map(r => r.reviewData?.reviewerId).filter(Boolean);
      const allOtherReviews = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId !== sellerId && e.reviewData);
      const otherReviewerIds = new Set(allOtherReviews.map(r => r.reviewData?.reviewerId).filter(Boolean));
      const sharedReviewers = reviewerIds.filter(id => otherReviewerIds.has(id));
      const sharedReviewerRatio = reviewerIds.length > 0 ? [...new Set(sharedReviewers)].length / [...new Set(reviewerIds)].length : 0;

      const highGenericRatio = genericRatio > 0.5 && allReviews.length > 5;
      const suspiciousOverlap = sharedReviewerRatio > 0.4 && reviewerIds.length > 5;
      const paidReviewsLikely = (highGenericRatio && hasDuplicates) || (highGenericRatio && suspiciousOverlap);

      let riskScore = 0;
      if (highGenericRatio) riskScore += 25;
      if (hasDuplicates) riskScore += 30;
      if (suspiciousOverlap) riskScore += 25;
      if (duplicateCount > 5) riskScore += 10;

      return {
        success: true,
        data: {
          sellerId,
          totalReviews: allReviews.length,
          genericReviews: genericReviews.length,
          genericRatio: Math.round(genericRatio * 100) / 100,
          duplicateTextGroups: duplicateTexts.length,
          duplicateCount,
          sharedReviewerRatio: Math.round(sharedReviewerRatio * 100) / 100,
          highGenericRatio,
          hasDuplicates,
          suspiciousOverlap,
          paidReviewsLikely,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 5: Check review timing — abnormal timing patterns, reviews posted within minutes of purchase
    this.registerTool('check_review_timing', 'Detect abnormal timing patterns — reviews posted within minutes of purchase', async (params) => {
      const { sellerId } = params;

      const allReviews = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId && e.reviewData);

      // Reviews posted too quickly after purchase
      const quickReviews = allReviews.filter(r => {
        const purchaseTime = new Date(r.createdAt).getTime();
        const reviewTime = new Date(r.reviewData?.timestamp || r.createdAt).getTime();
        const diffMinutes = (reviewTime - purchaseTime) / (1000 * 60);
        return diffMinutes >= 0 && diffMinutes < 30;
      });

      const quickReviewRatio = allReviews.length > 0 ? quickReviews.length / allReviews.length : 0;

      // Off-hours reviews (2-5 AM local time)
      const offHoursReviews = allReviews.filter(r => {
        const hour = new Date(r.reviewData?.timestamp || r.createdAt).getHours();
        return hour >= 2 && hour <= 5;
      });

      const offHoursRatio = allReviews.length > 0 ? offHoursReviews.length / allReviews.length : 0;

      // Batch timing — multiple reviews submitted at exact same minute
      const minuteBuckets = {};
      allReviews.forEach(r => {
        const ts = new Date(r.reviewData?.timestamp || r.createdAt);
        const key = `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}-${ts.getHours()}-${ts.getMinutes()}`;
        minuteBuckets[key] = (minuteBuckets[key] || 0) + 1;
      });
      const batchSubmissions = Object.values(minuteBuckets).filter(c => c >= 3).length;

      const hasQuickReviews = quickReviewRatio > 0.3 && quickReviews.length >= 3;
      const hasOffHoursPattern = offHoursRatio > 0.4 && offHoursReviews.length >= 5;
      const hasBatchSubmissions = batchSubmissions >= 2;

      let riskScore = 0;
      if (hasQuickReviews) riskScore += 30;
      if (hasOffHoursPattern) riskScore += 20;
      if (hasBatchSubmissions) riskScore += 25;
      if (quickReviewRatio > 0.5) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          totalReviews: allReviews.length,
          quickReviews: quickReviews.length,
          quickReviewRatio: Math.round(quickReviewRatio * 100) / 100,
          offHoursReviews: offHoursReviews.length,
          offHoursRatio: Math.round(offHoursRatio * 100) / 100,
          batchSubmissions,
          hasQuickReviews,
          hasOffHoursPattern,
          hasBatchSubmissions,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Agentic tools
    this.registerTool('search_knowledge_base', 'Search knowledge base for similar review fraud cases', async (params) => {
      const { query, sellerId } = params;
      const results = await this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve relevant review fraud patterns from long-term memory', async (params) => {
      const { context } = params;
      const memories = await this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    const { sellerId, reviewData } = input;
    this.addObservation(`Starting review integrity evaluation for seller: ${sellerId}`);

    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) {
      return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };
    }

    const riskIndicators = this.identifyInitialRiskIndicators(input);
    this.addHypothesis(
      `Review integrity assessment needed — ${riskIndicators.length} initial indicators`,
      CONFIDENCE.POSSIBLE
    );

    return {
      understanding: `Evaluating review integrity for seller: ${sellerId}`,
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
      { type: 'detect_incentivized_reviews', params: { sellerId: input.sellerId } },
      { type: 'detect_feedback_manipulation', params: { sellerId: input.sellerId } },
      { type: 'detect_review_bombing', params: { sellerId: input.sellerId } },
      { type: 'detect_paid_reviews', params: { sellerId: input.sellerId } },
      { type: 'check_review_timing', params: { sellerId: input.sellerId } },
      { type: 'search_knowledge_base', params: { query: `review fraud ${input.sellerId || ''}`, sellerId: input.sellerId } },
      { type: 'retrieve_memory', params: { context: `review integrity ${input.sellerId || ''}` } }
    ];

    return {
      goal: 'Complete review integrity evaluation',
      actions,
      fallback: { type: 'default_flag', reason: 'incomplete_review_evaluation' }
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
        `REV-${Date.now().toString(36).toUpperCase()}`,
        context.input.sellerId,
        decision.action,
        decision.confidence,
        this.generateReasoning(riskFactors, decision)
      );
    }

    this.knowledgeBase.addKnowledge('review_integrity', [{
      _id: `REV-${Date.now()}`,
      text: `Review integrity evaluation for seller ${context.input?.sellerId || 'unknown'}. Decision: ${decision.action}. Risk: ${overallRisk.score}. Factors: ${riskFactors.map(f => f.factor).join(', ')}`,
      category: 'review_integrity', sellerId: context.input?.sellerId, domain: 'review_integrity',
      outcome: decision.action === 'APPROVE' ? 'legitimate' : decision.action === 'REMOVE' ? 'fraud' : 'pending',
      riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true,
      evaluationId: `REV-${Date.now().toString(36).toUpperCase()}`,
      summary: `Review integrity evaluation complete. ${riskFactors.length} risk factors. ${isAutonomous ? 'Autonomous.' : 'Needs review.'}`,
      evidence, riskFactors, overallRisk, decision,
      confidence: decision.confidence, isAutonomous, needsHumanReview,
      escalationReason: needsHumanReview ? `Risk score ${overallRisk.score} requires review` : null,
      selfCorrectionStats: this.selfCorrection.getAccuracy(),
      reasoning: this.generateReasoning(riskFactors, decision)
    };
  }

  identifyInitialRiskIndicators(input) {
    const indicators = [];
    if (input.reviewData?.bulkSubmission) indicators.push('BULK_REVIEW_SUBMISSION');
    if (input.reviewData?.newAccountReviewer) indicators.push('NEW_ACCOUNT_REVIEWER');
    if (input.reviewData?.ratingSpike) indicators.push('RATING_SPIKE_DETECTED');
    if (!input.reviewData) indicators.push('NO_REVIEW_DATA');
    return indicators;
  }

  analyzeEvidence(evidence) {
    const factors = [];

    evidence.forEach(e => {
      if (!e.success || !e.data) return;

      if (e.source === 'detect_incentivized_reviews') {
        if (e.data.incentivizedLikely) factors.push({ factor: 'INCENTIVIZED_REVIEWS', severity: 'CRITICAL', score: 40 });
        else if (e.data.hasTimingClusters) factors.push({ factor: 'REVIEW_TIMING_CLUSTERS', severity: 'HIGH', score: 25 });
        if (e.data.highNewAccountRatio) factors.push({ factor: 'HIGH_NEW_ACCOUNT_RATIO', severity: 'MEDIUM', score: 20 });
      }

      if (e.source === 'detect_feedback_manipulation') {
        if (e.data.coordinatedNegative) factors.push({ factor: 'COORDINATED_NEGATIVE_CAMPAIGN', severity: 'CRITICAL', score: 35 });
        if (e.data.suspiciousPositiveSkew) factors.push({ factor: 'SUSPICIOUS_POSITIVE_SKEW', severity: 'HIGH', score: 25 });
        if (e.data.lowReviewerDiversity) factors.push({ factor: 'LOW_REVIEWER_DIVERSITY', severity: 'MEDIUM', score: 15 });
      }

      if (e.source === 'detect_review_bombing') {
        if (e.data.reviewBombingDetected) factors.push({ factor: 'REVIEW_BOMBING', severity: 'CRITICAL', score: 40 });
        else if (e.data.isSpike) factors.push({ factor: 'NEGATIVE_REVIEW_SPIKE', severity: 'HIGH', score: 25 });
        if (e.data.ipOverlap) factors.push({ factor: 'REVIEWER_IP_OVERLAP', severity: 'HIGH', score: 20 });
      }

      if (e.source === 'detect_paid_reviews') {
        if (e.data.paidReviewsLikely) factors.push({ factor: 'PAID_REVIEWS_DETECTED', severity: 'CRITICAL', score: 40 });
        if (e.data.hasDuplicates) factors.push({ factor: 'DUPLICATE_REVIEW_TEXT', severity: 'HIGH', score: 25 });
        if (e.data.suspiciousOverlap) factors.push({ factor: 'SUSPICIOUS_REVIEWER_OVERLAP', severity: 'MEDIUM', score: 20 });
      }

      if (e.source === 'check_review_timing') {
        if (e.data.hasQuickReviews) factors.push({ factor: 'INSTANT_REVIEWS', severity: 'HIGH', score: 25 });
        if (e.data.hasBatchSubmissions) factors.push({ factor: 'BATCH_REVIEW_SUBMISSIONS', severity: 'HIGH', score: 25 });
        if (e.data.hasOffHoursPattern) factors.push({ factor: 'OFF_HOURS_REVIEW_PATTERN', severity: 'MEDIUM', score: 15 });
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
          const prompt = registry.getPromptById('review-integrity-decision');
          decisionContent = prompt?.content || '';
        } catch { /* fallback */ }
        const systemPrompt = decisionContent || 'You are the review integrity authority. Return ONLY valid JSON: {"action":"APPROVE|FLAG|REMOVE", "confidence":0.0-1.0, "reason":"..."}';
        const userPrompt = `Risk score: ${risk.score}/100, Critical: ${risk.criticalFactors}, High: ${risk.highFactors}\nFactors: ${factors.map(f => `${f.factor} (${f.severity}, score:${f.score})`).join(', ')}`;
        const result = await this.llmClient.complete(systemPrompt, userPrompt);
        if (result?.content) {
          const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (['APPROVE', 'FLAG', 'REMOVE'].includes(parsed.action)) {
              return { ...parsed, llmEnhanced: true };
            }
          }
        }
      } catch (e) { /* fallback */ }
    }

    const thresholds = this.autonomyThresholds;
    if (risk.score >= (thresholds.AUTO_REJECT_MIN_RISK || 66) || risk.criticalFactors > 0) {
      return { action: 'REMOVE', confidence: 0.90, reason: 'High risk review manipulation detected — removing fraudulent reviews' };
    } else if (risk.score >= (thresholds.AUTO_APPROVE_MAX_RISK || 31)) {
      return { action: 'FLAG', confidence: 0.75, reason: 'Moderate review integrity risk — flagging for manual review' };
    }
    return { action: 'APPROVE', confidence: 0.85, reason: 'Low review integrity risk — reviews appear legitimate' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## Review Integrity Summary\n\n### Risk Factors:\n${desc || '- No significant risk factors'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`.trim();
  }

  async evaluateReview(sellerId, reviewData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, reviewData, ...reviewData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getReviewIntegrityAgent() {
  if (!instance) instance = new ReviewIntegrityAgent();
  return instance;
}

export default ReviewIntegrityAgent;
