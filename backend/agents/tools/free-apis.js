/**
 * Free API Integrations
 *
 * Real API integrations using free-tier services (no credit card required).
 * Each function returns the same shape as existing simulation functions and
 * includes a `source` field indicating which API answered.
 *
 * Fallback chain: free API → existing simulation from external-apis.js
 */

import { checkIpReputation, verifyEmail, checkBusinessRegistration } from './external-apis.js';
import { checkFraudList } from './fraud-databases.js';
import { screenName } from './ofac-screening.js';

// ============================================================================
// RATE LIMITING
// ============================================================================

// Nominatim requires 1 req/sec
let _nominatimLastCall = 0;

async function nominatimRateLimit() {
  const now = Date.now();
  const elapsed = now - _nominatimLastCall;
  if (elapsed < 1100) {
    await new Promise(resolve => setTimeout(resolve, 1100 - elapsed));
  }
  _nominatimLastCall = Date.now();
}

// ============================================================================
// 1. IP REPUTATION — ip-api.com (free, HTTP only, 45 req/min)
// ============================================================================

export async function checkIpReputationFree(ipAddress) {
  if (!ipAddress) {
    return { success: false, error: 'IP address is required' };
  }

  // Primary: ip-api.com (no key, HTTP only on free tier)
  try {
    const resp = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ipAddress)}?fields=status,message,country,countryCode,region,city,zip,lat,lon,timezone,isp,org,as,proxy,hosting,mobile`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await resp.json();

    if (data.status === 'success') {
      const isProxy = data.proxy || false;
      const isHosting = data.hosting || false;
      const isMobile = data.mobile || false;
      const highRiskCountries = ['NG', 'RO', 'RU', 'UA', 'PK', 'BD'];
      const isHighRiskCountry = highRiskCountries.includes(data.countryCode);

      let riskScore = 0;
      if (isProxy) riskScore += 35;
      if (isHosting) riskScore += 20;
      if (isHighRiskCountry) riskScore += 20;

      return {
        success: true,
        data: {
          ipAddress,
          riskScore: Math.min(100, riskScore),
          riskLevel: riskScore > 60 ? 'HIGH' : riskScore > 30 ? 'MEDIUM' : 'LOW',
          isVpn: isProxy,
          isProxy,
          isTor: false, // ip-api doesn't detect Tor specifically
          isDatacenter: isHosting,
          location: {
            country: data.countryCode,
            countryName: data.country,
            city: data.city,
            region: data.region,
            lat: data.lat,
            lon: data.lon,
            isHighRiskCountry
          },
          asn: {
            number: data.as?.split(' ')[0] || '',
            organization: data.org || data.isp,
            isHighRisk: isHosting
          },
          isMobile,
          checkedAt: new Date().toISOString(),
          source: 'ip-api'
        }
      };
    }
  } catch (e) {
    console.warn('[free-apis] ip-api.com failed:', e.message);
  }

  // Secondary: AbuseIPDB (requires key)
  const abuseipdbKey = process.env.ABUSEIPDB_API_KEY;
  if (abuseipdbKey) {
    try {
      const resp = await fetch(
        `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ipAddress)}&maxAgeInDays=90`,
        {
          headers: { Key: abuseipdbKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(5000)
        }
      );
      const json = await resp.json();
      const d = json.data;

      if (d) {
        const riskScore = Math.min(100, d.abuseConfidenceScore || 0);
        return {
          success: true,
          data: {
            ipAddress,
            riskScore,
            riskLevel: riskScore > 60 ? 'HIGH' : riskScore > 30 ? 'MEDIUM' : 'LOW',
            isVpn: d.isTor || false,
            isProxy: d.usageType === 'Data Center/Web Hosting/Transit',
            isTor: d.isTor || false,
            isDatacenter: d.usageType?.includes('Data Center') || false,
            location: {
              country: d.countryCode,
              countryName: d.countryName || d.countryCode,
              isHighRiskCountry: ['NG', 'RO', 'RU', 'UA', 'PK', 'BD'].includes(d.countryCode)
            },
            asn: {
              number: `AS${d.isp || ''}`,
              organization: d.isp,
              isHighRisk: false
            },
            abuseHistory: {
              reports: d.totalReports || 0,
              lastReported: d.lastReportedAt || null
            },
            checkedAt: new Date().toISOString(),
            source: 'abuseipdb'
          }
        };
      }
    } catch (e) {
      console.warn('[free-apis] AbuseIPDB failed:', e.message);
    }
  }

  // Fallback to simulation
  const sim = await checkIpReputation(ipAddress);
  sim.data.source = 'simulation';
  return sim;
}

// ============================================================================
// 2. EMAIL VERIFICATION — emailrep.io (1,000/day with key)
// ============================================================================

export async function verifyEmailFree(email) {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Invalid email format' };
  }

  // Primary: emailrep.io (free key, 1000/day)
  const emailrepKey = process.env.EMAILREP_API_KEY;
  if (emailrepKey) {
    try {
      const resp = await fetch(`https://emailrep.io/${encodeURIComponent(email)}`, {
        headers: {
          Key: emailrepKey,
          'User-Agent': 'fraud-detection-platform/1.0'
        },
        signal: AbortSignal.timeout(5000)
      });
      const data = await resp.json();

      if (data.email) {
        const isDisposable = data.details?.disposable || false;
        const isFreeProvider = data.details?.free_provider || false;

        let riskScore = 0;
        if (isDisposable) riskScore += 40;
        if (data.suspicious) riskScore += 30;
        if (data.details?.spam) riskScore += 20;
        if (!data.details?.deliverable) riskScore += 25;
        if (data.details?.credentials_leaked) riskScore += 15;

        return {
          success: true,
          data: {
            email,
            isValid: !isDisposable && data.reputation !== 'none',
            isDeliverable: data.details?.deliverable !== false,
            isDisposable,
            isFreeProvider,
            isBusinessEmail: !isFreeProvider && !isDisposable,
            isCatchAll: false,
            hasValidMx: true,
            reputation: data.reputation,
            suspicious: data.suspicious,
            domain: {
              name: email.split('@')[1],
              isNew: data.details?.domain_exists === false
            },
            riskScore: Math.min(100, riskScore),
            riskLevel: riskScore > 50 ? 'HIGH' : riskScore > 25 ? 'MEDIUM' : 'LOW',
            verifiedAt: new Date().toISOString(),
            source: 'emailrep'
          }
        };
      }
    } catch (e) {
      console.warn('[free-apis] emailrep.io failed:', e.message);
    }
  }

  // Secondary: AbstractAPI (100/month with key)
  const abstractKey = process.env.ABSTRACT_EMAIL_API_KEY;
  if (abstractKey) {
    try {
      const resp = await fetch(
        `https://emailvalidation.abstractapi.com/v1/?api_key=${abstractKey}&email=${encodeURIComponent(email)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const data = await resp.json();

      if (data.email) {
        const isDisposable = data.is_disposable_email?.value || false;
        const isFreeProvider = data.is_free_email?.value || false;

        let riskScore = 0;
        if (isDisposable) riskScore += 40;
        if (!data.deliverability || data.deliverability === 'UNDELIVERABLE') riskScore += 30;
        if (data.quality_score && parseFloat(data.quality_score) < 0.5) riskScore += 20;

        return {
          success: true,
          data: {
            email,
            isValid: data.deliverability === 'DELIVERABLE',
            isDeliverable: data.deliverability === 'DELIVERABLE',
            isDisposable,
            isFreeProvider,
            isBusinessEmail: !isFreeProvider && !isDisposable,
            isCatchAll: data.is_catchall_email?.value || false,
            hasValidMx: data.is_mx_found?.value || false,
            domain: {
              name: email.split('@')[1]
            },
            riskScore: Math.min(100, riskScore),
            riskLevel: riskScore > 50 ? 'HIGH' : riskScore > 25 ? 'MEDIUM' : 'LOW',
            verifiedAt: new Date().toISOString(),
            source: 'abstractapi'
          }
        };
      }
    } catch (e) {
      console.warn('[free-apis] AbstractAPI failed:', e.message);
    }
  }

  // Fallback to simulation
  const sim = await verifyEmail(email);
  sim.data.source = 'simulation';
  return sim;
}

// ============================================================================
// 3. WATCHLIST SCREENING — OFAC local + stopforumspam
// ============================================================================

export async function screenWatchlistFree(params) {
  const { name, dateOfBirth, country, businessName } = params;
  const screenTarget = name || businessName || '';

  // OFAC local screening
  const ofacResult = screenName(screenTarget);

  // Also check business name if different from personal name
  let businessOfac = null;
  if (businessName && businessName !== name) {
    businessOfac = screenName(businessName);
  }

  const hasSanctionsMatch = ofacResult.matched || (businessOfac?.matched || false);
  const allMatches = [
    ...(ofacResult.matches || []),
    ...(businessOfac?.matches || [])
  ];

  return {
    success: true,
    data: {
      name,
      businessName,
      country,
      sanctionsMatch: hasSanctionsMatch,
      pepMatch: false, // No free PEP database available
      watchlistMatch: hasSanctionsMatch,
      matches: allMatches.map(m => ({
        ...m,
        listSource: 'OFAC SDN'
      })),
      screenedAt: new Date().toISOString(),
      source: ofacResult.source || 'ofac-local'
    }
  };
}

// ============================================================================
// 4. FRAUD DATABASE — stopforumspam.com (no key needed)
// ============================================================================

export async function checkFraudDatabasesFree(params) {
  const { email, businessName, phone, taxId } = params;

  // stopforumspam.com — check email
  if (email) {
    try {
      const resp = await fetch(
        `https://api.stopforumspam.org/api?email=${encodeURIComponent(email)}&json`,
        { signal: AbortSignal.timeout(5000) }
      );
      const data = await resp.json();

      if (data.success === 1 && data.email) {
        const emailResult = data.email;
        const isBlocked = emailResult.appears === 1;
        const frequency = emailResult.frequency || 0;

        // Also run internal fraud check
        let fraudCheck = { data: {} };
        try {
          fraudCheck = await checkFraudList({ email, businessName, phone });
        } catch (e) { /* skip */ }

        return {
          success: true,
          data: {
            email,
            businessName,
            isBlocked,
            isHighRisk: frequency > 5 || (fraudCheck.data?.isHighRisk || false),
            riskScore: isBlocked ? Math.min(100, 40 + frequency * 5) : (fraudCheck.data?.riskScore || 0),
            stopForumSpam: {
              appears: isBlocked,
              frequency,
              lastSeen: emailResult.lastseen || null
            },
            consortiumData: fraudCheck.data?.consortiumData || {},
            checkedAt: new Date().toISOString(),
            source: 'stopforumspam'
          }
        };
      }
    } catch (e) {
      console.warn('[free-apis] stopforumspam failed:', e.message);
    }
  }

  // Fallback to internal fraud database check
  try {
    const fraudCheck = await checkFraudList({ email, businessName, phone });
    if (fraudCheck?.data) {
      fraudCheck.data.source = 'internal';
      fraudCheck.data.checkedAt = new Date().toISOString();
      return fraudCheck;
    }
  } catch (e) {
    console.warn('[free-apis] internal fraud check failed:', e.message);
  }

  return {
    success: true,
    data: {
      email, businessName,
      isBlocked: false,
      isHighRisk: false,
      riskScore: 0,
      checkedAt: new Date().toISOString(),
      source: 'none'
    }
  };
}

// ============================================================================
// 5. BUSINESS VERIFICATION — OpenCorporates (50/day with key)
// ============================================================================

export async function verifyBusinessFree(params) {
  const { businessName, registrationNumber, country, businessCategory } = params;

  const opencorpKey = process.env.OPENCORPORATES_API_KEY;
  if (opencorpKey && businessName) {
    try {
      const q = encodeURIComponent(businessName);
      const jurisdictionCode = country ? country.toLowerCase() : '';
      const url = jurisdictionCode
        ? `https://api.opencorporates.com/v0.4/companies/search?q=${q}&jurisdiction_code=${jurisdictionCode}&api_token=${opencorpKey}`
        : `https://api.opencorporates.com/v0.4/companies/search?q=${q}&api_token=${opencorpKey}`;

      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const json = await resp.json();
      const companies = json.results?.companies || [];

      if (companies.length > 0) {
        const top = companies[0].company;
        const incorporationDate = top.incorporation_date ? new Date(top.incorporation_date) : null;
        const businessAge = incorporationDate
          ? Math.floor((Date.now() - incorporationDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        return {
          success: true,
          data: {
            businessName: top.name,
            registrationNumber: top.company_number || registrationNumber,
            country: top.jurisdiction_code?.toUpperCase() || country,
            businessCategory,
            isRegistered: true,
            registrationDate: top.incorporation_date || null,
            businessAge,
            status: top.current_status?.toUpperCase() || 'ACTIVE',
            legalEntityType: top.company_type || 'UNKNOWN',
            verifiedAt: new Date().toISOString(),
            source: 'opencorporates',
            opencorporatesUrl: top.opencorporates_url
          }
        };
      }

      // No results = not found
      return {
        success: true,
        data: {
          businessName, registrationNumber, country, businessCategory,
          isRegistered: false,
          status: 'NOT_FOUND',
          verifiedAt: new Date().toISOString(),
          source: 'opencorporates'
        }
      };
    } catch (e) {
      console.warn('[free-apis] OpenCorporates failed:', e.message);
    }
  }

  // Fallback to simulation
  const sim = await checkBusinessRegistration({ businessName, registrationNumber, country });
  return {
    success: true,
    data: {
      ...sim.data,
      businessCategory,
      source: 'simulation'
    }
  };
}

// ============================================================================
// 6. ADDRESS VERIFICATION — Nominatim/OSM (no key, 1 req/sec)
// ============================================================================

export async function verifyAddressFree(params) {
  const { address, country, addressType } = params;

  if (address) {
    try {
      await nominatimRateLimit();

      const q = encodeURIComponent(address + (country ? `, ${country}` : ''));
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=1`,
        {
          headers: { 'User-Agent': 'FraudDetectionPlatform/1.0 (fraud-detection@example.com)' },
          signal: AbortSignal.timeout(8000)
        }
      );
      const results = await resp.json();

      if (results.length > 0) {
        const r = results[0];
        const addr = r.address || {};

        // Check for risky address types
        const riskIndicators = [];
        if (addr.office || addr.building) riskIndicators.push('COMMERCIAL_ADDRESS');
        if (r.type === 'postcode') riskIndicators.push('PO_BOX_LIKELY');
        if (!addr.road && !addr.house_number) riskIndicators.push('INCOMPLETE_ADDRESS');

        return {
          success: true,
          data: {
            address,
            country: addr.country_code?.toUpperCase() || country,
            addressType,
            verified: true,
            verificationMethod: 'GEOCODING',
            formattedAddress: r.display_name,
            location: {
              lat: parseFloat(r.lat),
              lon: parseFloat(r.lon)
            },
            riskIndicators,
            verifiedAt: new Date().toISOString(),
            source: 'nominatim'
          }
        };
      }

      // Address not found
      return {
        success: true,
        data: {
          address, country, addressType,
          verified: false,
          verificationMethod: 'GEOCODING',
          riskIndicators: ['ADDRESS_NOT_FOUND'],
          verifiedAt: new Date().toISOString(),
          source: 'nominatim'
        }
      };
    } catch (e) {
      console.warn('[free-apis] Nominatim failed:', e.message);
    }
  }

  // Fallback: return simulation-style result
  return {
    success: true,
    data: {
      address, country, addressType,
      verified: !!address,
      verificationMethod: 'SIMULATION',
      riskIndicators: [],
      verifiedAt: new Date().toISOString(),
      source: 'simulation'
    }
  };
}

// ============================================================================
// 7. BANK ACCOUNT VERIFICATION — ABA Routing Number Checksum (no API)
// ============================================================================

export async function verifyBankAccountFree(params) {
  const { accountNumber, routingNumber, accountHolderName, bankName, country } = params;

  // ABA routing number validation (US routing numbers are 9 digits with checksum)
  let routingValid = false;
  let routingCheckDetails = null;

  if (routingNumber && /^\d{9}$/.test(routingNumber)) {
    const digits = routingNumber.split('').map(Number);
    // ABA checksum: 3(d1 + d4 + d7) + 7(d2 + d5 + d8) + (d3 + d6 + d9) mod 10 === 0
    const checksum =
      3 * (digits[0] + digits[3] + digits[6]) +
      7 * (digits[1] + digits[4] + digits[7]) +
      (digits[2] + digits[5] + digits[8]);
    routingValid = checksum % 10 === 0;
    routingCheckDetails = {
      format: 'ABA',
      checksumValid: routingValid,
      checksum: checksum % 10
    };
  } else if (routingNumber) {
    routingCheckDetails = {
      format: 'UNKNOWN',
      checksumValid: false,
      reason: 'Not a valid 9-digit US routing number'
    };
  }

  // Basic account number format check
  const accountValid = accountNumber && accountNumber.length >= 4 && accountNumber.length <= 17;

  return {
    success: true,
    data: {
      accountNumber: accountNumber ? accountNumber.substring(0, 4) + '****' : null,
      routingNumber,
      accountHolderName,
      bankName,
      country,
      verified: routingValid && accountValid,
      routingValidation: routingCheckDetails,
      accountType: routingValid ? 'CHECKING' : 'UNKNOWN',
      accountAge: null, // Cannot determine without paid API
      ownershipMatch: null, // Cannot verify ownership without Plaid
      verifiedAt: new Date().toISOString(),
      source: 'aba-checksum'
    }
  };
}

// ============================================================================
// 8. FINANCIAL HISTORY — Deterministic Scoring Model (no API)
// ============================================================================

export async function checkFinancialHistoryDeterministic(params) {
  const { businessName, taxId, country, businessAge, businessCategory } = params;

  // Deterministic scoring based on inputs (same inputs = same output)
  let baseScore = 650; // Default credit score

  // Country factor
  const countryFactors = {
    US: 20, CA: 15, UK: 15, DE: 15, FR: 10, AU: 10,
    NG: -40, RO: -20, UA: -15, PK: -25, BD: -20
  };
  baseScore += countryFactors[country] || 0;

  // Business age factor (if provided, convert string to number)
  const ageYears = businessAge ? (typeof businessAge === 'string' ? parseFloat(businessAge) : businessAge / 365) : 1;
  if (ageYears > 5) baseScore += 30;
  else if (ageYears > 2) baseScore += 15;
  else if (ageYears < 0.5) baseScore -= 20;

  // Category factor
  const highRiskCategories = ['GAMBLING', 'ADULT_CONTENT', 'CRYPTO', 'PHARMACEUTICALS'];
  const mediumRiskCategories = ['ELECTRONICS', 'JEWELRY', 'TICKETS', 'GIFT_CARDS'];
  if (highRiskCategories.includes(businessCategory)) baseScore -= 30;
  else if (mediumRiskCategories.includes(businessCategory)) baseScore -= 10;

  // Hash-based deterministic jitter from taxId/businessName for variety
  const seed = hashInputs(businessName || '', taxId || '', country || '');
  const jitter = (seed % 60) - 30; // -30 to +29
  baseScore += jitter;

  // Clamp to 300-850
  const creditScore = Math.max(300, Math.min(850, baseScore));

  const bankruptcies = creditScore < 400 ? 1 : 0;
  const liens = creditScore < 500 ? Math.min(3, seed % 4) : 0;

  return {
    success: true,
    data: {
      businessName,
      taxId,
      creditScore,
      creditHistory: Math.max(365, Math.floor(ageYears * 365)),
      bankruptcies,
      liens,
      financialRisk: creditScore < 500 ? 'HIGH' : creditScore < 650 ? 'MEDIUM' : 'LOW',
      checkedAt: new Date().toISOString(),
      source: 'deterministic-model'
    }
  };
}

// ============================================================================
// 9. IDENTITY VERIFICATION — Document Format Validation (no API)
// ============================================================================

export async function verifyIdentityDeterministic(params) {
  const { documentType, documentNumber, country } = params;

  // Document number format validation by type and country
  const formatRules = {
    PASSPORT: {
      US: /^[A-Z]\d{8}$/,
      UK: /^\d{9}$/,
      DE: /^[CFGHJKLMNPRTVWXYZ0-9]{9}$/,
      DEFAULT: /^[A-Z0-9]{6,12}$/
    },
    DRIVERS_LICENSE: {
      US: /^[A-Z0-9]{5,20}$/,
      UK: /^[A-Z]{5}\d{6}[A-Z]{2}\d{2}$/,
      DEFAULT: /^[A-Z0-9]{5,20}$/
    },
    NATIONAL_ID: {
      DEFAULT: /^[A-Z0-9]{5,20}$/
    }
  };

  const typeRules = formatRules[documentType] || formatRules.NATIONAL_ID;
  const pattern = typeRules[country] || typeRules.DEFAULT;
  const normalizedDocNum = (documentNumber || '').toUpperCase().replace(/[\s-]/g, '');
  const formatValid = pattern.test(normalizedDocNum);

  // Deterministic confidence based on format validity
  const confidence = formatValid ? 0.75 : 0.3;

  return {
    success: true,
    data: {
      documentType,
      documentNumber: normalizedDocNum,
      country,
      verified: formatValid,
      verificationMethod: 'FORMAT_VALIDATION',
      confidence,
      formatCheck: {
        valid: formatValid,
        pattern: pattern.toString(),
        reason: formatValid ? 'Document number matches expected format' : 'Document number does not match expected format'
      },
      issues: formatValid ? [] : ['INVALID_FORMAT'],
      verifiedAt: new Date().toISOString(),
      source: 'format-validation'
    }
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function hashInputs(...strings) {
  let hash = 0;
  const combined = strings.join('|');
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
