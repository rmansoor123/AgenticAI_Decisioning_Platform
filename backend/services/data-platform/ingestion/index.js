import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// In-memory stream buffer (simulating Kafka/Kinesis)
const streamBuffer = {
  realtime: [],
  nearRealtime: [],
  batch: []
};

// Pipeline configurations
const pipelines = {
  realtime: {
    id: 'PIPE-RT-001',
    name: 'Real-time Transaction Stream',
    type: 'STREAMING',
    source: 'kafka://transactions',
    destination: 'feature-store',
    status: 'RUNNING',
    throughput: 0,
    latencyMs: 0,
    lastProcessed: null
  },
  nearRealtime: {
    id: 'PIPE-NRT-001',
    name: 'Near Real-time Aggregations',
    type: 'MICRO_BATCH',
    source: 'kafka://events',
    destination: 'aggregation-store',
    status: 'RUNNING',
    batchIntervalSec: 60,
    lastBatch: null
  },
  batch: {
    id: 'PIPE-BATCH-001',
    name: 'Daily Feature Engineering',
    type: 'BATCH',
    source: 's3://raw-data',
    destination: 's3://curated-data',
    status: 'IDLE',
    schedule: '0 2 * * *',
    lastRun: null
  }
};

// Ingest event (real-time)
router.post('/realtime', (req, res) => {
  try {
    const event = {
      eventId: uuidv4(),
      ...req.body,
      ingestedAt: new Date().toISOString(),
      pipeline: 'realtime'
    };

    // Add to buffer
    streamBuffer.realtime.push(event);
    if (streamBuffer.realtime.length > 1000) {
      streamBuffer.realtime.shift();
    }

    // Update pipeline metrics with real timing
    const startMs = performance.now();
    pipelines.realtime.throughput++;
    pipelines.realtime.lastProcessed = new Date().toISOString();

    // Process and store (real feature extraction)
    const features = extractFeatures(event);

    pipelines.realtime.latencyMs = parseFloat((performance.now() - startMs).toFixed(3));

    res.status(201).json({
      success: true,
      data: {
        eventId: event.eventId,
        features,
        latencyMs: pipelines.realtime.latencyMs
      }
    });
  } catch (error) {
    // Dead letter queue on failure
    try {
      db_ops.run(
        'INSERT INTO dead_letter_queue (id, pipeline, event_data, error_message, created_at) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), 'realtime', JSON.stringify(req.body), error.message, new Date().toISOString()]
      );
    } catch (_) { /* best-effort */ }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ingest batch (near real-time micro-batch)
router.post('/near-realtime', (req, res) => {
  try {
    const { events } = req.body;

    const processed = events.map(event => ({
      eventId: uuidv4(),
      ...event,
      ingestedAt: new Date().toISOString(),
      pipeline: 'near-realtime'
    }));

    streamBuffer.nearRealtime.push(...processed);
    if (streamBuffer.nearRealtime.length > 5000) {
      streamBuffer.nearRealtime = streamBuffer.nearRealtime.slice(-5000);
    }

    pipelines.nearRealtime.lastBatch = new Date().toISOString();

    res.status(201).json({
      success: true,
      data: {
        processedCount: processed.length,
        batchId: uuidv4()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trigger batch pipeline
router.post('/batch/trigger', (req, res) => {
  try {
    const { pipelineName, params } = req.body;

    const runId = `RUN-${uuidv4().substring(0, 8).toUpperCase()}`;
    const run = {
      runId,
      pipelineName: pipelineName || 'daily-feature-engineering',
      status: 'RUNNING',
      params,
      startedAt: new Date().toISOString(),
      stages: [
        { name: 'extract', status: 'COMPLETED', duration: 0 },
        { name: 'transform', status: 'RUNNING', duration: 0 },
        { name: 'load', status: 'PENDING', duration: 0 }
      ]
    };

    db_ops.run(
      'INSERT INTO pipeline_runs (run_id, pipeline_name, status, data, started_at) VALUES (?, ?, ?, ?, ?)',
      [runId, run.pipelineName, run.status, JSON.stringify(run), run.startedAt]
    );

    pipelines.batch.status = 'RUNNING';
    pipelines.batch.lastRun = run.startedAt;

    // Simulate async completion
    setTimeout(() => {
      run.status = 'COMPLETED';
      run.completedAt = new Date().toISOString();
      run.stages.forEach(s => s.status = 'COMPLETED');
      db_ops.run(
        'UPDATE pipeline_runs SET status = ?, data = ?, completed_at = ? WHERE run_id = ?',
        ['COMPLETED', JSON.stringify(run), run.completedAt, runId]
      );
      pipelines.batch.status = 'IDLE';
    }, 5000);

    res.status(202).json({
      success: true,
      data: run
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pipeline status
router.get('/pipelines', (req, res) => {
  try {
    res.json({
      success: true,
      data: Object.values(pipelines)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific pipeline
router.get('/pipelines/:pipelineId', (req, res) => {
  try {
    const pipeline = Object.values(pipelines).find(p => p.id === req.params.pipelineId);
    if (!pipeline) {
      return res.status(404).json({ success: false, error: 'Pipeline not found' });
    }
    res.json({ success: true, data: pipeline });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pipeline runs
router.get('/runs', (req, res) => {
  try {
    const { limit = 20, status } = req.query;
    let runs = db_ops.raw(
      'SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ?',
      [parseInt(limit)]
    );

    runs = runs.map(r => ({ ...r, data: JSON.parse(r.data) }));

    if (status) {
      runs = runs.filter(r => r.status === status);
    }

    res.json({ success: true, data: runs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get stream buffer stats
router.get('/streams/stats', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        realtime: {
          bufferSize: streamBuffer.realtime.length,
          lastEvent: streamBuffer.realtime[streamBuffer.realtime.length - 1]?.ingestedAt,
          throughput: pipelines.realtime.throughput
        },
        nearRealtime: {
          bufferSize: streamBuffer.nearRealtime.length,
          lastBatch: pipelines.nearRealtime.lastBatch
        },
        batch: {
          status: pipelines.batch.status,
          lastRun: pipelines.batch.lastRun
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to extract features from event
function extractFeatures(event) {
  const ts = new Date(event.timestamp || event.ingestedAt);
  const hour = ts.getHours();
  const amount = event.amount || 0;

  // Velocity: count events from same entity in recent buffer
  const entityId = event.sellerId || event.transactionId || event.eventId;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentFromEntity = streamBuffer.realtime.filter(
    e => (e.sellerId === entityId || e.transactionId === entityId) && e.ingestedAt > oneHourAgo
  ).length;

  return {
    entityId,
    features: {
      amount,
      timestamp: event.timestamp || event.ingestedAt,
      hourOfDay: hour,
      dayOfWeek: ts.getDay(),
      amountBucket: amount < 100 ? 'low' : amount < 500 ? 'medium' : amount < 2000 ? 'high' : 'very_high',
      isWeekend: [0, 6].includes(ts.getDay()),
      amountLog: parseFloat(Math.log10(amount + 1).toFixed(4)),
      hourBucket: hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening',
      isHighRisk: amount > 5000,
      velocityIndicator: recentFromEntity
    },
    metadata: {
      source: event.pipeline,
      extractedAt: new Date().toISOString()
    }
  };
}

// ─── Agent-Enhanced Route ────────────────────────────────────────────────────

router.post('/agent/ingest', (req, res) => {
  const correlationId = `INGEST-${Date.now().toString(36).toUpperCase()}`;

  import('../../../agents/specialized/data-agent.js')
    .then(({ getDataAgent }) => {
      const agent = getDataAgent();
      agent.reason({ operation: 'ingest', ...req.body }, { correlationId })
        .then(() => console.log(`[DataAgent:Ingest] Completed ${correlationId}`))
        .catch(err => console.error(`[DataAgent:Ingest] Error ${correlationId}:`, err.message));
    })
    .catch(err => console.error('[DataAgent:Ingest] Import error:', err.message));

  res.status(202).json({
    success: true,
    data: { correlationId, status: 'ACCEPTED', message: 'Ingestion analysis started' }
  });
});

export default router;
