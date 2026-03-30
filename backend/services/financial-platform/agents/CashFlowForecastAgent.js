/**
 * Cash Flow Forecast Agent — projects 30-day revenue.
 * Uses weighted moving average + linear trend.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

export class CashFlowForecastAgent {
  constructor() {
    this.stats = { forecasts: 0 };
  }

  async evaluate(input) {
    const { sellerId } = input;
    const startTime = Date.now();

    // Fetch seller's transaction history
    const db_ops = getDbOps();
    const allTx = (await db_ops.getAll('transactions', 50000, 0)).map(t => t.data);
    const sellerTx = allTx.filter(t => t.sellerId === sellerId);

    if (sellerTx.length === 0) {
      return {
        sellerId, projectedRevenue30d: 0, confidence: 0,
        anomalyFlag: false, trend: 'INSUFFICIENT_DATA',
        dailyAverage: 0, latencyMs: Date.now() - startTime
      };
    }

    // Group by week (last 12 weeks)
    const now = Date.now();
    const weeklyRevenue = [];
    for (let w = 0; w < 12; w++) {
      const weekStart = now - (w + 1) * 7 * 86400000;
      const weekEnd = now - w * 7 * 86400000;
      const weekTx = sellerTx.filter(t => {
        const txTime = new Date(t.createdAt || t.timestamp || 0).getTime();
        return txTime >= weekStart && txTime < weekEnd;
      });
      const revenue = weekTx.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
      weeklyRevenue.unshift(revenue); // oldest first
    }

    // Weighted moving average (recent weeks weighted more)
    const weights = weeklyRevenue.map((_, i) => i + 1);
    const weightSum = weights.reduce((s, w) => s + w, 0);
    const wma = weeklyRevenue.reduce((sum, rev, i) => sum + rev * weights[i], 0) / weightSum;

    // Linear regression for trend
    const n = weeklyRevenue.length;
    const xMean = (n - 1) / 2;
    const yMean = weeklyRevenue.reduce((s, v) => s + v, 0) / n;
    let slope = 0;
    let denom = 0;
    for (let i = 0; i < n; i++) {
      slope += (i - xMean) * (weeklyRevenue[i] - yMean);
      denom += (i - xMean) ** 2;
    }
    slope = denom !== 0 ? slope / denom : 0;

    // Project 30 days (roughly 4.3 weeks)
    const projectedWeekly = wma + slope * 2; // 2 weeks into future from midpoint
    const projectedRevenue30d = Math.max(0, Math.round(projectedWeekly * 4.3));
    const dailyAverage = Math.round(projectedRevenue30d / 30);

    // Confidence based on data consistency
    const stdDev = Math.sqrt(weeklyRevenue.reduce((s, v) => s + (v - yMean) ** 2, 0) / n);
    const cv = yMean !== 0 ? stdDev / yMean : 1; // coefficient of variation
    const confidence = Math.max(0, Math.min(1, 1 - cv));

    // Anomaly detection
    const recentWeek = weeklyRevenue[weeklyRevenue.length - 1];
    const anomalyFlag = Math.abs(recentWeek - yMean) > 2 * stdDev;

    // Trend
    let trend = 'STABLE';
    if (slope > yMean * 0.05) trend = 'GROWING';
    if (slope < -yMean * 0.05) trend = 'DECLINING';

    this.stats.forecasts++;

    // Confidence interval
    const margin = projectedRevenue30d * (1 - confidence) * 0.5;
    const confidenceInterval = {
      low: Math.max(0, Math.round(projectedRevenue30d - margin)),
      high: Math.round(projectedRevenue30d + margin)
    };

    return {
      sellerId, projectedRevenue30d, dailyAverage,
      confidence: Math.round(confidence * 100) / 100,
      confidenceInterval, anomalyFlag, trend,
      weeklyRevenue, slope: Math.round(slope),
      dataPoints: sellerTx.length,
      latencyMs: Date.now() - startTime
    };
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getCashFlowForecastAgent() {
  if (!instance) instance = new CashFlowForecastAgent();
  return instance;
}
export default { CashFlowForecastAgent, getCashFlowForecastAgent };
