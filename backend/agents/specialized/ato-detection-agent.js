/**
 * ATO Detection Agent
 *
 * Detects account takeover attempts by analyzing device trust, impossible travel,
 * login velocity, credential patterns, and session risk profiles.
 *
 * Decisions: ALLOW / CHALLENGE / BLOCK
 * Safe default on error: BLOCK
 * Domain weight: 0.14 (highest)
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getThresholdManager } from '../core/threshold-manager.js';

export class ATODetectionAgent extends BaseAgent {
  constructor() {
    super({
      name: 'ATO Detection Agent',
      role: 'ATO_DETECTION',
      agentId: 'ATO_DETECTION',
      capabilities: [
        'device_trust_analysis',
        'impossible_travel_detection',
        'login_velocity_monitoring',
        'credential_pattern_analysis',
        'session_risk_profiling'
      ]
    });

    this.riskThresholds = {
      ALLOW: { max: 30 },
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
    // Tool 1: Check device trust score from ato_events history
    this.registerTool('check_device_trust', 'Check device fingerprint trust score from ATO event history', async (params) => {
      const { deviceFingerprint, sellerId } = params;

      const events = (await db_ops.getAll('ato_events', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.deviceInfo?.fingerprint === deviceFingerprint);

      if (events.length === 0) {
        return {
          success: true,
          data: {
            deviceFingerprint,
            trustScore: 0,
            isKnownDevice: false,
            eventsCount: 0,
            riskLevel: 'HIGH',
            reason: 'Unknown device — never seen before'
          }
        };
      }

      const successfulLogins = events.filter(e => e.outcome === 'ALLOWED').length;
      const blockedAttempts = events.filter(e => e.outcome === 'BLOCKED').length;
      const firstSeen = new Date(events[events.length - 1].timestamp);
      const daysSinceFirst = (Date.now() - firstSeen) / (1000 * 60 * 60 * 24);

      let trustScore = 50;
      trustScore += Math.min(successfulLogins * 3, 30);
      trustScore -= blockedAttempts * 15;
      trustScore += Math.min(daysSinceFirst, 20);
      trustScore = Math.max(0, Math.min(100, Math.round(trustScore)));

      const associatedSellers = [...new Set(events.map(e => e.sellerId))];
      const isSharedDevice = associatedSellers.length > 1;

      return {
        success: true,
        data: {
          deviceFingerprint,
          trustScore,
          isKnownDevice: true,
          eventsCount: events.length,
          successfulLogins,
          blockedAttempts,
          daysSinceFirst: Math.round(daysSinceFirst),
          associatedSellers,
          isSharedDevice,
          riskLevel: trustScore < 30 ? 'HIGH' : trustScore < 60 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 2: Detect impossible travel
    this.registerTool('detect_impossible_travel', 'Detect impossible travel via geo/time analysis vs last event', async (params) => {
      const { sellerId, currentLocation, currentTime } = params;

      const recentEvents = (await db_ops.getAll('ato_events', 1000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      if (recentEvents.length === 0) {
        return {
          success: true,
          data: { impossibleTravel: false, reason: 'No previous events to compare', riskScore: 0 }
        };
      }

      const lastEvent = recentEvents[0];
      const lastLocation = lastEvent.location || {};
      const timeDiffMs = new Date(currentTime || Date.now()) - new Date(lastEvent.timestamp);
      const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

      const countryChanged = lastLocation.country && currentLocation?.country &&
        lastLocation.country !== currentLocation.country;
      const cityChanged = lastLocation.city && currentLocation?.city &&
        lastLocation.city !== currentLocation.city;

      // Impossible travel: different country within 1 hour
      const impossibleTravel = countryChanged && timeDiffHours < 1;
      // Suspicious travel: different city within 30 minutes
      const suspiciousTravel = cityChanged && timeDiffHours < 0.5;

      let riskScore = 0;
      if (impossibleTravel) riskScore = 45;
      else if (suspiciousTravel) riskScore = 25;
      else if (countryChanged && timeDiffHours < 4) riskScore = 15;

      return {
        success: true,
        data: {
          impossibleTravel,
          suspiciousTravel,
          lastLocation,
          currentLocation,
          timeDiffHours: Math.round(timeDiffHours * 100) / 100,
          countryChanged,
          riskScore,
          riskLevel: riskScore >= 40 ? 'CRITICAL' : riskScore >= 20 ? 'HIGH' : 'LOW'
        }
      };
    });

    // Tool 3: Check login velocity (brute force detection)
    this.registerTool('check_login_velocity', 'Detect brute force via login attempts in 15min/1h/24h windows', async (params) => {
      const { sellerId } = params;

      const allEvents = (await db_ops.getAll('ato_events', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId);

      const now = Date.now();
      const windows = {
        '15min': allEvents.filter(e => now - new Date(e.timestamp) < 15 * 60 * 1000),
        '1h': allEvents.filter(e => now - new Date(e.timestamp) < 60 * 60 * 1000),
        '24h': allEvents.filter(e => now - new Date(e.timestamp) < 24 * 60 * 60 * 1000)
      };

      const failedCounts = {
        '15min': windows['15min'].filter(e => e.outcome === 'BLOCKED' || e.outcome === 'CHALLENGED').length,
        '1h': windows['1h'].filter(e => e.outcome === 'BLOCKED' || e.outcome === 'CHALLENGED').length,
        '24h': windows['24h'].filter(e => e.outcome === 'BLOCKED' || e.outcome === 'CHALLENGED').length
      };

      const bruteForce = failedCounts['15min'] >= 5;
      const sustainedAttack = failedCounts['1h'] >= 15;
      const distributedAttack = failedCounts['24h'] >= 50;

      let riskScore = 0;
      if (bruteForce) riskScore += 40;
      if (sustainedAttack) riskScore += 25;
      if (distributedAttack) riskScore += 20;

      return {
        success: true,
        data: {
          totalAttempts: windows,
          failedCounts,
          bruteForce,
          sustainedAttack,
          distributedAttack,
          riskScore: Math.min(riskScore, 85),
          riskLevel: bruteForce ? 'CRITICAL' : sustainedAttack ? 'HIGH' : distributedAttack ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 4: Check credential patterns
    this.registerTool('check_credential_patterns', 'Analyze failed login rate and user-agent diversity', async (params) => {
      const { sellerId } = params;

      const recentEvents = (await db_ops.getAll('ato_events', 10000, 0) || [])
        .map(e => e.data)
        .filter(e => e.sellerId === sellerId && (Date.now() - new Date(e.timestamp)) < 7 * 24 * 60 * 60 * 1000);

      const totalAttempts = recentEvents.length;
      const failedAttempts = recentEvents.filter(e => e.outcome === 'BLOCKED').length;
      const failRate = totalAttempts > 0 ? failedAttempts / totalAttempts : 0;

      const userAgents = [...new Set(recentEvents.map(e => e.deviceInfo?.userAgent).filter(Boolean))];
      const uniqueIPs = [...new Set(recentEvents.map(e => e.location?.ip).filter(Boolean))];

      const highDiversity = userAgents.length > 5;
      const multiIP = uniqueIPs.length > 10;

      let riskScore = 0;
      if (failRate > 0.7) riskScore += 35;
      else if (failRate > 0.4) riskScore += 20;
      if (highDiversity) riskScore += 25;
      if (multiIP) riskScore += 20;

      return {
        success: true,
        data: {
          totalAttempts,
          failedAttempts,
          failRate: Math.round(failRate * 100) / 100,
          uniqueUserAgents: userAgents.length,
          uniqueIPs: uniqueIPs.length,
          highDiversity,
          multiIP,
          credentialStuffingLikely: failRate > 0.5 && highDiversity,
          riskScore: Math.min(riskScore, 80),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 5: Get session risk profile
    this.registerTool('get_session_risk_profile', 'Cross-reference sessions, MFA status, and recent changes', async (params) => {
      const { sellerId } = params;

      const seller = await db_ops.getById('sellers', 'seller_id', sellerId);
      const sellerData = seller?.data || {};

      const recentProfileUpdates = (await db_ops.getAll('profile_updates', 1000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId && (Date.now() - new Date(r.createdAt)) < 72 * 60 * 60 * 1000);

      const criticalChanges = recentProfileUpdates.filter(r =>
        ['email', 'phone', 'bankAccount', 'password'].some(f => r.changes?.[f])
      );

      const mfaEnabled = sellerData.mfaEnabled !== false;
      const recentPasswordChange = recentProfileUpdates.some(r => r.changes?.password);
      const recentBankChange = recentProfileUpdates.some(r => r.changes?.bankAccount);
      const recentEmailChange = recentProfileUpdates.some(r => r.changes?.email);

      let riskScore = 0;
      if (!mfaEnabled) riskScore += 15;
      if (recentPasswordChange) riskScore += 20;
      if (recentBankChange) riskScore += 25;
      if (recentEmailChange) riskScore += 20;
      if (criticalChanges.length >= 2) riskScore += 30;

      return {
        success: true,
        data: {
          sellerId,
          mfaEnabled,
          recentCriticalChanges: criticalChanges.length,
          recentPasswordChange,
          recentBankChange,
          recentEmailChange,
          accountAge: sellerData.createdAt ? Math.round((Date.now() - new Date(sellerData.createdAt)) / (1000 * 60 * 60 * 24)) : null,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Agentic tools
    this.registerTool('search_knowledge_base', 'Search knowledge base for similar ATO cases', async (params) => {
      const { query, sellerId } = params;
      const results = await this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve relevant ATO patterns from long-term memory', async (params) => {
      const { context } = params;
      const memories = await this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    const { sellerId, eventType } = input;
    this.addObservation(`Starting ATO detection for seller: ${sellerId}, event: ${eventType || 'unknown'}`);

    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) {
      return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };
    }

    const riskIndicators = this.identifyInitialRiskIndicators(input);
    this.addHypothesis(
      `ATO risk assessment needed — ${riskIndicators.length} initial indicators`,
      CONFIDENCE.POSSIBLE
    );

    return {
      understanding: `Evaluating ATO risk for event: ${eventType || 'login'}`,
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
      { type: 'check_device_trust', params: { deviceFingerprint: input.deviceFingerprint, sellerId: input.sellerId } },
      { type: 'detect_impossible_travel', params: { sellerId: input.sellerId, currentLocation: input.location, currentTime: input.submittedAt } },
      { type: 'check_login_velocity', params: { sellerId: input.sellerId } },
      { type: 'check_credential_patterns', params: { sellerId: input.sellerId } },
      { type: 'get_session_risk_profile', params: { sellerId: input.sellerId } },
      { type: 'search_knowledge_base', params: { query: `ato ${input.eventType || ''} ${input.sellerId || ''}`, sellerId: input.sellerId } },
      { type: 'retrieve_memory', params: { context: `ato detection ${input.eventType || ''}` } }
    ];

    return {
      goal: 'Complete ATO risk evaluation',
      actions,
      fallback: { type: 'default_block', reason: 'incomplete_ato_evaluation' }
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
        `ATO-${Date.now().toString(36).toUpperCase()}`,
        context.input.sellerId,
        decision.action,
        decision.confidence,
        this.generateReasoning(riskFactors, decision)
      );
    }

    this.knowledgeBase.addKnowledge('ato', [{
      _id: `ATO-${Date.now()}`,
      text: `ATO evaluation for seller ${context.input?.sellerId || 'unknown'}. Decision: ${decision.action}. Risk: ${overallRisk.score}. Factors: ${riskFactors.map(f => f.factor).join(', ')}`,
      category: 'ato', sellerId: context.input?.sellerId, domain: 'ato',
      outcome: decision.action === 'ALLOW' ? 'legitimate' : decision.action === 'BLOCK' ? 'fraud' : 'pending',
      riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true,
      evaluationId: `ATO-${Date.now().toString(36).toUpperCase()}`,
      summary: `ATO evaluation complete. ${riskFactors.length} risk factors. ${isAutonomous ? 'Autonomous.' : 'Needs review.'}`,
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
    if (!input.location) indicators.push('NO_LOCATION_DATA');
    if (['PASSWORD_CHANGE', 'EMAIL_CHANGE', 'BANK_CHANGE', 'MFA_DISABLED'].includes(input.eventType)) {
      indicators.push('SENSITIVE_EVENT');
    }
    return indicators;
  }

  analyzeEvidence(evidence) {
    const factors = [];

    evidence.forEach(e => {
      if (!e.success || !e.data) return;

      if (e.source === 'check_device_trust') {
        if (!e.data.isKnownDevice) factors.push({ factor: 'UNKNOWN_DEVICE', severity: 'HIGH', score: 30 });
        else if (e.data.trustScore < 30) factors.push({ factor: 'LOW_DEVICE_TRUST', severity: 'HIGH', score: 25 });
        if (e.data.isSharedDevice) factors.push({ factor: 'SHARED_DEVICE', severity: 'MEDIUM', score: 15 });
      }

      if (e.source === 'detect_impossible_travel') {
        if (e.data.impossibleTravel) factors.push({ factor: 'IMPOSSIBLE_TRAVEL', severity: 'CRITICAL', score: 45 });
        else if (e.data.suspiciousTravel) factors.push({ factor: 'SUSPICIOUS_TRAVEL', severity: 'HIGH', score: 25 });
      }

      if (e.source === 'check_login_velocity') {
        if (e.data.bruteForce) factors.push({ factor: 'BRUTE_FORCE_DETECTED', severity: 'CRITICAL', score: 40 });
        if (e.data.sustainedAttack) factors.push({ factor: 'SUSTAINED_ATTACK', severity: 'HIGH', score: 25 });
        if (e.data.distributedAttack) factors.push({ factor: 'DISTRIBUTED_ATTACK', severity: 'HIGH', score: 20 });
      }

      if (e.source === 'check_credential_patterns') {
        if (e.data.credentialStuffingLikely) factors.push({ factor: 'CREDENTIAL_STUFFING', severity: 'CRITICAL', score: 40 });
        if (e.data.highDiversity) factors.push({ factor: 'HIGH_UA_DIVERSITY', severity: 'MEDIUM', score: 15 });
        if (e.data.failRate > 0.7) factors.push({ factor: 'HIGH_FAIL_RATE', severity: 'HIGH', score: 25 });
      }

      if (e.source === 'get_session_risk_profile') {
        if (e.data.recentCriticalChanges >= 2) factors.push({ factor: 'MULTIPLE_CRITICAL_CHANGES', severity: 'CRITICAL', score: 35 });
        if (e.data.recentBankChange) factors.push({ factor: 'RECENT_BANK_CHANGE', severity: 'HIGH', score: 25 });
        if (!e.data.mfaEnabled) factors.push({ factor: 'MFA_DISABLED', severity: 'MEDIUM', score: 15 });
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
          const prompt = registry.getPromptById('ato-detection-decision');
          decisionContent = prompt?.content || '';
        } catch { /* fallback */ }
        const systemPrompt = decisionContent || 'You are the ATO detection authority. Return ONLY valid JSON: {"action":"ALLOW|CHALLENGE|BLOCK", "confidence":0.0-1.0, "reason":"..."}';
        const userPrompt = `Risk score: ${risk.score}/100, Critical: ${risk.criticalFactors}, High: ${risk.highFactors}\nFactors: ${factors.map(f => `${f.factor} (${f.severity}, score:${f.score})`).join(', ')}`;
        const result = await this.llmClient.complete(systemPrompt, userPrompt);
        if (result?.content) {
          const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (['ALLOW', 'CHALLENGE', 'BLOCK'].includes(parsed.action)) {
              return { ...parsed, llmEnhanced: true };
            }
          }
        }
      } catch (e) { /* fallback */ }
    }

    const thresholds = this.autonomyThresholds;
    if (risk.score >= (thresholds.AUTO_REJECT_MIN_RISK || 66) || risk.criticalFactors > 0) {
      return { action: 'BLOCK', confidence: 0.90, reason: 'High risk ATO indicators — blocking access' };
    } else if (risk.score >= (thresholds.AUTO_APPROVE_MAX_RISK || 31)) {
      return { action: 'CHALLENGE', confidence: 0.75, reason: 'Moderate ATO risk — additional verification required' };
    }
    return { action: 'ALLOW', confidence: 0.85, reason: 'Low ATO risk — access permitted' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## ATO Detection Summary\n\n### Risk Factors:\n${desc || '- No significant risk factors'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`.trim();
  }

  async evaluateEvent(sellerId, eventData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, ...eventData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getATODetectionAgent() {
  if (!instance) instance = new ATODetectionAgent();
  return instance;
}

export default ATODetectionAgent;
