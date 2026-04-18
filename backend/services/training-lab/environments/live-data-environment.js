/**
 * Live Data Environment — connects RL environments to real platform data.
 * Uses the Data Connector Framework to source real seller, transaction,
 * and risk data for environment states.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

class LiveDataEnvironment {
  constructor() {
    this.stats = { runs: 0, realDataPoints: 0 };
  }

  /**
   * Create an environment state from real seller data.
   */
  async createStateFromSeller(sellerId) {
    const db_ops = getDbOps();

    // Get real seller
    let seller = null;
    try {
      const record = await db_ops.getById('sellers', 'seller_id', sellerId);
      seller = record?.data || null;
    } catch (_) {}

    if (!seller) {
      // Fallback: pick a random seller
      const allSellers = (await db_ops.getAll('sellers', 100, 0)).map(s => s.data);
      seller = allSellers[Math.floor(Math.random() * allSellers.length)] || {};
    }

    // Get real transactions
    const allTx = (await db_ops.getAll('transactions', 50000, 0)).map(t => t.data);
    const sellerTx = allTx.filter(t => t.sellerId === seller.sellerId);
    const gmv30d = sellerTx
      .filter(t => new Date(t.createdAt || 0) > new Date(Date.now() - 30 * 86400000))
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    // Try to get risk profile
    let riskScore = seller.riskScore || 30;

    // Try data connectors
    let externalData = {};
    try {
      const { getConnectorRegistry } = await import('../../data-platform/connectors/connector-registry.js');
      const registry = getConnectorRegistry();
      const queryResult = await registry.query({
        entity: 'seller', entityId: seller.sellerId, freshness: '1h'
      });
      externalData = queryResult.results || {};
      this.stats.realDataPoints += queryResult.totalRecords || 0;
    } catch (_) {}

    this.stats.runs++;

    return {
      source: 'LIVE_DATA',
      sellerId: seller.sellerId,
      businessName: seller.businessName || 'Unknown',
      country: seller.country || 'US',
      status: seller.status || 'ACTIVE',
      riskScore,
      gmv30d: Math.round(gmv30d * 100) / 100,
      transactionCount: sellerTx.length,
      accountAgeDays: seller.createdAt ? Math.floor((Date.now() - new Date(seller.createdAt).getTime()) / 86400000) : 0,
      businessCategory: seller.businessCategory || 'OTHER',
      externalDataSources: Object.keys(externalData),
      externalData
    };
  }

  /**
   * Create a batch of states from real sellers for evaluation.
   */
  async createBatchStates(count = 10) {
    const db_ops = getDbOps();
    const allSellers = (await db_ops.getAll('sellers', 10000, 0)).map(s => s.data);

    // Sample sellers
    const sampled = [];
    const shuffled = [...allSellers].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
      const state = await this.createStateFromSeller(shuffled[i].sellerId);
      sampled.push(state);
    }

    return {
      count: sampled.length,
      states: sampled,
      sources: ['sellers', 'transactions', 'data_connectors']
    };
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getLiveDataEnvironment() {
  if (!instance) instance = new LiveDataEnvironment();
  return instance;
}
export default { LiveDataEnvironment, getLiveDataEnvironment };
