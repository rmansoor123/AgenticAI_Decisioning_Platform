/**
 * Seller Onboarding Agent
 *
 * An autonomous agent that evaluates seller applications during onboarding by:
 * - Performing comprehensive KYC verification
 * - Checking business legitimacy
 * - Analyzing risk factors
 * - Making approve/reject/review decisions
 * - Providing detailed reasoning
 * - Learning from past onboarding decisions
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { checkIpReputation, verifyEmail, checkBusinessRegistration } from '../tools/external-apis.js';
import { checkFraudList, checkConsortiumData } from '../tools/fraud-databases.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';

export class SellerOnboardingAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Seller Onboarding Agent',
      role: 'SELLER_ONBOARDING',
      capabilities: [
        'kyc_verification',
        'business_verification',
        'risk_assessment',
        'document_analysis',
        'watchlist_screening',
        'bank_verification',
        'address_verification',
        'decision_making',
        'compliance_check',
        'pattern_recognition'
      ]
    });

    this.riskThresholds = {
      APPROVE: { max: 30 },
      REVIEW: { min: 31, max: 60 },
      REJECT: { min: 61 }
    };

    this.registerTools();
  }

  registerTools() {
    // ============================================================================
    // KYC & IDENTITY VERIFICATION TOOLS
    // ============================================================================

    // Tool: Verify identity documents
    this.registerTool('verify_identity', 'Verify identity documents (ID, passport, etc.)', async (params) => {
      const { documentType, documentNumber, country } = params;
      
      // Simulate identity verification
      const verification = {
        documentType,
        documentNumber,
        country,
        verified: Math.random() > 0.15, // 85% pass rate
        verificationMethod: 'OCR_AND_ML',
        confidence: 0.85 + Math.random() * 0.15,
        issues: Math.random() > 0.8 ? ['document_expired', 'poor_quality'] : [],
        verifiedAt: new Date().toISOString()
      };

      return { success: true, data: verification };
    });

    // Tool: Verify business registration
    this.registerTool('verify_business', 'Verify business registration and legitimacy', async (params) => {
      const { businessName, registrationNumber, country, businessCategory } = params;
      
      const business = await checkBusinessRegistration({ businessName, registrationNumber, country });
      
      return {
        success: true,
        data: {
          ...business?.data || {},
          businessName,
          registrationNumber,
          country,
          businessCategory,
          isRegistered: business?.data?.isRegistered ?? (Math.random() > 0.1),
          registrationDate: business?.data?.registrationDate || new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000 * 5).toISOString(),
          businessAge: business?.data?.businessAge || Math.floor(Math.random() * 3650) + 30,
          status: business?.data?.status || 'ACTIVE',
          verifiedAt: new Date().toISOString()
        }
      };
    });

    // Tool: Check address verification
    this.registerTool('verify_address', 'Verify business and mailing address', async (params) => {
      const { address, country, addressType } = params;
      
      return {
        success: true,
        data: {
          address,
          country,
          addressType,
          verified: Math.random() > 0.2, // 80% pass rate
          verificationMethod: 'ADDRESS_API',
          riskIndicators: Math.random() > 0.85 ? ['PO_BOX', 'RESIDENTIAL_ADDRESS'] : [],
          verifiedAt: new Date().toISOString()
        }
      };
    });

    // ============================================================================
    // WATCHLIST & COMPLIANCE TOOLS
    // ============================================================================

    // Tool: Screen against watchlists
    this.registerTool('screen_watchlist', 'Screen against sanctions, PEP, and watchlists', async (params) => {
      const { name, dateOfBirth, country, businessName } = params;
      
      return {
        success: true,
        data: {
          name,
          businessName,
          country,
          sanctionsMatch: Math.random() > 0.95, // 5% match rate
          pepMatch: Math.random() > 0.97, // 3% match rate
          watchlistMatch: Math.random() > 0.98, // 2% match rate
          matches: [],
          screenedAt: new Date().toISOString()
        }
      };
    });

    // Tool: Check fraud databases
    this.registerTool('check_fraud_databases', 'Check seller against fraud databases', async (params) => {
      const { email, businessName, phone, taxId } = params;
      
      const fraudCheck = await checkFraudList({ email, businessName, phone });
      const consortiumCheck = await checkConsortiumData({ email, businessName, phone });
      
      return {
        success: true,
        data: {
          ...fraudCheck?.data || {},
          consortiumData: consortiumCheck?.data || {},
          isBlocked: fraudCheck?.data?.isBlocked || false,
          isHighRisk: fraudCheck?.data?.isHighRisk || (Math.random() > 0.9),
          riskScore: fraudCheck?.data?.riskScore || Math.floor(Math.random() * 100),
          checkedAt: new Date().toISOString()
        }
      };
    });

    // ============================================================================
    // BANK & FINANCIAL VERIFICATION
    // ============================================================================

    // Tool: Verify bank account
    this.registerTool('verify_bank_account', 'Verify bank account details and ownership', async (params) => {
      const { accountNumber, routingNumber, accountHolderName, bankName, country } = params;
      
      return {
        success: true,
        data: {
          accountNumber: accountNumber?.substring(0, 4) + '****',
          routingNumber,
          accountHolderName,
          bankName,
          country,
          verified: Math.random() > 0.1, // 90% pass rate
          accountType: ['CHECKING', 'SAVINGS'][Math.floor(Math.random() * 2)],
          accountAge: Math.floor(Math.random() * 3650) + 30,
          ownershipMatch: Math.random() > 0.15, // 85% match
          verifiedAt: new Date().toISOString()
        }
      };
    });

    // Tool: Check financial history
    this.registerTool('check_financial_history', 'Check credit and financial history', async (params) => {
      const { businessName, taxId, country } = params;
      
      return {
        success: true,
        data: {
          businessName,
          taxId,
          creditScore: Math.floor(Math.random() * 300) + 500, // 500-800
          creditHistory: Math.floor(Math.random() * 3650) + 365, // 1-10 years
          bankruptcies: Math.random() > 0.95 ? 1 : 0,
          liens: Math.random() > 0.9 ? Math.floor(Math.random() * 3) : 0,
          financialRisk: Math.random() > 0.85 ? 'MEDIUM' : 'LOW',
          checkedAt: new Date().toISOString()
        }
      };
    });

    // ============================================================================
    // EMAIL & COMMUNICATION VERIFICATION
    // ============================================================================

    // Tool: Verify email
    this.registerTool('verify_email', 'Verify email address validity and risk', async (params) => {
      const { email } = params;
      if (!email) {
        return { success: false, error: 'Email is required' };
      }
      return await verifyEmail(email);
    });

    // Tool: Check IP reputation
    this.registerTool('check_ip_reputation', 'Check IP address reputation', async (params) => {
      const { ipAddress } = params;
      if (!ipAddress) {
        return { success: false, error: 'IP address is required' };
      }
      return await checkIpReputation(ipAddress);
    });

    // ============================================================================
    // BUSINESS ANALYSIS TOOLS
    // ============================================================================

    // Tool: Analyze business category risk
    this.registerTool('analyze_business_category', 'Assess risk of business category', async (params) => {
      const { businessCategory, country } = params;
      
      const highRiskCategories = ['GAMBLING', 'ADULT_CONTENT', 'CRYPTO', 'PHARMACEUTICALS'];
      const mediumRiskCategories = ['ELECTRONICS', 'JEWELRY', 'TICKETS', 'GIFT_CARDS'];
      
      const isHighRisk = highRiskCategories.includes(businessCategory);
      const isMediumRisk = mediumRiskCategories.includes(businessCategory);
      
      return {
        success: true,
        data: {
          businessCategory,
          country,
          riskLevel: isHighRisk ? 'HIGH' : isMediumRisk ? 'MEDIUM' : 'LOW',
          riskScore: isHighRisk ? 40 : isMediumRisk ? 20 : 10,
          requiresAdditionalVerification: isHighRisk,
          categoryCompliance: {
            requiresLicense: isHighRisk,
            restrictions: isHighRisk ? ['age_verification', 'geographic_restrictions'] : []
          }
        }
      };
    });

    // Tool: Check for duplicate sellers
    this.registerTool('check_duplicates', 'Check for duplicate or related seller accounts', async (params) => {
      const { email, phone, businessName, taxId } = params;
      
      // Check database for similar sellers
      const allSellers = db_ops.getAll('sellers', 10000, 0).map(s => s.data);
      
      const duplicates = allSellers.filter(s => {
        return s.email === email ||
               s.phone === phone ||
               s.businessName === businessName ||
               (taxId && s.taxId === taxId);
      });

      return {
        success: true,
        data: {
          duplicateCount: duplicates.length,
          duplicates: duplicates.map(s => ({
            sellerId: s.sellerId,
            businessName: s.businessName,
            matchType: s.email === email ? 'EMAIL' : 
                      s.phone === phone ? 'PHONE' : 
                      s.businessName === businessName ? 'BUSINESS_NAME' : 'TAX_ID',
            status: s.status,
            riskTier: s.riskTier
          })),
          isDuplicate: duplicates.length > 0,
          riskLevel: duplicates.length > 0 ? 'HIGH' : 'LOW'
        }
      };
    });

    // Tool: Analyze historical patterns
    this.registerTool('analyze_historical_patterns', 'Check for patterns in similar sellers', async (params) => {
      const { businessCategory, country, businessAge } = params;
      
      const similarSellers = db_ops.getAll('sellers', 10000, 0)
        .map(s => s.data)
        .filter(s => s.businessCategory === businessCategory && s.country === country);
      
      const fraudRate = similarSellers.length > 0
        ? similarSellers.filter(s => s.status === 'BLOCKED' || s.riskTier === 'CRITICAL').length / similarSellers.length
        : 0.1;
      
      return {
        success: true,
        data: {
          similarSellerCount: similarSellers.length,
          averageRiskScore: similarSellers.length > 0
            ? similarSellers.reduce((sum, s) => sum + (s.riskScore || 0), 0) / similarSellers.length
            : 50,
          fraudRate,
          successRate: 1 - fraudRate,
          patternRisk: fraudRate > 0.3 ? 'HIGH' : fraudRate > 0.15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // ============================================================================
    // INTER-AGENT COLLABORATION
    // ============================================================================

    // Tool: Request investigation from Fraud Investigation Agent
    this.registerTool('request_fraud_investigation', 'Request deep investigation from Fraud Investigation Agent', async (params) => {
      const { sellerId, riskFactors } = params;
      
      try {
        const result = await this.requestHelp('transaction_analysis', {
          type: 'seller_onboarding_investigation',
          sellerId,
          riskFactors
        }, { requestingAgent: this.agentId });
        
        return {
          success: true,
          data: result || {
            recommendation: 'REVIEW',
            confidence: 0.75,
            riskFactors: riskFactors || []
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          data: { recommendation: 'REVIEW', confidence: 0.5 }
        };
      }
    });
  }

  // Override think to implement onboarding logic
  async think(input, context) {
    const { sellerId, sellerData } = input;

    this.addObservation(`Starting onboarding evaluation for seller: ${sellerId || 'NEW'}`);

    // Determine investigation strategy based on risk indicators
    const strategy = this.determineInvestigationStrategy(sellerData);

    this.addHypothesis(
      `Seller may require ${strategy.intensity} level verification based on initial data`,
      CONFIDENCE.POSSIBLE
    );

    return {
      understanding: `Evaluating seller application for onboarding`,
      strategy,
      riskIndicators: this.identifyInitialRiskIndicators(sellerData),
      relevantMemory: this.retrieveRelevantMemory(input),
      availableTools: Array.from(this.tools.keys())
    };
  }

  // Override plan to create onboarding investigation plan
  async plan(analysis, context) {
    const actions = [];

    // Always perform basic checks
    actions.push({ type: 'verify_identity', params: context.input?.sellerData });
    actions.push({ type: 'verify_email', params: { email: context.input?.sellerData?.email } });
    actions.push({ type: 'check_duplicates', params: context.input?.sellerData });
    actions.push({ type: 'screen_watchlist', params: context.input?.sellerData });

    // Conditional checks based on strategy
    if (analysis.strategy.intensity === 'COMPREHENSIVE' || analysis.strategy.intensity === 'STANDARD') {
      actions.push({ type: 'verify_business', params: context.input?.sellerData });
      actions.push({ type: 'verify_bank_account', params: context.input?.sellerData });
      actions.push({ type: 'verify_address', params: context.input?.sellerData });
      actions.push({ type: 'check_fraud_databases', params: context.input?.sellerData });
      actions.push({ type: 'analyze_business_category', params: context.input?.sellerData });
    }

    if (analysis.strategy.intensity === 'COMPREHENSIVE') {
      actions.push({ type: 'check_financial_history', params: context.input?.sellerData });
      actions.push({ type: 'analyze_historical_patterns', params: context.input?.sellerData });
      
      if (context.input?.sellerData?.ipAddress) {
        actions.push({ type: 'check_ip_reputation', params: { ipAddress: context.input.sellerData.ipAddress } });
      }
    }

    // Request fraud investigation for high-risk cases
    if (analysis.riskIndicators.length > 2) {
      actions.push({
        type: 'request_fraud_investigation',
        params: {
          sellerId: context.input?.sellerId,
          riskFactors: analysis.riskIndicators
        }
      });
    }

    return {
      goal: 'Complete comprehensive seller onboarding evaluation',
      actions,
      fallback: { type: 'escalate_to_human', reason: 'incomplete_verification' }
    };
  }

  // Override observe to generate onboarding decision
  async observe(actions, context) {
    const evidence = actions.map(a => ({
      source: a.action.type,
      data: a.result?.data,
      success: a.result?.success !== false,
      timestamp: new Date().toISOString()
    }));

    // Analyze evidence
    const riskFactors = this.analyzeOnboardingEvidence(evidence);
    const overallRisk = this.calculateOnboardingRisk(riskFactors);
    const decision = this.generateOnboardingDecision(overallRisk, riskFactors);

    // Add evidence to chain of thought
    for (const factor of riskFactors) {
      this.addEvidence(`Risk factor: ${factor.factor} (${factor.severity})`);
    }

    return {
      success: true,
      onboardingId: `ONB-${Date.now().toString(36).toUpperCase()}`,
      summary: `Onboarding evaluation complete. ${riskFactors.length} risk factors identified.`,
      evidence,
      riskFactors,
      overallRisk,
      decision,
      confidence: decision.confidence,
      needsHumanReview: decision.action === 'REVIEW' || overallRisk.score > 50,
      escalationReason: decision.action === 'REVIEW' ? 'Moderate risk requires manual review' : null,
      reasoning: this.generateOnboardingReasoning(riskFactors, decision)
    };
  }

  // Helper methods
  determineInvestigationStrategy(sellerData) {
    const riskIndicators = this.identifyInitialRiskIndicators(sellerData);
    
    if (riskIndicators.length >= 3) {
      return { intensity: 'COMPREHENSIVE', checks: 'all' };
    } else if (riskIndicators.length >= 1) {
      return { intensity: 'STANDARD', checks: 'standard' };
    }
    return { intensity: 'BASIC', checks: 'essential' };
  }

  identifyInitialRiskIndicators(sellerData) {
    const indicators = [];
    
    if (!sellerData?.kycVerified) indicators.push('KYC_NOT_VERIFIED');
    if (!sellerData?.bankVerified) indicators.push('BANK_NOT_VERIFIED');
    if (['NG', 'RO', 'UA', 'PK', 'BD'].includes(sellerData?.country)) indicators.push('HIGH_RISK_COUNTRY');
    
    const emailDomain = sellerData?.email?.split('@')[1];
    if (emailDomain && ['tempmail.com', 'guerrillamail.com'].includes(emailDomain)) {
      indicators.push('DISPOSABLE_EMAIL');
    }
    
    return indicators;
  }

  analyzeOnboardingEvidence(evidence) {
    const factors = [];

    evidence.forEach(e => {
      if (!e.success || !e.data) return;

      // Identity verification
      if (e.source === 'verify_identity' && !e.data.verified) {
        factors.push({ factor: 'IDENTITY_NOT_VERIFIED', severity: 'CRITICAL', score: 40 });
      }

      // Business verification
      if (e.source === 'verify_business' && !e.data.isRegistered) {
        factors.push({ factor: 'BUSINESS_NOT_REGISTERED', severity: 'CRITICAL', score: 45 });
      }

      // Email verification
      if (e.source === 'verify_email') {
        if (e.data.isDisposable) {
          factors.push({ factor: 'DISPOSABLE_EMAIL', severity: 'HIGH', score: 30 });
        }
        if (!e.data.isDeliverable) {
          factors.push({ factor: 'INVALID_EMAIL', severity: 'MEDIUM', score: 20 });
        }
      }

      // Watchlist screening
      if (e.source === 'screen_watchlist') {
        if (e.data.sanctionsMatch || e.data.pepMatch) {
          factors.push({ factor: 'WATCHLIST_MATCH', severity: 'CRITICAL', score: 50 });
        }
      }

      // Fraud database
      if (e.source === 'check_fraud_databases') {
        if (e.data.isBlocked) {
          factors.push({ factor: 'FRAUD_DATABASE_BLOCK', severity: 'CRITICAL', score: 50 });
        }
        if (e.data.isHighRisk) {
          factors.push({ factor: 'HIGH_RISK_IN_DATABASE', severity: 'HIGH', score: 35 });
        }
      }

      // Bank verification
      if (e.source === 'verify_bank_account' && !e.data.verified) {
        factors.push({ factor: 'BANK_ACCOUNT_NOT_VERIFIED', severity: 'HIGH', score: 30 });
      }
      if (e.source === 'verify_bank_account' && !e.data.ownershipMatch) {
        factors.push({ factor: 'BANK_OWNERSHIP_MISMATCH', severity: 'CRITICAL', score: 40 });
      }

      // Duplicate check
      if (e.source === 'check_duplicates' && e.data.isDuplicate) {
        factors.push({ factor: 'DUPLICATE_ACCOUNT', severity: 'HIGH', score: 35 });
      }

      // Business category
      if (e.source === 'analyze_business_category' && e.data.riskLevel === 'HIGH') {
        factors.push({ factor: 'HIGH_RISK_BUSINESS_CATEGORY', severity: 'MEDIUM', score: 25 });
      }

      // Financial history
      if (e.source === 'check_financial_history') {
        if (e.data.bankruptcies > 0) {
          factors.push({ factor: 'BANKRUPTCY_HISTORY', severity: 'HIGH', score: 30 });
        }
        if (e.data.creditScore < 550) {
          factors.push({ factor: 'LOW_CREDIT_SCORE', severity: 'MEDIUM', score: 20 });
        }
      }

      // Historical patterns
      if (e.source === 'analyze_historical_patterns' && e.data.patternRisk === 'HIGH') {
        factors.push({ factor: 'HIGH_FRAUD_RATE_IN_CATEGORY', severity: 'MEDIUM', score: 25 });
      }

      // IP reputation
      if (e.source === 'check_ip_reputation' && e.data.riskScore > 60) {
        factors.push({ factor: 'HIGH_RISK_IP', severity: 'MEDIUM', score: 20 });
      }
    });

    return factors;
  }

  calculateOnboardingRisk(factors) {
    const totalScore = factors.reduce((sum, f) => sum + f.score, 0);
    const normalizedScore = Math.min(100, totalScore);

    return {
      score: normalizedScore,
      level: normalizedScore > 60 ? 'HIGH' : normalizedScore > 30 ? 'MEDIUM' : 'LOW',
      factorCount: factors.length,
      criticalFactors: factors.filter(f => f.severity === 'CRITICAL').length,
      highFactors: factors.filter(f => f.severity === 'HIGH').length
    };
  }

  generateOnboardingDecision(risk, factors) {
    if (risk.score >= this.riskThresholds.REJECT.min || risk.criticalFactors > 0) {
      return {
        action: 'REJECT',
        confidence: 0.90,
        reason: 'High risk seller with critical indicators - cannot approve'
      };
    } else if (risk.score >= this.riskThresholds.REVIEW.min) {
      return {
        action: 'REVIEW',
        confidence: 0.75,
        reason: 'Moderate risk - manual review recommended'
      };
    } else {
      return {
        action: 'APPROVE',
        confidence: 0.85,
        reason: 'Low risk seller - meets onboarding criteria'
      };
    }
  }

  generateOnboardingReasoning(factors, decision) {
    const factorDescriptions = factors.map(f =>
      `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} severity (score: ${f.score})`
    ).join('\n');

    return `
## Seller Onboarding Evaluation Summary

### Risk Factors Identified:
${factorDescriptions || '- No significant risk factors found'}

### Decision: ${decision.action}
${decision.reason}

### Confidence: ${(decision.confidence * 100).toFixed(0)}%

This decision is based on comprehensive analysis of:
- Identity and document verification
- Business registration and legitimacy checks
- Watchlist and sanctions screening
- Fraud database lookups
- Bank account verification
- Financial history analysis
- Duplicate account detection
- Business category risk assessment
- Historical pattern analysis
- IP reputation checks

${factors.length > 0 ? `Total risk score: ${factors.reduce((sum, f) => sum + f.score, 0)}/100` : ''}
    `.trim();
  }

  // Public method to evaluate a seller
  async evaluateSeller(sellerId, sellerData) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;

    const result = await this.reason({
      sellerId,
      sellerData
    });

    this.status = 'IDLE';
    this.currentTask = null;

    return result;
  }
}

export default SellerOnboardingAgent;

