/**
 * ML Training Pipeline API
 * Endpoints for managing model training, experiments, and serving status.
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getModelServingType } from '../models/model-serving-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TRAINING_DIR = path.join(__dirname, '..', '..', '..', 'ml-training');

const router = express.Router();

// GET /experiments — list MLflow experiments (reads from training report)
router.get('/experiments', async (req, res) => {
  try {
    const reportPath = path.join(TRAINING_DIR, 'trained-models', 'training-report.json');
    const metadataPath = path.join(TRAINING_DIR, 'data', 'metadata.json');

    let report = null;
    let metadata = null;

    if (fs.existsSync(reportPath)) {
      report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    }
    if (fs.existsSync(metadataPath)) {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    }

    // Also try MLflow REST API
    let mlflowExperiments = [];
    const mlflowUri = process.env.MLFLOW_TRACKING_URI || 'http://localhost:5001';
    try {
      const mlRes = await fetch(`${mlflowUri}/api/2.0/mlflow/experiments/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_results: 20 }),
        signal: AbortSignal.timeout(3000)
      });
      if (mlRes.ok) {
        const mlData = await mlRes.json();
        mlflowExperiments = mlData.experiments || [];
      }
    } catch (_) { /* MLflow not available */ }

    res.json({
      success: true,
      data: {
        latestReport: report,
        datasetMetadata: metadata,
        mlflowExperiments,
        mlflowAvailable: mlflowExperiments.length > 0,
        trainingDataExists: fs.existsSync(path.join(TRAINING_DIR, 'data', 'train.csv')),
        trainedModelExists: fs.existsSync(path.join(TRAINING_DIR, 'trained-models', 'onboarding-risk-v2.onnx')),
        tritonModelExists: fs.existsSync(path.join(TRAINING_DIR, 'model-repository', 'onboarding-risk-v1', '1', 'model.onnx'))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /runs — list training runs from MLflow
router.get('/runs', async (req, res) => {
  try {
    const mlflowUri = process.env.MLFLOW_TRACKING_URI || 'http://localhost:5001';
    let runs = [];

    try {
      const mlRes = await fetch(`${mlflowUri}/api/2.0/mlflow/runs/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experiment_ids: ['0', '1'], max_results: 20 }),
        signal: AbortSignal.timeout(3000)
      });
      if (mlRes.ok) {
        const mlData = await mlRes.json();
        runs = (mlData.runs || []).map(run => ({
          runId: run.info?.run_id,
          runName: run.info?.run_name,
          status: run.info?.status,
          startTime: run.info?.start_time,
          endTime: run.info?.end_time,
          metrics: run.data?.metrics?.reduce((acc, m) => { acc[m.key] = m.value; return acc; }, {}) || {},
          params: run.data?.params?.reduce((acc, p) => { acc[p.key] = p.value; return acc; }, {}) || {}
        }));
      }
    } catch (_) { /* MLflow not available */ }

    // Fallback: read training report
    if (runs.length === 0) {
      const reportPath = path.join(TRAINING_DIR, 'trained-models', 'training-report.json');
      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        runs.push({
          runId: 'local-latest',
          runName: `train-${report.trained_at?.substring(0, 10) || 'unknown'}`,
          status: 'FINISHED',
          metrics: report.metrics || {},
          params: report.parameters || {}
        });
      }
    }

    res.json({ success: true, data: runs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /serving/status — current serving backend
router.get('/serving/status', async (req, res) => {
  try {
    const servingType = getModelServingType();

    let servingStats = {};
    try {
      const { getModelServingBackend } = await import('../models/model-serving-factory.js');
      const backend = await getModelServingBackend();
      servingStats = backend.getStats?.() || {};
    } catch (_) {}

    res.json({
      success: true,
      data: {
        backend: servingType,
        label: servingType === 'triton' ? 'Nvidia Triton Inference Server' :
               servingType === 'onnx' ? 'ONNX Runtime (CoreML)' :
               'TensorFlow.js (in-process)',
        ...servingStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /serving/benchmark — run inference benchmark
router.get('/serving/benchmark', async (req, res) => {
  try {
    const { getModelServingBackend } = await import('../models/model-serving-factory.js');
    const backend = await getModelServingBackend();

    const iterations = parseInt(req.query.n) || 100;
    const featureVector = Array(25).fill(0).map(() => Math.random());
    const latencies = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await backend.predict('onboarding-risk-v1', featureVector);
      latencies.push(performance.now() - start);
    }

    latencies.sort((a, b) => a - b);

    res.json({
      success: true,
      data: {
        backend: getModelServingType(),
        iterations,
        p50: parseFloat(latencies[Math.floor(iterations * 0.5)].toFixed(3)),
        p95: parseFloat(latencies[Math.floor(iterations * 0.95)].toFixed(3)),
        p99: parseFloat(latencies[Math.floor(iterations * 0.99)].toFixed(3)),
        min: parseFloat(Math.min(...latencies).toFixed(3)),
        max: parseFloat(Math.max(...latencies).toFixed(3)),
        avg: parseFloat((latencies.reduce((s, l) => s + l, 0) / iterations).toFixed(3)),
        unit: 'ms'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
