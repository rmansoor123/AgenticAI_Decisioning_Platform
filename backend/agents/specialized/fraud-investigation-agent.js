/**
 * Fraud Investigation Agent
 *
 * An autonomous agent that investigates suspicious transactions by:
 * - Gathering evidence from multiple data sources
 * - Analyzing patterns and anomalies
 * - Building a case with supporting evidence
 * - Making recommendations with confidence scores
 * - Explaining its reasoning in human-readable format
 * - Learning from past investigations
 * - Collaborating with other agents
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { checkIpReputation, verifyEmail, checkDeviceReputation, getGeoLocation } from '../tools/external-apis.js';
import { checkFraudList, checkConsortiumData, checkConsortiumVelocity } from '../tools/fraud-databases.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getGraphEngine } from '../../graph/graph-engine.js';
import { riskPropagation, findClusters, pageRank } from '../../graph/graph-queries.js';

export class FraudInvestigationAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Fraud Investigation Agent',
      role: 'FRAUD_INVESTIGATOR',
      capabilities: [
        'transaction_analysis',
        'pattern_detection',
        'evidence_gathering',
        'risk_assessment',
        'case_building',
        'recommendation_generation',
        'ip_analysis',
        'email_verification',
        'device_analysis',
        'fraud_list_check',
        'consortium_check'
      ]
    });

    this.investigationTemplates = {
      HIGH_VALUE: ['check_velocity', 'verify_device', 'analyze_history', 'check_network', 'check_ip_reputation', 'check_fraud_list'],
      NEW_DEVICE: ['verify_device', 'check_device_reputation', 'check_login_patterns', 'analyze_location', 'check_ip_reputation'],
      VELOCITY_SPIKE: ['check_velocity', 'analyze_history', 'check_related_accounts', 'check_consortium_velocity'],
      GEO_ANOMALY: ['analyze_location', 'check_ip_reputation', 'verify_device', 'check_vpn'],
      SUSPICIOUS_EMAIL: ['verify_email', 'check_fraud_list', 'analyze_history'],
      NETWORK_RISK: ['check_network', 'check_fraud_list', 'check_consortium_data']
    };

    this.registerTools();
  }

  registerTools() {
    // ============================================================================
    // EXISTING TOOLS (Enhanced)
    // ============================================================================

    // Tool: Fetch transaction details
    this.registerTool('get_transaction', 'Retrieve full transaction details', async (params) => {
      const { transactionId } = params;
      const tx = db_ops.getById('transactions', 'transaction_id', transactionId);
      return { success: true, data: tx?.data || this.generateMockTransaction(transactionId) };
    });

    // Tool: Check velocity (transaction frequency)
    this.registerTool('check_velocity', 'Analyze transaction velocity patterns', async (params) => {
      const { userId, timeWindowHours = 24 } = params;
      const velocity = {
        transactions_1h: Math.floor(Math.random() * 10) + 1,
        transactions_24h: Math.floor(Math.random() * 30) + 5,
        amount_1h: Math.floor(Math.random() * 10000) + 500,
        amount_24h: Math.floor(Math.random() * 50000) + 2000,
        avg_transaction_amount: Math.floor(Math.random() * 500) + 100,
        is_anomalous: Math.random() > 0.7,
        percentile_vs_baseline: Math.floor(Math.random() * 100),
        velocity_score: Math.floor(Math.random() * 100)
      };
      return { success: true, data: velocity };
    });

    // Tool: Verify device fingerprint
    this.registerTool('verify_device', 'Check device trust and history', async (params) => {
      const { deviceId } = params;
      const device = {
        deviceId: deviceId || `DEV-${Math.random().toString(36).slice(2, 10)}`,
        firstSeen: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
        trustScore: Math.floor(Math.random() * 100),
        isKnownDevice: Math.random() > 0.3,
        associatedAccounts: Math.floor(Math.random() * 5) + 1,
        riskIndicators: Math.random() > 0.7 ? ['vpn_detected', 'new_device'] : []
      };
      return { success: true, data: device };
    });

    // Tool: Analyze user history
    this.registerTool('analyze_history', 'Review user transaction history', async (params) => {
      const { userId } = params;
      const history = {
        accountAge: Math.floor(Math.random() * 365) + 30,
        totalTransactions: Math.floor(Math.random() * 500) + 10,
        avgTransactionAmount: Math.floor(Math.random() * 300) + 50,
        previousFraudFlags: Math.floor(Math.random() * 3),
        chargebackRate: (Math.random() * 0.05).toFixed(3),
        riskTrend: ['STABLE', 'INCREASING', 'DECREASING'][Math.floor(Math.random() * 3)],
        lastActivity: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
      };
      return { success: true, data: history };
    });

    // Tool: Check for related accounts (network analysis)
    this.registerTool('check_network', 'Analyze account network connections', async (params) => {
      const { userId } = params;
      const sellerId = userId;

      try {
        const engine = getGraphEngine();
        const sellerNode = engine.getNode(sellerId);

        // If the graph has no data for this seller, fall back to simulated data
        if (!sellerNode) {
          const network = {
            linkedAccounts: Math.floor(Math.random() * 10),
            sharedDevices: Math.floor(Math.random() * 5),
            sharedPaymentMethods: Math.floor(Math.random() * 3),
            networkRiskScore: Math.floor(Math.random() * 100),
            knownFraudConnections: Math.random() > 0.8 ? 1 : 0,
            clusterSize: Math.floor(Math.random() * 20) + 1,
            avgClusterRisk: Math.floor(Math.random() * 50)
          };
          return { success: true, data: network, source: 'simulated' };
        }

        // Get neighbors within 2 hops
        const neighborhood = engine.getNeighbors(sellerId, 2);
        const neighborNodes = neighborhood.nodes.filter(n => n.id !== sellerId);
        const neighborEdges = neighborhood.edges;

        // Count shared devices and payment methods from edge types
        let sharedDevices = 0;
        let sharedPaymentMethods = 0;
        for (const edge of neighborEdges) {
          const edgeType = (edge.type || '').toLowerCase();
          if (edgeType.includes('device') || edgeType === 'shared_device') {
            sharedDevices++;
          }
          if (edgeType.includes('payment') || edgeType === 'shared_payment') {
            sharedPaymentMethods++;
          }
        }

        // Get risk propagation data from this seller
        const riskMap = riskPropagation(sellerId);

        // Calculate network risk score as the average propagated risk across neighbors
        let totalPropagatedRisk = 0;
        let propagatedCount = 0;
        for (const neighbor of neighborNodes) {
          const risk = riskMap.get(neighbor.id) ?? 0;
          totalPropagatedRisk += risk;
          propagatedCount++;
        }
        const networkRiskScore = propagatedCount > 0
          ? Math.round(totalPropagatedRisk / propagatedCount)
          : 0;

        // Count known fraud connections (neighbors with high risk score)
        const HIGH_RISK_THRESHOLD = 70;
        let knownFraudConnections = 0;
        for (const neighbor of neighborNodes) {
          const riskScore = neighbor.properties?.riskScore ?? 0;
          if (riskScore >= HIGH_RISK_THRESHOLD) {
            knownFraudConnections++;
          }
        }

        // Get PageRank scores
        const pageRankScores = pageRank();
        const pageRankScore = pageRankScores.get(sellerId) ?? 0;

        // Find which cluster this seller belongs to
        const clusters = findClusters();
        let sellerCluster = null;
        for (const cluster of clusters) {
          if (cluster.nodes.includes(sellerId)) {
            sellerCluster = cluster;
            break;
          }
        }

        // Build neighbor details
        const neighborDetails = neighborNodes.map(n => ({
          id: n.id,
          type: n.type,
          riskScore: n.properties?.riskScore ?? 0,
          propagatedRisk: riskMap.get(n.id) ?? 0,
          pageRank: pageRankScores.get(n.id) ?? 0
        }));

        const network = {
          linkedAccounts: neighborNodes.length,
          sharedDevices,
          sharedPaymentMethods,
          networkRiskScore,
          knownFraudConnections,
          clusterSize: sellerCluster ? sellerCluster.size : 1,
          avgClusterRisk: sellerCluster ? Math.round(sellerCluster.avgRisk) : 0,
          pageRankScore,
          neighborDetails
        };

        return { success: true, data: network, source: 'graph' };
      } catch (error) {
        // On any graph error, fall back to simulated data
        const network = {
          linkedAccounts: Math.floor(Math.random() * 10),
          sharedDevices: Math.floor(Math.random() * 5),
          sharedPaymentMethods: Math.floor(Math.random() * 3),
          networkRiskScore: Math.floor(Math.random() * 100),
          knownFraudConnections: Math.random() > 0.8 ? 1 : 0,
          clusterSize: Math.floor(Math.random() * 20) + 1,
          avgClusterRisk: Math.floor(Math.random() * 50)
        };
        return { success: true, data: network, source: 'simulated', error: error.message };
      }
    });

    // Tool: Analyze geographic patterns
    this.registerTool('analyze_location', 'Check location and geo patterns', async (params) => {
      const { transactionId, ipAddress } = params;
      const geoData = ipAddress ? await getGeoLocation(ipAddress) : null;
      const geo = {
        transactionCountry: ['US', 'UK', 'NG', 'RO', 'CA'][Math.floor(Math.random() * 5)],
        userHomeCountry: 'US',
        distanceFromHome: Math.floor(Math.random() * 5000),
        impossibleTravel: Math.random() > 0.9,
        vpnDetected: Math.random() > 0.7,
        proxyDetected: Math.random() > 0.8,
        ...(geoData?.data || {})
      };
      return { success: true, data: geo };
    });

    // Tool: Query ML models
    this.registerTool('query_ml_model', 'Get ML model predictions', async (params) => {
      const { features } = params;
      const prediction = {
        fraudScore: Math.random(),
        confidence: 0.85 + Math.random() * 0.15,
        topFeatures: [
          { name: 'transaction_amount', importance: 0.35 },
          { name: 'device_trust', importance: 0.25 },
          { name: 'velocity_1h', importance: 0.20 },
          { name: 'geo_risk', importance: 0.15 }
        ],
        modelVersion: '3.2.1'
      };
      return { success: true, data: prediction };
    });

    // Tool: Search similar cases
    this.registerTool('search_similar_cases', 'Find similar historical cases', async (params) => {
      const { pattern } = params;
      const cases = [
        { caseId: 'CASE-001', similarity: 0.92, outcome: 'CONFIRMED_FRAUD', amount: 5200 },
        { caseId: 'CASE-002', similarity: 0.87, outcome: 'FALSE_POSITIVE', amount: 3100 },
        { caseId: 'CASE-003', similarity: 0.81, outcome: 'CONFIRMED_FRAUD', amount: 7800 }
      ];
      return { success: true, data: cases };
    });

    // ============================================================================
    // NEW EXTERNAL API TOOLS
    // ============================================================================

    // Tool: Check IP reputation
    this.registerTool('check_ip_reputation', 'Check IP address reputation and risk', async (params) => {
      const { ipAddress } = params;
      if (!ipAddress) {
        return { success: false, error: 'IP address is required' };
      }
      return await checkIpReputation(ipAddress);
    });

    // Tool: Verify email
    this.registerTool('verify_email', 'Verify email address validity and risk', async (params) => {
      const { email } = params;
      if (!email) {
        return { success: false, error: 'Email is required' };
      }
      return await verifyEmail(email);
    });

    // Tool: Check device reputation
    this.registerTool('check_device_reputation', 'Check device reputation and trust score', async (params) => {
      const { deviceId } = params;
      return await checkDeviceReputation(deviceId);
    });

    // ============================================================================
    // NEW FRAUD DATABASE TOOLS
    // ============================================================================

    // Tool: Check fraud list
    this.registerTool('check_fraud_list', 'Check identifiers against fraud blocklist', async (params) => {
      const { email, deviceId, ipAddress, phone, cardBin } = params;
      return await checkFraudList({ email, deviceId, ipAddress, phone, cardBin });
    });

    // Tool: Check consortium data
    this.registerTool('check_consortium_data', 'Check shared fraud network data', async (params) => {
      const { email, deviceId, ipAddress, phone, cardHash, accountId } = params;
      return await checkConsortiumData({ email, deviceId, ipAddress, phone, cardHash, accountId });
    });

    // Tool: Check consortium velocity
    this.registerTool('check_consortium_velocity', 'Check velocity across fraud consortium', async (params) => {
      const { email, deviceId, ipAddress, cardHash, timeWindowHours = 24 } = params;
      return await checkConsortiumVelocity({ email, deviceId, ipAddress, cardHash }, timeWindowHours);
    });

    // ============================================================================
    // INTER-AGENT COLLABORATION TOOL
    // ============================================================================

    // Tool: Request rule analysis from Rule Optimizer agent
    this.registerTool('request_rule_analysis', 'Request analysis from Rule Optimizer agent', async (params) => {
      const { transactionId, riskFactors } = params;

      try {
        const result = await this.requestHelp('rule_analysis', {
          type: 'analyze_rules_for_transaction',
          transactionId,
          riskFactors
        }, { requestingAgent: this.agentId });

        return {
          success: true,
          data: result || {
            rulesTriggered: Math.floor(Math.random() * 3),
            ruleRecommendations: ['Consider threshold adjustment', 'Pattern matches existing rule'],
            coverage: 'ADEQUATE'
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          data: { rulesTriggered: 0, ruleRecommendations: [], coverage: 'UNKNOWN' }
        };
      }
    });
  }

  generateMockTransaction(transactionId) {
    return {
      transactionId,
      amount: Math.floor(Math.random() * 10000) + 100,
      currency: 'USD',
      sellerId: `SLR-${Math.random().toString(36).slice(2, 10)}`,
      buyerId: `BYR-${Math.random().toString(36).slice(2, 10)}`,
      email: `user${Math.floor(Math.random() * 1000)}@example.com`,
      ipAddress: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      deviceId: `DEV-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: new Date().toISOString(),
      paymentMethod: ['CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER'][Math.floor(Math.random() * 3)],
      riskScore: Math.floor(Math.random() * 100)
    };
  }

  // Override think — LLM-first, template fallback
  async think(input, context) {
    const { transactionId, alertType, riskScore } = input;

    this.addObservation(`Starting investigation for ${alertType || 'suspicious'} transaction ${transactionId}`);
    this.addHypothesis(
      `Transaction may be ${alertType === 'HIGH_VALUE' ? 'fraudulent due to unusual amount' : 'suspicious based on alert type'}`,
      CONFIDENCE.POSSIBLE
    );

    // Try LLM-enhanced thinking (calls base agent with structured prompts)
    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) {
      return {
        ...llmThink,
        alertType,
        riskLevel: riskScore > 70 ? 'HIGH' : riskScore > 40 ? 'MEDIUM' : 'LOW'
      };
    }

    // Fallback: template-based strategy
    const strategy = this.investigationTemplates[alertType] ||
      this.investigationTemplates.HIGH_VALUE;

    return {
      understanding: `Investigating ${alertType || 'suspicious'} transaction ${transactionId}`,
      strategy,
      riskLevel: riskScore > 70 ? 'HIGH' : riskScore > 40 ? 'MEDIUM' : 'LOW',
      relevantMemory: this.retrieveRelevantMemory(input),
      availableTools: Array.from(this.tools.keys())
    };
  }

  // Override plan — LLM-first, template fallback
  async plan(analysis, context) {
    // Try LLM-enhanced planning (calls base agent)
    const llmPlan = await super.plan(analysis, context);
    if (llmPlan.llmEnhanced && llmPlan.actions.length > 0) {
      return llmPlan;
    }

    // Fallback: template-based planning
    const strategy = analysis.strategy || this.investigationTemplates.HIGH_VALUE;
    const actions = strategy.map(toolName => ({
      type: toolName,
      params: {
        transactionId: context.input?.transactionId,
        userId: context.input?.userId || context.input?.buyerId,
        deviceId: context.input?.deviceId,
        email: context.input?.email,
        ipAddress: context.input?.ipAddress
      }
    }));

    actions.push({ type: 'query_ml_model', params: { features: context.input } });
    actions.push({ type: 'search_similar_cases', params: { pattern: strategy[0] } });

    if (analysis.riskLevel === 'HIGH') {
      actions.push({
        type: 'request_rule_analysis',
        params: { transactionId: context.input?.transactionId, riskFactors: [] }
      });
    }

    return {
      goal: 'Complete investigation for transaction',
      actions,
      fallback: { type: 'escalate_to_human', reason: 'investigation_incomplete' }
    };
  }

  // Override observe to generate investigation report
  async observe(actions, context) {
    const evidence = actions.map(a => ({
      source: a.action.type,
      data: a.result?.data,
      success: a.result?.success !== false,
      timestamp: new Date().toISOString()
    }));

    // Calculate overall risk based on evidence
    const riskFactors = this.analyzeEvidence(evidence);
    const overallRisk = this.calculateOverallRisk(riskFactors);
    const recommendation = await this.generateRecommendation(overallRisk, riskFactors);

    // Add evidence and conclusion to chain of thought
    for (const factor of riskFactors) {
      this.addEvidence(`Risk factor: ${factor.factor} (${factor.severity})`);
    }

    return {
      success: true,
      investigationId: `INV-${Date.now().toString(36).toUpperCase()}`,
      summary: `Investigation complete. ${riskFactors.length} risk factors identified.`,
      evidence,
      riskFactors,
      overallRisk,
      recommendation,
      confidence: recommendation.confidence,
      needsHumanReview: overallRisk.score > 60 && overallRisk.score < 85,
      escalationReason: overallRisk.score > 60 && overallRisk.score < 85
        ? 'Moderate risk requires human verification' : null,
      reasoning: this.generateReasoning(riskFactors, recommendation)
    };
  }

  analyzeEvidence(evidence) {
    const factors = [];

    evidence.forEach(e => {
      if (!e.success || !e.data) return;

      // Velocity analysis
      if (e.source === 'check_velocity' && e.data?.is_anomalous) {
        factors.push({ factor: 'VELOCITY_ANOMALY', severity: 'HIGH', score: 25 });
      }

      // Device analysis
      if (e.source === 'verify_device' && !e.data?.isKnownDevice) {
        factors.push({ factor: 'NEW_DEVICE', severity: 'MEDIUM', score: 15 });
      }
      if (e.source === 'verify_device' && e.data?.trustScore < 30) {
        factors.push({ factor: 'LOW_DEVICE_TRUST', severity: 'HIGH', score: 20 });
      }

      // Device reputation (external API)
      if (e.source === 'check_device_reputation') {
        if (e.data?.trustScore < 40) {
          factors.push({ factor: 'DEVICE_REPUTATION_LOW', severity: 'HIGH', score: 20 });
        }
        if (e.data?.characteristics?.isEmulator) {
          factors.push({ factor: 'EMULATOR_DETECTED', severity: 'CRITICAL', score: 30 });
        }
        if (e.data?.characteristics?.isRooted) {
          factors.push({ factor: 'ROOTED_DEVICE', severity: 'MEDIUM', score: 15 });
        }
      }

      // Location analysis
      if (e.source === 'analyze_location') {
        if (e.data?.impossibleTravel) {
          factors.push({ factor: 'IMPOSSIBLE_TRAVEL', severity: 'CRITICAL', score: 35 });
        }
        if (e.data?.vpnDetected) {
          factors.push({ factor: 'VPN_DETECTED', severity: 'MEDIUM', score: 10 });
        }
      }

      // IP reputation (external API)
      if (e.source === 'check_ip_reputation') {
        if (e.data?.riskScore > 60) {
          factors.push({ factor: 'HIGH_RISK_IP', severity: 'HIGH', score: 20 });
        }
        if (e.data?.isVpn || e.data?.isProxy || e.data?.isTor) {
          factors.push({ factor: 'ANONYMIZING_NETWORK', severity: 'MEDIUM', score: 15 });
        }
        if (e.data?.isDatacenter) {
          factors.push({ factor: 'DATACENTER_IP', severity: 'LOW', score: 5 });
        }
      }

      // Email verification (external API)
      if (e.source === 'verify_email') {
        if (e.data?.isDisposable) {
          factors.push({ factor: 'DISPOSABLE_EMAIL', severity: 'HIGH', score: 25 });
        }
        if (!e.data?.isDeliverable) {
          factors.push({ factor: 'INVALID_EMAIL', severity: 'MEDIUM', score: 15 });
        }
        if (e.data?.riskScore > 50) {
          factors.push({ factor: 'HIGH_RISK_EMAIL', severity: 'MEDIUM', score: 15 });
        }
      }

      // Network analysis
      if (e.source === 'check_network' && e.data?.knownFraudConnections > 0) {
        factors.push({ factor: 'FRAUD_NETWORK_CONNECTION', severity: 'CRITICAL', score: 40 });
      }

      // History analysis
      if (e.source === 'analyze_history' && e.data?.previousFraudFlags > 0) {
        factors.push({ factor: 'PREVIOUS_FRAUD_FLAGS', severity: 'HIGH', score: 20 });
      }

      // ML model score
      if (e.source === 'query_ml_model' && e.data?.fraudScore > 0.7) {
        factors.push({ factor: 'HIGH_ML_SCORE', severity: 'HIGH', score: 25 });
      }

      // Fraud list check
      if (e.source === 'check_fraud_list') {
        if (e.data?.isBlocked) {
          factors.push({ factor: 'BLOCKLIST_MATCH', severity: 'CRITICAL', score: 45 });
        } else if (e.data?.isHighRisk) {
          factors.push({ factor: 'FRAUD_LIST_MATCH', severity: 'HIGH', score: 30 });
        }
      }

      // Consortium data
      if (e.source === 'check_consortium_data') {
        if (e.data?.hasConfirmedFraud) {
          factors.push({ factor: 'CONSORTIUM_CONFIRMED_FRAUD', severity: 'CRITICAL', score: 40 });
        }
        if (e.data?.hasChargebacks) {
          factors.push({ factor: 'CONSORTIUM_CHARGEBACKS', severity: 'HIGH', score: 25 });
        }
        if (e.data?.consortiumRiskScore > 50) {
          factors.push({ factor: 'HIGH_CONSORTIUM_RISK', severity: 'HIGH', score: 20 });
        }
      }

      // Consortium velocity
      if (e.source === 'check_consortium_velocity' && e.data?.isAnomalous) {
        factors.push({ factor: 'CONSORTIUM_VELOCITY_ANOMALY', severity: 'HIGH', score: 25 });
      }
    });

    return factors;
  }

  calculateOverallRisk(factors) {
    const totalScore = factors.reduce((sum, f) => sum + f.score, 0);
    const normalizedScore = Math.min(100, totalScore);

    return {
      score: normalizedScore,
      level: normalizedScore > 70 ? 'HIGH' : normalizedScore > 40 ? 'MEDIUM' : 'LOW',
      factorCount: factors.length,
      criticalFactors: factors.filter(f => f.severity === 'CRITICAL').length,
      highFactors: factors.filter(f => f.severity === 'HIGH').length
    };
  }

  async generateRecommendation(risk, factors) {
    // Try LLM-enhanced recommendation
    if (this.llmClient?.enabled) {
      try {
        const systemPrompt = 'You are a fraud investigation agent. Given risk factors, recommend BLOCK, REVIEW, MONITOR, or APPROVE. Return ONLY valid JSON: {"action":"...", "confidence":0.0-1.0, "reason":"..."}';
        const userPrompt = `Risk score: ${risk.score}/100, Critical factors: ${risk.criticalFactors}, High factors: ${risk.highFactors}\nFactors: ${factors.map(f => `${f.factor} (${f.severity})`).join(', ')}`;

        const result = await this.llmClient.complete(systemPrompt, userPrompt);
        if (result?.content) {
          const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (['BLOCK', 'REVIEW', 'MONITOR', 'APPROVE'].includes(parsed.action)) {
              return { ...parsed, llmEnhanced: true };
            }
          }
        }
      } catch (e) {
        // Fall through to hardcoded logic
      }
    }

    if (risk.score > 85 || risk.criticalFactors > 0) {
      return {
        action: 'BLOCK',
        confidence: 0.92,
        reason: 'High risk transaction with critical indicators'
      };
    } else if (risk.score > 60) {
      return {
        action: 'REVIEW',
        confidence: 0.75,
        reason: 'Moderate risk - manual review recommended'
      };
    } else if (risk.score > 30) {
      return {
        action: 'MONITOR',
        confidence: 0.80,
        reason: 'Low-moderate risk - approve with monitoring'
      };
    } else {
      return {
        action: 'APPROVE',
        confidence: 0.95,
        reason: 'Low risk transaction'
      };
    }
  }

  generateReasoning(factors, recommendation) {
    const factorDescriptions = factors.map(f =>
      `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} severity (score: ${f.score})`
    ).join('\n');

    return `
## Investigation Summary

### Risk Factors Identified:
${factorDescriptions || '- No significant risk factors found'}

### Recommendation: ${recommendation.action}
${recommendation.reason}

### Confidence: ${(recommendation.confidence * 100).toFixed(0)}%

This recommendation is based on analysis of ${factors.length} risk indicators
gathered from transaction data, device fingerprinting, velocity analysis,
geographic patterns, network analysis, external API checks (IP reputation,
email verification, device reputation), fraud databases, consortium data,
and ML model predictions.
    `.trim();
  }

  // Override feature extraction for better pattern matching
  extractFeaturesForPatternMatching(input) {
    return {
      alertType: input?.alertType || 'unknown',
      hasHighAmount: (input?.amount || 0) > 5000,
      hasNewDevice: input?.isNewDevice || false,
      riskLevel: input?.riskScore > 70 ? 'HIGH' : input?.riskScore > 40 ? 'MEDIUM' : 'LOW',
      hasVelocitySpike: input?.velocitySpike || false,
      transactionType: input?.transactionType || 'unknown'
    };
  }

  // Public method to investigate a transaction
  async investigate(transactionId, alertType = null, additionalContext = {}) {
    this.status = 'INVESTIGATING';
    this.currentTask = transactionId;

    const result = await this.reason({
      transactionId,
      alertType,
      ...additionalContext
    });

    this.status = 'IDLE';
    this.currentTask = null;

    return result;
  }
}

export default FraudInvestigationAgent;
