# Tool Integration Status - Mock vs Real

## Current Status: ALL TOOLS ARE SIMULATED ⚠️

All verification tools in the onboarding agent are currently **mocked/simulated** for demo purposes. They do NOT make real API calls or connect to real services.

## Tool Status Breakdown

### ✅ Simulated Tools (Current Implementation)

| Tool | Status | Implementation | Real Service Equivalent |
|------|--------|----------------|-------------------------|
| `verify_identity` | 🟡 **SIMULATED** | Uses `Math.random()` (85% pass rate) | Onfido, Jumio, Veriff |
| `verify_email` | 🟡 **SIMULATED** | Hash-based deterministic results | Hunter.io, ZeroBounce, NeverBounce |
| `check_duplicates` | 🟡 **SIMULATED** | In-memory database check | Internal database query |
| `screen_watchlist` | 🟡 **SIMULATED** | `Math.random()` (5% match rate) | Dow Jones, World-Check, LexisNexis |
| `verify_business` | 🟡 **SIMULATED** | Hash-based business check | Dun & Bradstreet, OpenCorporates |
| `verify_bank_account` | 🟡 **SIMULATED** | `Math.random()` (90% pass rate) | Plaid, Yodlee, Finicity |
| `verify_address` | 🟡 **SIMULATED** | `Math.random()` (80% pass rate) | SmartyStreets, Loqate, Google Maps API |
| `check_fraud_databases` | 🟡 **SIMULATED** | In-memory Set lookups | Internal fraud database, Sift, Riskified |
| `analyze_business_category` | 🟡 **SIMULATED** | Hardcoded risk categories | Internal risk rules |
| `check_financial_history` | 🟡 **SIMULATED** | `Math.random()` credit scores | Experian, Equifax, TransUnion |
| `analyze_historical_patterns` | 🟡 **SIMULATED** | In-memory seller analysis | Internal analytics database |
| `check_ip_reputation` | 🟡 **SIMULATED** | Hash-based IP analysis | MaxMind, IPQualityScore, AbuseIPDB |
| `check_device_reputation` | 🟡 **SIMULATED** | Hash-based device check | ThreatMetrix, iovation, Sift |
| `check_consortium_data` | 🟡 **SIMULATED** | In-memory consortium data | Early Warning, Ethoca, Verifi |
| `request_fraud_investigation` | 🟡 **SIMULATED** | Internal agent call | Fraud Investigation Agent (also simulated) |

## Evidence from Code

### Example 1: Email Verification (Simulated)
```javascript
// backend/agents/tools/external-apis.js
export async function verifyEmail(email) {
  await delay(50 + Math.random() * 100); // Simulated latency
  
  const emailHash = hashString(email);
  const isDisposable = disposableDomains.some(d => domain.includes(d)) || emailHash % 17 === 0;
  // ... more simulated logic
}
```

### Example 2: Fraud Database (Simulated)
```javascript
// backend/agents/tools/fraud-databases.js
const KNOWN_FRAUD_PATTERNS = {
  emails: new Set(['fraudster123@tempmail.com', ...]), // Hardcoded
  devices: new Set(['DEV-FRAUD-001', ...]),
  ips: new Set(['192.168.100.1', ...])
};
```

### Example 3: Identity Verification (Simulated)
```javascript
// backend/agents/specialized/seller-onboarding-agent.js
this.registerTool('verify_identity', ..., async (params) => {
  const verification = {
    verified: Math.random() > 0.15, // 85% pass rate - SIMULATED
    confidence: 0.85 + Math.random() * 0.15,
    // ...
  };
});
```

## How to Enable Real Integrations

### Step 1: Create Real API Integration Layer

Create a new file: `backend/agents/tools/real-apis.js`

```javascript
/**
 * Real API Integrations
 * Replace simulated tools with actual API calls
 */

import axios from 'axios';

// Environment variables for API keys
const API_KEYS = {
  ONFIDO_API_KEY: process.env.ONFIDO_API_KEY,
  HUNTER_API_KEY: process.env.HUNTER_API_KEY,
  MAXMIND_LICENSE_KEY: process.env.MAXMIND_LICENSE_KEY,
  PLUID_API_KEY: process.env.PLUID_API_KEY,
  // ... more API keys
};

/**
 * Real Identity Verification - Onfido
 */
export async function verifyIdentityReal(params) {
  const { documentType, documentNumber, country } = params;
  
  try {
    const response = await axios.post('https://api.onfido.com/v3/checks', {
      applicant_id: params.applicantId,
      report_names: ['identity_enhanced'],
      document_ids: [params.documentId]
    }, {
      headers: {
        'Authorization': `Token token=${API_KEYS.ONFIDO_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    return {
      success: true,
      data: {
        verified: response.data.status === 'clear',
        confidence: response.data.reports[0]?.sub_result === 'clear' ? 0.95 : 0.5,
        reportId: response.data.id,
        verifiedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      data: { verified: false }
    };
  }
}

/**
 * Real Email Verification - Hunter.io
 */
export async function verifyEmailReal(email) {
  try {
    const response = await axios.get('https://api.hunter.io/v2/email-verifier', {
      params: {
        email,
        api_key: API_KEYS.HUNTER_API_KEY
      }
    });
    
    return {
      success: true,
      data: {
        email,
        isValid: response.data.data.result === 'deliverable',
        isDeliverable: response.data.data.result === 'deliverable',
        isDisposable: response.data.data.disposable === true,
        riskScore: response.data.data.result === 'deliverable' ? 10 : 50,
        verifiedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Real IP Reputation - MaxMind
 */
export async function checkIpReputationReal(ipAddress) {
  try {
    const response = await axios.get(`https://minfraud.maxmind.com/minfraud/v2.0/score`, {
      params: {
        ip_address: ipAddress
      },
      auth: {
        username: process.env.MAXMIND_ACCOUNT_ID,
        password: process.env.MAXMIND_LICENSE_KEY
      }
    });
    
    return {
      success: true,
      data: {
        ipAddress,
        riskScore: response.data.risk_score * 100,
        riskLevel: response.data.risk_score > 0.6 ? 'HIGH' : 
                   response.data.risk_score > 0.3 ? 'MEDIUM' : 'LOW',
        isVpn: response.data.risk?.vpn?.is_vpn || false,
        isProxy: response.data.risk?.proxy?.is_proxy || false,
        location: response.data.location,
        checkedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Real Bank Account Verification - Plaid
 */
export async function verifyBankAccountReal(params) {
  const { accountNumber, routingNumber, accountHolderName } = params;
  
  try {
    // Plaid Link Token creation (simplified)
    const response = await axios.post('https://production.plaid.com/processor/token/create', {
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      access_token: params.accessToken,
      account_id: params.accountId
    });
    
    return {
      success: true,
      data: {
        verified: response.data.status === 'verified',
        accountType: response.data.account.type,
        ownershipMatch: response.data.account.name === accountHolderName,
        verifiedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Real Business Verification - Dun & Bradstreet
 */
export async function verifyBusinessReal(params) {
  const { businessName, registrationNumber, country } = params;
  
  try {
    const response = await axios.get('https://api.dnb.com/v1/company', {
      params: {
        name: businessName,
        country: country,
        registrationNumber: registrationNumber
      },
      headers: {
        'Authorization': `Bearer ${process.env.DNB_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    return {
      success: true,
      data: {
        businessName,
        isRegistered: response.data.status === 'ACTIVE',
        registrationDate: response.data.incorporationDate,
        businessAge: response.data.yearsInBusiness,
        status: response.data.status,
        verifiedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Real Watchlist Screening - Dow Jones Risk & Compliance
 */
export async function screenWatchlistReal(params) {
  const { name, dateOfBirth, country, businessName } = params;
  
  try {
    const response = await axios.post('https://api.dowjones.com/api/search', {
      name,
      dateOfBirth,
      country,
      businessName
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DOWJONES_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    return {
      success: true,
      data: {
        sanctionsMatch: response.data.sanctions.length > 0,
        pepMatch: response.data.pep.length > 0,
        watchlistMatch: response.data.watchlist.length > 0,
        matches: response.data.matches,
        screenedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  verifyIdentityReal,
  verifyEmailReal,
  checkIpReputationReal,
  verifyBankAccountReal,
  verifyBusinessReal,
  screenWatchlistReal
};
```

### Step 2: Update Agent to Use Real APIs

Modify `backend/agents/specialized/seller-onboarding-agent.js`:

```javascript
import { 
  verifyEmailReal, 
  checkIpReputationReal, 
  verifyBusinessReal 
} from '../tools/real-apis.js';
import { 
  verifyEmail, 
  checkIpReputation, 
  checkBusinessRegistration 
} from '../tools/external-apis.js'; // Keep as fallback

// Use environment variable to switch between real and simulated
const USE_REAL_APIS = process.env.USE_REAL_APIS === 'true';

// In registerTools():
this.registerTool('verify_email', 'Verify email address', async (params) => {
  if (USE_REAL_APIS) {
    return await verifyEmailReal(params.email);
  } else {
    return await verifyEmail(params.email);
  }
});
```

### Step 3: Add Environment Variables

Create `.env` file:

```bash
# API Integration Toggle
USE_REAL_APIS=true

# Identity Verification
ONFIDO_API_KEY=your_onfido_key
JUMIO_API_KEY=your_jumio_key

# Email Verification
HUNTER_API_KEY=your_hunter_key
ZEROBOUNCE_API_KEY=your_zerobounce_key

# IP Reputation
MAXMIND_ACCOUNT_ID=your_maxmind_account
MAXMIND_LICENSE_KEY=your_maxmind_key
IPQUALITYSCORE_API_KEY=your_ipqs_key

# Bank Verification
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret

# Business Verification
DNB_API_KEY=your_dnb_key
OPENCORPORATES_API_KEY=your_opencorporates_key

# Watchlist Screening
DOWJONES_API_KEY=your_dowjones_key
WORLDCHECK_API_KEY=your_worldcheck_key

# Fraud Databases
SIFT_API_KEY=your_sift_key
RISKIFIED_API_KEY=your_riskified_key
```

### Step 4: Add Error Handling & Fallbacks

```javascript
async executeToolWithFallback(toolName, params) {
  try {
    // Try real API first
    if (USE_REAL_APIS) {
      return await this.executeRealTool(toolName, params);
    }
  } catch (error) {
    console.warn(`Real API failed for ${toolName}, using fallback:`, error.message);
    // Fallback to simulated
    return await this.executeSimulatedTool(toolName, params);
  }
}
```

## Real API Service Providers

### Identity Verification
- **Onfido**: https://onfido.com
- **Jumio**: https://www.jumio.com
- **Veriff**: https://www.veriff.com
- **Persona**: https://withpersona.com

### Email Verification
- **Hunter.io**: https://hunter.io
- **ZeroBounce**: https://www.zerobounce.net
- **NeverBounce**: https://neverbounce.com
- **EmailListVerify**: https://www.emaillistverify.com

### IP Reputation
- **MaxMind**: https://www.maxmind.com
- **IPQualityScore**: https://www.ipqualityscore.com
- **AbuseIPDB**: https://www.abuseipdb.com
- **IPStack**: https://ipstack.com

### Bank Account Verification
- **Plaid**: https://plaid.com
- **Yodlee**: https://yodlee.com
- **Finicity**: https://www.finicity.com
- **TrueLayer**: https://truelayer.com

### Business Verification
- **Dun & Bradstreet**: https://www.dnb.com
- **OpenCorporates**: https://opencorporates.com
- **Clearbit**: https://clearbit.com
- **FullContact**: https://www.fullcontact.com

### Watchlist Screening
- **Dow Jones Risk & Compliance**: https://www.dowjones.com
- **World-Check**: https://www.worldcheck.com
- **LexisNexis**: https://www.lexisnexis.com
- **Refinitiv**: https://www.refinitiv.com

### Fraud Databases
- **Sift**: https://sift.com
- **Riskified**: https://www.riskified.com
- **Kount**: https://kount.com
- **Forter**: https://www.forter.com

## Cost Considerations

Real API integrations typically charge per request:
- Identity Verification: $0.50 - $2.00 per check
- Email Verification: $0.001 - $0.01 per email
- IP Reputation: $0.0001 - $0.001 per IP
- Bank Verification: $0.10 - $0.50 per check
- Business Verification: $0.50 - $5.00 per check
- Watchlist Screening: $1.00 - $10.00 per check

**Estimated cost per onboarding evaluation**: $3-20 depending on tools used.

## Recommendation

1. **For Development/Demo**: Keep simulated tools (current state)
2. **For Production**: 
   - Start with critical tools (identity, watchlist, fraud databases)
   - Add others gradually
   - Implement caching to reduce API calls
   - Use fallbacks for reliability

## Next Steps

1. ✅ Document current simulated state (this file)
2. ⏳ Create real API integration layer
3. ⏳ Add environment variable toggle
4. ⏳ Implement error handling & fallbacks
5. ⏳ Add API rate limiting & caching
6. ⏳ Set up monitoring & alerting for API failures

