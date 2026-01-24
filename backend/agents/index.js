/**
 * Agentic AI Module - Main Entry Point
 *
 * Initializes and exports all agents and the orchestrator
 */

import { orchestrator } from './core/agent-orchestrator.js';
import FraudInvestigationAgent from './specialized/fraud-investigation-agent.js';
import RuleOptimizationAgent from './specialized/rule-optimization-agent.js';
import AlertTriageAgent from './specialized/alert-triage-agent.js';

// Initialize agents
const fraudInvestigator = new FraudInvestigationAgent();
const ruleOptimizer = new RuleOptimizationAgent();
const alertTriage = new AlertTriageAgent();

// Register agents with orchestrator
orchestrator.registerAgent(fraudInvestigator);
orchestrator.registerAgent(ruleOptimizer);
orchestrator.registerAgent(alertTriage);

// Define standard workflows
orchestrator.defineWorkflow('fraud_investigation', {
  steps: [
    {
      name: 'triage_alert',
      agent: 'ALERT_TRIAGE',
      outputKey: 'triageResult'
    },
    {
      name: 'investigate_transaction',
      agent: 'FRAUD_INVESTIGATOR',
      inputMapper: (ctx) => ({
        transactionId: ctx.input.transactionId,
        alertType: ctx.triageResult?.prioritizedAlerts?.[0]?.alertType
      }),
      outputKey: 'investigation'
    },
    {
      name: 'check_rules',
      agent: 'RULE_OPTIMIZER',
      inputMapper: (ctx) => ({
        optimizationType: 'coverage',
        transactionContext: ctx.investigation
      }),
      outputKey: 'ruleAnalysis'
    }
  ],
  triggers: ['HIGH_RISK_ALERT', 'MANUAL']
});

orchestrator.defineWorkflow('continuous_optimization', {
  steps: [
    {
      name: 'analyze_rule_performance',
      agent: 'RULE_OPTIMIZER',
      inputMapper: () => ({ optimizationType: 'performance' }),
      outputKey: 'performanceAnalysis'
    },
    {
      name: 'triage_recommendations',
      agent: 'ALERT_TRIAGE',
      inputMapper: (ctx) => ({
        action: 'prioritize_recommendations',
        recommendations: ctx.performanceAnalysis?.result?.recommendations
      }),
      outputKey: 'prioritizedRecommendations'
    }
  ],
  triggers: ['SCHEDULED', 'MANUAL']
});

orchestrator.defineWorkflow('full_case_review', {
  steps: [
    {
      name: 'deep_investigation',
      agent: 'FRAUD_INVESTIGATOR',
      outputKey: 'investigation'
    },
    {
      name: 'rule_coverage_check',
      agent: 'RULE_OPTIMIZER',
      inputMapper: (ctx) => ({
        optimizationType: 'coverage',
        investigationContext: ctx.investigation
      }),
      outputKey: 'ruleAnalysis'
    },
    {
      name: 'generate_report',
      agent: 'FRAUD_INVESTIGATOR',
      inputMapper: (ctx) => ({
        action: 'generate_report',
        investigation: ctx.investigation,
        ruleAnalysis: ctx.ruleAnalysis
      }),
      outputKey: 'finalReport'
    }
  ],
  triggers: ['ESCALATION', 'MANUAL']
});

export {
  orchestrator,
  fraudInvestigator,
  ruleOptimizer,
  alertTriage
};

export default {
  orchestrator,
  agents: {
    fraudInvestigator,
    ruleOptimizer,
    alertTriage
  }
};
