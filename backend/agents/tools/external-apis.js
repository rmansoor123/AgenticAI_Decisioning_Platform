/**
 * External API Tools
 * Simulated external API integrations for IP, email, and device verification
 */

// Known VPN/Proxy IP ranges (simulated)
const KNOWN_VPN_RANGES = ['185.220', '45.153', '192.42', '104.200'];
const KNOWN_PROXY_RANGES = ['38.91', '45.33', '66.70'];

// High-risk ASNs
const HIGH_RISK_ASNS = ['AS14618', 'AS16509', 'AS8075']; // Major cloud providers

/**
 * Check IP Reputation
 * Simulates integration with IP reputation services like MaxMind, IPQualityScore
 */
export async function checkIpReputation(ipAddress) {
  // Simulate API latency
  await delay(50 + Math.random() * 100);

  // Generate deterministic but varied results based on IP
  const ipParts = (ipAddress || '0.0.0.0').split('.');
  const ipSum = ipParts.reduce((sum, part) => sum + parseInt(part || 0), 0);

  const isVpn = KNOWN_VPN_RANGES.some(range => ipAddress?.startsWith(range)) || ipSum % 7 === 0;
  const isProxy = KNOWN_PROXY_RANGES.some(range => ipAddress?.startsWith(range)) || ipSum % 11 === 0;
  const isTor = ipSum % 23 === 0;
  const isDatacenter = ipSum % 5 === 0;

  // Calculate risk score
  let riskScore = 0;
  if (isVpn) riskScore += 30;
  if (isProxy) riskScore += 25;
  if (isTor) riskScore += 40;
  if (isDatacenter) riskScore += 15;

  // Location data (simulated)
  const countries = ['US', 'UK', 'DE', 'NG', 'RO', 'CA', 'FR', 'RU'];
  const country = countries[ipSum % countries.length];
  const isHighRiskCountry = ['NG', 'RO', 'RU'].includes(country);
  if (isHighRiskCountry) riskScore += 20;

  return {
    success: true,
    data: {
      ipAddress,
      riskScore: Math.min(100, riskScore),
      riskLevel: riskScore > 60 ? 'HIGH' : riskScore > 30 ? 'MEDIUM' : 'LOW',
      isVpn,
      isProxy,
      isTor,
      isDatacenter,
      location: {
        country,
        countryName: getCountryName(country),
        isHighRiskCountry
      },
      asn: {
        number: `AS${10000 + (ipSum * 17) % 50000}`,
        organization: `ISP-${ipSum % 100}`,
        isHighRisk: ipSum % 13 === 0
      },
      abuseHistory: {
        reports: ipSum % 10,
        lastReported: ipSum % 10 > 0 ? new Date(Date.now() - (ipSum % 30) * 24 * 60 * 60 * 1000).toISOString() : null
      },
      checkedAt: new Date().toISOString()
    }
  };
}

/**
 * Verify Email
 * Simulates integration with email verification services like Hunter, ZeroBounce
 */
export async function verifyEmail(email) {
  await delay(50 + Math.random() * 100);

  if (!email || !email.includes('@')) {
    return {
      success: false,
      error: 'Invalid email format'
    };
  }

  const [localPart, domain] = email.split('@');
  const emailHash = hashString(email);

  // Disposable email domains
  const disposableDomains = ['tempmail.com', 'guerrillamail.com', 'mailinator.com', '10minutemail.com', 'throwaway.email'];
  const isDisposable = disposableDomains.some(d => domain.includes(d)) || emailHash % 17 === 0;

  // Free email providers
  const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
  const isFreeProvider = freeProviders.includes(domain);

  // Business email check
  const isBusinessEmail = !isFreeProvider && !isDisposable;

  // Email validity checks
  const hasValidMx = emailHash % 50 !== 0;
  const isDeliverable = hasValidMx && emailHash % 20 !== 0;
  const isCatchAll = emailHash % 15 === 0;

  // Account age estimation (simulated)
  const accountAgeDays = Math.floor(Math.random() * 1000) + 30;
  const isNewAccount = accountAgeDays < 30;

  // Risk calculation
  let riskScore = 0;
  if (isDisposable) riskScore += 40;
  if (isNewAccount) riskScore += 15;
  if (!isDeliverable) riskScore += 30;
  if (isCatchAll) riskScore += 10;
  if (!hasValidMx) riskScore += 25;

  return {
    success: true,
    data: {
      email,
      isValid: hasValidMx && isDeliverable,
      isDeliverable,
      isDisposable,
      isFreeProvider,
      isBusinessEmail,
      isCatchAll,
      hasValidMx,
      domain: {
        name: domain,
        createdAt: new Date(Date.now() - (emailHash % 3650) * 24 * 60 * 60 * 1000).toISOString(),
        isNew: (emailHash % 3650) < 30
      },
      riskScore: Math.min(100, riskScore),
      riskLevel: riskScore > 50 ? 'HIGH' : riskScore > 25 ? 'MEDIUM' : 'LOW',
      estimatedAccountAge: accountAgeDays,
      verifiedAt: new Date().toISOString()
    }
  };
}

/**
 * Check Device Reputation
 * Simulates integration with device fingerprinting services like ThreatMetrix, iovation
 */
export async function checkDeviceReputation(deviceId) {
  await delay(50 + Math.random() * 100);

  if (!deviceId) {
    return {
      success: false,
      error: 'Device ID is required'
    };
  }

  const deviceHash = hashString(deviceId);

  // Device characteristics
  const isEmulator = deviceHash % 25 === 0;
  const isRooted = deviceHash % 30 === 0;
  const hasDebugMode = deviceHash % 40 === 0;
  const hasTamperedApp = deviceHash % 50 === 0;

  // Device history
  const accountsLinked = (deviceHash % 10) + 1;
  const previousFraudFlags = deviceHash % 5;
  const firstSeenDays = (deviceHash % 365) + 1;
  const lastSeenDays = deviceHash % 7;

  // Trust score calculation
  let trustScore = 80;
  if (isEmulator) trustScore -= 40;
  if (isRooted) trustScore -= 20;
  if (hasDebugMode) trustScore -= 10;
  if (hasTamperedApp) trustScore -= 30;
  if (previousFraudFlags > 0) trustScore -= previousFraudFlags * 10;
  if (accountsLinked > 5) trustScore -= (accountsLinked - 5) * 5;
  trustScore = Math.max(0, Math.min(100, trustScore));

  return {
    success: true,
    data: {
      deviceId,
      trustScore,
      trustLevel: trustScore > 70 ? 'HIGH' : trustScore > 40 ? 'MEDIUM' : 'LOW',
      characteristics: {
        isEmulator,
        isRooted,
        hasDebugMode,
        hasTamperedApp,
        platform: ['iOS', 'Android', 'Web'][deviceHash % 3],
        browser: ['Chrome', 'Safari', 'Firefox', 'Edge'][deviceHash % 4]
      },
      history: {
        accountsLinked,
        previousFraudFlags,
        firstSeen: new Date(Date.now() - firstSeenDays * 24 * 60 * 60 * 1000).toISOString(),
        lastSeen: new Date(Date.now() - lastSeenDays * 24 * 60 * 60 * 1000).toISOString()
      },
      riskIndicators: [
        ...(isEmulator ? ['EMULATOR_DETECTED'] : []),
        ...(isRooted ? ['ROOTED_DEVICE'] : []),
        ...(hasDebugMode ? ['DEBUG_MODE'] : []),
        ...(hasTamperedApp ? ['APP_TAMPERING'] : []),
        ...(previousFraudFlags > 0 ? ['PREVIOUS_FRAUD'] : []),
        ...(accountsLinked > 5 ? ['MULTIPLE_ACCOUNTS'] : [])
      ],
      checkedAt: new Date().toISOString()
    }
  };
}

/**
 * Get geolocation data
 */
export async function getGeoLocation(ipAddress) {
  await delay(30 + Math.random() * 50);

  const ipParts = (ipAddress || '0.0.0.0').split('.');
  const ipSum = ipParts.reduce((sum, part) => sum + parseInt(part || 0), 0);

  const locations = [
    { city: 'New York', country: 'US', lat: 40.7128, lng: -74.0060 },
    { city: 'London', country: 'UK', lat: 51.5074, lng: -0.1278 },
    { city: 'Lagos', country: 'NG', lat: 6.5244, lng: 3.3792 },
    { city: 'Bucharest', country: 'RO', lat: 44.4268, lng: 26.1025 },
    { city: 'Toronto', country: 'CA', lat: 43.6532, lng: -79.3832 },
    { city: 'Berlin', country: 'DE', lat: 52.5200, lng: 13.4050 },
    { city: 'Moscow', country: 'RU', lat: 55.7558, lng: 37.6173 },
    { city: 'Paris', country: 'FR', lat: 48.8566, lng: 2.3522 }
  ];

  const location = locations[ipSum % locations.length];

  return {
    success: true,
    data: {
      ipAddress,
      ...location,
      timezone: `UTC${ipSum % 12 - 6 > 0 ? '+' : ''}${ipSum % 12 - 6}`,
      isp: `ISP-${ipSum % 100}`,
      accuracy: 'city',
      queriedAt: new Date().toISOString()
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

function getCountryName(code) {
  const names = {
    US: 'United States',
    UK: 'United Kingdom',
    DE: 'Germany',
    NG: 'Nigeria',
    RO: 'Romania',
    CA: 'Canada',
    FR: 'France',
    RU: 'Russia'
  };
  return names[code] || code;
}

export default {
  checkIpReputation,
  verifyEmail,
  checkDeviceReputation,
  getGeoLocation
};
