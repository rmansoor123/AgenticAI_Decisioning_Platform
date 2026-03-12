/**
 * Analytics factory — routes to Pinot or SQLite backend
 * based on ANALYTICS_BACKEND env var ('pinot' | 'sqlite').
 *
 * Mirrors the exact pattern of observability-factory.js.
 *
 * Usage:
 *   import { getAnalyticsBackend, getAnalyticsBackendType } from './analytics-factory.js';
 *   const backend = await getAnalyticsBackend();
 *   const trends = await backend.queryRiskTrends({ domain: 'onboarding', timeWindow: '24h' });
 */

let resolvedBackend = null;

/**
 * Get the analytics backend type.
 * @returns {'pinot' | 'sqlite'}
 */
export function getAnalyticsBackendType() {
  return (process.env.ANALYTICS_BACKEND || 'sqlite').toLowerCase();
}

/**
 * Get the analytics backend (Pinot or SQLite).
 * Lazy-loads the chosen backend; falls back to SQLite on any init error.
 */
export async function getAnalyticsBackend() {
  if (resolvedBackend) return resolvedBackend;

  const backend = getAnalyticsBackendType();

  if (backend === 'pinot') {
    try {
      const { getAnalyticsPinotBackend } = await import('./analytics-pinot.js');
      resolvedBackend = getAnalyticsPinotBackend();
      console.log('[analytics-factory] Backend: Pinot');
      return resolvedBackend;
    } catch (err) {
      console.warn(`[analytics-factory] Pinot init failed, falling back to SQLite: ${err.message}`);
    }
  }

  const { getAnalyticsSQLiteBackend } = await import('./analytics-sqlite.js');
  resolvedBackend = getAnalyticsSQLiteBackend();
  console.log('[analytics-factory] Backend: SQLite');
  return resolvedBackend;
}

export default { getAnalyticsBackend, getAnalyticsBackendType };
