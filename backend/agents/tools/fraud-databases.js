/**
 * Fraud Database Tools
 * Simulated fraud lists and consortium data lookups
 */

// Simulated fraud database entries
const KNOWN_FRAUD_PATTERNS = {
  emails: new Set([
    'fraudster123@tempmail.com',
    'scammer@fake.net',
    'test@disposable.com'
  ]),
  devices: new Set([
    'DEV-FRAUD-001',
    'DEV-FRAUD-002',
    'DEV-COMPROMISED-003'
  ]),
  ips: new Set([
    '192.168.100.1',
    '10.0.0.99',
    '185.220.101.1'
  ])
};

/**
 * Check against internal fraud list
 * Simulates lookup against company's internal fraud database
 */
export async function checkFraudList(identifiers) {
  await delay(30 + Math.random() * 50);

  const { email, deviceId, ipAddress, phone, cardBin } = identifiers;
  const matches = [];

  // Check email
  if (email) {
    const emailHash = hashString(email);
    if (KNOWN_FRAUD_PATTERNS.emails.has(email) || emailHash % 100 < 5) {
      matches.push({
        type: 'EMAIL',
        identifier: maskEmail(email),
        listType: 'INTERNAL_BLOCKLIST',
        reason: 'Previously confirmed fraud',
        addedAt: new Date(Date.now() - (emailHash % 365) * 24 * 60 * 60 * 1000).toISOString(),
        severity: 'HIGH'
      });
    }
  }

  // Check device
  if (deviceId) {
    const deviceHash = hashString(deviceId);
    if (KNOWN_FRAUD_PATTERNS.devices.has(deviceId) || deviceHash % 100 < 3) {
      matches.push({
        type: 'DEVICE',
        identifier: deviceId.substring(0, 8) + '***',
        listType: 'INTERNAL_BLOCKLIST',
        reason: 'Device used in fraud',
        addedAt: new Date(Date.now() - (deviceHash % 180) * 24 * 60 * 60 * 1000).toISOString(),
        severity: 'CRITICAL'
      });
    }
  }

  // Check IP
  if (ipAddress) {
    const ipHash = hashString(ipAddress);
    if (KNOWN_FRAUD_PATTERNS.ips.has(ipAddress) || ipHash % 100 < 2) {
      matches.push({
        type: 'IP_ADDRESS',
        identifier: maskIp(ipAddress),
        listType: 'INTERNAL_BLOCKLIST',
        reason: 'IP associated with fraud',
        addedAt: new Date(Date.now() - (ipHash % 90) * 24 * 60 * 60 * 1000).toISOString(),
        severity: 'HIGH'
      });
    }
  }

  // Check phone
  if (phone) {
    const phoneHash = hashString(phone);
    if (phoneHash % 100 < 4) {
      matches.push({
        type: 'PHONE',
        identifier: maskPhone(phone),
        listType: 'INTERNAL_BLOCKLIST',
        reason: 'Phone used in fraud attempts',
        addedAt: new Date(Date.now() - (phoneHash % 120) * 24 * 60 * 60 * 1000).toISOString(),
        severity: 'MEDIUM'
      });
    }
  }

  // Check card BIN
  if (cardBin) {
    const binHash = hashString(cardBin);
    if (binHash % 100 < 2) {
      matches.push({
        type: 'CARD_BIN',
        identifier: cardBin,
        listType: 'HIGH_RISK_BIN',
        reason: 'BIN associated with elevated fraud rate',
        addedAt: new Date(Date.now() - (binHash % 60) * 24 * 60 * 60 * 1000).toISOString(),
        severity: 'MEDIUM'
      });
    }
  }

  return {
    success: true,
    data: {
      checked: Object.keys(identifiers).filter(k => identifiers[k]).length,
      matches: matches.length,
      isBlocked: matches.some(m => m.severity === 'CRITICAL'),
      isHighRisk: matches.length > 0,
      matchDetails: matches,
      checkedAt: new Date().toISOString()
    }
  };
}

/**
 * Check consortium data
 * Simulates lookup against shared fraud network (like Early Warning, Ethoca)
 */
export async function checkConsortiumData(identifiers) {
  await delay(50 + Math.random() * 100);

  const { email, deviceId, ipAddress, phone, cardHash, accountId } = identifiers;
  const reports = [];

  // Email consortium check
  if (email) {
    const emailHash = hashString(email);
    if (emailHash % 50 < 5) {
      reports.push({
        type: 'EMAIL',
        source: 'CONSORTIUM_MEMBER_' + (emailHash % 10 + 1),
        reportType: 'CONFIRMED_FRAUD',
        reportDate: new Date(Date.now() - (emailHash % 180) * 24 * 60 * 60 * 1000).toISOString(),
        fraudType: ['ACCOUNT_TAKEOVER', 'NEW_ACCOUNT_FRAUD', 'PAYMENT_FRAUD'][emailHash % 3],
        amount: (emailHash % 50) * 100 + 500
      });
    }
  }

  // Device consortium check
  if (deviceId) {
    const deviceHash = hashString(deviceId);
    if (deviceHash % 50 < 3) {
      reports.push({
        type: 'DEVICE',
        source: 'DEVICE_REPUTATION_NETWORK',
        reportType: 'SUSPICIOUS_ACTIVITY',
        reportDate: new Date(Date.now() - (deviceHash % 90) * 24 * 60 * 60 * 1000).toISOString(),
        fraudType: 'DEVICE_FRAUD',
        linkedAccounts: (deviceHash % 20) + 5
      });
    }
  }

  // Card consortium check
  if (cardHash) {
    const hash = hashString(cardHash);
    if (hash % 50 < 4) {
      reports.push({
        type: 'PAYMENT_CARD',
        source: 'CARD_NETWORK',
        reportType: hash % 2 === 0 ? 'CONFIRMED_FRAUD' : 'CHARGEBACK',
        reportDate: new Date(Date.now() - (hash % 60) * 24 * 60 * 60 * 1000).toISOString(),
        fraudType: 'CARD_FRAUD',
        chargebackCount: hash % 5
      });
    }
  }

  // Account linking check
  if (accountId) {
    const accountHash = hashString(accountId);
    if (accountHash % 50 < 2) {
      reports.push({
        type: 'ACCOUNT',
        source: 'ACCOUNT_LINKING_SERVICE',
        reportType: 'LINKED_TO_FRAUD',
        reportDate: new Date(Date.now() - (accountHash % 30) * 24 * 60 * 60 * 1000).toISOString(),
        linkedFraudAccounts: accountHash % 3 + 1,
        connectionType: 'SHARED_DEVICE'
      });
    }
  }

  // Calculate consortium risk score
  let consortiumRiskScore = 0;
  reports.forEach(report => {
    if (report.reportType === 'CONFIRMED_FRAUD') consortiumRiskScore += 40;
    else if (report.reportType === 'CHARGEBACK') consortiumRiskScore += 25;
    else if (report.reportType === 'SUSPICIOUS_ACTIVITY') consortiumRiskScore += 20;
    else if (report.reportType === 'LINKED_TO_FRAUD') consortiumRiskScore += 30;
  });

  return {
    success: true,
    data: {
      consortiumRiskScore: Math.min(100, consortiumRiskScore),
      riskLevel: consortiumRiskScore > 50 ? 'HIGH' : consortiumRiskScore > 25 ? 'MEDIUM' : 'LOW',
      totalReports: reports.length,
      hasConfirmedFraud: reports.some(r => r.reportType === 'CONFIRMED_FRAUD'),
      hasChargebacks: reports.some(r => r.reportType === 'CHARGEBACK'),
      reports,
      dataProviders: ['EARLY_WARNING', 'ETHOCA', 'VERIFI', 'CONSORTIUM_ALPHA'],
      checkedAt: new Date().toISOString()
    }
  };
}

/**
 * Check velocity across consortium
 * Simulates shared velocity data
 */
export async function checkConsortiumVelocity(identifiers, timeWindowHours = 24) {
  await delay(40 + Math.random() * 60);

  const { email, deviceId, ipAddress, cardHash } = identifiers;
  const combinedHash = hashString(JSON.stringify(identifiers));

  // Simulated velocity across the consortium
  const txCount = (combinedHash % 50) + 1;
  const uniqueMerchants = Math.min(txCount, (combinedHash % 10) + 1);
  const totalAmount = (combinedHash % 100) * 100 + 500;
  const declinedCount = combinedHash % 10;

  const isAnomalous = txCount > 20 || declinedCount > 3 || uniqueMerchants > 5;

  return {
    success: true,
    data: {
      timeWindowHours,
      velocity: {
        transactionCount: txCount,
        uniqueMerchants,
        totalAmount,
        averageAmount: Math.round(totalAmount / txCount),
        declinedTransactions: declinedCount,
        declineRate: (declinedCount / txCount * 100).toFixed(1) + '%'
      },
      isAnomalous,
      anomalyReasons: [
        ...(txCount > 20 ? ['HIGH_TRANSACTION_COUNT'] : []),
        ...(declinedCount > 3 ? ['MULTIPLE_DECLINES'] : []),
        ...(uniqueMerchants > 5 ? ['MERCHANT_SPREADING'] : [])
      ],
      comparedToNetwork: {
        percentile: 100 - (combinedHash % 30),
        averageTxCount: 5,
        averageAmount: 200
      },
      checkedAt: new Date().toISOString()
    }
  };
}

/**
 * Submit fraud report to consortium
 */
export async function submitFraudReport(reportData) {
  await delay(100 + Math.random() * 100);

  const { transactionId, fraudType, identifiers, description } = reportData;

  if (!transactionId || !fraudType) {
    return {
      success: false,
      error: 'transactionId and fraudType are required'
    };
  }

  const reportId = `RPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  return {
    success: true,
    data: {
      reportId,
      status: 'SUBMITTED',
      transactionId,
      fraudType,
      identifiersReported: Object.keys(identifiers || {}).length,
      submittedAt: new Date().toISOString(),
      expectedProcessingTime: '24-48 hours',
      acknowledgement: 'Report received and will be shared with consortium members'
    }
  };
}

// Helper functions
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  return local.substring(0, 2) + '***@' + domain;
}

function maskIp(ip) {
  const parts = ip.split('.');
  return parts[0] + '.' + parts[1] + '.xxx.xxx';
}

function maskPhone(phone) {
  return phone.substring(0, 4) + '****' + phone.slice(-2);
}

export default {
  checkFraudList,
  checkConsortiumData,
  checkConsortiumVelocity,
  submitFraudReport
};
