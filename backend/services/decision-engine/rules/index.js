import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { generateRule } from '../../../shared/synthetic-data/generators.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get all rules
router.get('/', (req, res) => {
  try {
    const { limit = 50, status, type, action } = req.query;

    let rules = db_ops.getAll('rules', parseInt(limit), 0);
    rules = rules.map(r => r.data);

    if (status) rules = rules.filter(r => r.status === status);
    if (type) rules = rules.filter(r => r.type === type);
    if (action) rules = rules.filter(r => r.action === action);

    // Sort by priority
    rules.sort((a, b) => (a.priority || 100) - (b.priority || 100));

    res.json({
      success: true,
      data: rules,
      total: db_ops.count('rules')
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get rule by ID
router.get('/:ruleId', (req, res) => {
  try {
    const rule = db_ops.getById('rules', 'rule_id', req.params.ruleId);
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    res.json({ success: true, data: rule.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create rule
router.post('/', (req, res) => {
  try {
    const ruleData = req.body.ruleId ? req.body : {
      ruleId: `RULE-${uuidv4().substring(0, 6).toUpperCase()}`,
      ...req.body,
      status: 'TESTING',
      performance: {
        triggered: 0,
        truePositives: 0,
        falsePositives: 0,
        catchRate: 0,
        falsePositiveRate: 0
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Validate rule structure
    if (!ruleData.name || !ruleData.conditions || !ruleData.action) {
      return res.status(400).json({
        success: false,
        error: 'Rule must have name, conditions, and action'
      });
    }

    db_ops.insert('rules', 'rule_id', ruleData.ruleId, ruleData);

    res.status(201).json({ success: true, data: ruleData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update rule
router.put('/:ruleId', (req, res) => {
  try {
    const existing = db_ops.getById('rules', 'rule_id', req.params.ruleId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    const updated = {
      ...existing.data,
      ...req.body,
      ruleId: req.params.ruleId, // Prevent ID change
      updatedAt: new Date().toISOString(),
      versionHistory: [
        ...(existing.data.versionHistory || []),
        {
          version: (existing.data.versionHistory?.length || 0) + 1,
          changes: req.body,
          timestamp: new Date().toISOString(),
          changedBy: req.body.changedBy || 'system'
        }
      ]
    };

    db_ops.update('rules', 'rule_id', req.params.ruleId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update rule status
router.patch('/:ruleId/status', (req, res) => {
  try {
    const { status, reason } = req.body;
    const existing = db_ops.getById('rules', 'rule_id', req.params.ruleId);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    const validStatuses = ['ACTIVE', 'SHADOW', 'DISABLED', 'TESTING'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const updated = {
      ...existing.data,
      status,
      statusHistory: [
        ...(existing.data.statusHistory || []),
        { from: existing.data.status, to: status, reason, timestamp: new Date().toISOString() }
      ],
      updatedAt: new Date().toISOString()
    };

    db_ops.update('rules', 'rule_id', req.params.ruleId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test rule against sample data
router.post('/:ruleId/test', (req, res) => {
  try {
    const { testData } = req.body;
    const rule = db_ops.getById('rules', 'rule_id', req.params.ruleId);

    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    const result = evaluateRule(rule.data, testData);

    res.json({
      success: true,
      data: {
        ruleId: rule.data.ruleId,
        ruleName: rule.data.name,
        testData,
        result
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get rule performance
router.get('/:ruleId/performance', (req, res) => {
  try {
    const { timeRange = '7d' } = req.query;
    const rule = db_ops.getById('rules', 'rule_id', req.params.ruleId);

    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    // Generate performance time series
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 7;
    const timeSeries = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      timeSeries.push({
        date: date.toISOString().split('T')[0],
        triggered: Math.floor(Math.random() * 1000) + 100,
        truePositives: Math.floor(Math.random() * 200) + 50,
        falsePositives: Math.floor(Math.random() * 50) + 5,
        catchRate: (0.85 + Math.random() * 0.1).toFixed(4),
        falsePositiveRate: (0.02 + Math.random() * 0.03).toFixed(4)
      });
    }

    res.json({
      success: true,
      data: {
        ruleId: rule.data.ruleId,
        ruleName: rule.data.name,
        currentPerformance: rule.data.performance,
        timeSeries
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clone rule
router.post('/:ruleId/clone', (req, res) => {
  try {
    const existing = db_ops.getById('rules', 'rule_id', req.params.ruleId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    const cloned = {
      ...existing.data,
      ruleId: `RULE-${uuidv4().substring(0, 6).toUpperCase()}`,
      name: `${existing.data.name} (Copy)`,
      status: 'TESTING',
      clonedFrom: req.params.ruleId,
      performance: {
        triggered: 0,
        truePositives: 0,
        falsePositives: 0,
        catchRate: 0,
        falsePositiveRate: 0
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db_ops.insert('rules', 'rule_id', cloned.ruleId, cloned);

    res.status(201).json({ success: true, data: cloned });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk update rules status
router.post('/bulk/status', (req, res) => {
  try {
    const { ruleIds, status, reason } = req.body;

    const updated = [];
    for (const ruleId of ruleIds) {
      const existing = db_ops.getById('rules', 'rule_id', ruleId);
      if (existing) {
        const updatedRule = {
          ...existing.data,
          status,
          updatedAt: new Date().toISOString()
        };
        db_ops.update('rules', 'rule_id', ruleId, updatedRule);
        updated.push(ruleId);
      }
    }

    res.json({ success: true, data: { updated, count: updated.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get rule statistics
router.get('/stats/summary', (req, res) => {
  try {
    const rules = db_ops.getAll('rules', 1000, 0).map(r => r.data);

    const stats = {
      total: rules.length,
      byStatus: {},
      byType: {},
      byAction: {},
      topPerformers: [],
      worstPerformers: []
    };

    rules.forEach(r => {
      stats.byStatus[r.status] = (stats.byStatus[r.status] || 0) + 1;
      stats.byType[r.type] = (stats.byType[r.type] || 0) + 1;
      stats.byAction[r.action] = (stats.byAction[r.action] || 0) + 1;
    });

    // Sort by catch rate
    const sortedByCatchRate = [...rules]
      .filter(r => r.performance?.catchRate)
      .sort((a, b) => (b.performance?.catchRate || 0) - (a.performance?.catchRate || 0));

    stats.topPerformers = sortedByCatchRate.slice(0, 5).map(r => ({
      ruleId: r.ruleId,
      name: r.name,
      catchRate: r.performance?.catchRate
    }));

    stats.worstPerformers = sortedByCatchRate.slice(-5).reverse().map(r => ({
      ruleId: r.ruleId,
      name: r.name,
      catchRate: r.performance?.catchRate
    }));

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to evaluate rule
function evaluateRule(rule, data) {
  let triggered = true;
  const evaluatedConditions = [];

  for (const condition of rule.conditions || []) {
    const fieldValue = getNestedValue(data, condition.field);
    let conditionMet = false;

    switch (condition.operator) {
      case 'GT':
        conditionMet = fieldValue > condition.value;
        break;
      case 'LT':
        conditionMet = fieldValue < condition.value;
        break;
      case 'EQ':
        conditionMet = fieldValue === condition.value;
        break;
      case 'NE':
        conditionMet = fieldValue !== condition.value;
        break;
      case 'IN':
        conditionMet = Array.isArray(condition.value) && condition.value.includes(fieldValue);
        break;
      case 'GTE':
        conditionMet = fieldValue >= condition.value;
        break;
      case 'LTE':
        conditionMet = fieldValue <= condition.value;
        break;
      default:
        conditionMet = false;
    }

    evaluatedConditions.push({
      ...condition,
      actualValue: fieldValue,
      met: conditionMet
    });

    if (!conditionMet) triggered = false;
  }

  return {
    triggered,
    action: triggered ? rule.action : 'NO_ACTION',
    evaluatedConditions
  };
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

export default router;
