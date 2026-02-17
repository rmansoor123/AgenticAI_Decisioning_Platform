/**
 * Rule Optimization Agent
 *
 * An autonomous agent that continuously optimizes fraud detection rules by:
 * - Analyzing rule performance metrics
 * - Identifying underperforming or redundant rules
 * - Suggesting threshold adjustments
 * - Proposing new rules based on patterns
 * - A/B testing rule changes
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';

export class RuleOptimizationAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Rule Optimization Agent',
      role: 'RULE_OPTIMIZER',
      capabilities: [
        'rule_analysis',
        'performance_monitoring',
        'threshold_optimization',
        'rule_generation',
        'ab_test_design',
        'impact_simulation'
      ]
    });

    this.optimizationGoals = {
      targetCatchRate: 0.98,
      maxFalsePositiveRate: 0.005,
      targetLatency: 50 // ms
    };

    this.registerTools();
  }

  registerTools() {
    // Tool: Get all rules with performance metrics
    this.registerTool('get_rules_performance', 'Retrieve rules with their performance metrics', async (params) => {
      const rules = db_ops.getAll('rules', 100, 0);
      return {
        success: true,
        data: rules.map(r => ({
          ...r.data,
          performance: {
            triggerRate: Math.random() * 0.1,
            truePositiveRate: 0.7 + Math.random() * 0.3,
            falsePositiveRate: Math.random() * 0.05,
            avgLatency: Math.floor(Math.random() * 30) + 5,
            lastTriggered: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
          }
        }))
      };
    });

    // Tool: Analyze rule overlap
    this.registerTool('analyze_rule_overlap', 'Find redundant or overlapping rules', async (params) => {
      // Simulated overlap analysis
      return {
        success: true,
        data: {
          overlappingPairs: [
            { rule1: 'RULE-001', rule2: 'RULE-015', overlapPercent: 78 },
            { rule1: 'RULE-008', rule2: 'RULE-023', overlapPercent: 65 }
          ],
          redundantRules: ['RULE-042'],
          consolidationOpportunities: 2
        }
      };
    });

    // Tool: Simulate threshold change
    this.registerTool('simulate_threshold', 'Simulate impact of threshold changes', async (params) => {
      const { ruleId, currentThreshold, newThreshold } = params;
      const improvement = (newThreshold - currentThreshold) / currentThreshold;
      return {
        success: true,
        data: {
          ruleId,
          currentThreshold,
          newThreshold,
          projectedImpact: {
            catchRateChange: (Math.random() * 0.02 * Math.sign(improvement)).toFixed(4),
            falsePositiveChange: (Math.random() * 0.01 * -Math.sign(improvement)).toFixed(4),
            transactionsAffected: Math.floor(Math.random() * 10000) + 1000
          },
          confidence: 0.85 + Math.random() * 0.1
        }
      };
    });

    // Tool: Analyze fraud patterns
    this.registerTool('analyze_fraud_patterns', 'Discover patterns in recent fraud cases', async (params) => {
      return {
        success: true,
        data: {
          emergingPatterns: [
            {
              pattern: 'High velocity + New device + Gift card purchase',
              frequency: 47,
              avgAmount: 2300,
              confidence: 0.89
            },
            {
              pattern: 'Cross-border + Night time + Multiple items',
              frequency: 23,
              avgAmount: 4100,
              confidence: 0.76
            }
          ],
          uncoveredFraud: {
            count: 12,
            totalAmount: 34500,
            commonCharacteristics: ['new_account', 'high_velocity']
          }
        }
      };
    });

    // Tool: Generate rule suggestion
    this.registerTool('generate_rule', 'Create a new rule based on pattern', async (params) => {
      const { pattern, targetAction } = params;
      return {
        success: true,
        data: {
          suggestedRule: {
            name: `Auto-generated: ${pattern.substring(0, 30)}...`,
            conditions: [
              { field: 'velocity_1h', operator: 'GT', value: 5 },
              { field: 'device.isNew', operator: 'EQ', value: true },
              { field: 'category', operator: 'IN', value: ['gift_cards', 'electronics'] }
            ],
            action: targetAction || 'REVIEW',
            estimatedImpact: {
              additionalFraudCaught: Math.floor(Math.random() * 50) + 10,
              additionalFalsePositives: Math.floor(Math.random() * 20) + 5
            }
          }
        }
      };
    });

    // Tool: Design A/B test
    this.registerTool('design_ab_test', 'Create an A/B test for rule change', async (params) => {
      const { ruleId, change } = params;
      return {
        success: true,
        data: {
          testId: `TEST-${Date.now().toString(36).toUpperCase()}`,
          ruleId,
          change,
          recommendedTraffic: 10,
          recommendedDuration: '7 days',
          minimumSampleSize: 5000,
          primaryMetric: 'fraud_catch_rate',
          secondaryMetrics: ['false_positive_rate', 'customer_friction']
        }
      };
    });
  }

  async think(input, context) {
    const { optimizationType } = input;

    let focus = [];
    if (optimizationType === 'performance') {
      focus = ['get_rules_performance', 'analyze_rule_overlap'];
    } else if (optimizationType === 'coverage') {
      focus = ['analyze_fraud_patterns', 'generate_rule'];
    } else if (optimizationType === 'threshold') {
      focus = ['get_rules_performance', 'simulate_threshold'];
    } else {
      // Full optimization
      focus = ['get_rules_performance', 'analyze_rule_overlap', 'analyze_fraud_patterns'];
    }

    return {
      understanding: `Performing ${optimizationType || 'full'} rule optimization`,
      focus,
      goals: this.optimizationGoals,
      relevantMemory: this.retrieveRelevantMemory(input)
    };
  }

  async plan(analysis, context) {
    const actions = analysis.focus.map(tool => ({
      type: tool,
      params: context.input
    }));

    return {
      goal: 'Optimize rule performance',
      actions
    };
  }

  async observe(actions, context) {
    const insights = [];
    const recommendations = [];

    // Try LLM-enhanced synthesis of rule optimization insights
    if (this.llmClient?.enabled) {
      try {
        const actionsData = actions.map(a => ({
          type: a.action.type,
          data: a.result?.data ? JSON.stringify(a.result.data).slice(0, 500) : null
        }));
        const systemPrompt = 'You are a rule optimization agent. Synthesize the data into insights and recommendations. Return ONLY valid JSON: {"insights":[{"type":"string","description":"string"}], "recommendations":[{"type":"string","priority":"HIGH|MEDIUM|LOW","description":"string"}]}';
        const userPrompt = `Optimization data:\n${JSON.stringify(actionsData)}`;

        const result = await this.llmClient.complete(systemPrompt, userPrompt);
        if (result?.content) {
          const jsonMatch = result.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.insights) parsed.insights.forEach(i => insights.push({ ...i, llmEnhanced: true }));
            if (parsed.recommendations) parsed.recommendations.forEach(r => recommendations.push({ ...r, llmEnhanced: true }));
          }
        }
      } catch (e) {
        // Fall through to hardcoded analysis below which will add to insights/recommendations
      }
    }

    actions.forEach(a => {
      if (a.action.type === 'get_rules_performance' && a.result?.data) {
        // Analyze underperforming rules
        const underperforming = a.result.data.filter(r =>
          r.performance?.falsePositiveRate > 0.03 || r.performance?.truePositiveRate < 0.8
        );
        if (underperforming.length > 0) {
          insights.push({
            type: 'UNDERPERFORMING_RULES',
            count: underperforming.length,
            rules: underperforming.map(r => r.ruleId)
          });
          recommendations.push({
            type: 'THRESHOLD_ADJUSTMENT',
            priority: 'HIGH',
            description: `${underperforming.length} rules need threshold tuning`,
            affectedRules: underperforming.map(r => r.ruleId)
          });
        }

        // Find inactive rules
        const inactive = a.result.data.filter(r => {
          const lastTriggered = new Date(r.performance?.lastTriggered);
          return (Date.now() - lastTriggered.getTime()) > 30 * 24 * 60 * 60 * 1000;
        });
        if (inactive.length > 0) {
          insights.push({
            type: 'INACTIVE_RULES',
            count: inactive.length,
            rules: inactive.map(r => r.ruleId)
          });
        }
      }

      if (a.action.type === 'analyze_rule_overlap' && a.result?.data) {
        if (a.result.data.overlappingPairs?.length > 0) {
          insights.push({
            type: 'RULE_OVERLAP',
            pairs: a.result.data.overlappingPairs
          });
          recommendations.push({
            type: 'CONSOLIDATE_RULES',
            priority: 'MEDIUM',
            description: 'Consider consolidating overlapping rules',
            details: a.result.data.overlappingPairs
          });
        }
      }

      if (a.action.type === 'analyze_fraud_patterns' && a.result?.data) {
        if (a.result.data.emergingPatterns?.length > 0) {
          insights.push({
            type: 'EMERGING_PATTERNS',
            patterns: a.result.data.emergingPatterns
          });
          a.result.data.emergingPatterns.forEach(p => {
            recommendations.push({
              type: 'NEW_RULE',
              priority: 'HIGH',
              description: `Create rule for pattern: ${p.pattern}`,
              estimatedCatch: p.frequency,
              confidence: p.confidence
            });
          });
        }
      }
    });

    const overallHealth = this.calculateRuleHealth(actions);

    return {
      success: true,
      optimizationId: `OPT-${Date.now().toString(36).toUpperCase()}`,
      summary: `Found ${insights.length} insights and ${recommendations.length} recommendations`,
      insights,
      recommendations: recommendations.sort((a, b) =>
        a.priority === 'HIGH' ? -1 : b.priority === 'HIGH' ? 1 : 0
      ),
      ruleHealth: overallHealth,
      reasoning: this.generateOptimizationReport(insights, recommendations, overallHealth)
    };
  }

  calculateRuleHealth(actions) {
    const perfAction = actions.find(a => a.action.type === 'get_rules_performance');
    if (!perfAction?.result?.data) {
      return { score: 0, status: 'UNKNOWN' };
    }

    const rules = perfAction.result.data;
    const avgTruePositive = rules.reduce((sum, r) => sum + (r.performance?.truePositiveRate || 0), 0) / rules.length;
    const avgFalsePositive = rules.reduce((sum, r) => sum + (r.performance?.falsePositiveRate || 0), 0) / rules.length;

    const score = Math.round(
      (avgTruePositive * 50) + ((1 - avgFalsePositive) * 50)
    );

    return {
      score,
      status: score > 80 ? 'HEALTHY' : score > 60 ? 'NEEDS_ATTENTION' : 'CRITICAL',
      avgTruePositiveRate: avgTruePositive.toFixed(3),
      avgFalsePositiveRate: avgFalsePositive.toFixed(3),
      totalRules: rules.length
    };
  }

  generateOptimizationReport(insights, recommendations, health) {
    return `
## Rule Optimization Report

### Overall Health: ${health.status} (Score: ${health.score}/100)
- True Positive Rate: ${(health.avgTruePositiveRate * 100).toFixed(1)}%
- False Positive Rate: ${(health.avgFalsePositiveRate * 100).toFixed(2)}%
- Total Active Rules: ${health.totalRules}

### Key Insights:
${insights.map(i => `- ${i.type}: ${i.count || i.patterns?.length || i.pairs?.length} items`).join('\n')}

### Recommendations (${recommendations.length}):
${recommendations.slice(0, 5).map((r, i) => `${i + 1}. [${r.priority}] ${r.description}`).join('\n')}

### Suggested Actions:
1. Review and tune underperforming rules
2. Consider consolidating overlapping rules
3. Create new rules for emerging patterns
4. Set up A/B tests for significant changes
    `.trim();
  }

  async optimize(type = 'full') {
    this.status = 'OPTIMIZING';
    const result = await this.reason({ optimizationType: type });
    this.status = 'IDLE';
    return result;
  }
}

export default RuleOptimizationAgent;
