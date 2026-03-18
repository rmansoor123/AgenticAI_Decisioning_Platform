/**
 * Feature Store Stats Endpoint
 *
 * Routes (mounted under /api/features):
 *   GET /stats  — feature store backend type + usage statistics
 */

import express from 'express';
import { getFeatureStoreBackend, getFeatureStoreBackendType } from './feature-store-factory.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /stats
// ---------------------------------------------------------------------------
router.get('/stats', async (req, res) => {
  try {
    const store = await getFeatureStoreBackend();
    const backendType = getFeatureStoreBackendType();

    let stats = {
      reads:         0,
      writes:        0,
      hits:          0,
      misses:        0,
      hitRate:       0,
      featureGroups: []
    };

    try {
      if (typeof store.getStats === 'function') {
        const raw = store.getStats();
        stats = {
          reads:         raw.reads         ?? 0,
          writes:        raw.writes        ?? 0,
          hits:          raw.hits          ?? 0,
          misses:        raw.misses        ?? 0,
          hitRate:       raw.hitRate       ?? 0,
          featureGroups: raw.featureGroups ?? [],
          onlineStoreSize: raw.onlineStoreSize ?? null,
          freshness:     raw.freshness     ?? null
        };
      }
    } catch (e) {
      // store not fully initialised yet — return zero stats
    }

    res.json({
      backendType,
      label: backendType === 'redis' ? 'Redis Feature Store' : 'In-Memory Feature Store',
      ...stats,
      retrievedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
