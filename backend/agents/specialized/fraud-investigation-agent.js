/**
 * Fraud Investigation Agent
 *
 * An autonomous agent that investigates suspicious transactions by:
 * - Gathering evidence from multiple data sources
 * - Analyzing patterns and anomalies
 * - Building a case with supporting evidence
 * - Making recommendations with confidence scores
 * - Explaining its reasoning in human-readable format
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';

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
        'recommendation_generation'
      ]
    });

    this.investigationTemplates = {
      HIGH_VALUE: ['check_velocity', 'verify_device', 'analyze_history', 'check_network'],
      NEW_DEVICE: ['verify_device', 'check_login_patterns', 'analyze_location'],
      VELOCITY_SPIKE: ['check_velocity', 'analyze_history', 'check_related_accounts'],
      GEO_ANOMALY: ['analyze_location', 'check_vpn', 'verify_device']
    };

    this.registerTools();
  }

  registerTools() {
    // Tool: Fetch transaction details
    this.registerTool('get_transaction', 'Retrieve full transaction details', async (params) => {
      const { transactionId } = params;
      const tx = db_ops.getById('transactions', 'transaction_id', transactionId);
      return { success: true, data: tx?.data || this.generateMockTransaction(transactionId) };
    });

    // Tool: Check velocity (transaction frequency)
    this.registerTool('check_velocity', 'Analyze transaction velocity patterns', async (params) => {
      const { userId, timeWindowHours = 24 } = params;
      // Simulated velocity check
      const velocity = {
        transactions_1h: Math.floor(Math.random() * 10) + 1,
        transactions_24h: Math.floor(Math.random() * 30) + 5,
        amount_1h: Math.floor(Math.random() * 10000) + 500,
        amount_24h: Math.floor(Math.random() * 50000) + 2000,
        avg_transaction_amount: Math.floor(Math.random() * 500) + 100,
        is_anomalous: Math.random() > 0.7
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
        riskTrend: ['STABLE', 'INCREASING', 'DECREASING'][Math.floor(Math.random() * 3)]
      };
      return { success: true, data: history };
    });

    // Tool: Check for related accounts (network analysis)
    this.registerTool('check_network', 'Analyze account network connections', async (params) => {
      const { userId } = params;
      const network = {
        linkedAccounts: Math.floor(Math.random() * 10),
        sharedDevices: Math.floor(Math.random() * 5),
        sharedPaymentMethods: Math.floor(Math.random() * 3),
        networkRiskScore: Math.floor(Math.random() * 100),
        knownFraudConnections: Math.random() > 0.8 ? 1 : 0
      };
      return { success: true, data: network };
    });

    // Tool: Analyze geographic patterns
    this.registerTool('analyze_location', 'Check location and geo patterns', async (params) => {
      const { transactionId } = params;
      const geo = {
        transactionCountry: ['US', 'UK', 'NG', 'RO', 'CA'][Math.floor(Math.random() * 5)],
        userHomeCountry: 'US',
        distanceFromHome: Math.floor(Math.random() * 5000),
        impossibleTravel: Math.random() > 0.9,
        vpnDetected: Math.random() > 0.7,
        proxyDetected: Math.random() > 0.8
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
  }

  generateMockTransaction(transactionId) {
    return {
      transactionId,
      amount: Math.floor(Math.random() * 10000) + 100,
      currency: 'USD',
      sellerId: `SLR-${Math.random().toString(36).slice(2, 10)}`,
      buyerId: `BYR-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: new Date().toISOString(),
      paymentMethod: ['CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER'][Math.floor(Math.random() * 3)],
      riskScore: Math.floor(Math.random() * 100)
    };
  }

  // Override think to implement investigation logic
  async think(input, context) {
    const { transactionId, alertType, riskScore } = input;

    // Determine investigation strategy based on alert type
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

  // Override plan to create investigation plan
  async plan(analysis, context) {
    const actions = analysis.strategy.map(toolName => ({
      type: toolName,
      params: {
        transactionId: context.input?.transactionId,
        userId: context.input?.userId || context.input?.buyerId,
        deviceId: context.input?.deviceId
      }
    }));

    // Always query ML model
    actions.push({
      type: 'query_ml_model',
      params: { features: context.input }
    });

    // Search for similar cases
    actions.push({
      type: 'search_similar_cases',
      params: { pattern: analysis.strategy[0] }
    });

    return {
      goal: `Complete investigation for transaction`,
      actions,
      fallback: { type: 'escalate_to_human', reason: 'investigation_incomplete' }
    };
  }

  // Override observe to generate investigation report
  async observe(actions, context) {
    const evidence = actions.map(a => ({
      source: a.action.type,
      data: a.result?.data,
      timestamp: new Date().toISOString()
    }));

    // Calculate overall risk based on evidence
    const riskFactors = this.analyzeEvidence(evidence);
    const overallRisk = this.calculateOverallRisk(riskFactors);
    const recommendation = this.generateRecommendation(overallRisk, riskFactors);

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
      if (e.source === 'check_velocity' && e.data?.is_anomalous) {
        factors.push({ factor: 'VELOCITY_ANOMALY', severity: 'HIGH', score: 25 });
      }
      if (e.source === 'verify_device' && !e.data?.isKnownDevice) {
        factors.push({ factor: 'NEW_DEVICE', severity: 'MEDIUM', score: 15 });
      }
      if (e.source === 'verify_device' && e.data?.trustScore < 30) {
        factors.push({ factor: 'LOW_DEVICE_TRUST', severity: 'HIGH', score: 20 });
      }
      if (e.source === 'analyze_location' && e.data?.impossibleTravel) {
        factors.push({ factor: 'IMPOSSIBLE_TRAVEL', severity: 'CRITICAL', score: 35 });
      }
      if (e.source === 'analyze_location' && e.data?.vpnDetected) {
        factors.push({ factor: 'VPN_DETECTED', severity: 'MEDIUM', score: 10 });
      }
      if (e.source === 'check_network' && e.data?.knownFraudConnections > 0) {
        factors.push({ factor: 'FRAUD_NETWORK_CONNECTION', severity: 'CRITICAL', score: 40 });
      }
      if (e.source === 'analyze_history' && e.data?.previousFraudFlags > 0) {
        factors.push({ factor: 'PREVIOUS_FRAUD_FLAGS', severity: 'HIGH', score: 20 });
      }
      if (e.source === 'query_ml_model' && e.data?.fraudScore > 0.7) {
        factors.push({ factor: 'HIGH_ML_SCORE', severity: 'HIGH', score: 25 });
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
      criticalFactors: factors.filter(f => f.severity === 'CRITICAL').length
    };
  }

  generateRecommendation(risk, factors) {
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
geographic patterns, network analysis, and ML model predictions.
    `.trim();
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
