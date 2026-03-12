/**
 * Agentic AI Module - Main Entry Point
 *
 * Initializes and exports all agents and the orchestrator
 */

import { orchestrator } from './core/agent-orchestrator.js';
import { getAgentCoordinator } from './core/agent-coordinator.js';
import FraudInvestigationAgent from './specialized/fraud-investigation-agent.js';
import RuleOptimizationAgent from './specialized/rule-optimization-agent.js';
import AlertTriageAgent from './specialized/alert-triage-agent.js';
import SellerOnboardingAgent from './specialized/seller-onboarding-agent.js';
import { getEvalTracker } from './core/eval-tracker.js';
import { getATODetectionAgent } from './specialized/ato-detection-agent.js';
import { getShippingRiskAgent } from './specialized/shipping-risk-agent.js';
import { getAccountSetupAgent } from './specialized/account-setup-agent.js';
import { getItemSetupAgent } from './specialized/item-setup-agent.js';
import { getPricingRiskAgent } from './specialized/pricing-risk-agent.js';

// Initialize agents
const fraudInvestigator = new FraudInvestigationAgent();
const ruleOptimizer = new RuleOptimizationAgent();
const alertTriage = new AlertTriageAgent();
const sellerOnboarding = new SellerOnboardingAgent();
const evalTracker = getEvalTracker();
const atoDetection = getATODetectionAgent();
const shippingRisk = getShippingRiskAgent();
const accountSetup = getAccountSetupAgent();
const itemSetup = getItemSetupAgent();
const pricingRisk = getPricingRiskAgent();

// Register agents with orchestrator
orchestrator.registerAgent(fraudInvestigator);
orchestrator.registerAgent(ruleOptimizer);
orchestrator.registerAgent(alertTriage);
orchestrator.registerAgent(sellerOnboarding);
orchestrator.registerAgent(atoDetection);
orchestrator.registerAgent(shippingRisk);
orchestrator.registerAgent(accountSetup);
orchestrator.registerAgent(itemSetup);
orchestrator.registerAgent(pricingRisk);

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

// Initialize coordinator with orchestrator reference
const coordinator = getAgentCoordinator(orchestrator);

export {
  orchestrator,
  coordinator,
  fraudInvestigator,
  ruleOptimizer,
  alertTriage,
  sellerOnboarding,
  atoDetection,
  shippingRisk,
  accountSetup,
  itemSetup,
  pricingRisk,
  evalTracker
};

export default {
  orchestrator,
  coordinator,
  evalTracker,
  agents: {
    fraudInvestigator,
    ruleOptimizer,
    alertTriage,
    sellerOnboarding,
    atoDetection,
    shippingRisk,
    accountSetup,
    itemSetup,
    pricingRisk
  }
};
