/**
 * Feature Extractor
 * Transforms raw transaction data into normalized feature vectors for ML models
 */

// Feature definitions with normalization parameters
const FEATURE_DEFINITIONS = {
  // Transaction features
  amount: { min: 0, max: 50000, default: 0 },
  amountLog: { min: 0, max: 11, default: 0 }, // log(amount + 1)

  // Velocity features
  txCount1h: { min: 0, max: 100, default: 0 },
  txCount24h: { min: 0, max: 500, default: 0 },
  amountSum1h: { min: 0, max: 100000, default: 0 },
  amountSum24h: { min: 0, max: 500000, default: 0 },

  // Device features
  deviceTrustScore: { min: 0, max: 100, default: 50 },
  isNewDevice: { min: 0, max: 1, default: 0 },
  deviceAge: { min: 0, max: 365, default: 30 },

  // Geographic features
  geoDistance: { min: 0, max: 20000, default: 0 }, // km
  isHighRiskCountry: { min: 0, max: 1, default: 0 },
  vpnDetected: { min: 0, max: 1, default: 0 },

  // Account features
  accountAgeDays: { min: 0, max: 3650, default: 30 },
  previousFraudFlags: { min: 0, max: 10, default: 0 },
  chargebackRate: { min: 0, max: 1, default: 0 }
};

// High-risk countries for geo risk calculation
const HIGH_RISK_COUNTRIES = new Set(['NG', 'RO', 'RU', 'UA', 'PK', 'BD', 'VN', 'ID']);

/**
 * Normalize a single value using min-max scaling
 */
function normalize(value, min, max) {
  if (value === null || value === undefined || isNaN(value)) {
    return 0.5; // Default to middle for missing values
  }
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized)); // Clamp to [0, 1]
}

/**
 * Extract and normalize features from raw transaction data
 * @param {Object} rawData - Raw transaction and context data
 * @returns {Object} - Feature vector and metadata
 */
export function extractFeatures(rawData) {
  const {
    amount = 0,
    velocity = {},
    device = {},
    geo = {},
    account = {},
    riskScore = 50,
    isNewDevice = false,
    velocitySpike = false
  } = rawData;

  // Calculate derived features
  const amountValue = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  const amountLog = Math.log(amountValue + 1);

  // Velocity features
  const txCount1h = velocity.transactions_1h || velocity.txCount1h || 0;
  const txCount24h = velocity.transactions_24h || velocity.txCount24h || 0;
  const amountSum1h = velocity.amount_1h || velocity.amountSum1h || 0;
  const amountSum24h = velocity.amount_24h || velocity.amountSum24h || 0;

  // Device features
  const deviceTrustScore = device.trustScore || device.deviceTrustScore || 50;
  const deviceIsNew = isNewDevice || device.isNew || !device.isKnownDevice ? 1 : 0;
  const deviceAge = device.deviceAge || 30;

  // Geographic features
  const geoDistance = geo.distanceFromHome || geo.geoDistance || 0;
  const isHighRiskCountry = HIGH_RISK_COUNTRIES.has(geo.transactionCountry || geo.country) ? 1 : 0;
  const vpnDetected = geo.vpnDetected || geo.proxyDetected ? 1 : 0;

  // Account features
  const accountAgeDays = account.accountAge || account.accountAgeDays || 30;
  const previousFraudFlags = account.previousFraudFlags || 0;
  const chargebackRate = parseFloat(account.chargebackRate) || 0;

  // Build raw feature object
  const rawFeatures = {
    amount: amountValue,
    amountLog,
    txCount1h,
    txCount24h,
    amountSum1h,
    amountSum24h,
    deviceTrustScore,
    isNewDevice: deviceIsNew,
    deviceAge,
    geoDistance,
    isHighRiskCountry,
    vpnDetected,
    accountAgeDays,
    previousFraudFlags,
    chargebackRate
  };

  // Normalize features
  const normalizedFeatures = {};
  for (const [name, value] of Object.entries(rawFeatures)) {
    const def = FEATURE_DEFINITIONS[name];
    if (def) {
      normalizedFeatures[name] = normalize(value, def.min, def.max);
    }
  }

  // Convert to feature vector (array format for TensorFlow)
  const featureVector = Object.values(normalizedFeatures);

  return {
    raw: rawFeatures,
    normalized: normalizedFeatures,
    vector: featureVector,
    featureNames: Object.keys(normalizedFeatures),
    featureCount: featureVector.length
  };
}

/**
 * Extract features for batch processing
 * @param {Array} records - Array of raw transaction records
 * @returns {Object} - Batch features with vectors as 2D array
 */
export function extractBatchFeatures(records) {
  const results = records.map(record => extractFeatures(record.features || record));

  return {
    vectors: results.map(r => r.vector),
    featureNames: results[0]?.featureNames || [],
    featureCount: results[0]?.featureCount || 0,
    recordCount: records.length
  };
}

/**
 * Get feature importance weights (for explainability)
 */
export function getFeatureImportance() {
  return [
    { name: 'amount', importance: 0.15, description: 'Transaction amount' },
    { name: 'amountLog', importance: 0.10, description: 'Log-transformed amount' },
    { name: 'txCount1h', importance: 0.12, description: '1-hour transaction count' },
    { name: 'txCount24h', importance: 0.08, description: '24-hour transaction count' },
    { name: 'amountSum1h', importance: 0.08, description: '1-hour total amount' },
    { name: 'amountSum24h', importance: 0.05, description: '24-hour total amount' },
    { name: 'deviceTrustScore', importance: 0.12, description: 'Device trust score' },
    { name: 'isNewDevice', importance: 0.10, description: 'New device indicator' },
    { name: 'deviceAge', importance: 0.03, description: 'Device age in days' },
    { name: 'geoDistance', importance: 0.05, description: 'Geographic distance from home' },
    { name: 'isHighRiskCountry', importance: 0.04, description: 'High-risk country indicator' },
    { name: 'vpnDetected', importance: 0.03, description: 'VPN/Proxy detection' },
    { name: 'accountAgeDays', importance: 0.02, description: 'Account age in days' },
    { name: 'previousFraudFlags', importance: 0.02, description: 'Previous fraud flag count' },
    { name: 'chargebackRate', importance: 0.01, description: 'Historical chargeback rate' }
  ];
}

/**
 * Calculate SHAP-like feature contributions for a prediction
 * @param {Object} features - Extracted features
 * @param {number} prediction - Model prediction score
 * @returns {Array} - Feature contributions
 */
export function calculateFeatureContributions(features, prediction) {
  const importance = getFeatureImportance();
  const baseValue = 0.5;
  const outputDiff = prediction - baseValue;

  return importance.map((feat, index) => {
    const featureValue = features.normalized[feat.name] || 0;
    const deviation = featureValue - 0.5;
    const contribution = deviation * feat.importance * 2;

    return {
      feature: feat.name,
      value: features.raw[feat.name],
      normalizedValue: featureValue,
      importance: feat.importance,
      contribution: parseFloat(contribution.toFixed(4)),
      direction: contribution > 0 ? 'positive' : 'negative',
      description: feat.description
    };
  }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

export default {
  extractFeatures,
  extractBatchFeatures,
  getFeatureImportance,
  calculateFeatureContributions,
  FEATURE_DEFINITIONS
};
