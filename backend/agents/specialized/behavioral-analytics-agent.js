/**
 * Behavioral Analytics Agent
 *
 * Analyzes user behavior patterns to detect bot activity, off-hours anomalies,
 * browsing ratio deviations, session anomalies, and device reputation signals.
 *
 * Decisions: NORMAL / FLAG / CHALLENGE
 * Safe default on error: FLAG
 * Domain weight: 0.08
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getThresholdManager } from '../core/threshold-manager.js';

export class BehavioralAnalyticsAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Behavioral Analytics Agent',
      role: 'BEHAVIORAL_ANALYTICS',
      agentId: 'BEHAVIORAL_ANALYTICS',
      capabilities: [
        'bot_detection',
        'off_hours_monitoring',
        'browsing_analysis',
        'session_anomaly_detection',
        'device_reputation'
      ]
    });

    this.riskThresholds = {
      NORMAL: { max: 30 },
      FLAG: { min: 31, max: 65 },
      CHALLENGE: { min: 66 }
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
    // Tool 1: Detect bot behavior — behavioral biometrics analysis
    this.registerTool('detect_bot_behavior', 'Analyze behavioral biometrics — click patterns, typing speed, mouse movements', async (params) => {
      const { sellerId, behaviorData } = params;

      const events = (db_ops.getAll('ato_events', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      const sessions = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      // Analyze click patterns — too regular intervals indicate bot
      const clickIntervals = behaviorData?.clickIntervals || [];
      const avgInterval = clickIntervals.length > 0
        ? clickIntervals.reduce((s, v) => s + v, 0) / clickIntervals.length
        : null;
      const intervalVariance = clickIntervals.length > 1
        ? clickIntervals.reduce((s, v) => s + Math.pow(v - avgInterval, 2), 0) / clickIntervals.length
        : null;
      const tooRegular = intervalVariance !== null && intervalVariance < 50;

      // Typing speed analysis — inhuman speed or zero variance
      const typingSpeed = behaviorData?.typingSpeedWPM || null;
      const inhumanTyping = typingSpeed !== null && (typingSpeed > 200 || typingSpeed === 0);

      // Mouse movement analysis — no mouse movement or perfectly linear paths
      const mouseEvents = behaviorData?.mouseMovements || 0;
      const noMouseMovement = mouseEvents === 0 && sessions.length > 3;
      const linearPaths = behaviorData?.linearMousePaths || false;

      // Event frequency — too many actions per minute
      const actionsPerMinute = behaviorData?.actionsPerMinute || 0;
      const highActionRate = actionsPerMinute > 60;

      const botIndicators = [tooRegular, inhumanTyping, noMouseMovement, linearPaths, highActionRate].filter(Boolean).length;
      const botLikely = botIndicators >= 3;

      let riskScore = 0;
      if (tooRegular) riskScore += 20;
      if (inhumanTyping) riskScore += 25;
      if (noMouseMovement) riskScore += 20;
      if (linearPaths) riskScore += 15;
      if (highActionRate) riskScore += 20;

      return {
        success: true,
        data: {
          sellerId,
          tooRegular,
          inhumanTyping,
          typingSpeed,
          noMouseMovement,
          linearPaths,
          highActionRate,
          actionsPerMinute,
          botIndicators,
          botLikely,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 2: Check off-hours activity — unusual time patterns and bulk operations at 2-5 AM
    this.registerTool('check_off_hours_activity', 'Detect unusual time patterns — bulk operations at 2-5AM', async (params) => {
      const { sellerId } = params;

      const allEvents = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      const atoEvents = (db_ops.getAll('ato_events', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      const combinedEvents = [...allEvents, ...atoEvents];

      // Count events by hour
      const hourCounts = new Array(24).fill(0);
      combinedEvents.forEach(e => {
        const hour = new Date(e.timestamp || e.createdAt).getHours();
        hourCounts[hour]++;
      });

      // Off-hours: 2-5 AM
      const offHoursCount = hourCounts.slice(2, 6).reduce((s, v) => s + v, 0);
      const totalEvents = combinedEvents.length;
      const offHoursRatio = totalEvents > 0 ? offHoursCount / totalEvents : 0;

      // Bulk operations during off-hours — more than 10 events in a single off-hour
      const offHoursBulk = hourCounts.slice(2, 6).some(c => c >= 10);

      // Check for activity pattern shift — historically daytime, suddenly nighttime
      const now = Date.now();
      const recentEvents = combinedEvents.filter(e =>
        (now - new Date(e.timestamp || e.createdAt)) < 7 * 24 * 60 * 60 * 1000
      );
      const olderEvents = combinedEvents.filter(e =>
        (now - new Date(e.timestamp || e.createdAt)) >= 7 * 24 * 60 * 60 * 1000
      );

      const recentOffHours = recentEvents.filter(e => {
        const h = new Date(e.timestamp || e.createdAt).getHours();
        return h >= 2 && h <= 5;
      }).length;

      const olderOffHours = olderEvents.filter(e => {
        const h = new Date(e.timestamp || e.createdAt).getHours();
        return h >= 2 && h <= 5;
      }).length;

      const recentOffHoursRatio = recentEvents.length > 0 ? recentOffHours / recentEvents.length : 0;
      const olderOffHoursRatio = olderEvents.length > 0 ? olderOffHours / olderEvents.length : 0;
      const patternShift = recentOffHoursRatio > 0.3 && olderOffHoursRatio < 0.1 && recentEvents.length >= 5;

      let riskScore = 0;
      if (offHoursRatio > 0.4) riskScore += 25;
      else if (offHoursRatio > 0.2) riskScore += 10;
      if (offHoursBulk) riskScore += 30;
      if (patternShift) riskScore += 25;

      return {
        success: true,
        data: {
          sellerId,
          totalEvents,
          offHoursCount,
          offHoursRatio: Math.round(offHoursRatio * 100) / 100,
          offHoursBulk,
          patternShift,
          hourDistribution: hourCounts,
          riskScore: Math.min(riskScore, 80),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 3: Check browsing-to-purchase ratio anomaly
    this.registerTool('check_browsing_ratio', 'Detect browsing-to-purchase ratio anomaly', async (params) => {
      const { sellerId, behaviorData } = params;

      const transactions = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      const browsingEvents = behaviorData?.browsingEvents || 0;
      const purchaseCount = transactions.length;

      // Normal ratio is roughly 20-50 browses per purchase
      const browsingRatio = purchaseCount > 0 ? browsingEvents / purchaseCount : browsingEvents;

      // Too low: buying without browsing (automated purchases)
      const tooLowBrowsing = browsingRatio < 2 && purchaseCount >= 3;
      // Too high: excessive browsing without purchase (scraping or reconnaissance)
      const tooHighBrowsing = browsingRatio > 200 && browsingEvents > 100;

      // Check for zero-browse purchases — direct URL access to purchase
      const zeroBrowsePurchases = behaviorData?.zeroBrowsePurchases || 0;
      const zeroBrowseRatio = purchaseCount > 0 ? zeroBrowsePurchases / purchaseCount : 0;
      const highZeroBrowse = zeroBrowseRatio > 0.5 && purchaseCount >= 5;

      let riskScore = 0;
      if (tooLowBrowsing) riskScore += 30;
      if (tooHighBrowsing) riskScore += 25;
      if (highZeroBrowse) riskScore += 25;
      if (browsingRatio < 1 && purchaseCount > 5) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          browsingEvents,
          purchaseCount,
          browsingRatio: Math.round(browsingRatio * 100) / 100,
          tooLowBrowsing,
          tooHighBrowsing,
          zeroBrowsePurchases,
          zeroBrowseRatio: Math.round(zeroBrowseRatio * 100) / 100,
          highZeroBrowse,
          riskScore: Math.min(riskScore, 80),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 4: Compute session anomaly — session duration, page sequence, interaction patterns
    this.registerTool('compute_session_anomaly', 'Analyze session duration, page sequence, and interaction patterns', async (params) => {
      const { sellerId, behaviorData } = params;

      const sessions = behaviorData?.sessions || [];
      const transactions = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      // Session duration analysis
      const durations = sessions.map(s => s.duration || 0).filter(d => d > 0);
      const avgDuration = durations.length > 0 ? durations.reduce((s, v) => s + v, 0) / durations.length : 0;
      const shortSessions = durations.filter(d => d < 5).length; // < 5 seconds
      const veryLongSessions = durations.filter(d => d > 7200).length; // > 2 hours

      const shortSessionRatio = durations.length > 0 ? shortSessions / durations.length : 0;
      const suspiciousShort = shortSessionRatio > 0.5 && shortSessions >= 5;

      // Page sequence analysis — identical sequences repeated
      const sequences = sessions.map(s => (s.pageSequence || []).join('>'));
      const sequenceFreq = {};
      sequences.forEach(seq => { if (seq) sequenceFreq[seq] = (sequenceFreq[seq] || 0) + 1; });
      const repeatedSequences = Object.values(sequenceFreq).filter(c => c >= 3).length;
      const hasRepeatedSequences = repeatedSequences > 0;

      // Interaction pattern — pages per session
      const pagesPerSession = sessions.map(s => (s.pageSequence || []).length);
      const avgPages = pagesPerSession.length > 0
        ? pagesPerSession.reduce((s, v) => s + v, 0) / pagesPerSession.length
        : 0;
      const singlePageSessions = pagesPerSession.filter(p => p <= 1).length;
      const highSinglePage = pagesPerSession.length > 0 && singlePageSessions / pagesPerSession.length > 0.7;

      let riskScore = 0;
      if (suspiciousShort) riskScore += 25;
      if (hasRepeatedSequences) riskScore += 30;
      if (highSinglePage) riskScore += 20;
      if (veryLongSessions >= 3) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          totalSessions: sessions.length,
          avgDuration: Math.round(avgDuration),
          shortSessions,
          veryLongSessions,
          suspiciousShort,
          repeatedSequences,
          hasRepeatedSequences,
          avgPagesPerSession: Math.round(avgPages * 100) / 100,
          highSinglePage,
          riskScore: Math.min(riskScore, 85),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 5: Check device reputation — device fingerprint reputation from past events
    this.registerTool('check_device_reputation', 'Check device fingerprint reputation from past events', async (params) => {
      const { sellerId, deviceFingerprint } = params;

      const allEvents = (db_ops.getAll('ato_events', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.deviceInfo?.fingerprint === deviceFingerprint);

      if (allEvents.length === 0) {
        return {
          success: true,
          data: {
            deviceFingerprint,
            isKnown: false,
            reputationScore: 0,
            riskScore: 20,
            riskLevel: 'MEDIUM',
            reason: 'Unknown device — no history'
          }
        };
      }

      const blockedEvents = allEvents.filter(e => e.outcome === 'BLOCKED').length;
      const challengedEvents = allEvents.filter(e => e.outcome === 'CHALLENGED').length;
      const allowedEvents = allEvents.filter(e => e.outcome === 'ALLOWED').length;

      // Multiple sellers using same device
      const associatedSellers = [...new Set(allEvents.map(e => e.sellerId))];
      const multiSeller = associatedSellers.length > 2;

      // Device age
      const firstSeen = new Date(allEvents[allEvents.length - 1].timestamp);
      const daysSinceFirst = (Date.now() - firstSeen) / (1000 * 60 * 60 * 24);

      let reputationScore = 50;
      reputationScore += Math.min(allowedEvents * 2, 30);
      reputationScore -= blockedEvents * 20;
      reputationScore -= challengedEvents * 5;
      if (multiSeller) reputationScore -= 20;
      reputationScore += Math.min(daysSinceFirst * 0.5, 15);
      reputationScore = Math.max(0, Math.min(100, Math.round(reputationScore)));

      let riskScore = 0;
      if (reputationScore < 20) riskScore += 35;
      else if (reputationScore < 40) riskScore += 20;
      if (multiSeller) riskScore += 20;
      if (blockedEvents > 3) riskScore += 25;

      return {
        success: true,
        data: {
          deviceFingerprint,
          isKnown: true,
          reputationScore,
          totalEvents: allEvents.length,
          blockedEvents,
          challengedEvents,
          allowedEvents,
          associatedSellers: associatedSellers.length,
          multiSeller,
          daysSinceFirst: Math.round(daysSinceFirst),
          riskScore: Math.min(riskScore, 80),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Agentic tools
    this.registerTool('search_knowledge_base', 'Search knowledge base for similar behavioral fraud cases', async (params) => {
      const { query, sellerId } = params;
      const results = this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve relevant behavioral anomaly patterns from long-term memory', async (params) => {
      const { context } = params;
      const memories = this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    const { sellerId, behaviorData } = input;
    this.addObservation(`Starting behavioral analytics for seller: ${sellerId}`);

    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) {
      return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };
    }

    const riskIndicators = this.identifyInitialRiskIndicators(input);
    this.addHypothesis(
      `Behavioral analysis needed — ${riskIndicators.length} initial indicators`,
      CONFIDENCE.POSSIBLE
    );

    return {
      understanding: `Evaluating behavioral patterns for seller: ${sellerId}`,
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
      { type: 'detect_bot_behavior', params: { sellerId: input.sellerId, behaviorData: input.behaviorData } },
      { type: 'check_off_hours_activity', params: { sellerId: input.sellerId } },
      { type: 'check_browsing_ratio', params: { sellerId: input.sellerId, behaviorData: input.behaviorData } },
      { type: 'compute_session_anomaly', params: { sellerId: input.sellerId, behaviorData: input.behaviorData } },
      { type: 'check_device_reputation', params: { sellerId: input.sellerId, deviceFingerprint: input.deviceFingerprint } },
      { type: 'search_knowledge_base', params: { query: `behavioral anomaly ${input.sellerId || ''}`, sellerId: input.sellerId } },
      { type: 'retrieve_memory', params: { context: `behavioral analytics ${input.sellerId || ''}` } }
    ];

    return {
      goal: 'Complete behavioral analytics evaluation',
      actions,
      fallback: { type: 'default_flag', reason: 'incomplete_behavioral_evaluation' }
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
        `BEH-${Date.now().toString(36).toUpperCase()}`,
        context.input.sellerId,
        decision.action,
        decision.confidence,
        this.generateReasoning(riskFactors, decision)
      );
    }

    this.knowledgeBase.addKnowledge('behavioral_analytics', [{
      _id: `BEH-${Date.now()}`,
      text: `Behavioral analytics for seller ${context.input?.sellerId || 'unknown'}. Decision: ${decision.action}. Risk: ${overallRisk.score}. Factors: ${riskFactors.map(f => f.factor).join(', ')}`,
      category: 'behavioral_analytics', sellerId: context.input?.sellerId, domain: 'behavioral_analytics',
      outcome: decision.action === 'NORMAL' ? 'legitimate' : decision.action === 'CHALLENGE' ? 'fraud' : 'pending',
      riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true,
      evaluationId: `BEH-${Date.now().toString(36).toUpperCase()}`,
      summary: `Behavioral analytics complete. ${riskFactors.length} risk factors. ${isAutonomous ? 'Autonomous.' : 'Needs review.'}`,
      evidence, riskFactors, overallRisk, decision,
      confidence: decision.confidence, isAutonomous, needsHumanReview,
      escalationReason: needsHumanReview ? `Risk score ${overallRisk.score} requires review` : null,
      selfCorrectionStats: this.selfCorrection.getAccuracy(),
      reasoning: this.generateReasoning(riskFactors, decision)
    };
  }

  identifyInitialRiskIndicators(input) {
    const indicators = [];
    if (!input.deviceFingerprint) indicators.push('NO_DEVICE_FINGERPRINT');
    if (!input.behaviorData) indicators.push('NO_BEHAVIORAL_DATA');
    if (input.behaviorData?.actionsPerMinute > 60) indicators.push('HIGH_ACTION_RATE');
    if (input.behaviorData?.mouseMovements === 0) indicators.push('NO_MOUSE_MOVEMENT');
    return indicators;
  }

  analyzeEvidence(evidence) {
    const factors = [];

    evidence.forEach(e => {
      if (!e.success || !e.data) return;

      if (e.source === 'detect_bot_behavior') {
        if (e.data.botLikely) factors.push({ factor: 'BOT_BEHAVIOR_DETECTED', severity: 'CRITICAL', score: 40 });
        else if (e.data.botIndicators >= 2) factors.push({ factor: 'PARTIAL_BOT_SIGNALS', severity: 'HIGH', score: 25 });
        if (e.data.inhumanTyping) factors.push({ factor: 'INHUMAN_TYPING_SPEED', severity: 'HIGH', score: 20 });
        if (e.data.tooRegular) factors.push({ factor: 'REGULAR_CLICK_PATTERN', severity: 'MEDIUM', score: 15 });
      }

      if (e.source === 'check_off_hours_activity') {
        if (e.data.offHoursBulk) factors.push({ factor: 'OFF_HOURS_BULK_ACTIVITY', severity: 'CRITICAL', score: 35 });
        if (e.data.patternShift) factors.push({ factor: 'ACTIVITY_PATTERN_SHIFT', severity: 'HIGH', score: 25 });
        if (e.data.offHoursRatio > 0.4) factors.push({ factor: 'HIGH_OFF_HOURS_RATIO', severity: 'MEDIUM', score: 15 });
      }

      if (e.source === 'check_browsing_ratio') {
        if (e.data.tooLowBrowsing) factors.push({ factor: 'NO_BROWSING_BEFORE_PURCHASE', severity: 'HIGH', score: 30 });
        if (e.data.tooHighBrowsing) factors.push({ factor: 'EXCESSIVE_BROWSING', severity: 'MEDIUM', score: 20 });
        if (e.data.highZeroBrowse) factors.push({ factor: 'ZERO_BROWSE_PURCHASES', severity: 'HIGH', score: 25 });
      }

      if (e.source === 'compute_session_anomaly') {
        if (e.data.hasRepeatedSequences) factors.push({ factor: 'REPEATED_SESSION_SEQUENCES', severity: 'CRITICAL', score: 30 });
        if (e.data.suspiciousShort) factors.push({ factor: 'SUSPICIOUS_SHORT_SESSIONS', severity: 'HIGH', score: 25 });
        if (e.data.highSinglePage) factors.push({ factor: 'HIGH_SINGLE_PAGE_SESSIONS', severity: 'MEDIUM', score: 15 });
      }

      if (e.source === 'check_device_reputation') {
        if (e.data.reputationScore < 20) factors.push({ factor: 'LOW_DEVICE_REPUTATION', severity: 'CRITICAL', score: 35 });
        else if (e.data.reputationScore < 40) factors.push({ factor: 'POOR_DEVICE_REPUTATION', severity: 'HIGH', score: 20 });
        if (e.data.multiSeller) factors.push({ factor: 'MULTI_SELLER_DEVICE', severity: 'MEDIUM', score: 15 });
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
          const prompt = registry.getPromptById('behavioral-analytics-decision');
          decisionContent = prompt?.content || '';
        } catch { /* fallback */ }
        const systemPrompt = decisionContent || 'You are the behavioral analytics authority. Return ONLY valid JSON: {"action":"NORMAL|FLAG|CHALLENGE", "confidence":0.0-1.0, "reason":"..."}';
        const userPrompt = `Risk score: ${risk.score}/100, Critical: ${risk.criticalFactors}, High: ${risk.highFactors}\nFactors: ${factors.map(f => `${f.factor} (${f.severity}, score:${f.score})`).join(', ')}`;
        const result = await this.llmClient.complete(systemPrompt, userPrompt);
        if (result?.content) {
          const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (['NORMAL', 'FLAG', 'CHALLENGE'].includes(parsed.action)) {
              return { ...parsed, llmEnhanced: true };
            }
          }
        }
      } catch (e) { /* fallback */ }
    }

    const thresholds = this.autonomyThresholds;
    if (risk.score >= (thresholds.AUTO_REJECT_MIN_RISK || 66) || risk.criticalFactors > 0) {
      return { action: 'CHALLENGE', confidence: 0.90, reason: 'High risk behavioral anomalies — issuing challenge' };
    } else if (risk.score >= (thresholds.AUTO_APPROVE_MAX_RISK || 31)) {
      return { action: 'FLAG', confidence: 0.75, reason: 'Moderate behavioral anomalies — flagging for review' };
    }
    return { action: 'NORMAL', confidence: 0.85, reason: 'Behavioral patterns within normal range' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## Behavioral Analytics Summary\n\n### Risk Factors:\n${desc || '- No significant risk factors'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`.trim();
  }

  async evaluateBehavior(sellerId, behaviorData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, behaviorData, ...behaviorData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getBehavioralAnalyticsAgent() {
  if (!instance) instance = new BehavioralAnalyticsAgent();
  return instance;
}

export default BehavioralAnalyticsAgent;
