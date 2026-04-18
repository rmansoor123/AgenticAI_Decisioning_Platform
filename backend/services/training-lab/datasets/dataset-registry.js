/**
 * Dataset Registry — version, track, and serve training datasets.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

class DatasetRegistry {
  constructor() {
    this.datasets = new Map();
    this.stats = { registered: 0, versions: 0 };
    this._seedDefaults();
  }

  _seedDefaults() {
    const defaults = [
      { datasetId: 'DS-FRAUD-TRAINING', name: 'Fraud Detection Training Set', domain: 'fraud_detection', version: '1.0.0', recordCount: 10000, format: 'csv', features: 25, labelDistribution: { legitimate: 8500, fraudulent: 1500 }, quality: 92 },
      { datasetId: 'DS-ONBOARDING-FEATURES', name: 'Onboarding Feature Set', domain: 'seller_onboarding', version: '1.0.0', recordCount: 8000, format: 'csv', features: 25, labelDistribution: { approved: 6800, rejected: 1200 }, quality: 88 },
      { datasetId: 'DS-CREDIT-SCORING', name: 'Credit Scoring Dataset', domain: 'credit_underwriting', version: '1.0.0', recordCount: 5000, format: 'csv', features: 15, labelDistribution: { approved: 3500, denied: 1500 }, quality: 85 },
      { datasetId: 'DS-PAYMENT-FRAUD', name: 'Payment Fraud Dataset', domain: 'payment_processing', version: '1.0.0', recordCount: 20000, format: 'json', features: 30, labelDistribution: { legitimate: 18000, fraudulent: 2000 }, quality: 90 },
      { datasetId: 'DS-RL-TRAJECTORIES', name: 'Agent Trajectory Dataset', domain: 'rl_training', version: '1.0.0', recordCount: 1000, format: 'json', features: 0, labelDistribution: { completed: 800, failed: 200 }, quality: 78 }
    ];

    for (const ds of defaults) {
      this.datasets.set(ds.datasetId, {
        ...ds, status: 'ACTIVE', createdAt: new Date().toISOString(),
        versions: [{ version: ds.version, createdAt: new Date().toISOString(), recordCount: ds.recordCount }]
      });
    }
    this.stats.registered = defaults.length;
    this.stats.versions = defaults.length;
  }

  register(config) {
    const { datasetId, name, domain, version = '1.0.0', recordCount = 0, format = 'csv', features = 0, labelDistribution = {}, quality = 0 } = config;
    const id = datasetId || `DS-${Date.now().toString(36).toUpperCase()}`;

    const dataset = {
      datasetId: id, name, domain, version, recordCount, format, features,
      labelDistribution, quality, status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      versions: [{ version, createdAt: new Date().toISOString(), recordCount }]
    };

    this.datasets.set(id, dataset);
    this.stats.registered++;
    this.stats.versions++;
    return dataset;
  }

  addVersion(datasetId, version, recordCount) {
    const ds = this.datasets.get(datasetId);
    if (!ds) return null;
    ds.version = version;
    ds.recordCount = recordCount;
    ds.versions.push({ version, createdAt: new Date().toISOString(), recordCount });
    this.stats.versions++;
    return ds;
  }

  getDataset(datasetId) { return this.datasets.get(datasetId) || null; }
  listDatasets() { return Array.from(this.datasets.values()); }
  getStats() { return { ...this.stats, totalDatasets: this.datasets.size }; }
}

let instance = null;
export function getDatasetRegistry() {
  if (!instance) instance = new DatasetRegistry();
  return instance;
}
export default { DatasetRegistry, getDatasetRegistry };
