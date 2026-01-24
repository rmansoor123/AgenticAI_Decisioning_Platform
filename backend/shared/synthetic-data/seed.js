import { initializeDatabase, db_ops } from '../common/database.js';
import generators from './generators.js';

console.log('🚀 Starting database seed...\n');

// Initialize database schema
initializeDatabase();

// Configuration
const SEED_CONFIG = {
  sellers: 500,
  transactionsPerSeller: 20,
  listingsPerSeller: 10,
  payoutsPerSeller: 5,
  atoEventsPerSeller: 3,
  shipmentsPerSeller: 8,
  mlModels: 15,
  rules: 50,
  experiments: 12,
  datasets: 25,
  metricsSnapshots: 48 // 48 hours of hourly data
};

async function seed() {
  console.log('📦 Seeding Sellers...');
  const sellers = [];
  for (let i = 0; i < SEED_CONFIG.sellers; i++) {
    const seller = generators.generateSeller();
    sellers.push(seller);
    db_ops.insert('sellers', 'seller_id', seller.sellerId, seller);
  }
  console.log(`   ✓ Created ${sellers.length} sellers`);

  console.log('💳 Seeding Transactions...');
  let txCount = 0;
  for (const seller of sellers) {
    for (let i = 0; i < SEED_CONFIG.transactionsPerSeller; i++) {
      const tx = generators.generateTransaction(seller.sellerId);
      db_ops.insert('transactions', 'transaction_id', tx.transactionId, tx);
      txCount++;
    }
  }
  console.log(`   ✓ Created ${txCount} transactions`);

  console.log('📋 Seeding Listings...');
  let listingCount = 0;
  for (const seller of sellers) {
    for (let i = 0; i < SEED_CONFIG.listingsPerSeller; i++) {
      const listing = generators.generateListing(seller.sellerId);
      db_ops.insert('listings', 'listing_id', listing.listingId, listing);
      listingCount++;
    }
  }
  console.log(`   ✓ Created ${listingCount} listings`);

  console.log('💰 Seeding Payouts...');
  let payoutCount = 0;
  for (const seller of sellers) {
    for (let i = 0; i < SEED_CONFIG.payoutsPerSeller; i++) {
      const payout = generators.generatePayout(seller.sellerId);
      db_ops.insert('payouts', 'payout_id', payout.payoutId, payout);
      payoutCount++;
    }
  }
  console.log(`   ✓ Created ${payoutCount} payouts`);

  console.log('🔐 Seeding ATO Events...');
  let atoCount = 0;
  for (const seller of sellers) {
    for (let i = 0; i < SEED_CONFIG.atoEventsPerSeller; i++) {
      const event = generators.generateATOEvent(seller.sellerId);
      db_ops.insert('ato_events', 'event_id', event.eventId, event);
      atoCount++;
    }
  }
  console.log(`   ✓ Created ${atoCount} ATO events`);

  console.log('📦 Seeding Shipments...');
  let shipmentCount = 0;
  for (const seller of sellers) {
    for (let i = 0; i < SEED_CONFIG.shipmentsPerSeller; i++) {
      const shipment = generators.generateShipment(seller.sellerId);
      db_ops.insert('shipments', 'shipment_id', shipment.shipmentId, shipment);
      shipmentCount++;
    }
  }
  console.log(`   ✓ Created ${shipmentCount} shipments`);

  console.log('🧠 Seeding ML Models...');
  for (let i = 0; i < SEED_CONFIG.mlModels; i++) {
    const model = generators.generateMLModel();
    db_ops.insert('ml_models', 'model_id', model.modelId, model);
  }
  console.log(`   ✓ Created ${SEED_CONFIG.mlModels} ML models`);

  console.log('📜 Seeding Rules...');
  for (let i = 0; i < SEED_CONFIG.rules; i++) {
    const rule = generators.generateRule();
    db_ops.insert('rules', 'rule_id', rule.ruleId, rule);
  }
  console.log(`   ✓ Created ${SEED_CONFIG.rules} rules`);

  console.log('🧪 Seeding Experiments...');
  for (let i = 0; i < SEED_CONFIG.experiments; i++) {
    const experiment = generators.generateExperiment();
    db_ops.insert('experiments', 'experiment_id', experiment.experimentId, experiment);
  }
  console.log(`   ✓ Created ${SEED_CONFIG.experiments} experiments`);

  console.log('📚 Seeding Data Catalog...');
  for (let i = 0; i < SEED_CONFIG.datasets; i++) {
    const dataset = generators.generateDataset();
    db_ops.insert('datasets', 'dataset_id', dataset.datasetId, dataset);
  }
  console.log(`   ✓ Created ${SEED_CONFIG.datasets} datasets`);

  console.log('📊 Seeding Metrics History...');
  for (let i = 0; i < SEED_CONFIG.metricsSnapshots; i++) {
    const metrics = generators.generateMetricsSnapshot();
    const pastTime = new Date(Date.now() - (i * 60 * 60 * 1000)).toISOString();
    metrics.timestamp = pastTime;
    db_ops.run(
      'INSERT INTO metrics_history (data, timestamp) VALUES (?, ?)',
      [JSON.stringify(metrics), pastTime]
    );
  }
  console.log(`   ✓ Created ${SEED_CONFIG.metricsSnapshots} metrics snapshots`);

  // Summary
  console.log('\n✅ Database seeding complete!\n');
  console.log('Summary:');
  console.log(`   Sellers:      ${db_ops.count('sellers')}`);
  console.log(`   Transactions: ${db_ops.count('transactions')}`);
  console.log(`   Listings:     ${db_ops.count('listings')}`);
  console.log(`   Payouts:      ${db_ops.count('payouts')}`);
  console.log(`   ATO Events:   ${db_ops.count('ato_events')}`);
  console.log(`   Shipments:    ${db_ops.count('shipments')}`);
  console.log(`   ML Models:    ${db_ops.count('ml_models')}`);
  console.log(`   Rules:        ${db_ops.count('rules')}`);
  console.log(`   Experiments:  ${db_ops.count('experiments')}`);
  console.log(`   Datasets:     ${db_ops.count('datasets')}`);
  console.log(`   Metrics:      ${db_ops.count('metrics_history')}`);
}

seed().catch(console.error);
