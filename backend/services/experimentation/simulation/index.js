import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { generateTransaction } from '../../../shared/synthetic-data/generators.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Simulation results storage
const simulationResults = new Map();

// Run simulation
router.post('/run', (req, res) => {
  try {
    const {
      name,
      description,
      ruleChanges,
      thresholdChanges,
      sampleSize = 1000,
      useHistoricalData = true
    } = req.body;

    const simulationId = `SIM-${uuidv4().substring(0, 8).toUpperCase()}`;
    const startTime = Date.now();

    // Get current rules
    const currentRules = db_ops.getAll('rules', 1000, 0).map(r => r.data);
    const activeRules = currentRules.filter(r => r.status === 'ACTIVE');

    // Apply rule changes for simulation
    const simulatedRules = applyRuleChanges(activeRules, ruleChanges, thresholdChanges);

    // Get or generate transactions
    let transactions;
    if (useHistoricalData) {
      transactions = db_ops.getAll('transactions', sampleSize, 0).map(t => t.data);
    } else {
      transactions = Array.from({ length: sampleSize }, () => generateTransaction());
    }

    // Run simulation with both rule sets
    const baselineResults = runRuleSet(activeRules, transactions);
    const simulatedResults = runRuleSet(simulatedRules, transactions);

    // Calculate comparison metrics
    const comparison = calculateComparison(baselineResults, simulatedResults, transactions);

    const simulation = {
      simulationId,
      name: name || `Simulation ${simulationId}`,
      description,
      config: {
        ruleChanges,
        thresholdChanges,
        sampleSize,
        useHistoricalData
      },
      baseline: baselineResults.summary,
      simulated: simulatedResults.summary,
      comparison,
      impactAnalysis: generateImpactAnalysis(baselineResults, simulatedResults),
      executionTimeMs: Date.now() - startTime,
      status: 'COMPLETED',
      createdAt: new Date().toISOString()
    };

    simulationResults.set(simulationId, simulation);

    res.status(201).json({ success: true, data: simulation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get simulation by ID
router.get('/:simulationId', (req, res) => {
  try {
    const simulation = simulationResults.get(req.params.simulationId);
    if (!simulation) {
      return res.status(404).json({ success: false, error: 'Simulation not found' });
    }
    res.json({ success: true, data: simulation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all simulations
router.get('/', (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const simulations = Array.from(simulationResults.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, parseInt(limit));

    res.json({ success: true, data: simulations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Run threshold sensitivity analysis
router.post('/sensitivity', (req, res) => {
  try {
    const { ruleId, thresholdField, minValue, maxValue, steps = 10 } = req.body;

    const rule = db_ops.getById('rules', 'rule_id', ruleId);
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    const transactions = db_ops.getAll('transactions', 500, 0).map(t => t.data);
    const stepSize = (maxValue - minValue) / steps;
    const results = [];

    for (let i = 0; i <= steps; i++) {
      const thresholdValue = minValue + (i * stepSize);

      // Create modified rule
      const modifiedRule = {
        ...rule.data,
        conditions: rule.data.conditions.map(c =>
          c.field === thresholdField ? { ...c, value: thresholdValue } : c
        )
      };

      // Evaluate
      let triggered = 0;
      let wouldBlock = 0;
      let wouldReview = 0;

      transactions.forEach(tx => {
        const result = evaluateSingleRule(modifiedRule, tx);
        if (result.triggered) {
          triggered++;
          if (modifiedRule.action === 'BLOCK') wouldBlock++;
          if (modifiedRule.action === 'REVIEW') wouldReview++;
        }
      });

      results.push({
        threshold: thresholdValue,
        triggeredCount: triggered,
        triggeredRate: (triggered / transactions.length).toFixed(4),
        wouldBlock,
        wouldReview
      });
    }

    res.json({
      success: true,
      data: {
        ruleId,
        ruleName: rule.data.name,
        thresholdField,
        range: { min: minValue, max: maxValue },
        sampleSize: transactions.length,
        results
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Compare rule sets
router.post('/compare-rules', (req, res) => {
  try {
    const { ruleSetA, ruleSetB, sampleSize = 500 } = req.body;

    const transactions = db_ops.getAll('transactions', sampleSize, 0).map(t => t.data);

    const allRules = db_ops.getAll('rules', 1000, 0).map(r => r.data);

    const rulesA = allRules.filter(r => ruleSetA.includes(r.ruleId));
    const rulesB = allRules.filter(r => ruleSetB.includes(r.ruleId));

    const resultsA = runRuleSet(rulesA, transactions);
    const resultsB = runRuleSet(rulesB, transactions);

    res.json({
      success: true,
      data: {
        ruleSetA: {
          rules: ruleSetA,
          summary: resultsA.summary
        },
        ruleSetB: {
          rules: ruleSetB,
          summary: resultsB.summary
        },
        comparison: calculateComparison(resultsA, resultsB, transactions)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// What-if analysis
router.post('/what-if', (req, res) => {
  try {
    const { scenario, transactions: inputTransactions } = req.body;

    // Get transactions to analyze
    let transactions = inputTransactions;
    if (!transactions || transactions.length === 0) {
      transactions = db_ops.getAll('transactions', 100, 0).map(t => t.data);
    }

    const rules = db_ops.getAll('rules', 1000, 0)
      .map(r => r.data)
      .filter(r => r.status === 'ACTIVE');

    // Analyze each transaction
    const analysis = transactions.map(tx => {
      // Apply scenario modifications
      const modifiedTx = applyScenario(tx, scenario);

      // Evaluate with original
      const originalResult = evaluateTransaction(rules, tx);

      // Evaluate with modified
      const modifiedResult = evaluateTransaction(rules, modifiedTx);

      return {
        transactionId: tx.transactionId,
        original: {
          decision: originalResult.decision,
          rulesTriggered: originalResult.triggeredCount
        },
        modified: {
          decision: modifiedResult.decision,
          rulesTriggered: modifiedResult.triggeredCount
        },
        changed: originalResult.decision !== modifiedResult.decision
      };
    });

    const changedDecisions = analysis.filter(a => a.changed);

    res.json({
      success: true,
      data: {
        scenario,
        totalTransactions: transactions.length,
        changedDecisions: changedDecisions.length,
        changeRate: (changedDecisions.length / transactions.length).toFixed(4),
        details: analysis
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper functions
function applyRuleChanges(rules, ruleChanges, thresholdChanges) {
  return rules.map(rule => {
    let modified = { ...rule };

    // Apply specific rule changes
    if (ruleChanges && ruleChanges[rule.ruleId]) {
      modified = { ...modified, ...ruleChanges[rule.ruleId] };
    }

    // Apply threshold changes
    if (thresholdChanges) {
      modified.conditions = modified.conditions.map(condition => {
        const change = thresholdChanges.find(tc =>
          tc.ruleId === rule.ruleId && tc.field === condition.field
        );
        if (change) {
          return { ...condition, value: change.newValue };
        }
        return condition;
      });
    }

    return modified;
  });
}

function runRuleSet(rules, transactions) {
  const results = {
    decisions: { APPROVED: 0, BLOCKED: 0, REVIEW: 0, CHALLENGE: 0 },
    ruleHits: {},
    details: []
  };

  transactions.forEach(tx => {
    const txResult = evaluateTransaction(rules, tx);
    results.decisions[txResult.decision] = (results.decisions[txResult.decision] || 0) + 1;

    txResult.triggeredRules.forEach(ruleId => {
      results.ruleHits[ruleId] = (results.ruleHits[ruleId] || 0) + 1;
    });

    results.details.push({
      transactionId: tx.transactionId,
      decision: txResult.decision,
      triggeredRules: txResult.triggeredRules
    });
  });

  results.summary = {
    total: transactions.length,
    approvalRate: (results.decisions.APPROVED / transactions.length).toFixed(4),
    blockRate: (results.decisions.BLOCKED / transactions.length).toFixed(4),
    reviewRate: (results.decisions.REVIEW / transactions.length).toFixed(4),
    avgRulesTriggered: results.details.reduce((sum, d) => sum + d.triggeredRules.length, 0) / transactions.length
  };

  return results;
}

function evaluateTransaction(rules, transaction) {
  let decision = 'APPROVED';
  const triggeredRules = [];

  const actionPriority = { 'BLOCK': 5, 'REVIEW': 4, 'CHALLENGE': 3, 'FLAG': 2 };
  let highestPriority = 0;

  for (const rule of rules) {
    const result = evaluateSingleRule(rule, transaction);
    if (result.triggered) {
      triggeredRules.push(rule.ruleId);

      const priority = actionPriority[rule.action] || 0;
      if (priority > highestPriority) {
        highestPriority = priority;
        decision = mapActionToDecision(rule.action);
      }
    }
  }

  return { decision, triggeredRules, triggeredCount: triggeredRules.length };
}

function evaluateSingleRule(rule, transaction) {
  for (const condition of rule.conditions || []) {
    const value = getNestedValue(transaction, condition.field);
    if (!evaluateCondition(value, condition.operator, condition.value)) {
      return { triggered: false };
    }
  }
  return { triggered: true };
}

function evaluateCondition(actual, operator, expected) {
  switch (operator) {
    case 'GT': return actual > expected;
    case 'LT': return actual < expected;
    case 'GTE': return actual >= expected;
    case 'LTE': return actual <= expected;
    case 'EQ': return actual === expected;
    case 'NE': return actual !== expected;
    case 'IN': return Array.isArray(expected) && expected.includes(actual);
    default: return false;
  }
}

function mapActionToDecision(action) {
  const mapping = { 'BLOCK': 'BLOCKED', 'REVIEW': 'REVIEW', 'CHALLENGE': 'CHALLENGE' };
  return mapping[action] || 'APPROVED';
}

function calculateComparison(baseline, simulated, transactions) {
  return {
    approvalRateChange: (parseFloat(simulated.summary.approvalRate) - parseFloat(baseline.summary.approvalRate)).toFixed(4),
    blockRateChange: (parseFloat(simulated.summary.blockRate) - parseFloat(baseline.summary.blockRate)).toFixed(4),
    reviewRateChange: (parseFloat(simulated.summary.reviewRate) - parseFloat(baseline.summary.reviewRate)).toFixed(4),
    additionalBlocks: simulated.decisions.BLOCKED - baseline.decisions.BLOCKED,
    additionalReviews: simulated.decisions.REVIEW - baseline.decisions.REVIEW,
    decisionChanges: countDecisionChanges(baseline.details, simulated.details)
  };
}

function countDecisionChanges(baselineDetails, simulatedDetails) {
  let changes = 0;
  for (let i = 0; i < baselineDetails.length; i++) {
    if (baselineDetails[i].decision !== simulatedDetails[i].decision) {
      changes++;
    }
  }
  return changes;
}

function generateImpactAnalysis(baseline, simulated) {
  return {
    customerImpact: {
      additionalFriction: simulated.decisions.REVIEW - baseline.decisions.REVIEW,
      additionalBlocks: simulated.decisions.BLOCKED - baseline.decisions.BLOCKED
    },
    operationalImpact: {
      reviewQueueChange: ((simulated.summary.reviewRate - baseline.summary.reviewRate) * 100).toFixed(2) + '%',
      automationRate: ((simulated.summary.approvalRate / 1) * 100).toFixed(2) + '%'
    },
    riskImpact: {
      estimatedFraudPrevention: 'Requires historical fraud labels',
      falsePositiveChange: 'Requires ground truth data'
    }
  };
}

function applyScenario(transaction, scenario) {
  const modified = { ...transaction };

  if (scenario.amountMultiplier) {
    modified.amount = transaction.amount * scenario.amountMultiplier;
  }
  if (scenario.setRiskScore !== undefined) {
    modified.riskScore = scenario.setRiskScore;
  }
  if (scenario.setCountry) {
    modified.geoLocation = { ...modified.geoLocation, country: scenario.setCountry };
  }

  return modified;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

export default router;
