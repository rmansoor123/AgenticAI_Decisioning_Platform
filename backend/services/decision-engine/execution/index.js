import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Decision history
const decisionHistory = [];

// Execute decision for a transaction
router.post('/evaluate', (req, res) => {
  try {
    const { transaction, context, dryRun = false } = req.body;
    const startTime = Date.now();

    // Get all active rules sorted by priority
    const rules = db_ops.getAll('rules', 1000, 0)
      .map(r => r.data)
      .filter(r => r.status === 'ACTIVE' || (dryRun && r.status === 'SHADOW'))
      .sort((a, b) => (a.priority || 100) - (b.priority || 100));

    // Evaluate all rules
    const ruleResults = [];
    let finalDecision = 'APPROVE';
    let finalAction = null;
    const triggeredRules = [];

    for (const rule of rules) {
      const result = evaluateRule(rule, transaction, context);
      ruleResults.push({
        ruleId: rule.ruleId,
        ruleName: rule.name,
        priority: rule.priority,
        status: rule.status,
        triggered: result.triggered,
        action: result.action,
        conditions: result.evaluatedConditions
      });

      if (result.triggered) {
        triggeredRules.push(rule);

        // Apply action hierarchy: BLOCK > REVIEW > CHALLENGE > FLAG > ALLOW
        const actionPriority = { 'BLOCK': 5, 'REVIEW': 4, 'CHALLENGE': 3, 'FLAG': 2, 'ALLOW_WITH_LIMIT': 1 };

        if (!finalAction || (actionPriority[result.action] || 0) > (actionPriority[finalAction] || 0)) {
          finalAction = result.action;
          finalDecision = mapActionToDecision(result.action);
        }
      }
    }

    // If no rules triggered, default to approve
    if (!finalAction) {
      finalDecision = 'APPROVED';
      finalAction = 'ALLOW';
    }

    const latencyMs = Date.now() - startTime;

    const decision = {
      decisionId: `DEC-${uuidv4().substring(0, 10).toUpperCase()}`,
      transactionId: transaction.transactionId,
      decision: finalDecision,
      action: finalAction,
      riskScore: calculateRiskScore(triggeredRules, transaction),
      rulesEvaluated: rules.length,
      rulesTriggered: triggeredRules.length,
      triggeredRuleIds: triggeredRules.map(r => r.ruleId),
      ruleResults: dryRun ? ruleResults : undefined, // Only include details in dry run
      latencyMs,
      timestamp: new Date().toISOString(),
      dryRun
    };

    // Store decision if not dry run
    if (!dryRun) {
      decisionHistory.unshift(decision);
      if (decisionHistory.length > 10000) decisionHistory.pop();
    }

    res.json({ success: true, data: decision });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Batch evaluation
router.post('/evaluate/batch', (req, res) => {
  try {
    const { transactions, dryRun = false } = req.body;
    const startTime = Date.now();

    const rules = db_ops.getAll('rules', 1000, 0)
      .map(r => r.data)
      .filter(r => r.status === 'ACTIVE')
      .sort((a, b) => (a.priority || 100) - (b.priority || 100));

    const results = transactions.map(tx => {
      const txStartTime = Date.now();
      let finalDecision = 'APPROVED';
      let finalAction = 'ALLOW';
      const triggeredRules = [];

      for (const rule of rules) {
        const result = evaluateRule(rule, tx, {});
        if (result.triggered) {
          triggeredRules.push(rule);
          const actionPriority = { 'BLOCK': 5, 'REVIEW': 4, 'CHALLENGE': 3, 'FLAG': 2 };
          if ((actionPriority[result.action] || 0) > (actionPriority[finalAction] || 0)) {
            finalAction = result.action;
            finalDecision = mapActionToDecision(result.action);
          }
        }
      }

      return {
        transactionId: tx.transactionId,
        decision: finalDecision,
        action: finalAction,
        rulesTriggered: triggeredRules.length,
        latencyMs: Date.now() - txStartTime
      };
    });

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: results.length,
          approved: results.filter(r => r.decision === 'APPROVED').length,
          blocked: results.filter(r => r.decision === 'BLOCKED').length,
          review: results.filter(r => r.decision === 'REVIEW').length,
          totalLatencyMs: Date.now() - startTime,
          avgLatencyMs: (Date.now() - startTime) / results.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get decision by ID
router.get('/decisions/:decisionId', (req, res) => {
  try {
    const decision = decisionHistory.find(d => d.decisionId === req.params.decisionId);
    if (!decision) {
      return res.status(404).json({ success: false, error: 'Decision not found' });
    }
    res.json({ success: true, data: decision });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get decision history
router.get('/history', (req, res) => {
  try {
    const { limit = 50, decision, transactionId } = req.query;

    let history = decisionHistory;

    if (decision) history = history.filter(d => d.decision === decision);
    if (transactionId) history = history.filter(d => d.transactionId === transactionId);

    res.json({
      success: true,
      data: history.slice(0, parseInt(limit))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Override decision (manual review)
router.post('/decisions/:decisionId/override', (req, res) => {
  try {
    const { newDecision, reason, overriddenBy } = req.body;
    const decision = decisionHistory.find(d => d.decisionId === req.params.decisionId);

    if (!decision) {
      return res.status(404).json({ success: false, error: 'Decision not found' });
    }

    decision.override = {
      originalDecision: decision.decision,
      newDecision,
      reason,
      overriddenBy,
      timestamp: new Date().toISOString()
    };
    decision.decision = newDecision;

    res.json({ success: true, data: decision });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get decision statistics
router.get('/stats', (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;

    const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 24;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const recentDecisions = decisionHistory.filter(d =>
      new Date(d.timestamp) > cutoff
    );

    const stats = {
      total: recentDecisions.length,
      byDecision: {},
      byAction: {},
      avgLatencyMs: 0,
      avgRulesTriggered: 0,
      topTriggeredRules: {}
    };

    let totalLatency = 0;
    let totalRulesTriggered = 0;

    recentDecisions.forEach(d => {
      stats.byDecision[d.decision] = (stats.byDecision[d.decision] || 0) + 1;
      stats.byAction[d.action] = (stats.byAction[d.action] || 0) + 1;
      totalLatency += d.latencyMs;
      totalRulesTriggered += d.rulesTriggered;

      d.triggeredRuleIds?.forEach(ruleId => {
        stats.topTriggeredRules[ruleId] = (stats.topTriggeredRules[ruleId] || 0) + 1;
      });
    });

    if (recentDecisions.length > 0) {
      stats.avgLatencyMs = totalLatency / recentDecisions.length;
      stats.avgRulesTriggered = totalRulesTriggered / recentDecisions.length;
    }

    // Sort top triggered rules
    stats.topTriggeredRules = Object.entries(stats.topTriggeredRules)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  try {
    const rules = db_ops.getAll('rules', 1000, 0).map(r => r.data);
    const activeRules = rules.filter(r => r.status === 'ACTIVE');

    res.json({
      success: true,
      data: {
        status: activeRules.length > 0 ? 'HEALTHY' : 'WARNING',
        activeRules: activeRules.length,
        totalRules: rules.length,
        decisionsProcessed: decisionHistory.length,
        avgLatencyMs: decisionHistory.length > 0
          ? decisionHistory.slice(0, 100).reduce((sum, d) => sum + d.latencyMs, 0) / Math.min(100, decisionHistory.length)
          : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper functions
function evaluateRule(rule, transaction, context) {
  let triggered = true;
  const evaluatedConditions = [];

  for (const condition of rule.conditions || []) {
    const fieldValue = getNestedValue({ ...transaction, ...context }, condition.field);
    let conditionMet = false;

    switch (condition.operator) {
      case 'GT': conditionMet = fieldValue > condition.value; break;
      case 'LT': conditionMet = fieldValue < condition.value; break;
      case 'GTE': conditionMet = fieldValue >= condition.value; break;
      case 'LTE': conditionMet = fieldValue <= condition.value; break;
      case 'EQ': conditionMet = fieldValue === condition.value; break;
      case 'NE': conditionMet = fieldValue !== condition.value; break;
      case 'IN': conditionMet = Array.isArray(condition.value) && condition.value.includes(fieldValue); break;
      case 'NOT_IN': conditionMet = Array.isArray(condition.value) && !condition.value.includes(fieldValue); break;
      case 'CONTAINS': conditionMet = String(fieldValue).includes(condition.value); break;
      default: conditionMet = false;
    }

    evaluatedConditions.push({ ...condition, actualValue: fieldValue, met: conditionMet });
    if (!conditionMet) triggered = false;
  }

  return { triggered, action: triggered ? rule.action : 'NO_ACTION', evaluatedConditions };
}

function mapActionToDecision(action) {
  const mapping = {
    'BLOCK': 'BLOCKED',
    'REVIEW': 'REVIEW',
    'CHALLENGE': 'CHALLENGE',
    'FLAG': 'APPROVED',
    'ALLOW_WITH_LIMIT': 'APPROVED',
    'ALLOW': 'APPROVED'
  };
  return mapping[action] || 'APPROVED';
}

function calculateRiskScore(triggeredRules, transaction) {
  let score = transaction.riskScore || 0;

  // Add weight based on triggered rules
  triggeredRules.forEach(rule => {
    if (rule.action === 'BLOCK') score += 30;
    else if (rule.action === 'REVIEW') score += 20;
    else if (rule.action === 'CHALLENGE') score += 15;
    else if (rule.action === 'FLAG') score += 10;
  });

  return Math.min(100, score);
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

export default router;
