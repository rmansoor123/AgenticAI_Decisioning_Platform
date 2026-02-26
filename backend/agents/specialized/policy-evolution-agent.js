/**
 * Policy Evolution Agent
 *
 * An autonomous agent that manages the full lifecycle of fraud detection rules:
 * - Detects coverage gaps by analyzing false negatives and false positives
 * - Clusters common fraud features to draft new candidate rules
 * - Simulates rules against historical transactions
 * - Deploys rules in shadow mode for safe evaluation
 * - Promotes proven rules to active status
 * - Deprecates underperforming rules
 *
 * Extends AutonomousAgent with a 30-minute scan interval and event-driven
 * acceleration when fraud outcomes arrive.
 */

import { AutonomousAgent } from '../core/autonomous-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { getRuleDrafter } from '../core/rule-drafter.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getConfidenceCalibrator } from '../core/confidence-calibrator.js';
import { getAdversarialTester } from '../core/adversarial-tester.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';

export class PolicyEvolutionAgent extends AutonomousAgent {
  constructor() {
    super({
      agentId: 'POLICY_EVOLUTION',
      name: 'Policy Evolution Agent',
      role: 'policy_analyst',
      capabilities: [
        'rule_creation',
        'gap_detection',
        'friction_reduction',
        'rule_lifecycle_management',
        'simulation_analysis'
      ],
      scanIntervalMs: 1800000, // 30 minutes
      eventAccelerationThreshold: 5,
      subscribedTopics: [
        'decision:made',
        'agent:outcome:received',
        'case:resolved',
        'rule:triggered'
      ]
    });

    // Initialize components
    this.ruleDrafter = getRuleDrafter();
    this.selfCorrection = createSelfCorrection(this.agentId);
    this.calibrator = getConfidenceCalibrator();
    this.adversarialTester = getAdversarialTester();
    this.knowledgeBase = getKnowledgeBase();

    // Rule lifecycle pipeline: ruleId -> stage metadata
    this.rulePipeline = new Map();

    // Register all 10 tools
    this._registerTools();
  }

  // ============================================================================
  // TOOL REGISTRATION
  // ============================================================================

  _registerTools() {
    // 1. get_false_negatives
    this.registerTool(
      'get_false_negatives',
      'Query recent transactions where fraud was missed (APPROVED but high risk)',
      async () => {
        try {
          const transactions = db_ops.getAll('transactions', 500, 0);
          const falseNegatives = transactions
            .filter(t => {
              const data = t.data || t;
              const decision = (data.decision || data.status || '').toUpperCase();
              const riskScore = data.riskScore || data.risk_score || 0;
              return (decision === 'APPROVED' || decision === 'APPROVE') && riskScore > 60;
            })
            .map(t => {
              const data = t.data || t;
              return {
                decisionId: data.transaction_id || data.transactionId || t.transaction_id,
                sellerId: data.seller_id || data.sellerId,
                features: {
                  amount: data.amount,
                  country: data.country,
                  category: data.category,
                  riskScore: data.riskScore || data.risk_score
                },
                outcome: 'false_negative'
              };
            });
          return { success: true, data: falseNegatives, count: falseNegatives.length };
        } catch (error) {
          return { success: false, error: error.message, data: [], count: 0 };
        }
      }
    );

    // 2. get_false_positives
    this.registerTool(
      'get_false_positives',
      'Query recent transactions that were incorrectly blocked (BLOCKED/REVIEW but low risk)',
      async () => {
        try {
          const transactions = db_ops.getAll('transactions', 500, 0);
          const falsePositives = transactions
            .filter(t => {
              const data = t.data || t;
              const decision = (data.decision || data.status || '').toUpperCase();
              const riskScore = data.riskScore || data.risk_score || 0;
              return (decision === 'BLOCKED' || decision === 'REVIEW') && riskScore < 30;
            })
            .map(t => {
              const data = t.data || t;
              return {
                decisionId: data.transaction_id || data.transactionId || t.transaction_id,
                sellerId: data.seller_id || data.sellerId,
                features: {
                  amount: data.amount,
                  country: data.country,
                  category: data.category,
                  riskScore: data.riskScore || data.risk_score
                },
                outcome: 'false_positive'
              };
            });
          return { success: true, data: falsePositives, count: falsePositives.length };
        } catch (error) {
          return { success: false, error: error.message, data: [], count: 0 };
        }
      }
    );

    // 3. get_rule_performance
    this.registerTool(
      'get_rule_performance',
      'Get all rules with performance stats sorted by false positive rate descending',
      async () => {
        try {
          const rules = db_ops.getAll('rules', 500, 0);
          const rulePerformance = rules
            .map(r => {
              const data = r.data || r;
              return {
                ruleId: data.ruleId || data.rule_id || r.rule_id,
                name: data.name,
                status: data.status,
                triggered: data.performance?.triggered || 0,
                truePositives: data.performance?.truePositives || 0,
                falsePositives: data.performance?.falsePositives || 0,
                catchRate: data.performance?.catchRate || 0,
                falsePositiveRate: data.performance?.falsePositiveRate || 0
              };
            })
            .sort((a, b) => b.falsePositiveRate - a.falsePositiveRate);
          return { success: true, data: rulePerformance, count: rulePerformance.length };
        } catch (error) {
          return { success: false, error: error.message, data: [], count: 0 };
        }
      }
    );

    // 4. cluster_features
    this.registerTool(
      'cluster_features',
      'Identify common feature patterns in a set of transactions',
      async (params) => {
        const { transactions } = params || {};
        const items = transactions || [];

        // Try LLM-based clustering if available
        if (this.llmClient?.enabled && items.length > 0) {
          try {
            const systemPrompt = 'You are a fraud pattern analyst. Cluster the given transactions by common features. Return ONLY valid JSON: {"clusters": [{"features": [{"field": "...", "values": [...], "operator": "GT|LT|IN|EQ"}], "count": N, "reason": "..."}]}';
            const userPrompt = `Cluster these transactions by common fraud patterns:\n${JSON.stringify(items.slice(0, 20))}`;
            const result = await this.llmClient.complete(systemPrompt, userPrompt);
            if (result?.content) {
              const jsonMatch = result.content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.clusters) {
                  return { success: true, data: parsed };
                }
              }
            }
          } catch (e) {
            // Fall through to hardcoded clustering
          }
        }

        // Hardcoded feature extraction fallback
        const clusters = [];

        // Group by amount ranges
        const amountGroups = { low: [], medium: [], high: [], veryHigh: [] };
        for (const item of items) {
          const features = item.features || item;
          const amount = features.amount || 0;
          if (amount > 5000) amountGroups.veryHigh.push(item);
          else if (amount > 1000) amountGroups.high.push(item);
          else if (amount > 200) amountGroups.medium.push(item);
          else amountGroups.low.push(item);
        }

        if (amountGroups.veryHigh.length >= 2) {
          clusters.push({
            features: [{ field: 'amount', values: [5000], operator: 'GT' }],
            count: amountGroups.veryHigh.length,
            reason: 'High-value transactions above $5000'
          });
        }

        // Group by country
        const countryMap = {};
        for (const item of items) {
          const features = item.features || item;
          const country = features.country;
          if (country) {
            if (!countryMap[country]) countryMap[country] = [];
            countryMap[country].push(item);
          }
        }
        for (const [country, group] of Object.entries(countryMap)) {
          if (group.length >= 2) {
            clusters.push({
              features: [{ field: 'country', values: [country], operator: 'IN' }],
              count: group.length,
              reason: `Transactions from ${country}`
            });
          }
        }

        // Group by category
        const categoryMap = {};
        for (const item of items) {
          const features = item.features || item;
          const category = features.category;
          if (category) {
            if (!categoryMap[category]) categoryMap[category] = [];
            categoryMap[category].push(item);
          }
        }
        for (const [category, group] of Object.entries(categoryMap)) {
          if (group.length >= 2) {
            clusters.push({
              features: [{ field: 'category', values: [category], operator: 'IN' }],
              count: group.length,
              reason: `Transactions in ${category} category`
            });
          }
        }

        // Group by account age ranges
        const ageGroups = { newAccount: [], established: [] };
        for (const item of items) {
          const features = item.features || item;
          const accountAge = features.accountAge || features.account_age || 0;
          if (accountAge < 30) ageGroups.newAccount.push(item);
          else ageGroups.established.push(item);
        }
        if (ageGroups.newAccount.length >= 2) {
          clusters.push({
            features: [{ field: 'accountAge', values: [30], operator: 'LT' }],
            count: ageGroups.newAccount.length,
            reason: 'New accounts less than 30 days old'
          });
        }

        // If no clusters found, create a generic one from first items
        if (clusters.length === 0 && items.length > 0) {
          clusters.push({
            features: [{ field: 'riskScore', values: [60], operator: 'GT' }],
            count: items.length,
            reason: 'High risk score transactions'
          });
        }

        return { success: true, data: { clusters } };
      }
    );

    // 5. draft_rule
    this.registerTool(
      'draft_rule',
      'Draft a new fraud rule from a feature cluster using the RuleDrafter',
      async (params) => {
        const { cluster } = params || {};
        if (!cluster) {
          return { success: false, error: 'Cluster is required' };
        }

        // Ensure the cluster has a checkpoint defaulting to 'transaction'
        const clusterWithDefaults = {
          checkpoint: 'transaction',
          severity: 'MEDIUM',
          action: 'REVIEW',
          ...cluster
        };

        const rule = this.ruleDrafter.draftRuleFromCluster(clusterWithDefaults);
        if (!rule) {
          return { success: false, error: 'Failed to draft rule from cluster' };
        }

        return { success: true, data: rule };
      }
    );

    // 6. simulate_rule
    this.registerTool(
      'simulate_rule',
      'Simulate a rule against recent transactions to estimate catch rate and FP rate',
      async (params) => {
        const { rule } = params || {};
        if (!rule) {
          return { success: false, error: 'Rule is required' };
        }

        try {
          const transactions = db_ops.getAll('transactions', 500, 0);
          let wouldTrigger = 0;
          let wouldBlock = 0;
          let truePositiveEstimate = 0;

          for (const t of transactions) {
            const data = t.data || t;
            const matches = this._evaluateRuleConditions(rule.conditions || [], data);
            if (matches) {
              wouldTrigger++;
              const riskScore = data.riskScore || data.risk_score || 0;
              if (riskScore > 50) {
                truePositiveEstimate++;
              }
              if (rule.action === 'BLOCK') {
                wouldBlock++;
              }
            }
          }

          const transactionsEvaluated = transactions.length;
          const estimatedCatchRate = transactionsEvaluated > 0
            ? wouldTrigger / transactionsEvaluated
            : 0;
          const estimatedFPRate = wouldTrigger > 0
            ? (wouldTrigger - truePositiveEstimate) / wouldTrigger
            : 0;

          return {
            success: true,
            data: {
              estimatedCatchRate: Math.round(estimatedCatchRate * 10000) / 10000,
              estimatedFPRate: Math.round(estimatedFPRate * 10000) / 10000,
              transactionsEvaluated,
              wouldTrigger,
              wouldBlock
            }
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            data: {
              estimatedCatchRate: 0,
              estimatedFPRate: 0,
              transactionsEvaluated: 0,
              wouldTrigger: 0,
              wouldBlock: 0
            }
          };
        }
      }
    );

    // 7. deploy_shadow
    this.registerTool(
      'deploy_shadow',
      'Deploy a rule in SHADOW mode for safe evaluation before promotion',
      async (params) => {
        const { rule } = params || {};
        if (!rule) {
          return { success: false, error: 'Rule is required' };
        }

        const ruleId = rule.ruleId || `RULE-PE-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        const shadowRule = {
          ...rule,
          ruleId,
          status: 'SHADOW',
          deployedAt: new Date().toISOString()
        };

        // Persist to database
        db_ops.insert('rules', 'rule_id', ruleId, shadowRule);

        // Track in pipeline
        this.rulePipeline.set(ruleId, {
          rule: shadowRule,
          stage: 'SHADOW',
          proposedAt: rule.createdAt || new Date().toISOString(),
          simulatedAt: new Date().toISOString(),
          shadowDeployedAt: new Date().toISOString(),
          promotedAt: null,
          rejectedAt: null,
          reason: null
        });

        return { success: true, data: { ruleId, status: 'SHADOW' } };
      }
    );

    // 8. check_shadow_results
    this.registerTool(
      'check_shadow_results',
      'Check if a shadow rule has met the minimum evaluation period and analyze performance',
      async (params) => {
        const { ruleId } = params || {};
        if (!ruleId) {
          return { success: false, error: 'ruleId is required' };
        }

        const pipelineEntry = this.rulePipeline.get(ruleId);
        if (!pipelineEntry) {
          return { success: false, error: `Rule ${ruleId} not found in pipeline` };
        }

        const deployedAt = new Date(pipelineEntry.shadowDeployedAt).getTime();
        const now = Date.now();
        const hoursInShadow = (now - deployedAt) / (1000 * 60 * 60);

        // Evaluate shadow performance against recent transactions
        let estimatedCatchRate = 0;
        let estimatedFPRate = 0;
        try {
          const transactions = db_ops.getAll('transactions', 200, 0);
          let triggers = 0;
          let truePositives = 0;

          for (const t of transactions) {
            const data = t.data || t;
            const matches = this._evaluateRuleConditions(
              pipelineEntry.rule.conditions || [],
              data
            );
            if (matches) {
              triggers++;
              const riskScore = data.riskScore || data.risk_score || 0;
              if (riskScore > 50) truePositives++;
            }
          }

          estimatedCatchRate = transactions.length > 0
            ? triggers / transactions.length
            : 0;
          estimatedFPRate = triggers > 0
            ? (triggers - truePositives) / triggers
            : 0;
        } catch (e) {
          // Continue with zero estimates
        }

        const readyForPromotion = hoursInShadow >= 24 && estimatedFPRate < 0.5;

        return {
          success: true,
          data: {
            ruleId,
            hoursInShadow: Math.round(hoursInShadow * 100) / 100,
            estimatedCatchRate: Math.round(estimatedCatchRate * 10000) / 10000,
            estimatedFPRate: Math.round(estimatedFPRate * 10000) / 10000,
            readyForPromotion
          }
        };
      }
    );

    // 9. promote_rule
    this.registerTool(
      'promote_rule',
      'Promote a shadow rule to ACTIVE status in the decision engine',
      async (params) => {
        const { ruleId } = params || {};
        if (!ruleId) {
          return { success: false, error: 'ruleId is required' };
        }

        const pipelineEntry = this.rulePipeline.get(ruleId);

        // Update rule in database
        const existing = db_ops.getById('rules', 'rule_id', ruleId);
        const ruleData = existing?.data || pipelineEntry?.rule || {};
        const updatedRule = {
          ...ruleData,
          status: 'ACTIVE',
          promotedAt: new Date().toISOString()
        };

        db_ops.update('rules', 'rule_id', ruleId, updatedRule);

        // Update pipeline tracking
        if (pipelineEntry) {
          pipelineEntry.stage = 'ACTIVE';
          pipelineEntry.promotedAt = new Date().toISOString();
          pipelineEntry.rule = updatedRule;
        }

        return {
          success: true,
          data: {
            ruleId,
            status: 'ACTIVE',
            promotedAt: updatedRule.promotedAt
          }
        };
      }
    );

    // 10. deprecate_rule
    this.registerTool(
      'deprecate_rule',
      'Deprecate an underperforming rule by setting it to DISABLED',
      async (params) => {
        const { ruleId, reason } = params || {};
        if (!ruleId) {
          return { success: false, error: 'ruleId is required' };
        }

        const deprecationReason = reason || 'Deprecated by Policy Evolution Agent';

        // Update rule in database
        const existing = db_ops.getById('rules', 'rule_id', ruleId);
        const ruleData = existing?.data || {};
        const updatedRule = {
          ...ruleData,
          status: 'DISABLED',
          deprecatedAt: new Date().toISOString(),
          deprecationReason
        };

        db_ops.update('rules', 'rule_id', ruleId, updatedRule);

        // Update pipeline tracking
        const pipelineEntry = this.rulePipeline.get(ruleId);
        if (pipelineEntry) {
          pipelineEntry.stage = 'DEPRECATED';
          pipelineEntry.rejectedAt = new Date().toISOString();
          pipelineEntry.reason = deprecationReason;
        }

        return {
          success: true,
          data: {
            ruleId,
            status: 'DEPRECATED',
            reason: deprecationReason
          }
        };
      }
    );
  }

  // ============================================================================
  // AUTONOMOUS SCAN INTERFACE
  // ============================================================================

  /**
   * Build input for the reasoning loop from accumulated events.
   * Categorizes events into false negatives, false positives, and rule events.
   */
  _buildScanInput() {
    const falseNegatives = [];
    const falsePositives = [];
    const ruleEvents = [];

    for (const event of this.eventBuffer) {
      const type = event.type || event.topic || '';
      const data = event.data || event;

      if (type.includes('outcome')) {
        // Outcome events - check if fraud was missed or legitimate was blocked
        const outcome = data.outcome || data.actualOutcome || '';
        const decision = (data.decision || data.originalDecision || '').toUpperCase();

        if (
          (outcome === 'fraud' || outcome === 'chargeback') &&
          (decision === 'APPROVE' || decision === 'APPROVED')
        ) {
          falseNegatives.push(event);
        } else if (
          (outcome === 'legitimate' || outcome === 'successful') &&
          (decision === 'BLOCK' || decision === 'BLOCKED' || decision === 'REJECT')
        ) {
          falsePositives.push(event);
        }
      } else if (type.includes('rule:triggered') || type.includes('rule')) {
        ruleEvents.push(event);
      }
    }

    return {
      falseNegatives,
      falsePositives,
      ruleEvents,
      totalEvents: this.eventBuffer.length,
      scanTimestamp: new Date().toISOString()
    };
  }

  /**
   * Post-cycle processing: manage proposed rules, shadow promotions,
   * and emit lifecycle events.
   */
  async _postCycle(result) {
    if (!result) return;

    // Process proposed rules from the cycle result
    const proposedRules = result.proposedRules || result.rules || [];
    for (const ruleProposal of proposedRules) {
      const rule = ruleProposal.rule || ruleProposal;
      const ruleId = rule.ruleId || `RULE-PE-${Date.now().toString(36)}`;

      // Add to pipeline as PROPOSED
      this.rulePipeline.set(ruleId, {
        rule,
        stage: 'PROPOSED',
        proposedAt: new Date().toISOString(),
        simulatedAt: null,
        shadowDeployedAt: null,
        promotedAt: null,
        rejectedAt: null,
        reason: null
      });

      // If simulation results are included and passed, deploy to shadow
      if (ruleProposal.simulationPassed || ruleProposal.estimatedFPRate < 0.5) {
        try {
          const deployResult = await this.tools.get('deploy_shadow').handler({ rule });
          if (deployResult.success) {
            this.rulePipeline.get(ruleId).stage = 'SHADOW';
          }
        } catch (e) {
          // Shadow deployment failed, rule stays in PROPOSED
        }
      }

      // Log to knowledge base
      try {
        this.knowledgeBase.addKnowledge('rules', [{
          _id: `PE-${ruleId}`,
          text: `Policy Evolution proposed rule ${ruleId}: ${rule.name || 'unnamed'}. Conditions: ${JSON.stringify(rule.conditions || [])}`,
          category: 'rules',
          ruleId,
          source: this.agentId,
          domain: 'policy-evolution'
        }]);
      } catch (e) {
        // Knowledge base write is non-critical
      }

      // Emit event for proposed rule
      this.emitEvent('policy-evolution:rule-proposed', {
        agentId: this.agentId,
        ruleId,
        rule,
        stage: this.rulePipeline.get(ruleId)?.stage || 'PROPOSED'
      });
    }

    // Check shadow rules ready for promotion (24+ hours)
    for (const [ruleId, entry] of this.rulePipeline) {
      if (entry.stage === 'SHADOW' && entry.shadowDeployedAt) {
        const hoursInShadow = (Date.now() - new Date(entry.shadowDeployedAt).getTime()) / (1000 * 60 * 60);
        if (hoursInShadow >= 24) {
          try {
            const checkResult = await this.tools.get('check_shadow_results').handler({ ruleId });
            if (checkResult.success && checkResult.data.readyForPromotion) {
              await this.tools.get('promote_rule').handler({ ruleId });
            }
          } catch (e) {
            // Shadow check failed, will retry next cycle
          }
        }
      }
    }

    // Emit cycle completion event
    this.emitEvent('policy-evolution:cycle-complete', {
      agentId: this.agentId,
      pipelineSize: this.rulePipeline.size,
      proposedCount: proposedRules.length,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Evaluate rule conditions against a transaction data object.
   * Returns true if all conditions match.
   */
  _evaluateRuleConditions(conditions, data) {
    if (!conditions || conditions.length === 0) return false;

    for (const condition of conditions) {
      const fieldValue = data[condition.field] ?? data.features?.[condition.field];
      if (fieldValue === undefined || fieldValue === null) return false;

      switch (condition.operator) {
        case 'GT':
          if (!(fieldValue > condition.value)) return false;
          break;
        case 'GTE':
          if (!(fieldValue >= condition.value)) return false;
          break;
        case 'LT':
          if (!(fieldValue < condition.value)) return false;
          break;
        case 'LTE':
          if (!(fieldValue <= condition.value)) return false;
          break;
        case 'EQ':
          if (fieldValue !== condition.value) return false;
          break;
        case 'IN':
          if (Array.isArray(condition.value)) {
            if (!condition.value.includes(fieldValue)) return false;
          } else {
            if (fieldValue !== condition.value) return false;
          }
          break;
        default:
          return false;
      }
    }

    return true;
  }
}

// ── Singleton ──
let instance = null;

export function getPolicyEvolutionAgent() {
  if (!instance) {
    instance = new PolicyEvolutionAgent();
  }
  return instance;
}

export default PolicyEvolutionAgent;
