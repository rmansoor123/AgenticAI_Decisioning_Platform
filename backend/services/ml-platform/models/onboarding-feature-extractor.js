/**
 * Onboarding Feature Extractor
 * Extracts and normalizes 25 features from raw seller onboarding data
 * for the onboarding risk ML model.
 */

// Feature definitions with normalization parameters
const ONBOARDING_FEATURE_DEFINITIONS = {
  // Business profile
  businessAgeDays: { min: 0, max: 3650, default: 365 },
  businessAgeLog: { min: 0, max: 9, default: 5 },
  countryRiskScore: { min: 0, max: 100, default: 20 },
  categoryRiskScore: { min: 0, max: 100, default: 20 },

  // Identity verification
  identityVerificationScore: { min: 0, max: 100, default: 50 },
  documentAuthenticityScore: { min: 0, max: 100, default: 50 },

  // Contact & address
  emailRiskScore: { min: 0, max: 100, default: 20 },
  phoneRiskScore: { min: 0, max: 100, default: 20 },
  addressVerificationScore: { min: 0, max: 100, default: 50 },

  // Financial
  bankVerificationScore: { min: 0, max: 100, default: 50 },
  taxIdVerificationScore: { min: 0, max: 100, default: 50 },

  // Compliance
  watchlistMatchScore: { min: 0, max: 100, default: 0 },

  // Behavioral
  velocityScore: { min: 0, max: 100, default: 10 },
  deviceTrustScore: { min: 0, max: 100, default: 50 },
  ipReputationScore: { min: 0, max: 100, default: 30 },

  // Duplicate & registration
  duplicateDetectionScore: { min: 0, max: 100, default: 0 },
  businessRegistrationScore: { min: 0, max: 100, default: 50 },

  // Business size
  revenueEstimate: { min: 0, max: 1000000, default: 50000 },
  employeeCount: { min: 0, max: 10000, default: 10 },

  // Online presence
  webPresenceScore: { min: 0, max: 100, default: 30 },
  socialMediaScore: { min: 0, max: 100, default: 20 },

  // Risk indicators
  industryFraudRate: { min: 0, max: 1, default: 0.02 },
  geographicAnomalyScore: { min: 0, max: 100, default: 10 },
  historicalFraudFlags: { min: 0, max: 10, default: 0 },
  networkRiskScore: { min: 0, max: 100, default: 10 }
};

// High-risk countries with associated risk scores
const HIGH_RISK_COUNTRIES = new Map([
  ['IR', 100], ['KP', 100], ['SY', 95],
  ['NG', 85], ['RU', 85], ['RO', 80],
  ['UA', 80], ['PK', 80], ['BD', 80],
  ['VN', 80], ['ID', 80]
]);

// High-risk business categories with associated risk scores
const HIGH_RISK_CATEGORIES = new Map([
  ['WEAPONS', 95],
  ['GAMBLING', 90],
  ['ADULT_CONTENT', 85],
  ['CRYPTO', 80],
  ['PHARMACEUTICALS', 75],
  ['CBD', 70]
]);

// Industry fraud rate lookup by category
const INDUSTRY_FRAUD_RATES = new Map([
  ['WEAPONS', 0.12],
  ['GAMBLING', 0.09],
  ['ADULT_CONTENT', 0.07],
  ['CRYPTO', 0.08],
  ['PHARMACEUTICALS', 0.06],
  ['CBD', 0.05],
  ['ELECTRONICS', 0.04],
  ['FASHION', 0.03],
  ['JEWELRY', 0.035],
  ['DIGITAL_GOODS', 0.04],
  ['HOME_GARDEN', 0.015],
  ['FOOD_BEVERAGE', 0.01],
  ['BOOKS', 0.008],
  ['SPORTS', 0.012],
  ['TOYS', 0.01]
]);

// Known disposable email domains
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'dispostable.com', 'trashmail.com', 'fakeinbox.com', 'tempail.com',
  'temp-mail.org', '10minutemail.com', 'getnada.com', 'mohmal.com',
  'maildrop.cc', 'discard.email', 'burnermail.io', 'tempr.email'
]);

// Free email providers (not disposable, but riskier than business domains)
const FREE_EMAIL_PROVIDERS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'gmx.com', 'live.com', 'msn.com'
]);

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
 * Calculate business age in days from incorporation or registration date
 */
function computeBusinessAgeDays(sellerData) {
  const dateStr = sellerData.incorporationDate
    || sellerData.businessRegistrationDate
    || sellerData.registrationDate;

  if (!dateStr) {
    return ONBOARDING_FEATURE_DEFINITIONS.businessAgeDays.default;
  }

  const regDate = new Date(dateStr);
  if (isNaN(regDate.getTime())) {
    return ONBOARDING_FEATURE_DEFINITIONS.businessAgeDays.default;
  }

  const now = new Date();
  const diffMs = now.getTime() - regDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Compute country risk score based on country code
 */
function computeCountryRiskScore(countryCode) {
  if (!countryCode) {
    return ONBOARDING_FEATURE_DEFINITIONS.countryRiskScore.default;
  }
  const code = countryCode.toUpperCase();
  if (HIGH_RISK_COUNTRIES.has(code)) {
    return HIGH_RISK_COUNTRIES.get(code);
  }
  // Low-risk countries get a baseline score between 10-30
  const baselineScores = { 'US': 10, 'CA': 12, 'GB': 10, 'DE': 10, 'FR': 12,
    'AU': 10, 'JP': 10, 'NZ': 10, 'SE': 10, 'NO': 10, 'DK': 10, 'FI': 10,
    'CH': 10, 'NL': 10, 'SG': 12, 'IE': 12 };
  return baselineScores[code] || 25;
}

/**
 * Compute category risk score from business category
 */
function computeCategoryRiskScore(category) {
  if (!category) {
    return ONBOARDING_FEATURE_DEFINITIONS.categoryRiskScore.default;
  }
  const cat = category.toUpperCase().replace(/[\s-]/g, '_');
  if (HIGH_RISK_CATEGORIES.has(cat)) {
    return HIGH_RISK_CATEGORIES.get(cat);
  }
  // Standard categories get a baseline score between 10-30
  const standardScores = { 'ELECTRONICS': 25, 'FASHION': 15, 'JEWELRY': 28,
    'DIGITAL_GOODS': 25, 'HOME_GARDEN': 10, 'FOOD_BEVERAGE': 12,
    'BOOKS': 10, 'SPORTS': 12, 'TOYS': 10 };
  return standardScores[cat] || 20;
}

/**
 * Compute email risk score from email address and metadata
 */
function computeEmailRiskScore(sellerData) {
  const email = sellerData.email || sellerData.contactEmail || '';
  if (!email) {
    return ONBOARDING_FEATURE_DEFINITIONS.emailRiskScore.default;
  }

  let score = 0;
  const domain = email.split('@')[1]?.toLowerCase();

  if (!domain) return 60;

  // Disposable email domain - very high risk
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    score += 70;
  }
  // Free email provider - moderate risk for business
  else if (FREE_EMAIL_PROVIDERS.has(domain)) {
    score += 25;
  }
  // Business domain - low risk
  else {
    score += 5;
  }

  // Check email age if available
  const emailAge = sellerData.emailAgeDays || sellerData.emailAge;
  if (emailAge !== undefined && emailAge !== null) {
    if (emailAge < 7) score += 25;
    else if (emailAge < 30) score += 15;
    else if (emailAge < 90) score += 5;
  }

  // Check if email matches business name
  if (sellerData.businessName && domain) {
    const bizLower = sellerData.businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const domainBase = domain.split('.')[0].toLowerCase();
    if (!FREE_EMAIL_PROVIDERS.has(domain) && !domainBase.includes(bizLower) && bizLower.length > 3) {
      score += 5;
    }
  }

  return Math.min(100, score);
}

/**
 * Compute phone risk score
 */
function computePhoneRiskScore(sellerData) {
  const phone = sellerData.phone || sellerData.contactPhone || sellerData.phoneNumber;
  if (!phone) {
    return ONBOARDING_FEATURE_DEFINITIONS.phoneRiskScore.default;
  }

  let score = 10; // baseline

  // VOIP phone detection
  if (sellerData.phoneType === 'voip' || sellerData.isVoipPhone) {
    score += 30;
  }

  // Phone country mismatch
  if (sellerData.phoneCountry && sellerData.country) {
    if (sellerData.phoneCountry.toUpperCase() !== sellerData.country.toUpperCase()) {
      score += 25;
    }
  }

  // Prepaid phone
  if (sellerData.phoneType === 'prepaid' || sellerData.isPrepaidPhone) {
    score += 15;
  }

  // Phone verification status
  if (sellerData.phoneVerified === false) {
    score += 15;
  }

  return Math.min(100, score);
}

/**
 * Compute identity verification score from KYC data
 */
function computeIdentityVerificationScore(sellerData) {
  if (sellerData.identityVerificationScore !== undefined) {
    return sellerData.identityVerificationScore;
  }

  let score = ONBOARDING_FEATURE_DEFINITIONS.identityVerificationScore.default;

  if (sellerData.kycVerified === true) {
    score = 85;
  } else if (sellerData.kycVerified === false) {
    score = 20;
  }

  // Adjust based on ID verification result
  const idResult = sellerData.idVerification || sellerData.idVerificationResult;
  if (idResult) {
    if (idResult.status === 'verified' || idResult.passed === true) {
      score = Math.max(score, 80);
    } else if (idResult.status === 'failed' || idResult.passed === false) {
      score = Math.min(score, 25);
    } else if (idResult.status === 'partial') {
      score = Math.min(score, 50);
    }

    if (idResult.confidence !== undefined) {
      score = Math.round((score + idResult.confidence) / 2);
    }
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Compute document authenticity score
 */
function computeDocumentAuthenticityScore(sellerData) {
  if (sellerData.documentAuthenticityScore !== undefined) {
    return sellerData.documentAuthenticityScore;
  }

  const docVerification = sellerData.documentVerification || sellerData.docVerification;
  if (!docVerification) {
    return ONBOARDING_FEATURE_DEFINITIONS.documentAuthenticityScore.default;
  }

  let score = 50;

  if (docVerification.authentic === true || docVerification.status === 'verified') {
    score = 85;
  } else if (docVerification.authentic === false || docVerification.status === 'failed') {
    score = 10;
  }

  if (docVerification.tamperingDetected) {
    score = Math.min(score, 15);
  }

  if (docVerification.confidence !== undefined) {
    score = Math.round((score + docVerification.confidence) / 2);
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Compute address verification score
 */
function computeAddressVerificationScore(sellerData) {
  if (sellerData.addressVerificationScore !== undefined) {
    return sellerData.addressVerificationScore;
  }

  const addrVerification = sellerData.addressVerification || {};
  let score = ONBOARDING_FEATURE_DEFINITIONS.addressVerificationScore.default;

  if (addrVerification.verified === true || sellerData.addressVerified === true) {
    score = 80;
  } else if (addrVerification.verified === false || sellerData.addressVerified === false) {
    score = 20;
  }

  // Commercial vs residential
  if (addrVerification.type === 'commercial') {
    score += 5;
  } else if (addrVerification.type === 'po_box') {
    score -= 10;
  }

  // Address is a known virtual office
  if (addrVerification.isVirtualOffice) {
    score -= 15;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Compute bank verification score
 */
function computeBankVerificationScore(sellerData) {
  if (sellerData.bankVerificationScore !== undefined) {
    return sellerData.bankVerificationScore;
  }

  let score = ONBOARDING_FEATURE_DEFINITIONS.bankVerificationScore.default;

  if (sellerData.bankVerified === true) {
    score = 80;
  } else if (sellerData.bankVerified === false) {
    score = 20;
  }

  // Micro-deposit verification
  if (sellerData.microDepositVerified) {
    score = Math.max(score, 85);
  }

  // Bank account country matches business country
  if (sellerData.bankCountry && sellerData.country) {
    if (sellerData.bankCountry.toUpperCase() !== sellerData.country.toUpperCase()) {
      score -= 15;
    }
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Compute tax ID verification score
 */
function computeTaxIdVerificationScore(sellerData) {
  if (sellerData.taxIdVerificationScore !== undefined) {
    return sellerData.taxIdVerificationScore;
  }

  let score = ONBOARDING_FEATURE_DEFINITIONS.taxIdVerificationScore.default;

  if (sellerData.taxIdVerified === true) {
    score = 85;
  } else if (sellerData.taxIdVerified === false) {
    score = 20;
  } else if (!sellerData.taxId && !sellerData.taxIdentificationNumber) {
    score = 30; // No tax ID provided
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Compute watchlist match score from screening results
 */
function computeWatchlistMatchScore(sellerData) {
  if (sellerData.watchlistMatchScore !== undefined) {
    return sellerData.watchlistMatchScore;
  }

  const screening = sellerData.watchlistScreening || sellerData.sanctionsScreening;
  if (!screening) {
    return ONBOARDING_FEATURE_DEFINITIONS.watchlistMatchScore.default;
  }

  if (screening.matched === true || screening.hit === true) {
    // Confidence of match
    return screening.confidence || screening.matchScore || 90;
  }

  if (screening.potentialMatch === true) {
    return screening.confidence || 50;
  }

  // No match
  return 0;
}

/**
 * Compute velocity score based on recent registration patterns
 */
function computeVelocityScore(sellerData) {
  if (sellerData.velocityScore !== undefined) {
    return sellerData.velocityScore;
  }

  let score = ONBOARDING_FEATURE_DEFINITIONS.velocityScore.default;

  const velocity = sellerData.registrationVelocity || sellerData.velocity || {};

  // Same IP registrations in last 24h
  const sameIpCount = velocity.sameIp24h || velocity.registrationsFromIp || 0;
  if (sameIpCount > 5) score += 40;
  else if (sameIpCount > 3) score += 25;
  else if (sameIpCount > 1) score += 10;

  // Same device registrations in last 24h
  const sameDeviceCount = velocity.sameDevice24h || velocity.registrationsFromDevice || 0;
  if (sameDeviceCount > 3) score += 35;
  else if (sameDeviceCount > 1) score += 15;

  return Math.min(100, score);
}

/**
 * Compute device trust score
 */
function computeDeviceTrustScore(sellerData) {
  if (sellerData.deviceTrustScore !== undefined) {
    return sellerData.deviceTrustScore;
  }

  const device = sellerData.device || sellerData.deviceInfo || {};
  let score = ONBOARDING_FEATURE_DEFINITIONS.deviceTrustScore.default;

  if (device.trustScore !== undefined) {
    return device.trustScore;
  }

  // Known device
  if (device.isKnown === true) {
    score += 15;
  }

  // Emulator or virtual machine
  if (device.isEmulator || device.isVirtualMachine) {
    score -= 30;
  }

  // Root/jailbreak detected
  if (device.isRooted || device.isJailbroken) {
    score -= 20;
  }

  // Device age
  if (device.firstSeenDays !== undefined) {
    if (device.firstSeenDays < 1) score -= 15;
    else if (device.firstSeenDays > 30) score += 10;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Compute IP reputation score
 */
function computeIpReputationScore(sellerData) {
  if (sellerData.ipReputationScore !== undefined) {
    return sellerData.ipReputationScore;
  }

  const ip = sellerData.ipInfo || sellerData.ip || {};
  let score = ONBOARDING_FEATURE_DEFINITIONS.ipReputationScore.default;

  if (ip.reputationScore !== undefined) {
    return ip.reputationScore;
  }

  // VPN / proxy / tor
  if (ip.isVpn || ip.vpnDetected) score += 20;
  if (ip.isProxy || ip.proxyDetected) score += 25;
  if (ip.isTor || ip.torDetected) score += 35;

  // Datacenter IP
  if (ip.isDatacenter) score += 15;

  // IP blacklisted
  if (ip.isBlacklisted) score += 30;

  return Math.min(100, Math.max(0, score));
}

/**
 * Compute duplicate detection score
 */
function computeDuplicateDetectionScore(sellerData) {
  if (sellerData.duplicateDetectionScore !== undefined) {
    return sellerData.duplicateDetectionScore;
  }

  const dupCheck = sellerData.duplicateCheck || sellerData.duplicateDetection || {};
  if (!dupCheck || Object.keys(dupCheck).length === 0) {
    return ONBOARDING_FEATURE_DEFINITIONS.duplicateDetectionScore.default;
  }

  if (dupCheck.exactMatch === true) return 95;
  if (dupCheck.highSimilarity === true) return 75;
  if (dupCheck.partialMatch === true) return 50;

  if (dupCheck.similarityScore !== undefined) {
    return Math.round(dupCheck.similarityScore * 100);
  }

  return dupCheck.score || 0;
}

/**
 * Compute business registration score
 */
function computeBusinessRegistrationScore(sellerData) {
  if (sellerData.businessRegistrationScore !== undefined) {
    return sellerData.businessRegistrationScore;
  }

  const bizVerification = sellerData.businessVerification || sellerData.businessCheck || {};
  let score = ONBOARDING_FEATURE_DEFINITIONS.businessRegistrationScore.default;

  if (bizVerification.verified === true || sellerData.businessVerified === true) {
    score = 80;
  } else if (bizVerification.verified === false || sellerData.businessVerified === false) {
    score = 20;
  }

  // Shell company indicators
  if (bizVerification.isShellCompany) {
    score = Math.min(score, 15);
  }

  // Active registration status
  if (bizVerification.status === 'active') {
    score = Math.max(score, 70);
  } else if (bizVerification.status === 'dissolved' || bizVerification.status === 'inactive') {
    score = Math.min(score, 20);
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Compute web presence score
 */
function computeWebPresenceScore(sellerData) {
  if (sellerData.webPresenceScore !== undefined) {
    return sellerData.webPresenceScore;
  }

  let score = 0;

  // Has website
  if (sellerData.website || sellerData.businessWebsite) {
    score += 40;

    // Website age
    if (sellerData.websiteAgeDays !== undefined) {
      if (sellerData.websiteAgeDays > 365) score += 20;
      else if (sellerData.websiteAgeDays > 90) score += 10;
      else if (sellerData.websiteAgeDays < 7) score -= 5;
    }

    // SSL certificate
    if (sellerData.websiteHasSsl || sellerData.sslVerified) {
      score += 10;
    }
  }

  // Domain matches business name
  if (sellerData.domainMatchesBusiness) {
    score += 15;
  }

  // Has business listings (Google, Yelp, etc.)
  if (sellerData.hasBusinessListings) {
    score += 15;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Compute social media presence score
 */
function computeSocialMediaScore(sellerData) {
  if (sellerData.socialMediaScore !== undefined) {
    return sellerData.socialMediaScore;
  }

  let score = 0;
  const social = sellerData.socialMedia || sellerData.socialProfiles || {};

  const platforms = ['linkedin', 'facebook', 'twitter', 'instagram', 'tiktok'];
  let platformCount = 0;

  for (const platform of platforms) {
    if (social[platform] || sellerData[`${platform}Url`]) {
      platformCount++;
      if (social[`${platform}Verified`]) {
        score += 15;
      } else {
        score += 8;
      }
    }
  }

  // Bonus for multiple platforms
  if (platformCount >= 3) score += 15;
  else if (platformCount >= 2) score += 8;

  return Math.min(100, Math.max(0, score));
}

/**
 * Compute industry fraud rate from category
 */
function computeIndustryFraudRate(category) {
  if (!category) {
    return ONBOARDING_FEATURE_DEFINITIONS.industryFraudRate.default;
  }
  const cat = category.toUpperCase().replace(/[\s-]/g, '_');
  return INDUSTRY_FRAUD_RATES.get(cat) || ONBOARDING_FEATURE_DEFINITIONS.industryFraudRate.default;
}

/**
 * Compute geographic anomaly score (IP country vs business country mismatch)
 */
function computeGeographicAnomalyScore(sellerData) {
  if (sellerData.geographicAnomalyScore !== undefined) {
    return sellerData.geographicAnomalyScore;
  }

  let score = ONBOARDING_FEATURE_DEFINITIONS.geographicAnomalyScore.default;

  const businessCountry = (sellerData.country || sellerData.businessCountry || '').toUpperCase();
  const ipCountry = (sellerData.ipCountry || sellerData.ipInfo?.country || '').toUpperCase();

  if (businessCountry && ipCountry && businessCountry !== ipCountry) {
    // Mismatch detected
    score = 60;

    // Higher risk if IP is from a high-risk country
    if (HIGH_RISK_COUNTRIES.has(ipCountry)) {
      score = 85;
    }

    // Slightly lower risk if just different but both low-risk
    if (!HIGH_RISK_COUNTRIES.has(ipCountry) && !HIGH_RISK_COUNTRIES.has(businessCountry)) {
      score = 45;
    }
  } else if (businessCountry && ipCountry && businessCountry === ipCountry) {
    score = 5;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Compute historical fraud flags count
 */
function computeHistoricalFraudFlags(sellerData) {
  if (sellerData.historicalFraudFlags !== undefined) {
    return typeof sellerData.historicalFraudFlags === 'number'
      ? sellerData.historicalFraudFlags
      : 0;
  }

  const history = sellerData.fraudHistory || sellerData.priorFlags || {};
  return history.flagCount || history.totalFlags || 0;
}

/**
 * Compute network risk score from graph/network analysis
 */
function computeNetworkRiskScore(sellerData) {
  if (sellerData.networkRiskScore !== undefined) {
    return sellerData.networkRiskScore;
  }

  const network = sellerData.networkAnalysis || sellerData.graphAnalysis || {};
  if (!network || Object.keys(network).length === 0) {
    return ONBOARDING_FEATURE_DEFINITIONS.networkRiskScore.default;
  }

  let score = 10;

  // Connected to known fraudulent accounts
  if (network.fraudulentConnections > 0) {
    score += Math.min(40, network.fraudulentConnections * 15);
  }

  // Shared attributes with flagged accounts
  if (network.sharedAttributes > 0) {
    score += Math.min(30, network.sharedAttributes * 10);
  }

  // Part of a known fraud ring
  if (network.fraudRingMember) {
    score = 90;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Extract and normalize features from raw seller onboarding data
 * @param {Object} sellerData - Raw seller onboarding data
 * @returns {Object} - Feature vector and metadata
 */
export function extractOnboardingFeatures(sellerData) {
  const data = sellerData || {};

  // Compute all raw features
  const businessAgeDays = computeBusinessAgeDays(data);
  const businessAgeLog = Math.log(businessAgeDays + 1);
  const category = data.businessCategory || data.category || data.industryCategory;

  const rawFeatures = {
    businessAgeDays,
    businessAgeLog,
    countryRiskScore: computeCountryRiskScore(data.country || data.businessCountry),
    categoryRiskScore: computeCategoryRiskScore(category),
    identityVerificationScore: computeIdentityVerificationScore(data),
    documentAuthenticityScore: computeDocumentAuthenticityScore(data),
    emailRiskScore: computeEmailRiskScore(data),
    phoneRiskScore: computePhoneRiskScore(data),
    addressVerificationScore: computeAddressVerificationScore(data),
    bankVerificationScore: computeBankVerificationScore(data),
    taxIdVerificationScore: computeTaxIdVerificationScore(data),
    watchlistMatchScore: computeWatchlistMatchScore(data),
    velocityScore: computeVelocityScore(data),
    deviceTrustScore: computeDeviceTrustScore(data),
    ipReputationScore: computeIpReputationScore(data),
    duplicateDetectionScore: computeDuplicateDetectionScore(data),
    businessRegistrationScore: computeBusinessRegistrationScore(data),
    revenueEstimate: parseFloat(data.revenueEstimate || data.estimatedRevenue || data.annualRevenue) || ONBOARDING_FEATURE_DEFINITIONS.revenueEstimate.default,
    employeeCount: parseInt(data.employeeCount || data.numberOfEmployees || data.employees, 10) || ONBOARDING_FEATURE_DEFINITIONS.employeeCount.default,
    webPresenceScore: computeWebPresenceScore(data),
    socialMediaScore: computeSocialMediaScore(data),
    industryFraudRate: computeIndustryFraudRate(category),
    geographicAnomalyScore: computeGeographicAnomalyScore(data),
    historicalFraudFlags: computeHistoricalFraudFlags(data),
    networkRiskScore: computeNetworkRiskScore(data)
  };

  // Normalize features
  const normalizedFeatures = {};
  for (const [name, value] of Object.entries(rawFeatures)) {
    const def = ONBOARDING_FEATURE_DEFINITIONS[name];
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
 * @param {Array} records - Array of raw seller onboarding records
 * @returns {Object} - Batch features with vectors as 2D array
 */
export function extractBatchOnboardingFeatures(records) {
  const results = records.map(record => extractOnboardingFeatures(record.features || record));

  return {
    vectors: results.map(r => r.vector),
    featureNames: results[0]?.featureNames || [],
    featureCount: results[0]?.featureCount || 0,
    recordCount: records.length
  };
}

/**
 * Get feature importance weights for onboarding risk (for explainability)
 */
export function getOnboardingFeatureImportance() {
  return [
    { name: 'watchlistMatchScore', importance: 0.10, description: 'Watchlist/sanctions match score' },
    { name: 'identityVerificationScore', importance: 0.09, description: 'Identity verification confidence' },
    { name: 'countryRiskScore', importance: 0.07, description: 'Country-based risk level' },
    { name: 'duplicateDetectionScore', importance: 0.07, description: 'Duplicate/multi-account detection' },
    { name: 'documentAuthenticityScore', importance: 0.06, description: 'Document authenticity confidence' },
    { name: 'emailRiskScore', importance: 0.06, description: 'Email risk indicators' },
    { name: 'velocityScore', importance: 0.06, description: 'Registration velocity anomalies' },
    { name: 'bankVerificationScore', importance: 0.05, description: 'Bank account verification status' },
    { name: 'deviceTrustScore', importance: 0.05, description: 'Device trust level' },
    { name: 'ipReputationScore', importance: 0.05, description: 'IP address reputation' },
    { name: 'categoryRiskScore', importance: 0.04, description: 'Business category risk' },
    { name: 'geographicAnomalyScore', importance: 0.04, description: 'IP vs business country mismatch' },
    { name: 'networkRiskScore', importance: 0.04, description: 'Network/graph analysis risk' },
    { name: 'businessRegistrationScore', importance: 0.03, description: 'Business registration verification' },
    { name: 'taxIdVerificationScore', importance: 0.03, description: 'Tax ID verification status' },
    { name: 'historicalFraudFlags', importance: 0.03, description: 'Prior fraud flag count' },
    { name: 'phoneRiskScore', importance: 0.03, description: 'Phone risk indicators' },
    { name: 'addressVerificationScore', importance: 0.02, description: 'Address verification confidence' },
    { name: 'businessAgeDays', importance: 0.02, description: 'Business age in days' },
    { name: 'businessAgeLog', importance: 0.01, description: 'Log-transformed business age' },
    { name: 'industryFraudRate', importance: 0.01, description: 'Industry baseline fraud rate' },
    { name: 'webPresenceScore', importance: 0.01, description: 'Web presence strength' },
    { name: 'socialMediaScore', importance: 0.01, description: 'Social media presence' },
    { name: 'revenueEstimate', importance: 0.01, description: 'Estimated annual revenue' },
    { name: 'employeeCount', importance: 0.01, description: 'Number of employees' }
  ];
}

/**
 * Calculate SHAP-like feature contributions for a prediction
 * @param {Object} features - Extracted onboarding features
 * @param {number} prediction - Model prediction score
 * @returns {Array} - Feature contributions sorted by absolute contribution
 */
export function calculateOnboardingContributions(features, prediction) {
  const importance = getOnboardingFeatureImportance();
  const baseValue = 0.5;
  const outputDiff = prediction - baseValue;

  return importance.map((feat) => {
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
  extractOnboardingFeatures,
  extractBatchOnboardingFeatures,
  getOnboardingFeatureImportance,
  calculateOnboardingContributions,
  ONBOARDING_FEATURE_DEFINITIONS
};
