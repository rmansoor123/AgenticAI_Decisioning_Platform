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

    // Persist event to experiment_events table
    const eventId = `EVT-${uuidv4().substring(0, 8).toUpperCase()}`;
    db_ops.run(
      'INSERT INTO experiment_events (event_id, experiment_id, entity_id, variant, event_type, value, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [eventId, req.params.experimentId, entityId, variant, eventType, value || null, JSON.stringify(req.body.metadata || {}), new Date().toISOString()]
    );

    res.json({
      success: true,
      data: {
        eventId,
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

    // Aggregate real results from experiment_events table
    const variantData = db_ops.raw(`
      SELECT
        variant,
        COUNT(*) as sampleSize,
        AVG(CASE WHEN event_type = 'fraud_caught' THEN value ELSE NULL END) as fraudCatchRate,
        AVG(CASE WHEN event_type = 'false_positive' THEN value ELSE NULL END) as falsePositiveRate,
        AVG(CASE WHEN event_type = 'latency' THEN value ELSE NULL END) as latencyP99,
        AVG(CASE WHEN event_type = 'conversion' THEN value ELSE NULL END) as conversionRate,
        SUM(CASE WHEN event_type = 'fraud_caught' AND value > 0 THEN 1 ELSE 0 END) as fraudCaughtCount,
        COUNT(CASE WHEN event_type = 'fraud_caught' THEN 1 END) as fraudTrials
      FROM experiment_events
      WHERE experiment_id = ?
      GROUP BY variant
    `, [req.params.experimentId]);

    let results;

    if (variantData.length > 0) {
      // Build results from real data
      const variantResults = experiment.data.variants.map(v => {
        const data = variantData.find(vd => vd.variant === v.id) || {};
        return {
          id: v.id,
          name: v.name,
          allocation: v.allocation,
          sampleSize: data.sampleSize || 0,
          metrics: {
            fraudCatchRate: data.fraudCatchRate != null ? parseFloat(data.fraudCatchRate).toFixed(4) : null,
            falsePositiveRate: data.falsePositiveRate != null ? parseFloat(data.falsePositiveRate).toFixed(4) : null,
            latencyP99: data.latencyP99 != null ? Math.floor(data.latencyP99) : null,
            conversionRate: data.conversionRate != null ? parseFloat(data.conversionRate).toFixed(4) : null
          }
        };
      });

      // Chi-square significance test between first two variants
      let statisticalAnalysis = {
        primaryMetric: experiment.data.metrics?.primaryMetric || 'fraud_catch_rate',
        pValue: null,
        confidenceLevel: 0.95,
        isSignificant: false,
        uplift: null,
        recommendation: 'INSUFFICIENT_DATA'
      };

      if (variantResults.length >= 2 && variantResults[0].sampleSize > 0 && variantResults[1].sampleSize > 0) {
        const control = variantData.find(vd => vd.variant === variantResults[0].id) || {};
        const treatment = variantData.find(vd => vd.variant === variantResults[1].id) || {};

        if (control.fraudTrials > 0 && treatment.fraudTrials > 0) {
          const chiResult = chiSquareTest(
            { tp: control.fraudCaughtCount || 0, n: control.fraudTrials },
            { tp: treatment.fraudCaughtCount || 0, n: treatment.fraudTrials }
          );
          const controlRate = parseFloat(variantResults[0].metrics.fraudCatchRate || 0);
          const treatmentRate = parseFloat(variantResults[1].metrics.fraudCatchRate || 0);
          const uplift = controlRate > 0 ? ((treatmentRate - controlRate) / controlRate * 100).toFixed(2) : '0.00';

          statisticalAnalysis = {
            primaryMetric: experiment.data.metrics?.primaryMetric || 'fraud_catch_rate',
            pValue: parseFloat(chiResult.pValue.toFixed(4)),
            chiSquare: parseFloat(chiResult.chiSquare.toFixed(4)),
            confidenceLevel: 0.95,
            isSignificant: chiResult.isSignificant,
            uplift: uplift + '%',
            recommendation: chiResult.isSignificant
              ? (treatmentRate > controlRate ? 'PROMOTE_TREATMENT' : 'KEEP_CONTROL')
              : 'CONTINUE_EXPERIMENT'
          };
        }
      }

      results = {
        experimentId: req.params.experimentId,
        status: experiment.data.status,
        variants: variantResults,
        statisticalAnalysis,
        generatedAt: new Date().toISOString()
      };
    } else {
      // No events recorded yet
      results = {
        experimentId: req.params.experimentId,
        status: experiment.data.status,
        variants: experiment.data.variants.map(v => ({
          id: v.id,
          name: v.name,
          allocation: v.allocation,
          sampleSize: 0,
          metrics: {}
        })),
        statisticalAnalysis: {
          primaryMetric: experiment.data.metrics?.primaryMetric || 'fraud_catch_rate',
          pValue: null,
          confidenceLevel: 0.95,
          isSignificant: false,
          uplift: null,
          recommendation: 'NO_DATA',
          message: 'No events recorded yet. Submit events via POST /experiments/:experimentId/event'
        },
        generatedAt: new Date().toISOString()
      };
    }

    // Override with stored results if experiment is completed and has them
    if (experiment.data.results && experiment.data.status === 'COMPLETED') {
      const storedVariants = Object.entries(experiment.data.results)
        .filter(([key]) => key !== 'pValue' && key !== 'significant')
        .map(([key, value]) => ({
          id: key,
          name: key.charAt(0).toUpperCase() + key.slice(1),
          metrics: value
        }));
      if (storedVariants.length > 0) results.variants = storedVariants;
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

// Chi-square test for statistical significance (2x2 contingency table)
function chiSquareTest(control, treatment) {
  const total = control.n + treatment.n;
  const totalPositive = control.tp + treatment.tp;
  const totalNegative = total - totalPositive;

  if (total === 0 || totalPositive === 0 || totalNegative === 0) {
    return { chiSquare: 0, pValue: 1, isSignificant: false };
  }

  // Expected values for 2x2 table
  const expected = [
    [control.n * totalPositive / total, control.n * totalNegative / total],
    [treatment.n * totalPositive / total, treatment.n * totalNegative / total]
  ];

  const observed = [
    [control.tp, control.n - control.tp],
    [treatment.tp, treatment.n - treatment.tp]
  ];

  // Chi-square statistic
  let chiSq = 0;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      if (expected[i][j] > 0) {
        chiSq += Math.pow(observed[i][j] - expected[i][j], 2) / expected[i][j];
      }
    }
  }

  // p-value approximation for 1 degree of freedom
  const pValue = Math.exp(-chiSq / 2);
  return { chiSquare: chiSq, pValue, isSignificant: pValue < 0.05 };
}

// Shared hashing/assignment functions (extracted for reuse by platform-integrator)
import { simpleHash, assignVariant } from './variant-assigner.js';

export default router;
