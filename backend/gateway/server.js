import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { initializeDatabase, db_ops } from '../shared/common/database.js';
import generators from '../shared/synthetic-data/generators.js';
const { generateTransaction, generateMetricsSnapshot, generateSeller, generateListing, generatePayout, generateATOEvent, generateShipment, generateMLModel, generateRule, generateExperiment, generateDataset } = generators;

// Seed database with initial data
function seedDatabase() {
  console.log('Seeding database with synthetic data...');

  // Seed sellers
  for (let i = 0; i < 100; i++) {
    const seller = generateSeller();
    db_ops.insert('sellers', 'seller_id', seller.sellerId, seller);
  }

  // Seed transactions
  const sellers = db_ops.getAll('sellers', 100, 0);
  sellers.forEach(s => {
    for (let i = 0; i < 10; i++) {
      const tx = generateTransaction(s.data.sellerId);
      db_ops.insert('transactions', 'transaction_id', tx.transactionId, tx);
    }
  });

  // Seed other entities
  sellers.slice(0, 50).forEach(s => {
    for (let i = 0; i < 5; i++) {
      const listing = generateListing(s.data.sellerId);
      db_ops.insert('listings', 'listing_id', listing.listingId, listing);
    }
    for (let i = 0; i < 2; i++) {
      const payout = generatePayout(s.data.sellerId);
      db_ops.insert('payouts', 'payout_id', payout.payoutId, payout);
    }
    const ato = generateATOEvent(s.data.sellerId);
    db_ops.insert('ato_events', 'event_id', ato.eventId, ato);
    for (let i = 0; i < 3; i++) {
      const shipment = generateShipment(s.data.sellerId);
      db_ops.insert('shipments', 'shipment_id', shipment.shipmentId, shipment);
    }
  });

  // Seed ML models
  for (let i = 0; i < 15; i++) {
    const model = generateMLModel();
    db_ops.insert('ml_models', 'model_id', model.modelId, model);
  }

  // Seed rules
  for (let i = 0; i < 50; i++) {
    const rule = generateRule();
    db_ops.insert('rules', 'rule_id', rule.ruleId, rule);
  }

  // Seed experiments
  for (let i = 0; i < 12; i++) {
    const exp = generateExperiment();
    db_ops.insert('experiments', 'experiment_id', exp.experimentId, exp);
  }

  // Seed datasets
  for (let i = 0; i < 25; i++) {
    const dataset = generateDataset();
    db_ops.insert('datasets', 'dataset_id', dataset.datasetId, dataset);
  }

  console.log('Database seeded successfully!');
  console.log(`  Sellers: ${db_ops.count('sellers')}`);
  console.log(`  Transactions: ${db_ops.count('transactions')}`);
  console.log(`  Listings: ${db_ops.count('listings')}`);
  console.log(`  ML Models: ${db_ops.count('ml_models')}`);
  console.log(`  Rules: ${db_ops.count('rules')}`);
  console.log(`  Experiments: ${db_ops.count('experiments')}`);
}

// Import service routers
import sellerOnboardingRouter from '../services/business/seller-onboarding/index.js';
import sellerATORouter from '../services/business/seller-ato/index.js';
import sellerPayoutRouter from '../services/business/seller-payout/index.js';
import sellerListingRouter from '../services/business/seller-listing/index.js';
import sellerShippingRouter from '../services/business/seller-shipping/index.js';
import dataIngestionRouter from '../services/data-platform/ingestion/index.js';
import dataCatalogRouter from '../services/data-platform/catalog/index.js';
import queryFederationRouter from '../services/data-platform/query-federation/index.js';
import mlInferenceRouter from '../services/ml-platform/inference/index.js';
import mlGovernanceRouter from '../services/ml-platform/governance/index.js';
import mlMonitoringRouter from '../services/ml-platform/monitoring/index.js';
import rulesRouter from '../services/decision-engine/rules/index.js';
import executionRouter from '../services/decision-engine/execution/index.js';
import abTestingRouter from '../services/experimentation/ab-testing/index.js';
import simulationRouter from '../services/experimentation/simulation/index.js';
import agentsRouter from '../services/agents/index.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Initialize database and seed with data
initializeDatabase();
seedDatabase();

// ============================================================================
// API ROUTES
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      'seller-onboarding': 'running',
      'seller-ato': 'running',
      'seller-payout': 'running',
      'seller-listing': 'running',
      'seller-shipping': 'running',
      'data-platform': 'running',
      'ml-platform': 'running',
      'decision-engine': 'running',
      'experimentation': 'running'
    }
  });
});

// API Documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Fraud Detection Platform API',
    version: '1.0.0',
    description: 'Enterprise Risk Decisioning Platform',
    endpoints: {
      // Business Services
      '/api/onboarding': 'Seller Onboarding Service',
      '/api/ato': 'Account Takeover Prevention Service',
      '/api/payout': 'Seller Payout Service',
      '/api/listing': 'Seller Listing Service',
      '/api/shipping': 'Shipping & Fulfillment Service',
      // Data Platform
      '/api/data/ingestion': 'Data Ingestion (Real-time, Near Real-time, Batch)',
      '/api/data/catalog': 'Data Catalog & Lineage',
      '/api/data/query': 'Query Federation & Data Playground',
      // ML Platform
      '/api/ml/inference': 'Model Inference & Predictions',
      '/api/ml/governance': 'Model Registry & Governance',
      '/api/ml/monitoring': 'Model Monitoring & Drift Detection',
      // Decision Engine
      '/api/rules': 'Rule Management',
      '/api/decisions': 'Decision Execution Engine',
      // Experimentation
      '/api/experiments': 'A/B Testing & Experiments',
      '/api/simulation': 'Rule Simulation Engine',
      // Real-time
      '/api/metrics': 'Platform Metrics',
      '/api/stream': 'Transaction Stream',
      '/ws': 'WebSocket for Real-time Updates'
    }
  });
});

// Business Services
app.use('/api/onboarding', sellerOnboardingRouter);
app.use('/api/ato', sellerATORouter);
app.use('/api/payout', sellerPayoutRouter);
app.use('/api/listing', sellerListingRouter);
app.use('/api/shipping', sellerShippingRouter);

// Data Platform
app.use('/api/data/ingestion', dataIngestionRouter);
app.use('/api/data/catalog', dataCatalogRouter);
app.use('/api/data/query', queryFederationRouter);

// ML Platform
app.use('/api/ml/inference', mlInferenceRouter);
app.use('/api/ml/governance', mlGovernanceRouter);
app.use('/api/ml/monitoring', mlMonitoringRouter);

// Decision Engine
app.use('/api/rules', rulesRouter);
app.use('/api/decisions', executionRouter);

// Experimentation
app.use('/api/experiments', abTestingRouter);
app.use('/api/simulation', simulationRouter);

// Agentic AI
app.use('/api/agents', agentsRouter);

// ============================================================================
// METRICS & DASHBOARD ENDPOINTS
// ============================================================================

// Get current platform metrics
app.get('/api/metrics', (req, res) => {
  const metrics = generateMetricsSnapshot();
  res.json({ success: true, data: metrics });
});

// Get metrics history
app.get('/api/metrics/history', (req, res) => {
  const { hours = 24 } = req.query;
  const history = [];

  for (let i = parseInt(hours) - 1; i >= 0; i--) {
    const snapshot = generateMetricsSnapshot();
    snapshot.timestamp = new Date(Date.now() - i * 60 * 60 * 1000).toISOString();
    history.push(snapshot);
  }

  res.json({ success: true, data: history });
});

// Get platform architecture overview
app.get('/api/architecture', (req, res) => {
  res.json({
    success: true,
    data: {
      layers: [
        {
          id: 'data',
          name: 'Data Foundation',
          description: 'Real-time data ingestion & feature engineering',
          services: ['ingestion', 'processing', 'catalog', 'query-federation'],
          capabilities: ['Real-time streaming', 'Batch processing', 'Feature store', 'Data lineage'],
          stats: {
            dataSources: 47,
            features: 2840,
            latency: '< 5ms'
          }
        },
        {
          id: 'ml',
          name: 'ML Models',
          description: 'Ensemble of specialized detection models',
          services: ['training', 'inference', 'monitoring', 'governance'],
          capabilities: ['Model training', 'Real-time inference', 'Drift detection', 'Model registry'],
          stats: {
            models: 15,
            accuracy: '98.7%',
            retraining: 'Hourly'
          }
        },
        {
          id: 'engine',
          name: 'Decision Engine',
          description: 'Rules engine with ML score aggregation',
          services: ['rules', 'execution'],
          capabilities: ['Rule management', 'Real-time evaluation', 'Action routing', 'Audit trail'],
          stats: {
            rules: 50,
            decisions: '< 50ms',
            uptime: '99.99%'
          }
        },
        {
          id: 'experiment',
          name: 'Experimentation',
          description: 'A/B testing and model performance tracking',
          services: ['ab-testing', 'simulation'],
          capabilities: ['Shadow mode', 'Champion/Challenger', 'Threshold testing', 'Impact analysis'],
          stats: {
            experiments: 12,
            simulations: 'Unlimited',
            rolloutControl: '100%'
          }
        }
      ],
      businessServices: [
        { id: 'onboarding', name: 'Seller Onboarding', endpoint: '/api/onboarding' },
        { id: 'ato', name: 'Account Takeover Prevention', endpoint: '/api/ato' },
        { id: 'payout', name: 'Seller Payout', endpoint: '/api/payout' },
        { id: 'listing', name: 'Listing Management', endpoint: '/api/listing' },
        { id: 'shipping', name: 'Shipping & Fulfillment', endpoint: '/api/shipping' }
      ]
    }
  });
});

// ============================================================================
// WEBSOCKET FOR REAL-TIME UPDATES
// ============================================================================

const wsClients = new Set();

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  wsClients.add(ws);

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log('WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    wsClients.delete(ws);
  });

  // Send initial data
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to Fraud Detection Platform',
    timestamp: new Date().toISOString()
  }));
});

// Broadcast to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  wsClients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

// Generate and broadcast real-time transactions
setInterval(() => {
  if (wsClients.size > 0) {
    const transaction = generateTransaction();

    // Simulate decision
    const decisions = ['APPROVED', 'APPROVED', 'APPROVED', 'APPROVED', 'BLOCKED', 'REVIEW'];
    transaction.decision = decisions[Math.floor(Math.random() * decisions.length)];

    broadcast({
      type: 'transaction',
      data: transaction,
      timestamp: new Date().toISOString()
    });
  }
}, 1500);

// Broadcast metrics updates
setInterval(() => {
  if (wsClients.size > 0) {
    const metrics = generateMetricsSnapshot();
    broadcast({
      type: 'metrics',
      data: metrics,
      timestamp: new Date().toISOString()
    });
  }
}, 5000);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// ============================================================================
// START SERVER
// ============================================================================

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🛡️  FRAUD DETECTION PLATFORM                                ║
║                                                               ║
║   API Gateway running on http://localhost:${PORT}              ║
║   WebSocket available at ws://localhost:${PORT}/ws             ║
║                                                               ║
║   Services:                                                   ║
║   • Seller Onboarding    /api/onboarding                      ║
║   • Account Takeover     /api/ato                             ║
║   • Seller Payout        /api/payout                          ║
║   • Seller Listing       /api/listing                         ║
║   • Seller Shipping      /api/shipping                        ║
║   • Data Ingestion       /api/data/ingestion                  ║
║   • Data Catalog         /api/data/catalog                    ║
║   • Query Federation     /api/data/query                      ║
║   • ML Inference         /api/ml/inference                    ║
║   • ML Governance        /api/ml/governance                   ║
║   • ML Monitoring        /api/ml/monitoring                   ║
║   • Rules Engine         /api/rules                           ║
║   • Decision Engine      /api/decisions                       ║
║   • Experiments          /api/experiments                     ║
║   • Simulation           /api/simulation                      ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
