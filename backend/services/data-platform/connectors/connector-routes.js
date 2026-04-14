/**
 * Data Connector API Routes — register, query, and manage external data sources.
 */
import express from 'express';
import { getConnectorRegistry } from './connector-registry.js';

const router = express.Router();

// List all registered sources
router.get('/sources', (req, res) => {
  const registry = getConnectorRegistry();
  res.json({ success: true, data: registry.listSources() });
});

// Get source status
router.get('/sources/:sourceId', (req, res) => {
  const registry = getConnectorRegistry();
  const status = registry.getSourceStatus(req.params.sourceId);
  if (!status) return res.status(404).json({ success: false, error: 'Source not found' });
  res.json({ success: true, data: status });
});

// Register new source
router.post('/sources', async (req, res) => {
  try {
    const registry = getConnectorRegistry();
    const result = await registry.register(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Delete source
router.delete('/sources/:sourceId', (req, res) => {
  const registry = getConnectorRegistry();
  registry.deregister(req.params.sourceId);
  res.json({ success: true, message: `Source ${req.params.sourceId} deregistered` });
});

// Trigger sync for a source
router.post('/sources/:sourceId/sync', async (req, res) => {
  try {
    const registry = getConnectorRegistry();
    const result = await registry.syncSource(req.params.sourceId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Unified query — the main endpoint agents use
router.post('/query', async (req, res) => {
  try {
    const registry = getConnectorRegistry();
    const result = await registry.query(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Connector types reference
router.get('/types', (req, res) => {
  res.json({
    success: true,
    data: [
      { type: 'rest-api', description: 'Poll or query any REST API', config: ['url', 'apiKey', 'headers', 'pollIntervalMs', 'dataPath'] },
      { type: 'webhook', description: 'Receive inbound webhook events', config: ['secret', 'path'] },
      { type: 'database', description: 'Connect to external databases', config: ['connectionString', 'table', 'query'] },
      { type: 'kafka', description: 'Consume from external Kafka topics', config: ['brokers', 'topic', 'groupId'] },
      { type: 'file', description: 'Ingest from S3, SFTP, or local files', config: ['path', 'format', 'schedule'] },
      { type: 'graphql', description: 'Query GraphQL APIs', config: ['url', 'query', 'variables'] },
      { type: 'mock', description: 'Simulated data for testing', config: ['mockData'] }
    ]
  });
});

// Stats
router.get('/stats', (req, res) => {
  const registry = getConnectorRegistry();
  res.json({ success: true, data: registry.getStats() });
});

export default router;
