import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Query history
const queryHistory = [];

// Execute federated query
router.post('/query', (req, res) => {
  try {
    const { sql, sources, limit = 100 } = req.body;

    const queryId = `QRY-${uuidv4().substring(0, 8).toUpperCase()}`;
    const startTime = Date.now();

    // Parse and execute query (simplified simulation)
    const results = executeQuery(sql, sources, limit);
    const executionTimeMs = Date.now() - startTime;

    const queryRecord = {
      queryId,
      sql,
      sources,
      rowsReturned: results.length,
      executionTimeMs,
      timestamp: new Date().toISOString(),
      status: 'COMPLETED'
    };

    queryHistory.unshift(queryRecord);
    if (queryHistory.length > 100) queryHistory.pop();

    res.json({
      success: true,
      data: {
        queryId,
        results,
        metadata: {
          rowsReturned: results.length,
          executionTimeMs,
          sources: sources || ['default']
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get query history
router.get('/history', (req, res) => {
  try {
    const { limit = 20 } = req.query;
    res.json({
      success: true,
      data: queryHistory.slice(0, parseInt(limit))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available data sources
router.get('/sources', (req, res) => {
  try {
    const sources = [
      {
        id: 'transactions',
        name: 'Transactions DB',
        type: 'SQLITE',
        tables: ['transactions'],
        status: 'CONNECTED'
      },
      {
        id: 'sellers',
        name: 'Sellers DB',
        type: 'SQLITE',
        tables: ['sellers'],
        status: 'CONNECTED'
      },
      {
        id: 'feature-store',
        name: 'Feature Store',
        type: 'REDIS',
        collections: ['seller_features', 'transaction_features'],
        status: 'CONNECTED'
      },
      {
        id: 'data-lake',
        name: 'Data Lake',
        type: 'S3',
        buckets: ['raw-data', 'curated-data', 'features'],
        status: 'CONNECTED'
      },
      {
        id: 'ml-predictions',
        name: 'ML Predictions',
        type: 'API',
        endpoints: ['/predict', '/batch-predict'],
        status: 'CONNECTED'
      }
    ];

    res.json({ success: true, data: sources });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Preview query (explain plan)
router.post('/explain', (req, res) => {
  try {
    const { sql } = req.body;

    // Real timing-based explain plan
    const stages = [];
    let t0 = performance.now();

    // Stage 1: Parse SQL
    const sqlLower = (sql || '').toLowerCase();
    stages.push({ step: 1, operation: 'PARSE_SQL', durationMs: parseFloat((performance.now() - t0).toFixed(3)) });

    // Stage 2: Identify sources
    t0 = performance.now();
    const detectedSources = [];
    if (sqlLower.includes('transaction')) detectedSources.push('transactions');
    if (sqlLower.includes('seller')) detectedSources.push('sellers');
    if (sqlLower.includes('payout')) detectedSources.push('payouts');
    if (sqlLower.includes('listing')) detectedSources.push('listings');
    if (detectedSources.length === 0) detectedSources.push('transactions');
    stages.push({ step: 2, operation: 'IDENTIFY_SOURCES', durationMs: parseFloat((performance.now() - t0).toFixed(3)), sources: detectedSources });

    // Stage 3: Estimate fetch
    t0 = performance.now();
    const estimatedRows = detectedSources.reduce((sum, src) => sum + db_ops.count(src), 0);
    stages.push({ step: 3, operation: 'ESTIMATE_ROWS', durationMs: parseFloat((performance.now() - t0).toFixed(3)), estimatedRows });

    // Stage 4-6: Static estimates based on detected complexity
    const hasJoin = sqlLower.includes('join');
    const hasWhere = sqlLower.includes('where');
    stages.push({ step: 4, operation: 'FETCH_FROM_SOURCES', estimatedTimeMs: detectedSources.length * 25 });
    if (hasJoin) stages.push({ step: 5, operation: 'JOIN_RESULTS', estimatedTimeMs: 20 });
    if (hasWhere) stages.push({ step: 6, operation: 'APPLY_FILTERS', estimatedTimeMs: 5 });
    stages.push({ step: stages.length + 1, operation: 'RETURN_RESULTS', estimatedTimeMs: 2 });

    const totalEstimated = stages.reduce((sum, s) => sum + (s.durationMs || s.estimatedTimeMs || 0), 0);

    const plan = {
      sql,
      steps: stages,
      estimatedTotalMs: parseFloat(totalEstimated.toFixed(3)),
      estimatedRows,
      warnings: []
    };

    // Add warnings based on query
    if (sql?.toLowerCase().includes('select *')) {
      plan.warnings.push('SELECT * may return large result sets');
    }
    if (!sql?.toLowerCase().includes('limit')) {
      plan.warnings.push('Consider adding LIMIT clause');
    }

    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Data playground - interactive query interface
router.post('/playground', (req, res) => {
  try {
    const { entity, entityId, features } = req.body;

    // Fetch data from multiple sources for entity
    let result = {};

    if (entity === 'seller') {
      const seller = db_ops.getById('sellers', 'seller_id', entityId);
      const transactions = db_ops.getAll('transactions', 1000, 0)
        .map(t => t.data)
        .filter(t => t.sellerId === entityId);
      const payouts = db_ops.getAll('payouts', 1000, 0)
        .map(p => p.data)
        .filter(p => p.sellerId === entityId);

      result = {
        entity: 'seller',
        entityId,
        profile: seller?.data,
        aggregations: {
          totalTransactions: transactions.length,
          totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
          avgTransactionAmount: transactions.length > 0
            ? transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length
            : 0,
          totalPayouts: payouts.length,
          totalPaidOut: payouts.filter(p => p.status === 'COMPLETED').reduce((sum, p) => sum + p.amount, 0)
        },
        recentTransactions: transactions.slice(0, 10),
        recentPayouts: payouts.slice(0, 5)
      };
    } else if (entity === 'transaction') {
      const transaction = db_ops.getById('transactions', 'transaction_id', entityId);
      if (transaction) {
        const seller = db_ops.getById('sellers', 'seller_id', transaction.data.sellerId);
        result = {
          entity: 'transaction',
          entityId,
          transaction: transaction.data,
          seller: seller?.data,
          riskAnalysis: transaction.data.mlScores
        };
      }
    }

    // Filter to requested features if specified
    if (features && features.length > 0) {
      const filtered = {};
      features.forEach(f => {
        if (result[f] !== undefined) filtered[f] = result[f];
      });
      result = filtered;
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get aggregated metrics
router.get('/metrics/:entity', (req, res) => {
  try {
    const { entity } = req.params;
    const { groupBy, timeRange = '24h' } = req.query;

    let metrics = {};

    if (entity === 'transactions') {
      const transactions = db_ops.getAll('transactions', 10000, 0).map(t => t.data);

      metrics = {
        total: transactions.length,
        byStatus: {},
        byDecision: {},
        amountStats: {
          total: 0,
          avg: 0,
          min: Infinity,
          max: 0
        }
      };

      transactions.forEach(t => {
        metrics.byStatus[t.status] = (metrics.byStatus[t.status] || 0) + 1;
        metrics.byDecision[t.decision] = (metrics.byDecision[t.decision] || 0) + 1;
        metrics.amountStats.total += t.amount;
        metrics.amountStats.min = Math.min(metrics.amountStats.min, t.amount);
        metrics.amountStats.max = Math.max(metrics.amountStats.max, t.amount);
      });

      metrics.amountStats.avg = transactions.length > 0
        ? metrics.amountStats.total / transactions.length
        : 0;
    }

    res.json({ success: true, data: metrics });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to execute simplified queries
function executeQuery(sql, sources, limit) {
  // Very simplified SQL parsing - in production would use a proper parser
  const sqlLower = (sql || '').toLowerCase();

  let results = [];

  if (sqlLower.includes('from transactions') || sqlLower.includes('from transaction')) {
    results = db_ops.getAll('transactions', limit, 0).map(t => t.data);
  } else if (sqlLower.includes('from sellers') || sqlLower.includes('from seller')) {
    results = db_ops.getAll('sellers', limit, 0).map(s => s.data);
  } else if (sqlLower.includes('from payouts') || sqlLower.includes('from payout')) {
    results = db_ops.getAll('payouts', limit, 0).map(p => p.data);
  } else if (sqlLower.includes('from listings') || sqlLower.includes('from listing')) {
    results = db_ops.getAll('listings', limit, 0).map(l => l.data);
  } else {
    // Default - return sample data
    results = db_ops.getAll('transactions', Math.min(limit, 10), 0).map(t => t.data);
  }

  // Apply simple WHERE clause filtering
  const whereMatch = sqlLower.match(/where\s+(\w+)\s*=\s*'([^']+)'/);
  if (whereMatch) {
    const [, field, value] = whereMatch;
    results = results.filter(r => {
      const fieldValue = r[field] || r[toCamelCase(field)];
      return fieldValue?.toString().toLowerCase() === value.toLowerCase();
    });
  }

  return results.slice(0, limit);
}

function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

export default router;
