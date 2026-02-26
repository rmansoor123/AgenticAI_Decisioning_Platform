/**
 * Adversarial Tester — Generates challenging test scenarios for agent evaluation.
 *
 * Scenario types:
 * - Synthetic identity: fake-looking sellers with generated data
 * - Contradictory signals: mix of positive and negative indicators
 * - Boundary cases: risk scores near decision thresholds
 * - Evasion patterns: sophisticated fraud attempts
 *
 * Can run batch tests and produce vulnerability reports.
 */

import { v4 as uuidv4 } from 'uuid';

// ── Scenario Templates ─────────────────────────────────────────────────────

const SCENARIO_TEMPLATES = {
  'synthetic-identity': {
    description: 'Synthetic identity with fabricated credentials',
    expectedOutcome: 'REJECT',
    generate: () => ({
      sellerId: `ADV-SYN-${uuidv4().slice(0, 8)}`,
      businessName: `${['Global', 'Premier', 'Elite', 'Prime', 'Diamond'][Math.floor(Math.random() * 5)]} Trading LLC`,
      email: `seller${Math.random().toString(36).slice(2, 6)}@temp-mail.org`,
      country: 'US',
      ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      registrationAge: Math.floor(Math.random() * 30),
      category: 'ELECTRONICS',
      documents: { idVerified: false, addressVerified: false }
    })
  },

  'contradictory-signals': {
    description: 'Mix of strong positive and strong negative indicators',
    expectedOutcome: 'REVIEW',
    generate: () => ({
      sellerId: `ADV-MIX-${uuidv4().slice(0, 8)}`,
      businessName: 'Established Electronics Corp',
      email: 'verified@legitimate-domain.com',
      country: 'US',
      ipAddress: '8.8.8.8',
      registrationAge: 365,
      category: 'ELECTRONICS',
      riskScore: 55,
      documents: { idVerified: true, addressVerified: true },
      previousChargebacks: 3,
      fraudReports: 1,
      revenueHistory: 500000
    })
  },

  'boundary-case': {
    description: 'Risk score right at decision threshold',
    expectedOutcome: 'REVIEW',
    generate: () => ({
      sellerId: `ADV-BND-${uuidv4().slice(0, 8)}`,
      businessName: 'Borderline Seller Inc',
      email: 'seller@company.com',
      country: 'CA',
      category: 'FASHION',
      riskScore: 30 + Math.floor(Math.random() * 5),
      documents: { idVerified: true, addressVerified: false },
      registrationAge: 90
    })
  },

  'evasion-pattern': {
    description: 'Sophisticated fraud attempt mimicking legitimate seller',
    expectedOutcome: 'REJECT',
    generate: () => ({
      sellerId: `ADV-EVA-${uuidv4().slice(0, 8)}`,
      businessName: 'Quality Goods Marketplace',
      email: 'support@quality-goods-marketplace.com',
      country: 'UK',
      category: 'DIGITAL_GOODS',
      ipAddress: '185.220.101.1',
      documents: { idVerified: true, addressVerified: true },
      registrationAge: 180,
      bankAccount: { verified: true, country: 'NG' },
      shippingAddress: { country: 'CN' }
    })
  }
};

const TEMPLATE_KEYS = Object.keys(SCENARIO_TEMPLATES);

// ── AdversarialTester Class ────────────────────────────────────────────────

class AdversarialTester {
  /**
   * Generate adversarial test scenarios.
   * @param {string} agentType - Agent type to target (e.g., 'onboarding')
   * @param {number} count - Number of scenarios to generate (default 10)
   * @returns {Array<Object>} Array of scenario objects
   */
  generateScenarios(agentType, count = 10) {
    const scenarios = [];

    for (let i = 0; i < count; i++) {
      const key = TEMPLATE_KEYS[i % TEMPLATE_KEYS.length];
      const template = SCENARIO_TEMPLATES[key];

      scenarios.push({
        scenarioId: `ADVTEST-${Date.now().toString(36)}-${i}`,
        type: key,
        description: template.description,
        agentType,
        input: template.generate(),
        expectedOutcome: template.expectedOutcome,
        createdAt: new Date().toISOString()
      });
    }

    return scenarios;
  }

  /**
   * Run scenarios through an agent and collect results.
   * @param {Object} agent - Agent with async reason(input) method
   * @param {Array} scenarios - Array of scenario objects
   * @returns {Promise<Array>} Array of result objects
   */
  async runBatch(agent, scenarios) {
    const results = [];

    for (const scenario of scenarios) {
      try {
        const result = await agent.reason(scenario.input, { adversarialTest: true });
        const decision = result?.result?.recommendation?.action
          || result?.recommendation?.action
          || result?.decision
          || 'UNKNOWN';

        results.push({
          scenario,
          agentDecision: decision,
          confidence: result?.confidence || result?.result?.confidence || 0,
          riskScore: result?.riskScore || result?.result?.riskScore || 0,
          success: true,
          error: null
        });
      } catch (e) {
        results.push({
          scenario,
          agentDecision: null,
          confidence: 0,
          riskScore: 0,
          success: false,
          error: e.message
        });
      }
    }

    return results;
  }

  /**
   * Analyze batch results and produce a vulnerability report.
   * @param {Array} results - Array of result objects from runBatch
   * @returns {Object} Vulnerability report
   */
  analyzeResults(results) {
    let correct = 0;
    let falseNegatives = 0;
    let falsePositives = 0;
    let inconsistencies = 0;
    let errors = 0;
    const byType = {};

    for (const r of results) {
      const expected = r.scenario?.expectedOutcome;
      const actual = r.agentDecision;

      // Track errors
      if (!r.success || !actual) {
        errors++;
        // Still count in byType
        const type = r.scenario?.type || 'unknown';
        if (!byType[type]) byType[type] = { total: 0, correct: 0, incorrect: 0, errors: 0 };
        byType[type].total++;
        byType[type].errors++;
        continue;
      }

      // Check correctness
      const isCorrect = actual === expected;
      if (isCorrect) correct++;

      // False negatives: expected REJECT but got APPROVE
      if (expected === 'REJECT' && actual === 'APPROVE') falseNegatives++;

      // False positives: expected APPROVE/REVIEW but got REJECT
      if ((expected === 'APPROVE' || expected === 'REVIEW') && actual === 'REJECT') falsePositives++;

      // Inconsistency: any mismatch
      if (!isCorrect) inconsistencies++;

      // Group by type
      const type = r.scenario?.type || 'unknown';
      if (!byType[type]) byType[type] = { total: 0, correct: 0, incorrect: 0, errors: 0 };
      byType[type].total++;
      if (isCorrect) byType[type].correct++;
      else byType[type].incorrect++;
    }

    // Build vulnerabilities list
    const vulnerabilities = [];
    for (const [type, stats] of Object.entries(byType)) {
      if (stats.incorrect > 0 || stats.errors > 0) {
        const failRate = (stats.incorrect + stats.errors) / stats.total;
        vulnerabilities.push({
          type,
          severity: failRate > 0.5 ? 'high' : failRate > 0.25 ? 'medium' : 'low',
          failRate: Math.round(failRate * 10000) / 10000,
          description: SCENARIO_TEMPLATES[type]?.description || type,
          stats
        });
      }
    }

    return {
      total: results.length,
      correct,
      falseNegatives,
      falsePositives,
      inconsistencies,
      errors,
      accuracy: results.length > 0 ? Math.round((correct / results.length) * 10000) / 10000 : 0,
      byType,
      vulnerabilities,
      details: results.map(r => ({
        scenarioId: r.scenario?.scenarioId,
        type: r.scenario?.type,
        expected: r.scenario?.expectedOutcome,
        actual: r.agentDecision,
        correct: r.success && r.agentDecision === r.scenario?.expectedOutcome,
        error: r.error
      }))
    };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let instance = null;

export function getAdversarialTester() {
  if (!instance) instance = new AdversarialTester();
  return instance;
}
