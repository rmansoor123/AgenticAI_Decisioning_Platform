import { faker } from '@faker-js/faker';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// SELLER DATA GENERATORS
// ============================================================================

const BUSINESS_CATEGORIES = [
  'Electronics', 'Fashion', 'Home & Garden', 'Sports', 'Automotive',
  'Health & Beauty', 'Toys & Games', 'Books', 'Food & Grocery', 'Jewelry'
];

const RISK_TIERS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SELLER_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'UNDER_REVIEW', 'BLOCKED'];
const COUNTRIES = ['US', 'UK', 'CA', 'DE', 'FR', 'JP', 'AU', 'IN', 'BR', 'MX'];

export function generateSeller() {
  const createdAt = faker.date.past({ years: 3 });
  const riskTier = faker.helpers.weightedArrayElement([
    { weight: 60, value: 'LOW' },
    { weight: 25, value: 'MEDIUM' },
    { weight: 12, value: 'HIGH' },
    { weight: 3, value: 'CRITICAL' }
  ]);

  return {
    sellerId: `SLR-${uuidv4().substring(0, 8).toUpperCase()}`,
    businessName: faker.company.name(),
    businessCategory: faker.helpers.arrayElement(BUSINESS_CATEGORIES),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    country: faker.helpers.arrayElement(COUNTRIES),
    status: faker.helpers.weightedArrayElement([
      { weight: 70, value: 'ACTIVE' },
      { weight: 10, value: 'PENDING' },
      { weight: 8, value: 'UNDER_REVIEW' },
      { weight: 7, value: 'SUSPENDED' },
      { weight: 5, value: 'BLOCKED' }
    ]),
    riskTier,
    riskScore: riskTier === 'LOW' ? faker.number.int({ min: 0, max: 30 }) :
               riskTier === 'MEDIUM' ? faker.number.int({ min: 31, max: 60 }) :
               riskTier === 'HIGH' ? faker.number.int({ min: 61, max: 85 }) :
               faker.number.int({ min: 86, max: 100 }),
    kycVerified: faker.datatype.boolean({ probability: 0.85 }),
    bankVerified: faker.datatype.boolean({ probability: 0.9 }),
    totalListings: faker.number.int({ min: 1, max: 500 }),
    totalSales: faker.number.int({ min: 0, max: 10000 }),
    lifetimeGMV: faker.number.float({ min: 0, max: 5000000, fractionDigits: 2 }),
    averageOrderValue: faker.number.float({ min: 15, max: 500, fractionDigits: 2 }),
    returnRate: faker.number.float({ min: 0, max: 0.25, fractionDigits: 3 }),
    disputeRate: faker.number.float({ min: 0, max: 0.1, fractionDigits: 4 }),
    createdAt: createdAt.toISOString(),
    updatedAt: faker.date.between({ from: createdAt, to: new Date() }).toISOString()
  };
}

// ============================================================================
// TRANSACTION DATA GENERATORS
// ============================================================================

const TRANSACTION_TYPES = ['SALE', 'REFUND', 'PAYOUT', 'CHARGEBACK', 'ADJUSTMENT'];
const PAYMENT_METHODS = ['CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'PAYPAL', 'WALLET'];
const DECISION_OUTCOMES = ['APPROVED', 'BLOCKED', 'REVIEW', 'CHALLENGE'];

export function generateTransaction(sellerId = null) {
  const amount = faker.number.float({ min: 5, max: 2500, fractionDigits: 2 });
  const riskScore = faker.number.int({ min: 0, max: 100 });

  return {
    transactionId: `TXN-${uuidv4().substring(0, 12).toUpperCase()}`,
    sellerId: sellerId || `SLR-${faker.string.alphanumeric(8).toUpperCase()}`,
    buyerId: `BYR-${faker.string.alphanumeric(8).toUpperCase()}`,
    type: faker.helpers.weightedArrayElement([
      { weight: 80, value: 'SALE' },
      { weight: 10, value: 'REFUND' },
      { weight: 5, value: 'PAYOUT' },
      { weight: 3, value: 'CHARGEBACK' },
      { weight: 2, value: 'ADJUSTMENT' }
    ]),
    amount,
    currency: 'USD',
    paymentMethod: faker.helpers.arrayElement(PAYMENT_METHODS),
    riskScore,
    riskSignals: generateRiskSignals(riskScore),
    mlScores: {
      fraudProbability: faker.number.float({ min: 0, max: 1, fractionDigits: 4 }),
      atoRisk: faker.number.float({ min: 0, max: 1, fractionDigits: 4 }),
      velocityAnomaly: faker.number.float({ min: 0, max: 1, fractionDigits: 4 }),
      deviceRisk: faker.number.float({ min: 0, max: 1, fractionDigits: 4 })
    },
    decision: faker.helpers.weightedArrayElement([
      { weight: 75, value: 'APPROVED' },
      { weight: 10, value: 'BLOCKED' },
      { weight: 10, value: 'REVIEW' },
      { weight: 5, value: 'CHALLENGE' }
    ]),
    decisionLatencyMs: faker.number.int({ min: 8, max: 150 }),
    rulesTriggered: generateTriggeredRules(riskScore),
    deviceFingerprint: faker.string.alphanumeric(32),
    ipAddress: faker.internet.ip(),
    userAgent: faker.internet.userAgent(),
    geoLocation: {
      country: faker.helpers.arrayElement(COUNTRIES),
      city: faker.location.city(),
      lat: faker.location.latitude(),
      lng: faker.location.longitude()
    },
    timestamp: faker.date.recent({ days: 7 }).toISOString()
  };
}

function generateRiskSignals(riskScore) {
  const signals = [];
  const possibleSignals = [
    { signal: 'NEW_DEVICE', weight: 0.3 },
    { signal: 'UNUSUAL_AMOUNT', weight: 0.25 },
    { signal: 'VELOCITY_SPIKE', weight: 0.2 },
    { signal: 'GEO_MISMATCH', weight: 0.15 },
    { signal: 'PROXY_DETECTED', weight: 0.1 },
    { signal: 'MULTIPLE_CARDS', weight: 0.15 },
    { signal: 'ODD_HOURS', weight: 0.1 },
    { signal: 'HIGH_RISK_MERCHANT', weight: 0.08 },
    { signal: 'FAILED_ATTEMPTS', weight: 0.12 }
  ];

  const signalProbability = riskScore / 100;
  possibleSignals.forEach(s => {
    if (Math.random() < s.weight * signalProbability * 2) {
      signals.push(s.signal);
    }
  });

  return signals;
}

function generateTriggeredRules(riskScore) {
  const rules = [];
  const possibleRules = [
    { id: 'RULE_001', name: 'High Amount Threshold', threshold: 70 },
    { id: 'RULE_002', name: 'Velocity Check', threshold: 50 },
    { id: 'RULE_003', name: 'New Device Risk', threshold: 40 },
    { id: 'RULE_004', name: 'Geo Anomaly', threshold: 60 },
    { id: 'RULE_005', name: 'Time Pattern', threshold: 55 },
    { id: 'RULE_006', name: 'Buyer History', threshold: 45 },
    { id: 'RULE_007', name: 'Seller Risk Score', threshold: 65 }
  ];

  possibleRules.forEach(rule => {
    if (riskScore >= rule.threshold && Math.random() > 0.5) {
      rules.push({ ruleId: rule.id, ruleName: rule.name });
    }
  });

  return rules;
}

// ============================================================================
// LISTING DATA GENERATORS
// ============================================================================

export function generateListing(sellerId = null) {
  const price = faker.number.float({ min: 5, max: 1000, fractionDigits: 2 });

  return {
    listingId: `LST-${uuidv4().substring(0, 10).toUpperCase()}`,
    sellerId: sellerId || `SLR-${faker.string.alphanumeric(8).toUpperCase()}`,
    title: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    category: faker.helpers.arrayElement(BUSINESS_CATEGORIES),
    price,
    currency: 'USD',
    quantity: faker.number.int({ min: 1, max: 100 }),
    condition: faker.helpers.arrayElement(['NEW', 'REFURBISHED', 'USED_GOOD', 'USED_FAIR']),
    status: faker.helpers.weightedArrayElement([
      { weight: 80, value: 'ACTIVE' },
      { weight: 10, value: 'PENDING_REVIEW' },
      { weight: 5, value: 'SUSPENDED' },
      { weight: 5, value: 'REMOVED' }
    ]),
    riskFlags: {
      priceAnomaly: faker.datatype.boolean({ probability: 0.05 }),
      prohibitedContent: faker.datatype.boolean({ probability: 0.02 }),
      counterfeitRisk: faker.datatype.boolean({ probability: 0.03 }),
      duplicateListing: faker.datatype.boolean({ probability: 0.04 })
    },
    images: faker.number.int({ min: 1, max: 8 }),
    views: faker.number.int({ min: 0, max: 10000 }),
    sales: faker.number.int({ min: 0, max: 500 }),
    createdAt: faker.date.past({ years: 1 }).toISOString(),
    updatedAt: faker.date.recent({ days: 30 }).toISOString()
  };
}

// ============================================================================
// PAYOUT DATA GENERATORS
// ============================================================================

export function generatePayout(sellerId = null) {
  const amount = faker.number.float({ min: 100, max: 50000, fractionDigits: 2 });

  return {
    payoutId: `PAY-${uuidv4().substring(0, 10).toUpperCase()}`,
    sellerId: sellerId || `SLR-${faker.string.alphanumeric(8).toUpperCase()}`,
    amount,
    currency: 'USD',
    method: faker.helpers.arrayElement(['BANK_TRANSFER', 'PAYPAL', 'CHECK']),
    status: faker.helpers.weightedArrayElement([
      { weight: 60, value: 'COMPLETED' },
      { weight: 20, value: 'PENDING' },
      { weight: 10, value: 'PROCESSING' },
      { weight: 5, value: 'ON_HOLD' },
      { weight: 5, value: 'FAILED' }
    ]),
    riskHold: faker.datatype.boolean({ probability: 0.08 }),
    holdReason: null,
    bankAccount: {
      last4: faker.string.numeric(4),
      bankName: faker.company.name() + ' Bank',
      verified: faker.datatype.boolean({ probability: 0.95 })
    },
    scheduledAt: faker.date.future({ years: 0.1 }).toISOString(),
    completedAt: faker.datatype.boolean({ probability: 0.6 }) ? faker.date.recent({ days: 7 }).toISOString() : null,
    createdAt: faker.date.recent({ days: 14 }).toISOString()
  };
}

// ============================================================================
// ATO (Account Takeover) EVENT GENERATORS
// ============================================================================

export function generateATOEvent(sellerId = null) {
  const riskLevel = faker.helpers.weightedArrayElement([
    { weight: 50, value: 'LOW' },
    { weight: 30, value: 'MEDIUM' },
    { weight: 15, value: 'HIGH' },
    { weight: 5, value: 'CRITICAL' }
  ]);

  return {
    eventId: `ATO-${uuidv4().substring(0, 10).toUpperCase()}`,
    sellerId: sellerId || `SLR-${faker.string.alphanumeric(8).toUpperCase()}`,
    eventType: faker.helpers.arrayElement([
      'LOGIN_ATTEMPT', 'PASSWORD_CHANGE', 'EMAIL_CHANGE', 'BANK_CHANGE',
      'PHONE_CHANGE', 'MFA_DISABLED', 'UNUSUAL_ACTIVITY', 'DEVICE_CHANGE'
    ]),
    riskLevel,
    riskScore: riskLevel === 'LOW' ? faker.number.int({ min: 0, max: 30 }) :
               riskLevel === 'MEDIUM' ? faker.number.int({ min: 31, max: 60 }) :
               riskLevel === 'HIGH' ? faker.number.int({ min: 61, max: 85 }) :
               faker.number.int({ min: 86, max: 100 }),
    signals: {
      newDevice: faker.datatype.boolean({ probability: 0.3 }),
      newLocation: faker.datatype.boolean({ probability: 0.25 }),
      impossibleTravel: faker.datatype.boolean({ probability: 0.05 }),
      bruteForce: faker.datatype.boolean({ probability: 0.03 }),
      credentialStuffing: faker.datatype.boolean({ probability: 0.02 })
    },
    deviceInfo: {
      fingerprint: faker.string.alphanumeric(32),
      type: faker.helpers.arrayElement(['DESKTOP', 'MOBILE', 'TABLET']),
      os: faker.helpers.arrayElement(['Windows', 'macOS', 'iOS', 'Android', 'Linux']),
      browser: faker.helpers.arrayElement(['Chrome', 'Firefox', 'Safari', 'Edge'])
    },
    location: {
      ip: faker.internet.ip(),
      country: faker.helpers.arrayElement(COUNTRIES),
      city: faker.location.city()
    },
    outcome: faker.helpers.weightedArrayElement([
      { weight: 70, value: 'ALLOWED' },
      { weight: 15, value: 'CHALLENGED' },
      { weight: 10, value: 'BLOCKED' },
      { weight: 5, value: 'FLAGGED' }
    ]),
    timestamp: faker.date.recent({ days: 7 }).toISOString()
  };
}

// ============================================================================
// SHIPPING DATA GENERATORS
// ============================================================================

export function generateShipment(sellerId = null, transactionId = null) {
  const status = faker.helpers.weightedArrayElement([
    { weight: 30, value: 'PENDING' },
    { weight: 25, value: 'SHIPPED' },
    { weight: 25, value: 'IN_TRANSIT' },
    { weight: 15, value: 'DELIVERED' },
    { weight: 5, value: 'RETURNED' }
  ]);

  return {
    shipmentId: `SHP-${uuidv4().substring(0, 10).toUpperCase()}`,
    sellerId: sellerId || `SLR-${faker.string.alphanumeric(8).toUpperCase()}`,
    transactionId: transactionId || `TXN-${faker.string.alphanumeric(12).toUpperCase()}`,
    carrier: faker.helpers.arrayElement(['USPS', 'UPS', 'FEDEX', 'DHL', 'AMAZON']),
    trackingNumber: faker.string.alphanumeric(20).toUpperCase(),
    status,
    riskFlags: {
      addressMismatch: faker.datatype.boolean({ probability: 0.05 }),
      reshippingService: faker.datatype.boolean({ probability: 0.02 }),
      highRiskZip: faker.datatype.boolean({ probability: 0.03 }),
      poBoxDestination: faker.datatype.boolean({ probability: 0.08 })
    },
    origin: {
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      country: 'US',
      zip: faker.location.zipCode()
    },
    destination: {
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      country: faker.helpers.arrayElement(['US', 'US', 'US', 'CA', 'MX']),
      zip: faker.location.zipCode()
    },
    estimatedDelivery: faker.date.future({ years: 0.05 }).toISOString(),
    actualDelivery: status === 'DELIVERED' ? faker.date.recent({ days: 3 }).toISOString() : null,
    createdAt: faker.date.recent({ days: 14 }).toISOString()
  };
}

// ============================================================================
// ML MODEL DATA GENERATORS
// ============================================================================

const MODEL_TYPES = ['FRAUD_DETECTION', 'ATO_PREVENTION', 'SELLER_RISK', 'LISTING_QUALITY', 'VELOCITY_ANOMALY'];

export function generateMLModel() {
  const version = `${faker.number.int({ min: 1, max: 5 })}.${faker.number.int({ min: 0, max: 9 })}.${faker.number.int({ min: 0, max: 99 })}`;

  return {
    modelId: `MDL-${uuidv4().substring(0, 8).toUpperCase()}`,
    name: faker.helpers.arrayElement([
      'FraudNet-XGB', 'ATOShield-LSTM', 'SellerRisk-GBM',
      'ListingGuard-CNN', 'VelocityDetector-RF', 'BehaviorNet-Transformer'
    ]),
    type: faker.helpers.arrayElement(MODEL_TYPES),
    version,
    status: faker.helpers.weightedArrayElement([
      { weight: 50, value: 'PRODUCTION' },
      { weight: 20, value: 'SHADOW' },
      { weight: 15, value: 'CANARY' },
      { weight: 10, value: 'RETIRED' },
      { weight: 5, value: 'TRAINING' }
    ]),
    framework: faker.helpers.arrayElement(['XGBoost', 'PyTorch', 'TensorFlow', 'Scikit-learn', 'LightGBM']),
    metrics: {
      accuracy: faker.number.float({ min: 0.85, max: 0.99, fractionDigits: 4 }),
      precision: faker.number.float({ min: 0.80, max: 0.98, fractionDigits: 4 }),
      recall: faker.number.float({ min: 0.75, max: 0.95, fractionDigits: 4 }),
      f1Score: faker.number.float({ min: 0.78, max: 0.96, fractionDigits: 4 }),
      auc: faker.number.float({ min: 0.88, max: 0.99, fractionDigits: 4 }),
      latencyP50: faker.number.int({ min: 5, max: 20 }),
      latencyP99: faker.number.int({ min: 30, max: 100 })
    },
    features: faker.number.int({ min: 50, max: 500 }),
    trainingData: {
      samples: faker.number.int({ min: 100000, max: 10000000 }),
      positiveRate: faker.number.float({ min: 0.01, max: 0.1, fractionDigits: 4 })
    },
    deployedAt: faker.date.past({ years: 1 }).toISOString(),
    lastRetrained: faker.date.recent({ days: 30 }).toISOString(),
    createdBy: faker.internet.email()
  };
}

// ============================================================================
// RULE DATA GENERATORS
// ============================================================================

export function generateRule() {
  const ruleTypes = ['THRESHOLD', 'VELOCITY', 'LIST_MATCH', 'ML_SCORE', 'COMPOSITE', 'PATTERN'];
  const actions = ['BLOCK', 'REVIEW', 'CHALLENGE', 'FLAG', 'ALLOW_WITH_LIMIT'];

  return {
    ruleId: `RULE-${faker.string.alphanumeric(6).toUpperCase()}`,
    name: faker.helpers.arrayElement([
      'High Value Transaction Block',
      'Velocity Spike Detection',
      'New Seller Restriction',
      'Geographic Anomaly Check',
      'Device Fingerprint Mismatch',
      'Buyer Abuse Pattern',
      'Payout Velocity Limit',
      'Account Age Restriction',
      'Category Risk Threshold',
      'Cross-Border Transaction Limit'
    ]),
    description: faker.lorem.sentence(),
    type: faker.helpers.arrayElement(ruleTypes),
    status: faker.helpers.weightedArrayElement([
      { weight: 60, value: 'ACTIVE' },
      { weight: 20, value: 'SHADOW' },
      { weight: 10, value: 'DISABLED' },
      { weight: 10, value: 'TESTING' }
    ]),
    priority: faker.number.int({ min: 1, max: 100 }),
    conditions: generateRuleConditions(),
    action: faker.helpers.arrayElement(actions),
    performance: {
      triggered: faker.number.int({ min: 100, max: 50000 }),
      truePositives: faker.number.int({ min: 50, max: 10000 }),
      falsePositives: faker.number.int({ min: 10, max: 2000 }),
      catchRate: faker.number.float({ min: 0.6, max: 0.98, fractionDigits: 3 }),
      falsePositiveRate: faker.number.float({ min: 0.01, max: 0.15, fractionDigits: 4 })
    },
    createdAt: faker.date.past({ years: 2 }).toISOString(),
    updatedAt: faker.date.recent({ days: 60 }).toISOString(),
    createdBy: faker.internet.email()
  };
}

function generateRuleConditions() {
  const conditionTypes = [
    { field: 'transaction.amount', operator: 'GT', value: faker.number.int({ min: 500, max: 5000 }) },
    { field: 'seller.riskScore', operator: 'GT', value: faker.number.int({ min: 50, max: 80 }) },
    { field: 'transaction.velocity_1h', operator: 'GT', value: faker.number.int({ min: 5, max: 20 }) },
    { field: 'seller.accountAge', operator: 'LT', value: faker.number.int({ min: 7, max: 30 }) },
    { field: 'ml.fraudScore', operator: 'GT', value: faker.number.float({ min: 0.5, max: 0.9, fractionDigits: 2 }) },
    { field: 'device.isNew', operator: 'EQ', value: true },
    { field: 'geo.country', operator: 'IN', value: ['NG', 'RO', 'UA'] }
  ];

  const numConditions = faker.number.int({ min: 1, max: 4 });
  return faker.helpers.arrayElements(conditionTypes, numConditions);
}

// ============================================================================
// EXPERIMENT DATA GENERATORS
// ============================================================================

export function generateExperiment() {
  const startDate = faker.date.past({ years: 0.5 });
  const status = faker.helpers.weightedArrayElement([
    { weight: 40, value: 'RUNNING' },
    { weight: 30, value: 'COMPLETED' },
    { weight: 15, value: 'SCHEDULED' },
    { weight: 10, value: 'PAUSED' },
    { weight: 5, value: 'CANCELLED' }
  ]);

  return {
    experimentId: `EXP-${uuidv4().substring(0, 8).toUpperCase()}`,
    name: faker.helpers.arrayElement([
      'New Fraud Model A/B Test',
      'Threshold Optimization Study',
      'Rule Performance Comparison',
      'ML Champion/Challenger',
      'Velocity Limit Testing',
      'Geographic Restriction Impact'
    ]),
    description: faker.lorem.paragraph(),
    type: faker.helpers.arrayElement(['A/B_TEST', 'SHADOW_MODE', 'CHAMPION_CHALLENGER', 'SIMULATION']),
    status,
    hypothesis: faker.lorem.sentence(),
    variants: [
      {
        id: 'control',
        name: 'Control',
        allocation: 50,
        config: { useExisting: true }
      },
      {
        id: 'treatment',
        name: 'Treatment',
        allocation: 50,
        config: { newThreshold: faker.number.int({ min: 60, max: 80 }) }
      }
    ],
    metrics: {
      primaryMetric: 'fraud_catch_rate',
      secondaryMetrics: ['false_positive_rate', 'customer_friction', 'latency_p99']
    },
    results: status === 'COMPLETED' ? {
      control: {
        fraudCatchRate: faker.number.float({ min: 0.92, max: 0.97, fractionDigits: 4 }),
        falsePositiveRate: faker.number.float({ min: 0.02, max: 0.05, fractionDigits: 4 }),
        sampleSize: faker.number.int({ min: 10000, max: 100000 })
      },
      treatment: {
        fraudCatchRate: faker.number.float({ min: 0.93, max: 0.98, fractionDigits: 4 }),
        falsePositiveRate: faker.number.float({ min: 0.015, max: 0.045, fractionDigits: 4 }),
        sampleSize: faker.number.int({ min: 10000, max: 100000 })
      },
      pValue: faker.number.float({ min: 0.001, max: 0.1, fractionDigits: 4 }),
      significant: faker.datatype.boolean({ probability: 0.7 })
    } : null,
    trafficAllocation: faker.number.int({ min: 5, max: 50 }),
    startDate: startDate.toISOString(),
    endDate: status === 'COMPLETED' ? faker.date.between({ from: startDate, to: new Date() }).toISOString() : null,
    createdBy: faker.internet.email()
  };
}

// ============================================================================
// DATA CATALOG GENERATORS
// ============================================================================

export function generateDataset() {
  return {
    datasetId: `DS-${uuidv4().substring(0, 8).toUpperCase()}`,
    name: faker.helpers.arrayElement([
      'transactions_raw', 'seller_profiles', 'buyer_behavior', 'device_signals',
      'risk_events', 'model_predictions', 'rule_outcomes', 'feature_store_daily'
    ]),
    description: faker.lorem.sentence(),
    type: faker.helpers.arrayElement(['STREAMING', 'BATCH', 'DERIVED', 'SNAPSHOT']),
    format: faker.helpers.arrayElement(['PARQUET', 'AVRO', 'JSON', 'CSV']),
    schema: {
      fields: faker.number.int({ min: 10, max: 100 }),
      primaryKey: 'id',
      partitionKey: faker.helpers.arrayElement(['date', 'region', 'seller_id'])
    },
    storage: {
      location: `s3://data-lake/${faker.helpers.arrayElement(['raw', 'curated', 'features'])}/${faker.word.noun()}`,
      sizeGB: faker.number.float({ min: 1, max: 500, fractionDigits: 2 }),
      rowCount: faker.number.int({ min: 100000, max: 100000000 })
    },
    quality: {
      completeness: faker.number.float({ min: 0.95, max: 1.0, fractionDigits: 3 }),
      freshness: faker.helpers.arrayElement(['REAL_TIME', '< 1 HOUR', '< 1 DAY', 'WEEKLY']),
      accuracy: faker.number.float({ min: 0.98, max: 1.0, fractionDigits: 4 })
    },
    lineage: {
      upstream: faker.helpers.arrayElements(['raw_events', 'api_logs', 'clickstream', 'external_feed'], 2),
      downstream: faker.helpers.arrayElements(['feature_store', 'ml_training', 'dashboards', 'reports'], 2)
    },
    owner: faker.internet.email(),
    tags: faker.helpers.arrayElements(['PII', 'SENSITIVE', 'FINANCIAL', 'PUBLIC', 'INTERNAL'], 2),
    createdAt: faker.date.past({ years: 2 }).toISOString(),
    lastUpdated: faker.date.recent({ days: 1 }).toISOString()
  };
}

// ============================================================================
// METRICS/ANALYTICS GENERATORS
// ============================================================================

export function generateMetricsSnapshot() {
  return {
    timestamp: new Date().toISOString(),
    transactions: {
      total: faker.number.int({ min: 50000, max: 200000 }),
      approved: faker.number.int({ min: 45000, max: 180000 }),
      blocked: faker.number.int({ min: 1000, max: 10000 }),
      review: faker.number.int({ min: 500, max: 5000 }),
      challenged: faker.number.int({ min: 100, max: 2000 })
    },
    fraud: {
      detected: faker.number.int({ min: 500, max: 5000 }),
      prevented: faker.number.int({ min: 400, max: 4500 }),
      amountBlocked: faker.number.float({ min: 100000, max: 2000000, fractionDigits: 2 }),
      catchRate: faker.number.float({ min: 0.95, max: 0.99, fractionDigits: 4 }),
      falsePositiveRate: faker.number.float({ min: 0.002, max: 0.01, fractionDigits: 5 })
    },
    sellers: {
      active: faker.number.int({ min: 10000, max: 50000 }),
      newToday: faker.number.int({ min: 50, max: 500 }),
      suspended: faker.number.int({ min: 100, max: 1000 }),
      underReview: faker.number.int({ min: 50, max: 500 })
    },
    models: {
      avgLatencyMs: faker.number.int({ min: 10, max: 50 }),
      p99LatencyMs: faker.number.int({ min: 50, max: 150 }),
      predictionsToday: faker.number.int({ min: 100000, max: 500000 }),
      accuracy: faker.number.float({ min: 0.96, max: 0.99, fractionDigits: 4 })
    },
    rules: {
      active: faker.number.int({ min: 100, max: 500 }),
      triggered: faker.number.int({ min: 5000, max: 50000 }),
      avgEvalTimeMs: faker.number.float({ min: 1, max: 10, fractionDigits: 2 })
    },
    system: {
      apiLatencyP50: faker.number.int({ min: 20, max: 50 }),
      apiLatencyP99: faker.number.int({ min: 100, max: 300 }),
      errorRate: faker.number.float({ min: 0.0001, max: 0.005, fractionDigits: 5 }),
      throughput: faker.number.int({ min: 1000, max: 10000 })
    }
  };
}

export default {
  generateSeller,
  generateTransaction,
  generateListing,
  generatePayout,
  generateATOEvent,
  generateShipment,
  generateMLModel,
  generateRule,
  generateExperiment,
  generateDataset,
  generateMetricsSnapshot
};
