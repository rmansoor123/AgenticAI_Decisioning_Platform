import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { generateExperiment } from '../../../shared/synthetic-data/generators.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Assignment cache (for consistent user experience)
const assignmentCache = new Map();

// Get all experiments
router.get('/experiments', (req, res) => {
  try {
    const { limit = 50, status, type } = req.query;

    let experiments = db_ops.getAll('experiments', parseInt(limit), 0);
    experiments = experiments.map(e => e.data);

    if (status) experiments = experiments.filter(e => e.status === status);
    if (type) experiments = experiments.filter(e => e.type === type);

    res.json({
      success: true,
      data: experiments,
      total: db_ops.count('experiments')
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get experiment by ID
router.get('/experiments/:experimentId', (req, res) => {
  try {
    const experiment = db_ops.getById('experiments', 'experiment_id', req.params.experimentId);
    if (!experiment) {
      return res.status(404).json({ success: false, error: 'Experiment not found' });
    }
    res.json({ success: true, data: experiment.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create experiment
router.post('/experiments', (req, res) => {
  try {
    const experimentData = {
      experimentId: `EXP-${uuidv4().substring(0, 8).toUpperCase()}`,
      ...req.body,
      status: 'SCHEDULED',
      createdAt: new Date().toISOString(),
      metrics: req.body.metrics || {
        primaryMetric: 'fraud_catch_rate',
        secondaryMetrics: ['false_positive_rate', 'latency_p99']
      }
    };

    // Validate required fields
    if (!experimentData.name || !experimentData.variants) {
      return res.status(400).json({
        success: false,
        error: 'Experiment must have name and variants'
      });
    }

    // Validate variant allocations sum to 100
    const totalAllocation = experimentData.variants.reduce((sum, v) => sum + (v.allocation || 0), 0);
    if (totalAllocation !== 100) {
      return res.status(400).json({
        success: false,
        error: 'Variant allocations must sum to 100'
      });
    }

    db_ops.insert('experiments', 'experiment_id', experimentData.experimentId, experimentData);

    res.status(201).json({ success: true, data: experimentData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update experiment
router.put('/experiments/:experimentId', (req, res) => {
  try {
    const existing = db_ops.getById('experiments', 'experiment_id', req.params.experimentId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Experiment not found' });
    }

    if (existing.data.status === 'RUNNING') {
      return res.status(400).json({
        success: false,
        error: 'Cannot modify running experiment'
      });
    }

    const updated = { ...existing.data, ...req.body, updatedAt: new Date().toISOString() };
    db_ops.update('experiments', 'experiment_id', req.params.experimentId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start experiment
router.post('/experiments/:experimentId/start', (req, res) => {
  try {
    const existing = db_ops.getById('experiments', 'experiment_id', req.params.experimentId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Experiment not found' });
    }

    if (existing.data.status !== 'SCHEDULED' && existing.data.status !== 'PAUSED') {
      return res.status(400).json({
        success: false,
        error: `Cannot start experiment in ${existing.data.status} status`
      });
    }

    const updated = {
      ...existing.data,
      status: 'RUNNING',
      startDate: new Date().toISOString()
    };

    db_ops.update('experiments', 'experiment_id', req.params.experimentId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop experiment
router.post('/experiments/:experimentId/stop', (req, res) => {
  try {
    const { reason, winner } = req.body;
    const existing = db_ops.getById('experiments', 'experiment_id', req.params.experimentId);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Experiment not found' });
    }

    const updated = {
      ...existing.data,
      status: 'COMPLETED',
      endDate: new Date().toISOString(),
      conclusion: { reason, winner }
    };

    db_ops.update('experiments', 'experiment_id', req.params.experimentId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get variant assignment for entity
router.get('/assign', (req, res) => {
  try {
    const { experimentId, entityId } = req.query;

    if (!experimentId || !entityId) {
      return res.status(400).json({
        success: false,
        error: 'experimentId and entityId are required'
      });
    }

    const experiment = db_ops.getById('experiments', 'experiment_id', experimentId);
    if (!experiment || experiment.data.status !== 'RUNNING') {
      return res.json({
        success: true,
        data: { variant: 'control', inExperiment: false }
      });
    }

    // Check cache first
    const cacheKey = `${experimentId}:${entityId}`;
    if (assignmentCache.has(cacheKey)) {
      return res.json({
        success: true,
        data: { variant: assignmentCache.get(cacheKey), inExperiment: true, cached: true }
      });
    }

    // Deterministic assignment based on hash
    const hash = simpleHash(`${experimentId}${entityId}`);
    const bucket = hash % 100;

    // Check if in experiment traffic
    if (bucket >= experiment.data.trafficAllocation) {
      return res.json({
        success: true,
        data: { variant: 'control', inExperiment: false }
      });
    }

    // Assign to variant
    let cumulative = 0;
    let assignedVariant = experiment.data.variants[0];

    for (const variant of experiment.data.variants) {
      cumulative += variant.allocation;
      if (bucket < cumulative) {
        assignedVariant = variant;
        break;
      }
    }

    // Cache assignment
    assignmentCache.set(cacheKey, assignedVariant.id);

    res.json({
      success: true,
      data: {
        variant: assignedVariant.id,
        variantName: assignedVariant.name,
        config: assignedVariant.config,
        inExperiment: true
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Record experiment event
router.post('/experiments/:experimentId/event', (req, res) => {
  try {
    const { entityId, variant, eventType, value } = req.body;
    const experiment = db_ops.getById('experiments', 'experiment_id', req.params.experimentId);

    if (!experiment) {
      return res.status(404).json({ success: false, error: 'Experiment not found' });
    }

    // In production, this would store to an analytics database

    res.json({
      success: true,
      data: {
        experimentId: req.params.experimentId,
        entityId,
        variant,
        eventType,
        value,
        recordedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get experiment results
router.get('/experiments/:experimentId/results', (req, res) => {
  try {
    const experiment = db_ops.getById('experiments', 'experiment_id', req.params.experimentId);
    if (!experiment) {
      return res.status(404).json({ success: false, error: 'Experiment not found' });
    }

    // Generate realistic results
    const results = {
      experimentId: req.params.experimentId,
      status: experiment.data.status,
      variants: experiment.data.variants.map(v => ({
        id: v.id,
        name: v.name,
        allocation: v.allocation,
        sampleSize: Math.floor(1000 + Math.random() * 9000),
        metrics: {
          fraudCatchRate: (0.95 + Math.random() * 0.04).toFixed(4),
          falsePositiveRate: (0.02 + Math.random() * 0.02).toFixed(4),
          latencyP99: Math.floor(50 + Math.random() * 50),
          conversionRate: (0.03 + Math.random() * 0.02).toFixed(4)
        }
      })),
      statisticalAnalysis: {
        primaryMetric: experiment.data.metrics?.primaryMetric || 'fraud_catch_rate',
        pValue: (Math.random() * 0.1).toFixed(4),
        confidenceLevel: 0.95,
        isSignificant: Math.random() > 0.3,
        uplift: ((Math.random() * 10) - 2).toFixed(2) + '%',
        recommendation: Math.random() > 0.5 ? 'PROMOTE_TREATMENT' : 'KEEP_CONTROL'
      },
      generatedAt: new Date().toISOString()
    };

    // Use stored results if completed
    if (experiment.data.results) {
      results.variants = Object.entries(experiment.data.results)
        .filter(([key]) => key !== 'pValue' && key !== 'significant')
        .map(([key, value]) => ({
          id: key,
          name: key.charAt(0).toUpperCase() + key.slice(1),
          metrics: value
        }));
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get experiment statistics
router.get('/stats', (req, res) => {
  try {
    const experiments = db_ops.getAll('experiments', 1000, 0).map(e => e.data);

    const stats = {
      total: experiments.length,
      byStatus: {},
      byType: {},
      avgDuration: 0,
      successRate: 0
    };

    let totalDuration = 0;
    let completedCount = 0;
    let successCount = 0;

    experiments.forEach(e => {
      stats.byStatus[e.status] = (stats.byStatus[e.status] || 0) + 1;
      stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;

      if (e.status === 'COMPLETED' && e.startDate && e.endDate) {
        completedCount++;
        totalDuration += new Date(e.endDate) - new Date(e.startDate);

        if (e.results?.significant) {
          successCount++;
        }
      }
    });

    if (completedCount > 0) {
      stats.avgDuration = totalDuration / completedCount / (1000 * 60 * 60 * 24); // days
      stats.successRate = successCount / completedCount;
    }

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function for deterministic hashing
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export default router;
