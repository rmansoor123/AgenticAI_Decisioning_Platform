/**
 * Compliance & AML Agent
 *
 * Detects anti-money laundering violations including structuring (smurfing),
 * sanctions/OFAC matches, PEP screening, tax threshold splitting, and crypto layering.
 *
 * Decisions: APPROVE / REVIEW / BLOCK
 * Safe default on error: BLOCK
 * Domain weight: 0.12 (compliance)
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getThresholdManager } from '../core/threshold-manager.js';

export class ComplianceAgent extends BaseAgent {
  constructor() {
    super({
      agentId: 'COMPLIANCE_AML',
      name: 'Compliance & AML Agent',
      role: 'COMPLIANCE_AML',
      capabilities: [
        'structuring_detection',
        'sanctions_screening',
        'pep_screening',
        'tax_compliance',
        'crypto_monitoring'
      ]
    });

    this.riskThresholds = {
      APPROVE: { max: 30 },
      REVIEW: { min: 31, max: 65 },
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
    // Tool 1: Detect structuring (smurfing) — split transactions below $10K threshold
    this.registerTool('detect_structuring', 'Detect transaction splitting below $10K BSA reporting threshold (smurfing)', async (params) => {
      const { sellerId } = params;

      const allTxns = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId);

      // Look at rolling 24h windows for structuring
      const recentTxns = allTxns.filter(t =>
        (Date.now() - new Date(t.createdAt || t.timestamp)) < 24 * 60 * 60 * 1000
      );

      // Transactions just below $10K threshold ($8K-$9,999)
      const nearThreshold = recentTxns.filter(t => (t.amount || 0) >= 8000 && (t.amount || 0) < 10000);
      const total24h = recentTxns.reduce((s, t) => s + (t.amount || 0), 0);

      // Structuring: multiple transactions just below threshold that sum above it
      const structuringDetected = nearThreshold.length >= 2 && total24h >= 10000;
      // Severe structuring: many near-threshold transactions
      const severeStructuring = nearThreshold.length >= 4;

      // Check 7-day rolling for pattern persistence
      const weekTxns = allTxns.filter(t =>
        (Date.now() - new Date(t.createdAt || t.timestamp)) < 7 * 24 * 60 * 60 * 1000
      );
      const weekNearThreshold = weekTxns.filter(t => (t.amount || 0) >= 8000 && (t.amount || 0) < 10000);
      const persistentPattern = weekNearThreshold.length >= 5;

      let riskScore = 0;
      if (structuringDetected) riskScore += 40;
      if (severeStructuring) riskScore += 25;
      if (persistentPattern) riskScore += 20;
      if (total24h > 50000 && nearThreshold.length > 0) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          recentTransactions: recentTxns.length,
          nearThresholdCount: nearThreshold.length,
          total24h: Math.round(total24h * 100) / 100,
          structuringDetected,
          severeStructuring,
          persistentPattern,
          weekNearThreshold: weekNearThreshold.length,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 2: Check sanctions match — OFAC/SDN screen using seller data
    this.registerTool('check_sanctions_match', 'Screen seller against OFAC/SDN sanctions lists using name and country data', async (params) => {
      const { sellerId } = params;

      const seller = await db_ops.getById('sellers', 'seller_id', sellerId);
      const sellerData = seller?.data || {};

      // High-risk jurisdictions (FATF grey/black list approximation)
      const highRiskCountries = ['IR', 'KP', 'SY', 'MM', 'AF', 'YE', 'SO', 'SD', 'LY', 'IQ', 'VE', 'NI', 'CU'];
      const mediumRiskCountries = ['PK', 'NG', 'BD', 'KH', 'HT', 'UG', 'ML', 'PH', 'TZ', 'JM', 'GH'];

      const country = (sellerData.country || sellerData.billingCountry || '').toUpperCase();
      const isHighRiskCountry = highRiskCountries.includes(country);
      const isMediumRiskCountry = mediumRiskCountries.includes(country);

      // Simulate sanctions keyword screening against seller name/business
      const sanctionsKeywords = ['sanctioned', 'embargo', 'prohibited', 'restricted', 'blocked entity'];
      const sellerText = [sellerData.businessName, sellerData.name, sellerData.fullName].filter(Boolean).join(' ').toLowerCase();
      const keywordMatch = sanctionsKeywords.some(kw => sellerText.includes(kw));

      let riskScore = 0;
      if (keywordMatch) riskScore += 45;
      if (isHighRiskCountry) riskScore += 35;
      else if (isMediumRiskCountry) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          country,
          isHighRiskCountry,
          isMediumRiskCountry,
          keywordMatch,
          businessName: sellerData.businessName || 'N/A',
          screeningResult: keywordMatch ? 'POTENTIAL_MATCH' : isHighRiskCountry ? 'HIGH_RISK_JURISDICTION' : 'CLEAR',
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 40 ? 'CRITICAL' : riskScore >= 20 ? 'HIGH' : riskScore >= 10 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 3: Check PEP screen — politically exposed person / adverse media
    this.registerTool('check_pep_screen', 'Screen for politically exposed persons and adverse media indicators', async (params) => {
      const { sellerId } = params;

      const seller = await db_ops.getById('sellers', 'seller_id', sellerId);
      const sellerData = seller?.data || {};

      // PEP indicators from seller profile
      const pepIndicators = [];
      if (sellerData.isPep || sellerData.politicallyExposed) pepIndicators.push('SELF_DECLARED_PEP');
      if (sellerData.governmentRole) pepIndicators.push('GOVERNMENT_ROLE');

      // Check for high-value transactions typical of PEP laundering
      const allTxns = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId);

      const highValueTxns = allTxns.filter(t => (t.amount || 0) > 50000);
      const veryHighValue = allTxns.filter(t => (t.amount || 0) > 100000);

      if (highValueTxns.length >= 3) pepIndicators.push('FREQUENT_HIGH_VALUE');
      if (veryHighValue.length > 0) pepIndicators.push('VERY_HIGH_VALUE_TXN');

      // Check for shell company indicators
      const hasMinimalInfo = !sellerData.businessAddress && !sellerData.phone;
      if (hasMinimalInfo && highValueTxns.length > 0) pepIndicators.push('SHELL_COMPANY_INDICATOR');

      const pepDetected = pepIndicators.length >= 2;
      const adverseMedia = sellerData.adverseMedia || false;

      let riskScore = 0;
      if (pepDetected) riskScore += 35;
      if (adverseMedia) riskScore += 30;
      if (pepIndicators.includes('SELF_DECLARED_PEP')) riskScore += 20;
      if (pepIndicators.includes('SHELL_COMPANY_INDICATOR')) riskScore += 25;

      return {
        success: true,
        data: {
          sellerId,
          pepIndicators,
          pepDetected,
          adverseMedia,
          highValueTransactions: highValueTxns.length,
          screeningResult: pepDetected ? 'PEP_DETECTED' : adverseMedia ? 'ADVERSE_MEDIA' : 'CLEAR',
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 40 ? 'CRITICAL' : riskScore >= 20 ? 'HIGH' : riskScore >= 10 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 4: Detect tax threshold splitting — GMV split across accounts
    this.registerTool('detect_tax_threshold_splitting', 'Detect gross merchandise value split across multiple accounts to evade tax reporting', async (params) => {
      const { sellerId } = params;

      const seller = await db_ops.getById('sellers', 'seller_id', sellerId);
      const sellerData = seller?.data || {};

      const allTxns = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId);

      // Calculate annual GMV (1099-K threshold is $600 for 2024+)
      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      const yearTxns = allTxns.filter(t => new Date(t.createdAt || t.timestamp) >= yearStart);
      const annualGMV = yearTxns.reduce((s, t) => s + (t.amount || 0), 0);

      // Check for linked accounts (same email domain, phone, or address)
      const allSellers = (await db_ops.getAll('sellers', 5000, 0) || []).map(r => r.data);
      const linkedAccounts = allSellers.filter(s =>
        s.seller_id !== sellerId && (
          (sellerData.email && s.email && sellerData.email.split('@')[1] === s.email.split('@')[1] && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(sellerData.email.split('@')[1])) ||
          (sellerData.phone && s.phone && sellerData.phone === s.phone) ||
          (sellerData.taxId && s.taxId && sellerData.taxId === s.taxId)
        )
      );

      // Check linked account GMVs
      let combinedGMV = annualGMV;
      for (const linked of linkedAccounts) {
        const linkedTxns = (await db_ops.getAll('transactions', 10000, 0) || [])
          .map(r => r.data)
          .filter(r => r.sellerId === linked.seller_id && new Date(r.createdAt || r.timestamp) >= yearStart);
        combinedGMV += linkedTxns.reduce((s, t) => s + (t.amount || 0), 0);
      }

      // Each account under threshold but combined over
      const individualUnderThreshold = annualGMV < 600;
      const combinedOverThreshold = combinedGMV >= 600 && linkedAccounts.length > 0;
      const taxSplitting = individualUnderThreshold && combinedOverThreshold;

      let riskScore = 0;
      if (taxSplitting) riskScore += 40;
      if (linkedAccounts.length >= 3) riskScore += 25;
      if (combinedGMV > 20000 && linkedAccounts.length > 0) riskScore += 20;
      if (linkedAccounts.length >= 5) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          annualGMV: Math.round(annualGMV * 100) / 100,
          linkedAccounts: linkedAccounts.length,
          combinedGMV: Math.round(combinedGMV * 100) / 100,
          taxSplitting,
          individualUnderThreshold,
          combinedOverThreshold,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 5: Check crypto layering — crypto purchase + immediate withdrawal patterns
    this.registerTool('check_crypto_layering', 'Detect crypto purchase followed by rapid withdrawal indicating layering', async (params) => {
      const { sellerId } = params;

      const allTxns = (await db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId);

      const cryptoTxns = allTxns.filter(t =>
        (t.category || '').toLowerCase().includes('crypto') ||
        (t.paymentMethod || '').toLowerCase().includes('crypto') ||
        (t.itemType || '').toLowerCase().includes('crypto') ||
        (t.description || '').toLowerCase().match(/bitcoin|ethereum|usdt|tether|crypto|blockchain/)
      );

      const recentCrypto = cryptoTxns.filter(t =>
        (Date.now() - new Date(t.createdAt || t.timestamp)) < 7 * 24 * 60 * 60 * 1000
      );

      // Check payouts close to crypto purchases (layering: buy + immediate cashout)
      const allPayouts = (await db_ops.getAll('payouts', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId);

      const recentPayouts = allPayouts.filter(p =>
        (Date.now() - new Date(p.createdAt || p.timestamp)) < 7 * 24 * 60 * 60 * 1000
      );

      // Layering pattern: crypto transactions followed by rapid payouts
      const rapidCashout = recentCrypto.length > 0 && recentPayouts.length > 0;
      const highCryptoVolume = recentCrypto.length >= 5;
      const totalCryptoValue = recentCrypto.reduce((s, t) => s + (t.amount || 0), 0);
      const totalPayoutValue = recentPayouts.reduce((s, p) => s + (p.amount || 0), 0);
      const cashoutRatio = totalCryptoValue > 0 ? totalPayoutValue / totalCryptoValue : 0;

      // Suspicious if payout amount closely matches crypto amount
      const layeringDetected = rapidCashout && cashoutRatio > 0.7 && cashoutRatio < 1.3;

      let riskScore = 0;
      if (layeringDetected) riskScore += 40;
      if (highCryptoVolume) riskScore += 25;
      if (rapidCashout) riskScore += 20;
      if (totalCryptoValue > 50000) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          cryptoTransactions: recentCrypto.length,
          totalCryptoValue: Math.round(totalCryptoValue * 100) / 100,
          recentPayouts: recentPayouts.length,
          totalPayoutValue: Math.round(totalPayoutValue * 100) / 100,
          cashoutRatio: Math.round(cashoutRatio * 100) / 100,
          rapidCashout,
          layeringDetected,
          highCryptoVolume,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Agentic tools
    this.registerTool('search_knowledge_base', 'Search knowledge base for similar compliance/AML cases', async (params) => {
      const { query, sellerId } = params;
      const results = await this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve relevant compliance patterns from long-term memory', async (params) => {
      const { context } = params;
      const memories = await this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    const { sellerId, checkType } = input;
    this.addObservation(`Starting compliance/AML evaluation for seller: ${sellerId}, check: ${checkType || 'full'}`);

    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) {
      return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };
    }

    const riskIndicators = this.identifyInitialRiskIndicators(input);
    this.addHypothesis(
      `Compliance assessment needed — ${riskIndicators.length} initial indicators`,
      CONFIDENCE.POSSIBLE
    );

    return {
      understanding: `Evaluating compliance/AML risk for seller: ${sellerId}`,
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
      { type: 'detect_structuring', params: { sellerId: input.sellerId } },
      { type: 'check_sanctions_match', params: { sellerId: input.sellerId } },
      { type: 'check_pep_screen', params: { sellerId: input.sellerId } },
      { type: 'detect_tax_threshold_splitting', params: { sellerId: input.sellerId } },
      { type: 'check_crypto_layering', params: { sellerId: input.sellerId } },
      { type: 'search_knowledge_base', params: { query: `compliance aml ${input.checkType || ''} ${input.sellerId || ''}`, sellerId: input.sellerId } },
      { type: 'retrieve_memory', params: { context: `compliance aml ${input.checkType || ''}` } }
    ];

    return {
      goal: 'Complete compliance and AML evaluation',
      actions,
      fallback: { type: 'default_block', reason: 'incomplete_compliance_evaluation' }
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
    const needsHumanReview = !isAutonomous || decision.action === 'REVIEW';

    if (context.input?.sellerId) {
      this.selfCorrection.logPrediction(
        `CMP-${Date.now().toString(36).toUpperCase()}`,
        context.input.sellerId,
        decision.action,
        decision.confidence,
        this.generateReasoning(riskFactors, decision)
      );
    }

    this.knowledgeBase.addKnowledge('compliance', [{
      _id: `CMP-${Date.now()}`,
      text: `Compliance evaluation for seller ${context.input?.sellerId || 'unknown'}. Decision: ${decision.action}. Risk: ${overallRisk.score}. Factors: ${riskFactors.map(f => f.factor).join(', ')}`,
      category: 'compliance', sellerId: context.input?.sellerId, domain: 'compliance',
      outcome: decision.action === 'APPROVE' ? 'legitimate' : decision.action === 'BLOCK' ? 'fraud' : 'pending',
      riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true,
      evaluationId: `CMP-${Date.now().toString(36).toUpperCase()}`,
      summary: `Compliance evaluation complete. ${riskFactors.length} risk factors. ${isAutonomous ? 'Autonomous.' : 'Needs review.'}`,
      evidence, riskFactors, overallRisk, decision,
      confidence: decision.confidence, isAutonomous, needsHumanReview,
      escalationReason: needsHumanReview ? `Risk score ${overallRisk.score} requires compliance review` : null,
      selfCorrectionStats: this.selfCorrection.getAccuracy(),
      reasoning: this.generateReasoning(riskFactors, decision)
    };
  }

  identifyInitialRiskIndicators(input) {
    const indicators = [];
    if (input.country && ['IR', 'KP', 'SY', 'CU'].includes(input.country.toUpperCase())) indicators.push('SANCTIONED_COUNTRY');
    if (input.isPep || input.politicallyExposed) indicators.push('PEP_FLAG');
    if ((input.amount || 0) >= 8000 && (input.amount || 0) < 10000) indicators.push('NEAR_THRESHOLD_AMOUNT');
    if ((input.category || '').toLowerCase().includes('crypto')) indicators.push('CRYPTO_TRANSACTION');
    if (input.linkedAccounts && input.linkedAccounts > 2) indicators.push('MULTIPLE_LINKED_ACCOUNTS');
    return indicators;
  }

  analyzeEvidence(evidence) {
    const factors = [];

    evidence.forEach(e => {
      if (!e.success || !e.data) return;

      if (e.source === 'detect_structuring') {
        if (e.data.severeStructuring) factors.push({ factor: 'SEVERE_STRUCTURING', severity: 'CRITICAL', score: 45 });
        else if (e.data.structuringDetected) factors.push({ factor: 'STRUCTURING_DETECTED', severity: 'HIGH', score: 35 });
        if (e.data.persistentPattern) factors.push({ factor: 'PERSISTENT_STRUCTURING', severity: 'HIGH', score: 20 });
      }

      if (e.source === 'check_sanctions_match') {
        if (e.data.keywordMatch) factors.push({ factor: 'SANCTIONS_KEYWORD_MATCH', severity: 'CRITICAL', score: 45 });
        if (e.data.isHighRiskCountry) factors.push({ factor: 'HIGH_RISK_JURISDICTION', severity: 'CRITICAL', score: 35 });
        else if (e.data.isMediumRiskCountry) factors.push({ factor: 'MEDIUM_RISK_JURISDICTION', severity: 'MEDIUM', score: 15 });
      }

      if (e.source === 'check_pep_screen') {
        if (e.data.pepDetected) factors.push({ factor: 'PEP_DETECTED', severity: 'HIGH', score: 35 });
        if (e.data.adverseMedia) factors.push({ factor: 'ADVERSE_MEDIA', severity: 'HIGH', score: 30 });
        if (e.data.pepIndicators?.includes('SHELL_COMPANY_INDICATOR')) factors.push({ factor: 'SHELL_COMPANY', severity: 'HIGH', score: 25 });
      }

      if (e.source === 'detect_tax_threshold_splitting') {
        if (e.data.taxSplitting) factors.push({ factor: 'TAX_THRESHOLD_SPLITTING', severity: 'CRITICAL', score: 40 });
        if (e.data.linkedAccounts >= 3) factors.push({ factor: 'MULTIPLE_LINKED_ACCOUNTS', severity: 'HIGH', score: 25 });
      }

      if (e.source === 'check_crypto_layering') {
        if (e.data.layeringDetected) factors.push({ factor: 'CRYPTO_LAYERING', severity: 'CRITICAL', score: 40 });
        if (e.data.highCryptoVolume) factors.push({ factor: 'HIGH_CRYPTO_VOLUME', severity: 'HIGH', score: 25 });
        if (e.data.rapidCashout) factors.push({ factor: 'RAPID_CRYPTO_CASHOUT', severity: 'MEDIUM', score: 20 });
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
          const prompt = registry.getPromptById('compliance-aml-decision');
          decisionContent = prompt?.content || '';
        } catch { /* fallback */ }
        const systemPrompt = decisionContent || 'You are the compliance/AML authority. Return ONLY valid JSON: {"action":"APPROVE|REVIEW|BLOCK", "confidence":0.0-1.0, "reason":"..."}';
        const userPrompt = `Risk score: ${risk.score}/100, Critical: ${risk.criticalFactors}, High: ${risk.highFactors}\nFactors: ${factors.map(f => `${f.factor} (${f.severity}, score:${f.score})`).join(', ')}`;
        const result = await this.llmClient.complete(systemPrompt, userPrompt);
        if (result?.content) {
          const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (['APPROVE', 'REVIEW', 'BLOCK'].includes(parsed.action)) {
              return { ...parsed, llmEnhanced: true };
            }
          }
        }
      } catch (e) { /* fallback */ }
    }

    const thresholds = this.autonomyThresholds;
    if (risk.score >= (thresholds.AUTO_REJECT_MIN_RISK || 66) || risk.criticalFactors > 0) {
      return { action: 'BLOCK', confidence: 0.90, reason: 'Critical compliance violations detected — blocking activity' };
    } else if (risk.score >= (thresholds.AUTO_APPROVE_MAX_RISK || 31)) {
      return { action: 'REVIEW', confidence: 0.75, reason: 'Compliance concerns identified — manual review required' };
    }
    return { action: 'APPROVE', confidence: 0.85, reason: 'No compliance issues detected — activity permitted' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## Compliance & AML Summary\n\n### Risk Factors:\n${desc || '- No significant risk factors'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`.trim();
  }

  async evaluateCompliance(sellerId, checkData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, ...checkData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getComplianceAgent() {
  if (!instance) instance = new ComplianceAgent();
  return instance;
}

export default ComplianceAgent;
