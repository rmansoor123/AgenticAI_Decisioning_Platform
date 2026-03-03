/**
 * Agent Judge — Cross-agent decision evaluation system.
 *
 * After a high-stakes decision (REJECT/BLOCK), a different agent type
 * reviews the decision quality. This catches systematic errors that
 * self-reflection misses by providing independent evaluation.
 *
 * Judge selection uses cross-evaluation: seller onboarding decisions are
 * judged by fraud investigation agents and vice versa — preventing groupthink.
 *
 * Singleton: getAgentJudge()
 */

import { getLLMClient } from './llm-client.js';
import { parseLLMJson } from './prompt-templates.js';
import { getPromptRegistry } from './prompt-registry.js';

// Cross-evaluation map: which agent role judges which
const JUDGE_MAP = {
  'SELLER_ONBOARDING': 'FRAUD_INVESTIGATOR',
  'FRAUD_INVESTIGATOR': 'SELLER_ONBOARDING',
  'ALERT_TRIAGE': 'FRAUD_INVESTIGATOR',
  'RULE_OPTIMIZER': 'ALERT_TRIAGE',
  'PAYOUT_RISK': 'FRAUD_INVESTIGATOR',
  'LISTING_INTELLIGENCE': 'SELLER_ONBOARDING',
  'PROFILE_MUTATION': 'FRAUD_INVESTIGATOR',
  'RETURNS_ABUSE': 'FRAUD_INVESTIGATOR',
  'CROSS_DOMAIN_CORRELATION': 'FRAUD_INVESTIGATOR',
  'POLICY_EVOLUTION': 'RULE_OPTIMIZER',
};

const JUDGE_SYSTEM_PROMPT = `You are an independent judge evaluating the quality of another AI agent's fraud investigation decision.

Your role is to provide an unbiased second opinion. You are NOT the original decision-maker.

Evaluate the decision on these criteria:
1. **Evidence sufficiency**: Is there enough evidence to support the decision?
2. **Reasoning quality**: Does the reasoning logically follow from the evidence?
3. **Proportionality**: Is the decision proportional to the risk level?
4. **Citation grounding**: Are claims backed by specific tool results?
5. **Bias detection**: Are there signs of systematic bias (e.g., always rejecting certain categories)?

Respond ONLY with valid JSON:
{
  "quality": 0.0-1.0,
  "recommendation": "uphold" | "overturn" | "review",
  "issues": ["issue 1", "issue 2"],
  "reasoning": "Brief explanation of your evaluation"
}

Guidelines:
- "uphold": The decision is well-supported and proportional. Quality >= 0.7.
- "review": The decision has some issues but may still be correct. Recommend human review. Quality 0.4-0.7.
- "overturn": The decision is clearly wrong or unsupported. Quality < 0.4.
- Be skeptical but fair. Not every REJECT is wrong.
- Focus on evidence quality, not just the decision itself.`;

class AgentJudge {
  constructor() {
    this.llmClient = getLLMClient();
    this.promptRegistry = getPromptRegistry();
    this.stats = {
      totalEvaluations: 0,
      upheld: 0,
      overturned: 0,
      sentToReview: 0,
      fallbackCount: 0,
    };
  }

  /**
   * Evaluate a completed decision from another agent.
   *
   * @param {Object} thought - The full thought object from the agent's reasoning
   * @param {string} originalAgentRole - The role/ID of the agent that made the decision
   * @returns {Promise<{ quality: number, recommendation: string, issues: string[], reasoning: string }>}
   */
  async evaluate(thought, originalAgentRole) {
    this.stats.totalEvaluations++;

    const decision = thought.result?.recommendation?.action || thought.result?.decision;
    const evidence = thought.actions || [];
    const reasoning = thought.result?.reasoning || thought.result?.summary || '';
    const riskScore = thought.result?.riskScore || thought.result?.overallRisk?.score || 0;
    const confidence = thought.result?.confidence || 0;
    const citations = thought.result?.citations || [];
    const reflection = thought.reflection || {};

    // Try LLM-based evaluation
    if (this.llmClient?.enabled) {
      try {
        const judgePrompt = this._buildJudgePrompt(
          decision, evidence, reasoning, riskScore, confidence, citations, reflection, originalAgentRole
        );

        const result = await this.llmClient.complete(
          JUDGE_SYSTEM_PROMPT,
          judgePrompt,
          { temperature: 0.3, maxTokens: 1024 }
        );

        const parsed = parseLLMJson(result?.content, null);
        if (parsed?.recommendation) {
          const review = {
            quality: Math.max(0, Math.min(1, parsed.quality || 0.5)),
            recommendation: ['uphold', 'overturn', 'review'].includes(parsed.recommendation) ? parsed.recommendation : 'review',
            issues: Array.isArray(parsed.issues) ? parsed.issues : [],
            reasoning: parsed.reasoning || '',
            judgeAgent: this.selectJudge(originalAgentRole),
            llmEnhanced: true,
          };

          this._updateStats(review.recommendation);
          return review;
        }
      } catch (e) {
        // Fall through to rule-based evaluation
      }
    }

    // Rule-based fallback evaluation
    this.stats.fallbackCount++;
    return this._ruleBasedEvaluation(decision, evidence, riskScore, confidence, citations);
  }

  /**
   * Select which agent role should judge a given agent's decisions.
   * Cross-evaluation prevents groupthink.
   *
   * @param {string} originalAgentRole - The role of the original decision-maker
   * @returns {string} The judge agent role
   */
  selectJudge(originalAgentRole) {
    return JUDGE_MAP[originalAgentRole] || 'FRAUD_INVESTIGATOR';
  }

  /**
   * Get evaluation statistics.
   * @returns {Object}
   */
  getStats() {
    return {
      llmEnabled: this.llmClient?.enabled || false,
      ...this.stats,
    };
  }

  // ── Private methods ──

  _buildJudgePrompt(decision, evidence, reasoning, riskScore, confidence, citations, reflection, agentRole) {
    const evidenceSummary = evidence.map((a, i) => {
      const tool = a.action?.type || 'unknown';
      const success = a.result?.success !== false;
      const snippet = a.result?.data ? JSON.stringify(a.result.data).slice(0, 200) : 'no data';
      return `${i + 1}. [${tool}] ${success ? 'SUCCESS' : 'FAILED'}: ${snippet}`;
    }).join('\n');

    const citationSummary = citations.length > 0
      ? citations.map(c => `- "${c.claim}" [${c.toolName}] confidence: ${c.confidence}`).join('\n')
      : 'No citations provided.';

    const reflectionSummary = reflection.concerns?.length > 0
      ? `Concerns: ${reflection.concerns.join('; ')}`
      : 'No concerns raised by reflection.';

    return `Evaluate this ${agentRole} agent decision:

DECISION: ${decision}
RISK SCORE: ${riskScore}
CONFIDENCE: ${confidence}

REASONING:
${reasoning}

EVIDENCE (${evidence.length} tools executed):
${evidenceSummary}

CITATIONS:
${citationSummary}

SELF-REFLECTION:
${reflectionSummary}

Provide your independent evaluation.`;
  }

  _ruleBasedEvaluation(decision, evidence, riskScore, confidence, citations) {
    const issues = [];
    let quality = 0.7; // Start optimistic

    // Check evidence sufficiency
    const successfulTools = evidence.filter(a => a.result?.success !== false);
    if (successfulTools.length < 2) {
      issues.push('Insufficient evidence: fewer than 2 successful tool results');
      quality -= 0.2;
    }

    // Check citation grounding for REJECT/BLOCK
    if (['REJECT', 'BLOCK'].includes(decision)) {
      if (citations.length < 3) {
        issues.push(`High-stakes ${decision} with only ${citations.length} citation(s)`);
        quality -= 0.15;
      }
    }

    // Check proportionality
    if (decision === 'REJECT' && riskScore < 30) {
      issues.push(`REJECT decision with low risk score (${riskScore})`);
      quality -= 0.25;
    }
    if (decision === 'APPROVE' && riskScore > 80) {
      issues.push(`APPROVE decision with very high risk score (${riskScore})`);
      quality -= 0.2;
    }

    // Check confidence-evidence alignment
    if (confidence > 0.9 && successfulTools.length < 3) {
      issues.push('Very high confidence with limited evidence');
      quality -= 0.1;
    }

    quality = Math.max(0, Math.min(1, quality));

    let recommendation;
    if (quality >= 0.7) recommendation = 'uphold';
    else if (quality >= 0.4) recommendation = 'review';
    else recommendation = 'overturn';

    this._updateStats(recommendation);

    return {
      quality: Math.round(quality * 100) / 100,
      recommendation,
      issues,
      reasoning: issues.length > 0 ? `Rule-based evaluation found ${issues.length} issue(s)` : 'Decision appears well-supported',
      judgeAgent: 'rule-based',
      llmEnhanced: false,
    };
  }

  _updateStats(recommendation) {
    if (recommendation === 'uphold') this.stats.upheld++;
    else if (recommendation === 'overturn') this.stats.overturned++;
    else this.stats.sentToReview++;
  }
}

// Singleton
let instance = null;

export function getAgentJudge() {
  if (!instance) {
    instance = new AgentJudge();
  }
  return instance;
}

export default { AgentJudge, getAgentJudge };
