/**
 * Rule Drafter — Generates candidate fraud detection rules from feature clusters.
 *
 * Used by the Policy Evolution Agent to propose new rules based on observed
 * fraud patterns. The generated rules are compatible with the decision engine
 * format in backend/services/decision-engine/rules/index.js.
 *
 * Each drafted rule starts in TESTING status so it can be shadow-evaluated
 * before promotion to ACTIVE.
 */

const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VALID_ACTIONS = ['BLOCK', 'REVIEW', 'CHALLENGE', 'FLAG'];

class RuleDrafter {
  constructor() {
    this.stats = {
      rulesProposed: 0,
      rulesWithSingleCondition: 0,
      rulesWithMultipleConditions: 0
    };

    console.log('[RuleDrafter] Initialized');
  }

  /**
   * Draft a candidate rule from a feature cluster.
   *
   * @param {Object} cluster - Feature cluster describing a fraud pattern
   * @param {Array} cluster.features - Array of { field, values, operator }
   * @param {string} cluster.checkpoint - Rule checkpoint (transaction, onboarding, etc.)
   * @param {string} cluster.severity - Severity level (LOW, MEDIUM, HIGH, CRITICAL)
   * @param {string} cluster.action - Action to take (BLOCK, REVIEW, CHALLENGE, FLAG)
   * @param {string} cluster.reason - Human-readable reason for the rule
   * @returns {Object|null} Rule object compatible with decision engine, or null on invalid input
   */
  draftRuleFromCluster(cluster) {
    // Validate required inputs
    if (!cluster || !cluster.checkpoint) {
      return null;
    }

    if (!cluster.features || !Array.isArray(cluster.features) || cluster.features.length === 0) {
      return null;
    }

    // Generate conditions from features
    const conditions = [];
    for (const feature of cluster.features) {
      const condition = this._featureToCondition(feature);
      if (condition) {
        conditions.push(condition);
      }
    }

    if (conditions.length === 0) {
      return null;
    }

    // Determine rule type from the operators present
    const type = this._inferRuleType(cluster.features);

    // Build a feature summary for the rule name
    const featureSummary = cluster.features
      .map(f => f.field)
      .slice(0, 3)
      .join(' + ');

    const now = new Date();
    const timestamp36 = now.getTime().toString(36);
    const random = Math.random().toString(36).substring(2, 6);

    const rule = {
      ruleId: `RULE-PE-${timestamp36}-${random}`,
      name: `Auto: ${cluster.checkpoint} - ${featureSummary}`,
      description: `Auto-generated rule targeting ${cluster.reason || 'detected pattern'}`,
      checkpoint: cluster.checkpoint,
      type,
      severity: VALID_SEVERITIES.includes(cluster.severity) ? cluster.severity : 'MEDIUM',
      status: 'TESTING',
      priority: 50,
      action: VALID_ACTIONS.includes(cluster.action) ? cluster.action : 'REVIEW',
      conditions,
      tags: ['auto-generated', 'policy-evolution'],
      createdBy: 'POLICY_EVOLUTION',
      createdAt: now.toISOString(),
      performance: {
        triggered: 0,
        truePositives: 0,
        falsePositives: 0,
        catchRate: 0,
        falsePositiveRate: 0
      }
    };

    // Update stats
    this.stats.rulesProposed++;
    if (conditions.length === 1) {
      this.stats.rulesWithSingleCondition++;
    } else {
      this.stats.rulesWithMultipleConditions++;
    }

    return rule;
  }

  /**
   * Draft a modification of an existing rule.
   *
   * Clones the rule with adjusted conditions based on the modification spec.
   * The new rule starts in TESTING status and references the original via clonedFrom.
   *
   * @param {Object} existingRule - The original rule to modify
   * @param {Object} modification - Modification specification
   * @param {Array} [modification.relaxThresholds] - Array of { field, newValue } to relax
   * @param {Array} [modification.addExceptions] - Array of { field, operator, value } to add
   * @returns {Object} New rule object with modifications applied
   */
  draftModification(existingRule, modification) {
    const now = new Date();
    const timestamp36 = now.getTime().toString(36);
    const random = Math.random().toString(36).substring(2, 6);

    // Deep clone the conditions
    const conditions = (existingRule.conditions || []).map(c => ({ ...c }));

    // Apply threshold relaxations
    if (modification.relaxThresholds && Array.isArray(modification.relaxThresholds)) {
      for (const relaxation of modification.relaxThresholds) {
        const condition = conditions.find(c => c.field === relaxation.field);
        if (condition) {
          condition.value = relaxation.newValue;
        }
      }
    }

    // Add exception conditions
    if (modification.addExceptions && Array.isArray(modification.addExceptions)) {
      for (const exception of modification.addExceptions) {
        conditions.push({
          field: exception.field,
          operator: exception.operator,
          value: exception.value
        });
      }
    }

    const modifiedRule = {
      ...existingRule,
      ruleId: `RULE-PE-${timestamp36}-${random}`,
      name: `${existingRule.name} (Modified)`,
      status: 'TESTING',
      clonedFrom: existingRule.ruleId,
      conditions,
      performance: {
        triggered: 0,
        truePositives: 0,
        falsePositives: 0,
        catchRate: 0,
        falsePositiveRate: 0
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    // Update stats
    this.stats.rulesProposed++;
    if (conditions.length === 1) {
      this.stats.rulesWithSingleCondition++;
    } else {
      this.stats.rulesWithMultipleConditions++;
    }

    return modifiedRule;
  }

  /**
   * Get drafting statistics.
   * @returns {Object} { rulesProposed, rulesWithSingleCondition, rulesWithMultipleConditions }
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Convert a feature descriptor to a rule condition.
   * @private
   */
  _featureToCondition(feature) {
    if (!feature || !feature.field || !feature.operator) {
      return null;
    }

    const values = feature.values;
    if (!Array.isArray(values) || values.length === 0) {
      return null;
    }

    const operator = feature.operator;
    let value;

    switch (operator) {
      case 'GT':
      case 'GTE':
        // Use minimum to cast the widest net
        value = Math.min(...values);
        break;

      case 'LT':
      case 'LTE':
        // Use maximum to cast the widest net
        value = Math.max(...values);
        break;

      case 'IN':
        // Use unique values
        value = [...new Set(values)];
        break;

      case 'EQ':
        // Use the mode (most common value)
        value = this._mode(values);
        break;

      default:
        // Unknown operator — use first value as fallback
        value = values[0];
        break;
    }

    return { field: feature.field, operator, value };
  }

  /**
   * Compute the mode (most frequent value) of an array.
   * @private
   */
  _mode(values) {
    const counts = new Map();
    for (const v of values) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }

    let maxCount = 0;
    let modeValue = values[0];
    for (const [val, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        modeValue = val;
      }
    }

    return modeValue;
  }

  /**
   * Infer the rule type from the operators used in features.
   * @private
   */
  _inferRuleType(features) {
    const operators = features.map(f => f.operator);

    if (operators.includes('IN') || operators.includes('EQ')) {
      return 'pattern';
    }
    if (operators.some(op => ['GT', 'GTE', 'LT', 'LTE'].includes(op))) {
      return 'threshold';
    }
    return 'behavioral';
  }
}

// ── Singleton ──
let instance = null;

export function getRuleDrafter() {
  if (!instance) {
    instance = new RuleDrafter();
  }
  return instance;
}

export { RuleDrafter };
export default { getRuleDrafter, RuleDrafter };
