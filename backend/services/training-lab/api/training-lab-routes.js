/**
 * Training Lab API Routes
 */
import express from 'express';
import { getDocumentIngestionEngine } from '../pipeline/document-ingestion.js';
import { getDataProcessingPipeline } from '../pipeline/data-processing-pipeline.js';
import { getQualityMetrics } from '../pipeline/quality-metrics.js';
import { getLabelingEngine } from '../pipeline/labeling-engine.js';
import { getEnvironmentBuilder } from '../environments/environment-builder.js';
import { getTaskGenerator } from '../environments/task-generator.js';
import { getRewardSystem } from '../environments/reward-system.js';
import { getEvalFramework } from '../evaluation/eval-framework.js';
import { getDatasetRegistry } from '../datasets/dataset-registry.js';

const router = express.Router();

// --- Document Ingestion ---
router.post('/pipeline/ingest', async (req, res) => {
  try { res.json({ success: true, data: await getDocumentIngestionEngine().ingest(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/pipeline/batch-ingest', async (req, res) => {
  try { res.json({ success: true, data: await getDocumentIngestionEngine().batchIngest(req.body.documents || []) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/pipeline/documents', async (req, res) => {
  try { res.json({ success: true, data: await getDocumentIngestionEngine().getDocuments(req.query) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- Data Processing Pipeline ---
router.post('/pipeline/process', async (req, res) => {
  try { res.json({ success: true, data: await getDataProcessingPipeline().process(req.body.documents || [], req.body.options) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/pipeline/stages', (req, res) => {
  res.json({ success: true, data: getDataProcessingPipeline().getStages() });
});

// --- Quality Metrics ---
router.post('/pipeline/quality', async (req, res) => {
  try { res.json({ success: true, data: await getQualityMetrics().evaluateDataset(req.body.documents || []) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- Labeling ---
router.post('/pipeline/label', async (req, res) => {
  try { res.json({ success: true, data: await getLabelingEngine().autoLabel(req.body) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/pipeline/judge', async (req, res) => {
  try { res.json({ success: true, data: await getLabelingEngine().modelJudge(req.body.document, req.body.labels) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/pipeline/review-queue', (req, res) => {
  res.json({ success: true, data: getLabelingEngine().getReviewQueue() });
});

// --- RL Environments ---
router.post('/environments', (req, res) => {
  try { res.json({ success: true, data: getEnvironmentBuilder().create(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/environments', (req, res) => {
  res.json({ success: true, data: getEnvironmentBuilder().listEnvironments() });
});

router.get('/environments/:envId', (req, res) => {
  const env = getEnvironmentBuilder().getEnvironment(req.params.envId);
  if (!env) return res.status(404).json({ success: false, error: 'Environment not found' });
  res.json({ success: true, data: env });
});

router.post('/environments/:envId/run', async (req, res) => {
  try { res.json({ success: true, data: await getEnvironmentBuilder().runEpisode(req.params.envId) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- Task Generation ---
router.post('/tasks/generate', (req, res) => {
  try { res.json({ success: true, data: getTaskGenerator().generate(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/tasks/domains', (req, res) => {
  res.json({ success: true, data: { domains: getTaskGenerator().getDomains(), difficulties: getTaskGenerator().getDifficulties() } });
});

// --- Reward System ---
router.post('/rewards/evaluate', (req, res) => {
  try { res.json({ success: true, data: getRewardSystem().evaluate(req.body.trajectory, req.body.domain) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/rewards/verify', (req, res) => {
  try { res.json({ success: true, data: getRewardSystem().verify(req.body.trajectory, req.body.rubric) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/rewards/configs', (req, res) => {
  res.json({ success: true, data: getRewardSystem().getRewardConfigs() });
});

// --- Datasets ---
router.get('/datasets', (req, res) => {
  res.json({ success: true, data: getDatasetRegistry().listDatasets() });
});

router.get('/datasets/:datasetId', (req, res) => {
  const ds = getDatasetRegistry().getDataset(req.params.datasetId);
  if (!ds) return res.status(404).json({ success: false, error: 'Dataset not found' });
  res.json({ success: true, data: ds });
});

router.post('/datasets', (req, res) => {
  try { res.json({ success: true, data: getDatasetRegistry().register(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// --- Stats ---
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      pipeline: { ingestion: getDocumentIngestionEngine().getStats(), processing: getDataProcessingPipeline().getStats(), quality: getQualityMetrics().getStats(), labeling: getLabelingEngine().getStats() },
      environments: getEnvironmentBuilder().getStats(),
      tasks: getTaskGenerator().getStats(),
      rewards: getRewardSystem().getStats(),
      evaluation: getEvalFramework().getStats(),
      datasets: getDatasetRegistry().getStats()
    }
  });
});

export default router;
