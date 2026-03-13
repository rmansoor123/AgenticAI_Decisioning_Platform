/**
 * Rule Evaluator — shared functions for evaluating fraud rules
 * Extracted from execution/index.js for reuse by platform-integrator
 */

export function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

export function evaluateRule(rule, transaction, context) {
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

export function mapActionToDecision(action) {
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

export function calculateRiskScore(triggeredRules, transaction) {
  let score = transaction.riskScore || 0;

  triggeredRules.forEach(rule => {
    if (rule.action === 'BLOCK') score += 30;
    else if (rule.action === 'REVIEW') score += 20;
    else if (rule.action === 'CHALLENGE') score += 15;
    else if (rule.action === 'FLAG') score += 10;
  });

  return Math.min(100, score);
}
