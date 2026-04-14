/**
 * Seeds demo data connectors — called on server startup.
 */
import { getConnectorRegistry } from './connector-registry.js';

export async function seedConnectors() {
  const registry = getConnectorRegistry();

  // 1. Internal Platform Data
  await registry.register({
    sourceId: 'internal-sellers',
    name: 'Internal Seller Database',
    type: 'database',
    description: 'Primary seller records from PostgreSQL',
    config: { database: 'fraud_detection', table: 'sellers' },
    schema: { fields: ['sellerId', 'businessName', 'country', 'status', 'riskScore', 'createdAt'] },
    pollIntervalMs: 0 // no polling, read on demand
  });

  await registry.register({
    sourceId: 'internal-transactions',
    name: 'Transaction History',
    type: 'database',
    description: 'All platform transactions',
    config: { database: 'fraud_detection', table: 'transactions' },
    schema: { fields: ['transactionId', 'sellerId', 'amount', 'currency', 'status', 'createdAt'] },
    pollIntervalMs: 0
  });

  // 2. External Identity Verification
  await registry.register({
    sourceId: 'onfido-kyc',
    name: 'Onfido KYC Verification',
    type: 'rest-api',
    description: 'Identity document verification and face matching',
    config: { url: 'https://api.onfido.com/v3.6/checks', apiKey: process.env.ONFIDO_API_KEY || '' },
    schema: { fields: ['checkId', 'applicantId', 'status', 'result', 'documentReport', 'facialReport'] },
    pollIntervalMs: 0
  });

  // 3. Payment Gateway
  await registry.register({
    sourceId: 'stripe-payments',
    name: 'Stripe Payment Data',
    type: 'rest-api',
    description: 'Payment intents, charges, disputes, and refunds',
    config: { url: 'https://api.stripe.com/v1/charges', apiKey: process.env.STRIPE_API_KEY || '' },
    schema: { fields: ['chargeId', 'amount', 'currency', 'status', 'disputeStatus', 'refunded'] },
    pollIntervalMs: 0
  });

  // 4. Bank Verification
  await registry.register({
    sourceId: 'plaid-banking',
    name: 'Plaid Bank Verification',
    type: 'rest-api',
    description: 'Bank account verification, balance checks, transaction history',
    config: { url: 'https://production.plaid.com', apiKey: process.env.PLAID_API_KEY || '' },
    schema: { fields: ['accountId', 'institution', 'accountType', 'balance', 'verified'] },
    pollIntervalMs: 0
  });

  // 5. Credit Bureau
  await registry.register({
    sourceId: 'experian-credit',
    name: 'Experian Credit Bureau',
    type: 'rest-api',
    description: 'Business credit scores, payment history, public records',
    config: { url: 'https://us-api.experian.com/businessinformation/businesses/v1', apiKey: process.env.EXPERIAN_API_KEY || '' },
    schema: { fields: ['businessId', 'creditScore', 'paymentIndex', 'delinquencyScore', 'bankruptcyRisk'] },
    pollIntervalMs: 0
  });

  // 6. Device Intelligence
  await registry.register({
    sourceId: 'sardine-device',
    name: 'Sardine Device Intelligence',
    type: 'rest-api',
    description: 'Device fingerprinting, behavioral biometrics, bot detection',
    config: { url: 'https://api.sardine.ai/v1/devices', apiKey: process.env.SARDINE_API_KEY || '' },
    schema: { fields: ['sessionId', 'deviceId', 'riskLevel', 'botScore', 'emulatorDetected', 'vpnDetected'] },
    pollIntervalMs: 0
  });

  // 7. Shipping/Logistics
  await registry.register({
    sourceId: 'shipstation-logistics',
    name: 'ShipStation Logistics',
    type: 'rest-api',
    description: 'Shipping tracking, delivery confirmation, return processing',
    config: { url: 'https://ssapi.shipstation.com/shipments', apiKey: process.env.SHIPSTATION_API_KEY || '' },
    schema: { fields: ['shipmentId', 'orderId', 'carrier', 'trackingNumber', 'status', 'deliveredAt'] },
    pollIntervalMs: 0
  });

  // 8. Consortium Fraud Network
  await registry.register({
    sourceId: 'ethoca-consortium',
    name: 'Ethoca Fraud Network',
    type: 'rest-api',
    description: 'Shared fraud intelligence across merchants — chargeback alerts, fraud confirmations',
    config: { url: 'https://api.ethoca.com/v2/alerts', apiKey: process.env.ETHOCA_API_KEY || '' },
    schema: { fields: ['alertId', 'merchantId', 'cardBin', 'alertType', 'fraudConfirmed', 'chargebackAmount'] },
    pollIntervalMs: 0
  });

  // 9. Sanctions & Watchlists
  await registry.register({
    sourceId: 'ofac-sanctions',
    name: 'OFAC SDN List (US Treasury)',
    type: 'rest-api',
    description: 'Specially Designated Nationals sanctions list — 18,712 entries',
    config: { url: 'https://www.treasury.gov/ofac/downloads/sdn.xml' },
    schema: { fields: ['sdnId', 'name', 'type', 'program', 'country'] },
    pollIntervalMs: 86400000 // daily refresh
  });

  // 10. Business Registry
  await registry.register({
    sourceId: 'opencorporates-registry',
    name: 'OpenCorporates Business Registry',
    type: 'rest-api',
    description: 'Global business registration verification — 200M+ companies',
    config: { url: 'https://api.opencorporates.com/v0.4/companies/search' },
    schema: { fields: ['companyNumber', 'name', 'jurisdiction', 'status', 'incorporationDate', 'registeredAddress'] },
    pollIntervalMs: 0
  });

  // 11. Email Intelligence
  await registry.register({
    sourceId: 'emailrep-intelligence',
    name: 'EmailRep.io Email Intelligence',
    type: 'rest-api',
    description: 'Email reputation, age, deliverability, disposable detection',
    config: { url: 'https://emailrep.io' },
    schema: { fields: ['email', 'reputation', 'suspicious', 'references', 'deliverable', 'disposable'] },
    pollIntervalMs: 0
  });

  // 12. IP Intelligence
  await registry.register({
    sourceId: 'ipapi-geolocation',
    name: 'IP-API Geolocation',
    type: 'rest-api',
    description: 'IP geolocation, proxy/VPN detection, ISP information',
    config: { url: 'http://ip-api.com/json' },
    schema: { fields: ['ip', 'country', 'city', 'isp', 'proxy', 'hosting', 'mobile'] },
    pollIntervalMs: 0
  });

  // 13. Social Media Verification
  await registry.register({
    sourceId: 'social-verification',
    name: 'Social Media Presence Checker',
    type: 'rest-api',
    description: 'Verify business social media presence across platforms',
    config: {},
    schema: { fields: ['platform', 'profileUrl', 'followers', 'verified', 'accountAge'] },
    pollIntervalMs: 0
  });

  // 14. Mock External Data (for demo)
  await registry.register({
    sourceId: 'demo-external-feed',
    name: 'Demo External Data Feed',
    type: 'mock',
    description: 'Simulated external data for demonstration purposes',
    config: {
      mockData: [
        { entityId: 'SLR-DEMO-001', source: 'external', creditScore: 720, paymentHistory: 'GOOD', bankruptcyRisk: 'LOW' },
        { entityId: 'SLR-DEMO-002', source: 'external', creditScore: 580, paymentHistory: 'FAIR', bankruptcyRisk: 'MEDIUM' },
        { entityId: 'SLR-DEMO-003', source: 'external', creditScore: 450, paymentHistory: 'POOR', bankruptcyRisk: 'HIGH' }
      ]
    },
    schema: { fields: ['entityId', 'creditScore', 'paymentHistory', 'bankruptcyRisk'] },
    pollIntervalMs: 0
  });

  console.log(`[data-connectors] Seeded ${registry.listSources().length} data sources`);
}

export default { seedConnectors };
