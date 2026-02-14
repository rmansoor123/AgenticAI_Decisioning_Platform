# New Business Services & Checkpoints — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 6 new business services (Account Setup, Item Setup, Pricing, Profile Updates, Shipments, Returns) with 42 checkpoint rules, rebalanced risk domain weights, seeded data, and frontend pages.

**Architecture:** Each service is a self-contained Express router following the existing ATO/Payout/Listing pattern (`db_ops`, `emitRiskEvent`, standardized JSON responses). Services mount in `server.js`, seed ~50 records each, and emit risk events feeding into the existing risk profile system. Frontend gets 6 lightweight pages (stats cards + records table) and a new "Business Services" nav group.

**Tech Stack:** Express.js, React, Tailwind CSS v4, lucide-react, faker.js, db_ops abstraction

---

## Task 1: Rebalance Domain Weights

**Files:**
- Modify: `backend/services/risk-profile/emit-event.js:6-9`
- Modify: `backend/services/risk-profile/index.js:19-26`

**Step 1: Update DOMAIN_WEIGHTS in emit-event.js**

Replace lines 6-9 in `backend/services/risk-profile/emit-event.js`:

```js
const DOMAIN_WEIGHTS = {
  onboarding: 0.12, ato: 0.15, payout: 0.12,
  listing: 0.07, shipping: 0.05, transaction: 0.07,
  account_setup: 0.08, item_setup: 0.06, pricing: 0.08,
  profile_updates: 0.08, shipments: 0.06, returns: 0.06
};
```

**Step 2: Update DOMAIN_WEIGHTS in risk-profile/index.js**

Replace lines 19-26 in `backend/services/risk-profile/index.js`:

```js
const DOMAIN_WEIGHTS = {
  onboarding:  0.12,
  ato:         0.15,
  payout:      0.12,
  listing:     0.07,
  shipping:    0.05,
  transaction: 0.07,
  account_setup: 0.08,
  item_setup:    0.06,
  pricing:       0.08,
  profile_updates: 0.08,
  shipments:     0.06,
  returns:       0.06
};
```

**Step 3: Verify weights sum to 1.0**

Run: `node -e "const w={onboarding:0.12,ato:0.15,payout:0.12,listing:0.07,shipping:0.05,transaction:0.07,account_setup:0.08,item_setup:0.06,pricing:0.08,profile_updates:0.08,shipments:0.06,returns:0.06}; console.log(Object.values(w).reduce((a,b)=>a+b,0))"`
Expected: `1` (or `0.9999999999999999`)

**Step 4: Commit**

```bash
git add backend/services/risk-profile/emit-event.js backend/services/risk-profile/index.js
git commit -m "feat: rebalance domain weights for 12-checkpoint system"
```

---

## Task 2: Add 42 New Checkpoint Rules to generators.js

**Files:**
- Modify: `backend/shared/synthetic-data/generators.js:437-498`

**Step 1: Add new checkpoint rule templates**

In `backend/shared/synthetic-data/generators.js`, add the 42 new rules to the `templates` array inside `generateCheckpointRules()` (after line 479, before the closing `];` on line 480). Append these entries:

```js
    // Account Setup (7 rules)
    { name: 'Incomplete Tax Configuration', checkpoint: 'account_setup', type: 'PATTERN', severity: 'MEDIUM', action: 'FLAG', tags: ['pattern', 'identity'], conditions: [{ field: 'accountSetup.taxConfigComplete', operator: 'EQ', value: false }], description: 'Store missing required tax configuration fields' },
    { name: 'Multiple Payment Methods Added Rapidly', checkpoint: 'account_setup', type: 'VELOCITY', severity: 'HIGH', action: 'REVIEW', tags: ['velocity', 'identity'], conditions: [{ field: 'accountSetup.paymentMethodsAdded1h', operator: 'GT', value: 3 }], description: 'Multiple payment methods added within one hour' },
    { name: 'High-Risk Store Category', checkpoint: 'account_setup', type: 'LIST_MATCH', severity: 'MEDIUM', action: 'FLAG', tags: ['pattern', 'identity'], conditions: [{ field: 'accountSetup.storeCategory', operator: 'IN', value: ['GAMBLING', 'CRYPTO', 'ADULT', 'PHARMACY'] }], description: 'Store category is classified as high-risk' },
    { name: 'Mismatched Business Registration', checkpoint: 'account_setup', type: 'PATTERN', severity: 'HIGH', action: 'REVIEW', tags: ['identity', 'pattern'], conditions: [{ field: 'accountSetup.registrationMismatchScore', operator: 'GT', value: 0.7 }], description: 'Business registration details do not match provided information' },
    { name: 'Unusual Timezone/Currency Combination', checkpoint: 'account_setup', type: 'PATTERN', severity: 'MEDIUM', action: 'FLAG', tags: ['geo', 'pattern'], conditions: [{ field: 'accountSetup.timezoneCurrencyAnomaly', operator: 'EQ', value: true }], description: 'Store timezone and currency combination is unusual' },
    { name: 'Multiple Accounts Same Payment Method', checkpoint: 'account_setup', type: 'COMPOSITE', severity: 'CRITICAL', action: 'BLOCK', tags: ['network', 'identity'], conditions: [{ field: 'accountSetup.sharedPaymentMethodCount', operator: 'GT', value: 1 }], description: 'Payment method is linked to multiple seller accounts' },
    { name: 'Store Name Contains Brand Infringement', checkpoint: 'account_setup', type: 'LIST_MATCH', severity: 'HIGH', action: 'REVIEW', tags: ['pattern', 'identity'], conditions: [{ field: 'accountSetup.brandInfringementScore', operator: 'GT', value: 0.8 }], description: 'Store name may contain trademarked brand names' },

    // Item Setup (7 rules)
    { name: 'Excessive Variant Creation', checkpoint: 'item_setup', type: 'VELOCITY', severity: 'HIGH', action: 'REVIEW', tags: ['velocity', 'behavioral'], conditions: [{ field: 'itemSetup.variantsCreated1h', operator: 'GT', value: 50 }], description: 'Unusually high number of product variants created in one hour' },
    { name: 'Inventory Count Mismatch', checkpoint: 'item_setup', type: 'THRESHOLD', severity: 'MEDIUM', action: 'FLAG', tags: ['threshold', 'pattern'], conditions: [{ field: 'itemSetup.inventoryMismatchPct', operator: 'GT', value: 30 }], description: 'Declared inventory count differs significantly from actual' },
    { name: 'Restricted Category Product', checkpoint: 'item_setup', type: 'LIST_MATCH', severity: 'CRITICAL', action: 'BLOCK', tags: ['pattern', 'identity'], conditions: [{ field: 'itemSetup.isRestrictedCategory', operator: 'EQ', value: true }], description: 'Product belongs to a restricted or prohibited category' },
    { name: 'Bulk SKU Import From New Account', checkpoint: 'item_setup', type: 'COMPOSITE', severity: 'HIGH', action: 'REVIEW', tags: ['velocity', 'behavioral'], conditions: [{ field: 'seller.accountAgeDays', operator: 'LT', value: 7 }, { field: 'itemSetup.skuImportCount', operator: 'GT', value: 100 }], description: 'New account importing large number of SKUs' },
    { name: 'Missing Product Compliance Data', checkpoint: 'item_setup', type: 'PATTERN', severity: 'MEDIUM', action: 'FLAG', tags: ['pattern', 'identity'], conditions: [{ field: 'itemSetup.complianceDataComplete', operator: 'EQ', value: false }], description: 'Product is missing required compliance or safety data' },
    { name: 'Duplicate Product Across Sellers', checkpoint: 'item_setup', type: 'ML_SCORE', severity: 'HIGH', action: 'REVIEW', tags: ['ml-score', 'network'], conditions: [{ field: 'ml.productDuplicateScore', operator: 'GT', value: 0.85 }], description: 'Product appears to be a duplicate listed by another seller' },
    { name: 'Suspicious Weight/Dimension Ratio', checkpoint: 'item_setup', type: 'THRESHOLD', severity: 'MEDIUM', action: 'FLAG', tags: ['threshold', 'pattern'], conditions: [{ field: 'itemSetup.weightDimensionAnomaly', operator: 'GT', value: 0.7 }], description: 'Product weight and dimensions ratio is physically implausible' },

    // Pricing (7 rules)
    { name: 'Price Below Cost Threshold', checkpoint: 'pricing', type: 'THRESHOLD', severity: 'HIGH', action: 'REVIEW', tags: ['amount', 'threshold'], conditions: [{ field: 'pricing.priceBelowCostPct', operator: 'GT', value: 20 }], description: 'Product price is significantly below estimated cost' },
    { name: 'Rapid Price Fluctuation', checkpoint: 'pricing', type: 'VELOCITY', severity: 'MEDIUM', action: 'FLAG', tags: ['velocity', 'amount'], conditions: [{ field: 'pricing.priceChanges24h', operator: 'GT', value: 5 }], description: 'Price changed more than 5 times in 24 hours' },
    { name: 'Predatory Pricing Pattern', checkpoint: 'pricing', type: 'ML_SCORE', severity: 'HIGH', action: 'REVIEW', tags: ['ml-score', 'amount'], conditions: [{ field: 'ml.predatoryPricingScore', operator: 'GT', value: 0.75 }], description: 'ML model detects predatory pricing behavior' },
    { name: 'Coupon/Discount Stacking Abuse', checkpoint: 'pricing', type: 'COMPOSITE', severity: 'CRITICAL', action: 'BLOCK', tags: ['amount', 'behavioral'], conditions: [{ field: 'pricing.activeDiscounts', operator: 'GT', value: 3 }, { field: 'pricing.effectiveDiscountPct', operator: 'GT', value: 80 }], description: 'Multiple discounts stacked to reduce price below acceptable level' },
    { name: 'Price Manipulation Before Sale', checkpoint: 'pricing', type: 'PATTERN', severity: 'HIGH', action: 'REVIEW', tags: ['pattern', 'amount'], conditions: [{ field: 'pricing.priceInflatedBeforeSale', operator: 'EQ', value: true }], description: 'Price was inflated shortly before a sale discount was applied' },
    { name: 'Dynamic Pricing Anomaly', checkpoint: 'pricing', type: 'ML_SCORE', severity: 'MEDIUM', action: 'FLAG', tags: ['ml-score', 'amount'], conditions: [{ field: 'ml.dynamicPricingAnomaly', operator: 'GT', value: 0.6 }], description: 'Dynamic pricing algorithm producing unusual price patterns' },
    { name: 'Cross-Border Price Arbitrage', checkpoint: 'pricing', type: 'COMPOSITE', severity: 'HIGH', action: 'REVIEW', tags: ['geo', 'amount'], conditions: [{ field: 'pricing.crossBorderPriceDiffPct', operator: 'GT', value: 40 }], description: 'Significant price differences across regional markets suggest arbitrage' },

    // Profile Updates (7 rules)
    { name: 'Bank Account Change After Dispute', checkpoint: 'profile_updates', type: 'COMPOSITE', severity: 'CRITICAL', action: 'BLOCK', tags: ['identity', 'behavioral'], conditions: [{ field: 'profileUpdate.type', operator: 'EQ', value: 'BANK_CHANGE' }, { field: 'profileUpdate.hasOpenDispute', operator: 'EQ', value: true }], description: 'Bank account changed while a dispute is open' },
    { name: 'Multiple Address Changes in 24h', checkpoint: 'profile_updates', type: 'VELOCITY', severity: 'HIGH', action: 'REVIEW', tags: ['velocity', 'identity'], conditions: [{ field: 'profileUpdate.addressChanges24h', operator: 'GT', value: 2 }], description: 'Multiple address changes within 24 hours' },
    { name: 'Contact Info Changed From New Device', checkpoint: 'profile_updates', type: 'COMPOSITE', severity: 'HIGH', action: 'REVIEW', tags: ['device', 'identity'], conditions: [{ field: 'device.isNew', operator: 'EQ', value: true }, { field: 'profileUpdate.type', operator: 'IN', value: ['EMAIL_CHANGE', 'PHONE_CHANGE'] }], description: 'Contact information changed from an unrecognized device' },
    { name: 'Business Name Change Pattern', checkpoint: 'profile_updates', type: 'PATTERN', severity: 'MEDIUM', action: 'FLAG', tags: ['pattern', 'identity'], conditions: [{ field: 'profileUpdate.nameChanges90d', operator: 'GT', value: 2 }], description: 'Business name changed multiple times within 90 days' },
    { name: 'Email Domain Downgrade', checkpoint: 'profile_updates', type: 'LIST_MATCH', severity: 'MEDIUM', action: 'FLAG', tags: ['identity', 'pattern'], conditions: [{ field: 'profileUpdate.emailDomainDowngrade', operator: 'EQ', value: true }], description: 'Email changed from business domain to free/disposable provider' },
    { name: 'Phone Number Velocity', checkpoint: 'profile_updates', type: 'VELOCITY', severity: 'HIGH', action: 'REVIEW', tags: ['velocity', 'identity'], conditions: [{ field: 'profileUpdate.phoneChanges30d', operator: 'GT', value: 3 }], description: 'Phone number changed multiple times within 30 days' },
    { name: 'Identity Document Re-upload', checkpoint: 'profile_updates', type: 'PATTERN', severity: 'MEDIUM', action: 'REVIEW', tags: ['identity', 'pattern'], conditions: [{ field: 'profileUpdate.idDocReuploadCount', operator: 'GT', value: 2 }], description: 'Identity documents re-uploaded multiple times' },

    // Shipments (7 rules)
    { name: 'Label Created Without Order', checkpoint: 'shipments', type: 'COMPOSITE', severity: 'CRITICAL', action: 'BLOCK', tags: ['pattern', 'behavioral'], conditions: [{ field: 'shipment.hasMatchingOrder', operator: 'EQ', value: false }], description: 'Shipping label created without a corresponding order' },
    { name: 'Carrier Mismatch Pattern', checkpoint: 'shipments', type: 'PATTERN', severity: 'MEDIUM', action: 'FLAG', tags: ['pattern', 'behavioral'], conditions: [{ field: 'shipment.carrierMismatch', operator: 'EQ', value: true }], description: 'Carrier used does not match seller typical carrier pattern' },
    { name: 'Shipment Weight Discrepancy', checkpoint: 'shipments', type: 'THRESHOLD', severity: 'HIGH', action: 'REVIEW', tags: ['threshold', 'pattern'], conditions: [{ field: 'shipment.weightDiscrepancyPct', operator: 'GT', value: 50 }], description: 'Declared shipment weight differs significantly from product weight' },
    { name: 'Drop-Ship Detection', checkpoint: 'shipments', type: 'ML_SCORE', severity: 'MEDIUM', action: 'FLAG', tags: ['ml-score', 'behavioral'], conditions: [{ field: 'ml.dropShipScore', operator: 'GT', value: 0.7 }], description: 'Shipment pattern suggests unauthorized drop-shipping' },
    { name: 'Bulk Label Generation', checkpoint: 'shipments', type: 'VELOCITY', severity: 'HIGH', action: 'REVIEW', tags: ['velocity', 'behavioral'], conditions: [{ field: 'shipment.labelsCreated1h', operator: 'GT', value: 50 }], description: 'Unusually high number of shipping labels created in one hour' },
    { name: 'High-Value Shipment No Insurance', checkpoint: 'shipments', type: 'THRESHOLD', severity: 'MEDIUM', action: 'FLAG', tags: ['amount', 'threshold'], conditions: [{ field: 'shipment.value', operator: 'GT', value: 500 }, { field: 'shipment.insured', operator: 'EQ', value: false }], description: 'High-value shipment sent without insurance coverage' },
    { name: 'Cross-Border Restricted Destination', checkpoint: 'shipments', type: 'LIST_MATCH', severity: 'HIGH', action: 'REVIEW', tags: ['geo', 'pattern'], conditions: [{ field: 'shipment.destinationCountry', operator: 'IN', value: ['KP', 'IR', 'SY', 'CU'] }], description: 'Shipment destination is a restricted or sanctioned country' },

    // Returns (7 rules)
    { name: 'Return Rate Above Threshold', checkpoint: 'returns', type: 'THRESHOLD', severity: 'HIGH', action: 'REVIEW', tags: ['threshold', 'behavioral'], conditions: [{ field: 'returns.returnRate30d', operator: 'GT', value: 0.25 }], description: 'Seller return rate exceeds 25% over 30 days' },
    { name: 'Serial Returner Pattern', checkpoint: 'returns', type: 'VELOCITY', severity: 'CRITICAL', action: 'BLOCK', tags: ['velocity', 'behavioral'], conditions: [{ field: 'returns.returnCount7d', operator: 'GT', value: 10 }], description: 'Buyer has returned more than 10 items in 7 days' },
    { name: 'Return After Funds Withdrawal', checkpoint: 'returns', type: 'COMPOSITE', severity: 'CRITICAL', action: 'BLOCK', tags: ['amount', 'behavioral'], conditions: [{ field: 'returns.sellerWithdrewFunds', operator: 'EQ', value: true }, { field: 'returns.daysSincePayout', operator: 'LT', value: 3 }], description: 'Return requested shortly after seller withdrew funds' },
    { name: 'Empty Box Return', checkpoint: 'returns', type: 'PATTERN', severity: 'HIGH', action: 'REVIEW', tags: ['pattern', 'behavioral'], conditions: [{ field: 'returns.weightDiscrepancy', operator: 'GT', value: 0.8 }], description: 'Return package weight suggests empty or wrong item' },
    { name: 'Return Address Mismatch', checkpoint: 'returns', type: 'PATTERN', severity: 'MEDIUM', action: 'FLAG', tags: ['geo', 'identity'], conditions: [{ field: 'returns.addressMatchScore', operator: 'LT', value: 0.5 }], description: 'Return shipping address does not match buyer profile' },
    { name: 'Wardrobing Detection', checkpoint: 'returns', type: 'ML_SCORE', severity: 'HIGH', action: 'REVIEW', tags: ['ml-score', 'behavioral'], conditions: [{ field: 'ml.wardrobingScore', operator: 'GT', value: 0.7 }], description: 'ML model detects use-and-return wardrobing pattern' },
    { name: 'Refund Amount Exceeds Purchase', checkpoint: 'returns', type: 'THRESHOLD', severity: 'CRITICAL', action: 'BLOCK', tags: ['amount', 'threshold'], conditions: [{ field: 'returns.refundExceedsPurchase', operator: 'EQ', value: true }], description: 'Refund amount exceeds original purchase price' },
```

**Step 2: Update the rule ID generation to use sequential numbering**

The existing `templates.map` at line 482 already handles this with `RULE-CP-XXX`. No change needed — the new rules (indices 30-71) will get IDs `RULE-CP-031` through `RULE-CP-072`.

**Step 3: Update the `generateRule()` checkpoint list (line 402)**

Replace:
```js
checkpoint: faker.helpers.arrayElement(['onboarding', 'ato', 'payout', 'listing', 'shipping', 'transaction']),
```
With:
```js
checkpoint: faker.helpers.arrayElement(['onboarding', 'ato', 'payout', 'listing', 'shipping', 'transaction', 'account_setup', 'item_setup', 'pricing', 'profile_updates', 'shipments', 'returns']),
```

**Step 4: Commit**

```bash
git add backend/shared/synthetic-data/generators.js
git commit -m "feat: add 42 checkpoint rules for 6 new business services"
```

---

## Task 3: Add 6 Generator Functions to generators.js

**Files:**
- Modify: `backend/shared/synthetic-data/generators.js`

**Step 1: Add generator functions**

Add these functions before the `export default` block (before line 654):

```js
// ============================================================================
// ACCOUNT SETUP GENERATORS
// ============================================================================

const STORE_CATEGORIES = ['ELECTRONICS', 'FASHION', 'HOME_GARDEN', 'SPORTS', 'HEALTH_BEAUTY', 'TOYS', 'FOOD_GROCERY', 'JEWELRY', 'AUTOMOTIVE', 'BOOKS'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];
const TIMEZONES = ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'];

export function generateAccountSetup(sellerId = null) {
  const status = faker.helpers.weightedArrayElement([
    { weight: 60, value: 'COMPLETE' },
    { weight: 20, value: 'PENDING' },
    { weight: 10, value: 'INCOMPLETE' },
    { weight: 5, value: 'SUSPENDED' },
    { weight: 5, value: 'UNDER_REVIEW' }
  ]);

  return {
    setupId: `ASET-${uuidv4().substring(0, 10).toUpperCase()}`,
    sellerId: sellerId || `SLR-${faker.string.alphanumeric(8).toUpperCase()}`,
    storeName: faker.company.name() + ' Store',
    storeCategory: faker.helpers.arrayElement(STORE_CATEGORIES),
    currency: faker.helpers.arrayElement(CURRENCIES),
    timezone: faker.helpers.arrayElement(TIMEZONES),
    taxConfigComplete: faker.datatype.boolean({ probability: 0.8 }),
    paymentMethods: faker.number.int({ min: 1, max: 4 }),
    businessRegistration: {
      type: faker.helpers.arrayElement(['LLC', 'SOLE_PROPRIETOR', 'CORPORATION', 'PARTNERSHIP']),
      verified: faker.datatype.boolean({ probability: 0.85 }),
      country: faker.helpers.arrayElement(COUNTRIES)
    },
    status,
    riskScore: faker.number.int({ min: 0, max: 100 }),
    riskFlags: {
      brandInfringement: faker.datatype.boolean({ probability: 0.03 }),
      sharedPaymentMethod: faker.datatype.boolean({ probability: 0.02 }),
      timezoneCurrencyAnomaly: faker.datatype.boolean({ probability: 0.05 })
    },
    createdAt: faker.date.past({ years: 1 }).toISOString(),
    updatedAt: faker.date.recent({ days: 30 }).toISOString()
  };
}

// ============================================================================
// ITEM SETUP GENERATORS
// ============================================================================

export function generateItemSetup(sellerId = null) {
  const status = faker.helpers.weightedArrayElement([
    { weight: 65, value: 'ACTIVE' },
    { weight: 15, value: 'DRAFT' },
    { weight: 10, value: 'PENDING_REVIEW' },
    { weight: 5, value: 'SUSPENDED' },
    { weight: 5, value: 'ARCHIVED' }
  ]);

  return {
    itemId: `ITEM-${uuidv4().substring(0, 10).toUpperCase()}`,
    sellerId: sellerId || `SLR-${faker.string.alphanumeric(8).toUpperCase()}`,
    productName: faker.commerce.productName(),
    sku: faker.string.alphanumeric(12).toUpperCase(),
    category: faker.helpers.arrayElement(BUSINESS_CATEGORIES),
    variants: faker.number.int({ min: 1, max: 20 }),
    inventoryCount: faker.number.int({ min: 0, max: 500 }),
    weight: faker.number.float({ min: 0.1, max: 50, fractionDigits: 2 }),
    dimensions: {
      length: faker.number.float({ min: 1, max: 100, fractionDigits: 1 }),
      width: faker.number.float({ min: 1, max: 80, fractionDigits: 1 }),
      height: faker.number.float({ min: 1, max: 60, fractionDigits: 1 })
    },
    complianceData: faker.datatype.boolean({ probability: 0.85 }),
    status,
    riskScore: faker.number.int({ min: 0, max: 100 }),
    riskFlags: {
      restrictedCategory: faker.datatype.boolean({ probability: 0.02 }),
      weightAnomaly: faker.datatype.boolean({ probability: 0.04 }),
      duplicateProduct: faker.datatype.boolean({ probability: 0.03 })
    },
    createdAt: faker.date.past({ years: 1 }).toISOString(),
    updatedAt: faker.date.recent({ days: 30 }).toISOString()
  };
}

// ============================================================================
// PRICING GENERATORS
// ============================================================================

export function generatePricingRecord(sellerId = null) {
  const currentPrice = faker.number.float({ min: 5, max: 2000, fractionDigits: 2 });
  const previousPrice = currentPrice * (1 + (faker.number.float({ min: -0.3, max: 0.5, fractionDigits: 2 })));
  const status = faker.helpers.weightedArrayElement([
    { weight: 70, value: 'ACTIVE' },
    { weight: 15, value: 'PENDING_REVIEW' },
    { weight: 10, value: 'ADJUSTED' },
    { weight: 5, value: 'BLOCKED' }
  ]);

  return {
    pricingId: `PRC-${uuidv4().substring(0, 10).toUpperCase()}`,
    sellerId: sellerId || `SLR-${faker.string.alphanumeric(8).toUpperCase()}`,
    productName: faker.commerce.productName(),
    currentPrice,
    previousPrice: Math.round(previousPrice * 100) / 100,
    currency: 'USD',
    changeType: faker.helpers.arrayElement(['MANUAL', 'DYNAMIC', 'PROMOTION', 'BULK_UPDATE']),
    priceChanges24h: faker.number.int({ min: 0, max: 8 }),
    activeDiscounts: faker.number.int({ min: 0, max: 3 }),
    effectiveDiscountPct: faker.number.float({ min: 0, max: 50, fractionDigits: 1 }),
    status,
    riskScore: faker.number.int({ min: 0, max: 100 }),
    riskFlags: {
      belowCost: faker.datatype.boolean({ probability: 0.04 }),
      priceManipulation: faker.datatype.boolean({ probability: 0.03 }),
      arbitrage: faker.datatype.boolean({ probability: 0.02 })
    },
    createdAt: faker.date.past({ years: 0.5 }).toISOString(),
    updatedAt: faker.date.recent({ days: 7 }).toISOString()
  };
}

// ============================================================================
// PROFILE UPDATES GENERATORS
// ============================================================================

const PROFILE_UPDATE_TYPES = ['ADDRESS_CHANGE', 'BANK_CHANGE', 'EMAIL_CHANGE', 'PHONE_CHANGE', 'NAME_CHANGE', 'ID_DOCUMENT_UPLOAD', 'TAX_INFO_UPDATE'];

export function generateProfileUpdate(sellerId = null) {
  const updateType = faker.helpers.arrayElement(PROFILE_UPDATE_TYPES);
  const status = faker.helpers.weightedArrayElement([
    { weight: 60, value: 'APPROVED' },
    { weight: 20, value: 'PENDING' },
    { weight: 10, value: 'UNDER_REVIEW' },
    { weight: 5, value: 'REJECTED' },
    { weight: 5, value: 'BLOCKED' }
  ]);

  return {
    updateId: `PUPD-${uuidv4().substring(0, 10).toUpperCase()}`,
    sellerId: sellerId || `SLR-${faker.string.alphanumeric(8).toUpperCase()}`,
    updateType,
    fieldChanged: updateType.toLowerCase().replace('_change', '').replace('_upload', '').replace('_update', ''),
    previousValue: '[REDACTED]',
    newDevice: faker.datatype.boolean({ probability: 0.2 }),
    deviceFingerprint: faker.string.alphanumeric(32),
    ipAddress: faker.internet.ip(),
    status,
    riskScore: faker.number.int({ min: 0, max: 100 }),
    riskFlags: {
      openDispute: faker.datatype.boolean({ probability: 0.05 }),
      newDevice: faker.datatype.boolean({ probability: 0.15 }),
      emailDomainDowngrade: faker.datatype.boolean({ probability: 0.03 })
    },
    createdAt: faker.date.past({ years: 0.5 }).toISOString(),
    updatedAt: faker.date.recent({ days: 14 }).toISOString()
  };
}

// ============================================================================
// SHIPMENTS (OUTBOUND) GENERATORS
// ============================================================================

const CARRIERS = ['USPS', 'UPS', 'FEDEX', 'DHL', 'AMAZON_LOGISTICS'];

export function generateOutboundShipment(sellerId = null) {
  const status = faker.helpers.weightedArrayElement([
    { weight: 25, value: 'LABEL_CREATED' },
    { weight: 25, value: 'PICKED_UP' },
    { weight: 20, value: 'IN_TRANSIT' },
    { weight: 20, value: 'DELIVERED' },
    { weight: 5, value: 'FAILED' },
    { weight: 5, value: 'RETURNED_TO_SENDER' }
  ]);

  const declaredValue = faker.number.float({ min: 10, max: 2000, fractionDigits: 2 });

  return {
    shipmentId: `SHPM-${uuidv4().substring(0, 10).toUpperCase()}`,
    sellerId: sellerId || `SLR-${faker.string.alphanumeric(8).toUpperCase()}`,
    orderId: `ORD-${faker.string.alphanumeric(10).toUpperCase()}`,
    carrier: faker.helpers.arrayElement(CARRIERS),
    trackingNumber: faker.string.alphanumeric(22).toUpperCase(),
    declaredWeight: faker.number.float({ min: 0.5, max: 30, fractionDigits: 2 }),
    actualWeight: faker.number.float({ min: 0.5, max: 30, fractionDigits: 2 }),
    declaredValue,
    insured: declaredValue > 200 ? faker.datatype.boolean({ probability: 0.7 }) : faker.datatype.boolean({ probability: 0.2 }),
    origin: {
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      country: 'US',
      zip: faker.location.zipCode()
    },
    destination: {
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      country: faker.helpers.weightedArrayElement([
        { weight: 80, value: 'US' },
        { weight: 10, value: 'CA' },
        { weight: 5, value: 'MX' },
        { weight: 5, value: 'GB' }
      ]),
      zip: faker.location.zipCode()
    },
    status,
    riskScore: faker.number.int({ min: 0, max: 100 }),
    riskFlags: {
      noMatchingOrder: faker.datatype.boolean({ probability: 0.02 }),
      weightDiscrepancy: faker.datatype.boolean({ probability: 0.05 }),
      carrierMismatch: faker.datatype.boolean({ probability: 0.04 }),
      dropShipSuspected: faker.datatype.boolean({ probability: 0.03 })
    },
    createdAt: faker.date.recent({ days: 14 }).toISOString(),
    updatedAt: faker.date.recent({ days: 3 }).toISOString()
  };
}

// ============================================================================
// RETURNS GENERATORS
// ============================================================================

const RETURN_REASONS = ['DEFECTIVE', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'CHANGED_MIND', 'ARRIVED_LATE', 'BETTER_PRICE_FOUND', 'ACCIDENTAL_ORDER'];

export function generateReturn(sellerId = null) {
  const status = faker.helpers.weightedArrayElement([
    { weight: 30, value: 'REQUESTED' },
    { weight: 25, value: 'APPROVED' },
    { weight: 20, value: 'RECEIVED' },
    { weight: 15, value: 'REFUNDED' },
    { weight: 5, value: 'REJECTED' },
    { weight: 5, value: 'UNDER_REVIEW' }
  ]);

  const purchaseAmount = faker.number.float({ min: 10, max: 1000, fractionDigits: 2 });
  const refundAmount = purchaseAmount * faker.number.float({ min: 0.8, max: 1.05, fractionDigits: 2 });

  return {
    returnId: `RET-${uuidv4().substring(0, 10).toUpperCase()}`,
    sellerId: sellerId || `SLR-${faker.string.alphanumeric(8).toUpperCase()}`,
    orderId: `ORD-${faker.string.alphanumeric(10).toUpperCase()}`,
    buyerId: `BYR-${faker.string.alphanumeric(8).toUpperCase()}`,
    reason: faker.helpers.arrayElement(RETURN_REASONS),
    purchaseAmount,
    refundAmount: Math.round(refundAmount * 100) / 100,
    returnShippingPaid: faker.helpers.arrayElement(['BUYER', 'SELLER', 'PLATFORM']),
    status,
    riskScore: faker.number.int({ min: 0, max: 100 }),
    riskFlags: {
      serialReturner: faker.datatype.boolean({ probability: 0.04 }),
      emptyBox: faker.datatype.boolean({ probability: 0.02 }),
      refundExceedsPurchase: refundAmount > purchaseAmount,
      wardrobing: faker.datatype.boolean({ probability: 0.03 }),
      fundsWithdrawn: faker.datatype.boolean({ probability: 0.05 })
    },
    createdAt: faker.date.recent({ days: 30 }).toISOString(),
    updatedAt: faker.date.recent({ days: 7 }).toISOString()
  };
}
```

**Step 2: Update the default export**

Replace the `export default` block:

```js
export default {
  generateSeller,
  generateTransaction,
  generateListing,
  generatePayout,
  generateATOEvent,
  generateShipment,
  generateMLModel,
  generateRule,
  generateCheckpointRules,
  generateExperiment,
  generateDataset,
  generateMetricsSnapshot,
  generateAccountSetup,
  generateItemSetup,
  generatePricingRecord,
  generateProfileUpdate,
  generateOutboundShipment,
  generateReturn
};
```

**Step 3: Commit**

```bash
git add backend/shared/synthetic-data/generators.js
git commit -m "feat: add 6 generator functions for new business services"
```

---

## Task 4: Create Account Setup Backend Service

**Files:**
- Create: `backend/services/business/account-setup/index.js`

**Step 1: Create directory and service file**

```bash
mkdir -p /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/services/business/account-setup
```

**Step 2: Write the service**

Create `backend/services/business/account-setup/index.js`:

```js
import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';

const router = express.Router();

// GET / — List account setups with filters/pagination
router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status } = req.query;
    let records = db_ops.getAll('account_setups', parseInt(limit), parseInt(offset)).map(r => r.data);
    if (sellerId) records = records.filter(r => r.sellerId === sellerId);
    if (status) records = records.filter(r => r.status === status);
    res.json({ success: true, data: records, pagination: { limit: parseInt(limit), offset: parseInt(offset), total: db_ops.count('account_setups') } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats — Domain statistics
router.get('/stats', (req, res) => {
  try {
    const all = db_ops.getAll('account_setups', 10000, 0).map(r => r.data);
    const byStatus = {};
    const byCategory = {};
    let flagged = 0;
    all.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byCategory[r.storeCategory] = (byCategory[r.storeCategory] || 0) + 1;
      if (r.riskFlags && Object.values(r.riskFlags).some(v => v === true)) flagged++;
    });
    res.json({ success: true, data: { total: all.length, byStatus, byCategory, flagged } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id — Get by ID
router.get('/:id', (req, res) => {
  try {
    const record = db_ops.getById('account_setups', 'setup_id', req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Account setup not found' });
    res.json({ success: true, data: record.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / — Create new record (emits risk event)
router.post('/', (req, res) => {
  try {
    const data = req.body;
    if (!data.sellerId) return res.status(400).json({ success: false, error: 'sellerId is required' });

    const setupId = `ASET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();
    const record = { ...data, setupId, status: data.status || 'PENDING', createdAt: now, updatedAt: now };
    db_ops.insert('account_setups', 'setup_id', setupId, record);

    // Assess risk and emit event
    let riskScore = 0;
    if (data.riskFlags?.brandInfringement) riskScore += 30;
    if (data.riskFlags?.sharedPaymentMethod) riskScore += 40;
    if (data.riskFlags?.timezoneCurrencyAnomaly) riskScore += 15;
    if (!data.taxConfigComplete) riskScore += 10;

    if (riskScore > 0) {
      emitRiskEvent({ sellerId: data.sellerId, domain: 'account_setup', eventType: 'ACCOUNT_SETUP_RISK', riskScore, metadata: { setupId, flags: data.riskFlags } });
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /:id/status — Update status
router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });
    const record = db_ops.getById('account_setups', 'setup_id', req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Account setup not found' });
    const updated = { ...record.data, status, updatedAt: new Date().toISOString() };
    db_ops.update('account_setups', 'setup_id', req.params.id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

**Step 3: Commit**

```bash
git add backend/services/business/account-setup/index.js
git commit -m "feat: add account-setup backend service"
```

---

## Task 5: Create Item Setup Backend Service

**Files:**
- Create: `backend/services/business/item-setup/index.js`

**Step 1: Create directory and service file**

```bash
mkdir -p /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/services/business/item-setup
```

**Step 2: Write the service**

Create `backend/services/business/item-setup/index.js` — same pattern as account-setup but for product catalog:

```js
import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status } = req.query;
    let records = db_ops.getAll('item_setups', parseInt(limit), parseInt(offset)).map(r => r.data);
    if (sellerId) records = records.filter(r => r.sellerId === sellerId);
    if (status) records = records.filter(r => r.status === status);
    res.json({ success: true, data: records, pagination: { limit: parseInt(limit), offset: parseInt(offset), total: db_ops.count('item_setups') } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const all = db_ops.getAll('item_setups', 10000, 0).map(r => r.data);
    const byStatus = {};
    const byCategory = {};
    let flagged = 0;
    all.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      if (r.riskFlags && Object.values(r.riskFlags).some(v => v === true)) flagged++;
    });
    res.json({ success: true, data: { total: all.length, byStatus, byCategory, flagged, totalVariants: all.reduce((s, r) => s + (r.variants || 0), 0) } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const record = db_ops.getById('item_setups', 'item_id', req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Item setup not found' });
    res.json({ success: true, data: record.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const data = req.body;
    if (!data.sellerId) return res.status(400).json({ success: false, error: 'sellerId is required' });

    const itemId = `ITEM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();
    const record = { ...data, itemId, status: data.status || 'DRAFT', createdAt: now, updatedAt: now };
    db_ops.insert('item_setups', 'item_id', itemId, record);

    let riskScore = 0;
    if (data.riskFlags?.restrictedCategory) riskScore += 50;
    if (data.riskFlags?.weightAnomaly) riskScore += 15;
    if (data.riskFlags?.duplicateProduct) riskScore += 25;
    if (!data.complianceData) riskScore += 10;

    if (riskScore > 0) {
      emitRiskEvent({ sellerId: data.sellerId, domain: 'item_setup', eventType: 'ITEM_SETUP_RISK', riskScore, metadata: { itemId, flags: data.riskFlags } });
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });
    const record = db_ops.getById('item_setups', 'item_id', req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Item setup not found' });
    const updated = { ...record.data, status, updatedAt: new Date().toISOString() };
    db_ops.update('item_setups', 'item_id', req.params.id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

**Step 3: Commit**

```bash
git add backend/services/business/item-setup/index.js
git commit -m "feat: add item-setup backend service"
```

---

## Task 6: Create Pricing Backend Service

**Files:**
- Create: `backend/services/business/pricing/index.js`

**Step 1: Create directory and service file**

```bash
mkdir -p /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/services/business/pricing
```

**Step 2: Write the service**

Create `backend/services/business/pricing/index.js`:

```js
import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status } = req.query;
    let records = db_ops.getAll('pricing_records', parseInt(limit), parseInt(offset)).map(r => r.data);
    if (sellerId) records = records.filter(r => r.sellerId === sellerId);
    if (status) records = records.filter(r => r.status === status);
    res.json({ success: true, data: records, pagination: { limit: parseInt(limit), offset: parseInt(offset), total: db_ops.count('pricing_records') } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const all = db_ops.getAll('pricing_records', 10000, 0).map(r => r.data);
    const byStatus = {};
    const byChangeType = {};
    let flagged = 0;
    let avgPrice = 0;
    all.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byChangeType[r.changeType] = (byChangeType[r.changeType] || 0) + 1;
      if (r.riskFlags && Object.values(r.riskFlags).some(v => v === true)) flagged++;
      avgPrice += r.currentPrice || 0;
    });
    res.json({ success: true, data: { total: all.length, byStatus, byChangeType, flagged, avgPrice: all.length > 0 ? Math.round((avgPrice / all.length) * 100) / 100 : 0 } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const record = db_ops.getById('pricing_records', 'pricing_id', req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Pricing record not found' });
    res.json({ success: true, data: record.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const data = req.body;
    if (!data.sellerId) return res.status(400).json({ success: false, error: 'sellerId is required' });

    const pricingId = `PRC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();
    const record = { ...data, pricingId, status: data.status || 'ACTIVE', createdAt: now, updatedAt: now };
    db_ops.insert('pricing_records', 'pricing_id', pricingId, record);

    let riskScore = 0;
    if (data.riskFlags?.belowCost) riskScore += 30;
    if (data.riskFlags?.priceManipulation) riskScore += 35;
    if (data.riskFlags?.arbitrage) riskScore += 25;
    if (data.priceChanges24h > 5) riskScore += 15;

    if (riskScore > 0) {
      emitRiskEvent({ sellerId: data.sellerId, domain: 'pricing', eventType: 'PRICING_RISK', riskScore, metadata: { pricingId, flags: data.riskFlags } });
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });
    const record = db_ops.getById('pricing_records', 'pricing_id', req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Pricing record not found' });
    const updated = { ...record.data, status, updatedAt: new Date().toISOString() };
    db_ops.update('pricing_records', 'pricing_id', req.params.id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

**Step 3: Commit**

```bash
git add backend/services/business/pricing/index.js
git commit -m "feat: add pricing backend service"
```

---

## Task 7: Create Profile Updates Backend Service

**Files:**
- Create: `backend/services/business/profile-updates/index.js`

**Step 1: Create directory and service file**

```bash
mkdir -p /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/services/business/profile-updates
```

**Step 2: Write the service**

Create `backend/services/business/profile-updates/index.js`:

```js
import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status, updateType } = req.query;
    let records = db_ops.getAll('profile_updates', parseInt(limit), parseInt(offset)).map(r => r.data);
    if (sellerId) records = records.filter(r => r.sellerId === sellerId);
    if (status) records = records.filter(r => r.status === status);
    if (updateType) records = records.filter(r => r.updateType === updateType);
    res.json({ success: true, data: records, pagination: { limit: parseInt(limit), offset: parseInt(offset), total: db_ops.count('profile_updates') } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const all = db_ops.getAll('profile_updates', 10000, 0).map(r => r.data);
    const byStatus = {};
    const byType = {};
    let flagged = 0;
    all.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byType[r.updateType] = (byType[r.updateType] || 0) + 1;
      if (r.riskFlags && Object.values(r.riskFlags).some(v => v === true)) flagged++;
    });
    res.json({ success: true, data: { total: all.length, byStatus, byType, flagged } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const record = db_ops.getById('profile_updates', 'update_id', req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Profile update not found' });
    res.json({ success: true, data: record.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const data = req.body;
    if (!data.sellerId) return res.status(400).json({ success: false, error: 'sellerId is required' });

    const updateId = `PUPD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();
    const record = { ...data, updateId, status: data.status || 'PENDING', createdAt: now, updatedAt: now };
    db_ops.insert('profile_updates', 'update_id', updateId, record);

    let riskScore = 0;
    if (data.riskFlags?.openDispute && data.updateType === 'BANK_CHANGE') riskScore += 50;
    if (data.riskFlags?.newDevice) riskScore += 20;
    if (data.riskFlags?.emailDomainDowngrade) riskScore += 15;
    if (['BANK_CHANGE', 'EMAIL_CHANGE'].includes(data.updateType)) riskScore += 10;

    if (riskScore > 0) {
      emitRiskEvent({ sellerId: data.sellerId, domain: 'profile_updates', eventType: 'PROFILE_UPDATE_RISK', riskScore, metadata: { updateId, updateType: data.updateType, flags: data.riskFlags } });
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });
    const record = db_ops.getById('profile_updates', 'update_id', req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Profile update not found' });
    const updated = { ...record.data, status, updatedAt: new Date().toISOString() };
    db_ops.update('profile_updates', 'update_id', req.params.id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

**Step 3: Commit**

```bash
git add backend/services/business/profile-updates/index.js
git commit -m "feat: add profile-updates backend service"
```

---

## Task 8: Create Shipments Backend Service

**Files:**
- Create: `backend/services/business/shipments/index.js`

**Step 1: Create directory and service file**

```bash
mkdir -p /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/services/business/shipments
```

**Step 2: Write the service**

Create `backend/services/business/shipments/index.js`:

```js
import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status } = req.query;
    let records = db_ops.getAll('outbound_shipments', parseInt(limit), parseInt(offset)).map(r => r.data);
    if (sellerId) records = records.filter(r => r.sellerId === sellerId);
    if (status) records = records.filter(r => r.status === status);
    res.json({ success: true, data: records, pagination: { limit: parseInt(limit), offset: parseInt(offset), total: db_ops.count('outbound_shipments') } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const all = db_ops.getAll('outbound_shipments', 10000, 0).map(r => r.data);
    const byStatus = {};
    const byCarrier = {};
    let flagged = 0;
    all.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byCarrier[r.carrier] = (byCarrier[r.carrier] || 0) + 1;
      if (r.riskFlags && Object.values(r.riskFlags).some(v => v === true)) flagged++;
    });
    res.json({ success: true, data: { total: all.length, byStatus, byCarrier, flagged } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const record = db_ops.getById('outbound_shipments', 'shipment_id', req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Shipment not found' });
    res.json({ success: true, data: record.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const data = req.body;
    if (!data.sellerId) return res.status(400).json({ success: false, error: 'sellerId is required' });

    const shipmentId = `SHPM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();
    const record = { ...data, shipmentId, status: data.status || 'LABEL_CREATED', createdAt: now, updatedAt: now };
    db_ops.insert('outbound_shipments', 'shipment_id', shipmentId, record);

    let riskScore = 0;
    if (data.riskFlags?.noMatchingOrder) riskScore += 50;
    if (data.riskFlags?.weightDiscrepancy) riskScore += 25;
    if (data.riskFlags?.carrierMismatch) riskScore += 10;
    if (data.riskFlags?.dropShipSuspected) riskScore += 15;

    if (riskScore > 0) {
      emitRiskEvent({ sellerId: data.sellerId, domain: 'shipments', eventType: 'SHIPMENT_RISK', riskScore, metadata: { shipmentId, flags: data.riskFlags } });
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });
    const record = db_ops.getById('outbound_shipments', 'shipment_id', req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Shipment not found' });
    const updated = { ...record.data, status, updatedAt: new Date().toISOString() };
    db_ops.update('outbound_shipments', 'shipment_id', req.params.id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

**Step 3: Commit**

```bash
git add backend/services/business/shipments/index.js
git commit -m "feat: add shipments backend service"
```

---

## Task 9: Create Returns Backend Service

**Files:**
- Create: `backend/services/business/returns/index.js`

**Step 1: Create directory and service file**

```bash
mkdir -p /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/services/business/returns
```

**Step 2: Write the service**

Create `backend/services/business/returns/index.js`:

```js
import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status } = req.query;
    let records = db_ops.getAll('returns', parseInt(limit), parseInt(offset)).map(r => r.data);
    if (sellerId) records = records.filter(r => r.sellerId === sellerId);
    if (status) records = records.filter(r => r.status === status);
    res.json({ success: true, data: records, pagination: { limit: parseInt(limit), offset: parseInt(offset), total: db_ops.count('returns') } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const all = db_ops.getAll('returns', 10000, 0).map(r => r.data);
    const byStatus = {};
    const byReason = {};
    let flagged = 0;
    let totalRefunds = 0;
    all.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byReason[r.reason] = (byReason[r.reason] || 0) + 1;
      if (r.riskFlags && Object.values(r.riskFlags).some(v => v === true)) flagged++;
      totalRefunds += r.refundAmount || 0;
    });
    res.json({ success: true, data: { total: all.length, byStatus, byReason, flagged, totalRefunds: Math.round(totalRefunds * 100) / 100 } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const record = db_ops.getById('returns', 'return_id', req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Return not found' });
    res.json({ success: true, data: record.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const data = req.body;
    if (!data.sellerId) return res.status(400).json({ success: false, error: 'sellerId is required' });

    const returnId = `RET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();
    const record = { ...data, returnId, status: data.status || 'REQUESTED', createdAt: now, updatedAt: now };
    db_ops.insert('returns', 'return_id', returnId, record);

    let riskScore = 0;
    if (data.riskFlags?.serialReturner) riskScore += 40;
    if (data.riskFlags?.emptyBox) riskScore += 35;
    if (data.riskFlags?.refundExceedsPurchase) riskScore += 50;
    if (data.riskFlags?.wardrobing) riskScore += 25;
    if (data.riskFlags?.fundsWithdrawn) riskScore += 45;

    if (riskScore > 0) {
      emitRiskEvent({ sellerId: data.sellerId, domain: 'returns', eventType: 'RETURN_RISK', riskScore, metadata: { returnId, flags: data.riskFlags } });
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });
    const record = db_ops.getById('returns', 'return_id', req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Return not found' });
    const updated = { ...record.data, status, updatedAt: new Date().toISOString() };
    db_ops.update('returns', 'return_id', req.params.id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

**Step 3: Commit**

```bash
git add backend/services/business/returns/index.js
git commit -m "feat: add returns backend service"
```

---

## Task 10: Mount Routes, Seed Data, Update Health Check in server.js

**Files:**
- Modify: `backend/gateway/server.js`

**Step 1: Add imports for new services and generators**

After line 292 (`import caseQueueRouter ...`), add:

```js
import accountSetupRouter from '../services/business/account-setup/index.js';
import itemSetupRouter from '../services/business/item-setup/index.js';
import pricingRouter from '../services/business/pricing/index.js';
import profileUpdatesRouter from '../services/business/profile-updates/index.js';
import shipmentsRouter from '../services/business/shipments/index.js';
import returnsRouter from '../services/business/returns/index.js';
```

**Step 2: Update the generators destructure (line 8)**

Add the new generators to the destructure:

```js
const { generateTransaction, generateMetricsSnapshot, generateSeller, generateListing, generatePayout, generateATOEvent, generateShipment, generateMLModel, generateRule, generateExperiment, generateDataset, generateCheckpointRules, generateAccountSetup, generateItemSetup, generatePricingRecord, generateProfileUpdate, generateOutboundShipment, generateReturn } = generators;
```

**Step 3: Add seeding for new services**

After the existing entity seeding (after line 87 where `shipment` seeding ends), add:

```js
    // Seed new business services
    sellers.slice(0, 50).forEach(s => {
      const sid = s.data.sellerId;
      const setup = generateAccountSetup(sid);
      db_ops.insert('account_setups', 'setup_id', setup.setupId, setup);
      const item = generateItemSetup(sid);
      db_ops.insert('item_setups', 'item_id', item.itemId, item);
      const pricing = generatePricingRecord(sid);
      db_ops.insert('pricing_records', 'pricing_id', pricing.pricingId, pricing);
      for (let i = 0; i < 2; i++) {
        const update = generateProfileUpdate(sid);
        db_ops.insert('profile_updates', 'update_id', update.updateId, update);
      }
      const shipment = generateOutboundShipment(sid);
      db_ops.insert('outbound_shipments', 'shipment_id', shipment.shipmentId, shipment);
      const ret = generateReturn(sid);
      db_ops.insert('returns', 'return_id', ret.returnId, ret);
    });
```

**Step 4: Add risk event seeding for new domains**

In the risk event seeding section (inside `allSellersForRisk.forEach`), add events for new domains. For high-risk sellers, add after the existing high-risk block:

```js
      // New domain events for high-risk sellers
      emitRiskEvent({ sellerId: seller.sellerId, domain: 'account_setup', eventType: 'SHARED_PAYMENT_METHOD', riskScore: Math.floor(Math.random() * 30) + 40, metadata: { seeded: true } });
      emitRiskEvent({ sellerId: seller.sellerId, domain: 'pricing', eventType: 'PRICE_MANIPULATION', riskScore: Math.floor(Math.random() * 30) + 45, metadata: { seeded: true } });
      if (Math.random() > 0.4) {
        emitRiskEvent({ sellerId: seller.sellerId, domain: 'returns', eventType: 'HIGH_RETURN_RATE', riskScore: Math.floor(Math.random() * 30) + 40, metadata: { seeded: true } });
      }
      if (Math.random() > 0.5) {
        emitRiskEvent({ sellerId: seller.sellerId, domain: 'profile_updates', eventType: 'BANK_CHANGE_DURING_DISPUTE', riskScore: Math.floor(Math.random() * 30) + 50, metadata: { seeded: true } });
      }
```

For medium-risk sellers, add after the existing medium-risk block:

```js
      // New domain events for medium-risk sellers
      if (Math.random() > 0.4) {
        emitRiskEvent({ sellerId: seller.sellerId, domain: 'account_setup', eventType: 'INCOMPLETE_TAX_CONFIG', riskScore: Math.floor(Math.random() * 20) + 15, metadata: { seeded: true } });
      }
      if (Math.random() > 0.5) {
        emitRiskEvent({ sellerId: seller.sellerId, domain: 'item_setup', eventType: 'MISSING_COMPLIANCE', riskScore: Math.floor(Math.random() * 20) + 10, metadata: { seeded: true } });
      }
      if (Math.random() > 0.5) {
        emitRiskEvent({ sellerId: seller.sellerId, domain: 'pricing', eventType: 'RAPID_PRICE_CHANGE', riskScore: Math.floor(Math.random() * 20) + 15, metadata: { seeded: true } });
      }
```

For low-risk sellers, add after the existing low-risk block:

```js
      // New domain events for low-risk sellers (occasional)
      if (Math.random() > 0.8) {
        emitRiskEvent({ sellerId: seller.sellerId, domain: 'account_setup', eventType: 'ACCOUNT_SETUP_OK', riskScore: -3, metadata: { seeded: true } });
      }
      if (Math.random() > 0.8) {
        emitRiskEvent({ sellerId: seller.sellerId, domain: 'returns', eventType: 'RETURN_PROCESSED', riskScore: -2, metadata: { seeded: true } });
      }
```

**Step 5: Mount API routes**

After line 411 (`app.use('/api/shipping', sellerShippingRouter);`), add:

```js
// New Business Services
app.use('/api/account-setup', accountSetupRouter);
app.use('/api/item-setup', itemSetupRouter);
app.use('/api/pricing', pricingRouter);
app.use('/api/profile-updates', profileUpdatesRouter);
app.use('/api/shipments', shipmentsRouter);
app.use('/api/returns', returnsRouter);
```

**Step 6: Update health check**

Add the 6 new services to the health check response (in the `services` object around line 348-362):

```js
'account-setup': 'running',
'item-setup': 'running',
'pricing': 'running',
'profile-updates': 'running',
'shipments': 'running',
'returns': 'running',
```

**Step 7: Update case seeding checkpoints**

Update the `checkpoints` array in the case seeding section to include new checkpoints:

```js
const checkpoints = ['onboarding', 'ato', 'payout', 'listing', 'shipping', 'transaction', 'account_setup', 'item_setup', 'pricing', 'profile_updates', 'shipments', 'returns'];
```

**Step 8: Add seed counts to console output**

After the existing count logs, add:

```js
  console.log(`  Account Setups: ${db_ops.count('account_setups')}`);
  console.log(`  Item Setups: ${db_ops.count('item_setups')}`);
  console.log(`  Pricing Records: ${db_ops.count('pricing_records')}`);
  console.log(`  Profile Updates: ${db_ops.count('profile_updates')}`);
  console.log(`  Outbound Shipments: ${db_ops.count('outbound_shipments')}`);
  console.log(`  Returns: ${db_ops.count('returns')}`);
```

**Step 9: Update API documentation endpoint**

Add new endpoints to the `/api` doc response:

```js
'/api/account-setup': 'Account Setup Service',
'/api/item-setup': 'Item Setup Service',
'/api/pricing': 'Pricing Service',
'/api/profile-updates': 'Profile Updates Service',
'/api/shipments': 'Shipments Service',
'/api/returns': 'Returns Service',
```

**Step 10: Update startup banner**

Add the 6 new services to the ASCII banner:

```
║   • Account Setup      /api/account-setup                ║
║   • Item Setup         /api/item-setup                   ║
║   • Pricing            /api/pricing                      ║
║   • Profile Updates    /api/profile-updates              ║
║   • Shipments          /api/shipments                    ║
║   • Returns            /api/returns                      ║
```

**Step 11: Commit**

```bash
git add backend/gateway/server.js
git commit -m "feat: mount 6 new services, seed data, update health check"
```

---

## Task 11: Create 6 Frontend Pages

**Files:**
- Create: `src/pages/AccountSetup.jsx`
- Create: `src/pages/ItemSetup.jsx`
- Create: `src/pages/Pricing.jsx`
- Create: `src/pages/ProfileUpdates.jsx`
- Create: `src/pages/Shipments.jsx`
- Create: `src/pages/Returns.jsx`

Each page follows the same lightweight pattern: stats cards + recent records table with status badges. The design doc says "No complex detail views."

**Step 1: Create AccountSetup.jsx**

Create `src/pages/AccountSetup.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { Settings, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

const API_BASE = 'http://localhost:3005/api';

export default function AccountSetup() {
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/account-setup/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {});
    fetch(`${API_BASE}/account-setup?limit=20`).then(r => r.json()).then(d => d.success && setRecords(d.data)).catch(() => {});
  }, []);

  const statusColor = (s) => ({ COMPLETE: 'text-emerald-400 bg-emerald-400/10', PENDING: 'text-yellow-400 bg-yellow-400/10', INCOMPLETE: 'text-orange-400 bg-orange-400/10', SUSPENDED: 'text-red-400 bg-red-400/10', UNDER_REVIEW: 'text-blue-400 bg-blue-400/10' }[s] || 'text-gray-400 bg-gray-400/10');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-cyan-500/20 rounded-lg"><Settings className="w-6 h-6 text-cyan-400" /></div>
        <div><h1 className="text-2xl font-bold text-white">Account Setup</h1><p className="text-sm text-gray-400">Store configuration, payment methods, tax settings</p></div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Setups', value: stats.total, icon: Settings, color: 'cyan' },
            { label: 'Complete', value: stats.byStatus?.COMPLETE || 0, icon: CheckCircle, color: 'emerald' },
            { label: 'Pending', value: stats.byStatus?.PENDING || 0, icon: Clock, color: 'yellow' },
            { label: 'Flagged', value: stats.flagged, icon: AlertTriangle, color: 'red' }
          ].map(card => (
            <div key={card.label} className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{card.label}</span>
                <card.icon className={`w-4 h-4 text-${card.color}-400`} />
              </div>
              <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[#1a1f2e] rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800"><h2 className="text-lg font-semibold text-white">Recent Account Setups</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="p-3">Setup ID</th><th className="p-3">Seller</th><th className="p-3">Store Name</th><th className="p-3">Category</th><th className="p-3">Status</th><th className="p-3">Risk</th>
            </tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.setupId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 text-sm text-cyan-400 font-mono">{r.setupId}</td>
                  <td className="p-3 text-sm text-gray-300">{r.sellerId}</td>
                  <td className="p-3 text-sm text-white">{r.storeName}</td>
                  <td className="p-3 text-sm text-gray-400">{r.storeCategory}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${statusColor(r.status)}`}>{r.status}</span></td>
                  <td className="p-3 text-sm text-gray-300">{r.riskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create ItemSetup.jsx**

Create `src/pages/ItemSetup.jsx` — same pattern, with product catalog columns:

```jsx
import { useState, useEffect } from 'react';
import { Package, AlertTriangle, CheckCircle, Layers } from 'lucide-react';

const API_BASE = 'http://localhost:3005/api';

export default function ItemSetup() {
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/item-setup/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {});
    fetch(`${API_BASE}/item-setup?limit=20`).then(r => r.json()).then(d => d.success && setRecords(d.data)).catch(() => {});
  }, []);

  const statusColor = (s) => ({ ACTIVE: 'text-emerald-400 bg-emerald-400/10', DRAFT: 'text-gray-400 bg-gray-400/10', PENDING_REVIEW: 'text-yellow-400 bg-yellow-400/10', SUSPENDED: 'text-red-400 bg-red-400/10', ARCHIVED: 'text-blue-400 bg-blue-400/10' }[s] || 'text-gray-400 bg-gray-400/10');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-violet-500/20 rounded-lg"><Package className="w-6 h-6 text-violet-400" /></div>
        <div><h1 className="text-2xl font-bold text-white">Item Setup</h1><p className="text-sm text-gray-400">Product catalog, variants, inventory management</p></div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Items', value: stats.total, icon: Package, color: 'violet' },
            { label: 'Active', value: stats.byStatus?.ACTIVE || 0, icon: CheckCircle, color: 'emerald' },
            { label: 'Total Variants', value: stats.totalVariants || 0, icon: Layers, color: 'blue' },
            { label: 'Flagged', value: stats.flagged, icon: AlertTriangle, color: 'red' }
          ].map(card => (
            <div key={card.label} className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{card.label}</span>
                <card.icon className={`w-4 h-4 text-${card.color}-400`} />
              </div>
              <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[#1a1f2e] rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800"><h2 className="text-lg font-semibold text-white">Recent Items</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="p-3">Item ID</th><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3">Category</th><th className="p-3">Variants</th><th className="p-3">Status</th><th className="p-3">Risk</th>
            </tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.itemId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 text-sm text-violet-400 font-mono">{r.itemId}</td>
                  <td className="p-3 text-sm text-white">{r.productName}</td>
                  <td className="p-3 text-sm text-gray-400 font-mono">{r.sku}</td>
                  <td className="p-3 text-sm text-gray-400">{r.category}</td>
                  <td className="p-3 text-sm text-gray-300">{r.variants}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${statusColor(r.status)}`}>{r.status}</span></td>
                  <td className="p-3 text-sm text-gray-300">{r.riskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create Pricing.jsx**

Create `src/pages/Pricing.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { DollarSign, AlertTriangle, TrendingUp, Tag } from 'lucide-react';

const API_BASE = 'http://localhost:3005/api';

export default function Pricing() {
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/pricing/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {});
    fetch(`${API_BASE}/pricing?limit=20`).then(r => r.json()).then(d => d.success && setRecords(d.data)).catch(() => {});
  }, []);

  const statusColor = (s) => ({ ACTIVE: 'text-emerald-400 bg-emerald-400/10', PENDING_REVIEW: 'text-yellow-400 bg-yellow-400/10', ADJUSTED: 'text-blue-400 bg-blue-400/10', BLOCKED: 'text-red-400 bg-red-400/10' }[s] || 'text-gray-400 bg-gray-400/10');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-emerald-500/20 rounded-lg"><DollarSign className="w-6 h-6 text-emerald-400" /></div>
        <div><h1 className="text-2xl font-bold text-white">Pricing</h1><p className="text-sm text-gray-400">Price changes, promotions, dynamic pricing monitoring</p></div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Records', value: stats.total, icon: Tag, color: 'emerald' },
            { label: 'Avg Price', value: `$${stats.avgPrice}`, icon: DollarSign, color: 'cyan' },
            { label: 'Dynamic', value: stats.byChangeType?.DYNAMIC || 0, icon: TrendingUp, color: 'blue' },
            { label: 'Flagged', value: stats.flagged, icon: AlertTriangle, color: 'red' }
          ].map(card => (
            <div key={card.label} className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{card.label}</span>
                <card.icon className={`w-4 h-4 text-${card.color}-400`} />
              </div>
              <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[#1a1f2e] rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800"><h2 className="text-lg font-semibold text-white">Recent Pricing Changes</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="p-3">Pricing ID</th><th className="p-3">Product</th><th className="p-3">Price</th><th className="p-3">Previous</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Risk</th>
            </tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.pricingId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 text-sm text-emerald-400 font-mono">{r.pricingId}</td>
                  <td className="p-3 text-sm text-white">{r.productName}</td>
                  <td className="p-3 text-sm text-white font-medium">${r.currentPrice}</td>
                  <td className="p-3 text-sm text-gray-400">${r.previousPrice}</td>
                  <td className="p-3 text-sm text-gray-400">{r.changeType}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${statusColor(r.status)}`}>{r.status}</span></td>
                  <td className="p-3 text-sm text-gray-300">{r.riskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Create ProfileUpdates.jsx**

Create `src/pages/ProfileUpdates.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { UserCog, AlertTriangle, Shield, Clock } from 'lucide-react';

const API_BASE = 'http://localhost:3005/api';

export default function ProfileUpdates() {
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/profile-updates/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {});
    fetch(`${API_BASE}/profile-updates?limit=20`).then(r => r.json()).then(d => d.success && setRecords(d.data)).catch(() => {});
  }, []);

  const statusColor = (s) => ({ APPROVED: 'text-emerald-400 bg-emerald-400/10', PENDING: 'text-yellow-400 bg-yellow-400/10', UNDER_REVIEW: 'text-blue-400 bg-blue-400/10', REJECTED: 'text-red-400 bg-red-400/10', BLOCKED: 'text-red-400 bg-red-400/10' }[s] || 'text-gray-400 bg-gray-400/10');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-orange-500/20 rounded-lg"><UserCog className="w-6 h-6 text-orange-400" /></div>
        <div><h1 className="text-2xl font-bold text-white">Profile Updates</h1><p className="text-sm text-gray-400">Seller info changes — address, bank, contact monitoring</p></div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Updates', value: stats.total, icon: UserCog, color: 'orange' },
            { label: 'Approved', value: stats.byStatus?.APPROVED || 0, icon: Shield, color: 'emerald' },
            { label: 'Pending', value: stats.byStatus?.PENDING || 0, icon: Clock, color: 'yellow' },
            { label: 'Flagged', value: stats.flagged, icon: AlertTriangle, color: 'red' }
          ].map(card => (
            <div key={card.label} className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{card.label}</span>
                <card.icon className={`w-4 h-4 text-${card.color}-400`} />
              </div>
              <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[#1a1f2e] rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800"><h2 className="text-lg font-semibold text-white">Recent Profile Changes</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="p-3">Update ID</th><th className="p-3">Seller</th><th className="p-3">Type</th><th className="p-3">New Device</th><th className="p-3">Status</th><th className="p-3">Risk</th>
            </tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.updateId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 text-sm text-orange-400 font-mono">{r.updateId}</td>
                  <td className="p-3 text-sm text-gray-300">{r.sellerId}</td>
                  <td className="p-3 text-sm text-white">{r.updateType?.replace(/_/g, ' ')}</td>
                  <td className="p-3 text-sm">{r.newDevice ? <span className="text-red-400">Yes</span> : <span className="text-gray-500">No</span>}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${statusColor(r.status)}`}>{r.status}</span></td>
                  <td className="p-3 text-sm text-gray-300">{r.riskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

**Step 5: Create Shipments.jsx**

Create `src/pages/Shipments.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { Truck, AlertTriangle, MapPin, Package } from 'lucide-react';

const API_BASE = 'http://localhost:3005/api';

export default function Shipments() {
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/shipments/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {});
    fetch(`${API_BASE}/shipments?limit=20`).then(r => r.json()).then(d => d.success && setRecords(d.data)).catch(() => {});
  }, []);

  const statusColor = (s) => ({ LABEL_CREATED: 'text-gray-400 bg-gray-400/10', PICKED_UP: 'text-blue-400 bg-blue-400/10', IN_TRANSIT: 'text-yellow-400 bg-yellow-400/10', DELIVERED: 'text-emerald-400 bg-emerald-400/10', FAILED: 'text-red-400 bg-red-400/10', RETURNED_TO_SENDER: 'text-orange-400 bg-orange-400/10' }[s] || 'text-gray-400 bg-gray-400/10');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-500/20 rounded-lg"><Truck className="w-6 h-6 text-blue-400" /></div>
        <div><h1 className="text-2xl font-bold text-white">Shipments</h1><p className="text-sm text-gray-400">Outbound shipment creation, label generation, tracking</p></div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Shipments', value: stats.total, icon: Truck, color: 'blue' },
            { label: 'Delivered', value: stats.byStatus?.DELIVERED || 0, icon: Package, color: 'emerald' },
            { label: 'In Transit', value: stats.byStatus?.IN_TRANSIT || 0, icon: MapPin, color: 'yellow' },
            { label: 'Flagged', value: stats.flagged, icon: AlertTriangle, color: 'red' }
          ].map(card => (
            <div key={card.label} className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{card.label}</span>
                <card.icon className={`w-4 h-4 text-${card.color}-400`} />
              </div>
              <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[#1a1f2e] rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800"><h2 className="text-lg font-semibold text-white">Recent Shipments</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="p-3">Shipment ID</th><th className="p-3">Carrier</th><th className="p-3">Destination</th><th className="p-3">Value</th><th className="p-3">Insured</th><th className="p-3">Status</th><th className="p-3">Risk</th>
            </tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.shipmentId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 text-sm text-blue-400 font-mono">{r.shipmentId}</td>
                  <td className="p-3 text-sm text-white">{r.carrier}</td>
                  <td className="p-3 text-sm text-gray-400">{r.destination?.country || 'US'}</td>
                  <td className="p-3 text-sm text-white">${r.declaredValue}</td>
                  <td className="p-3 text-sm">{r.insured ? <span className="text-emerald-400">Yes</span> : <span className="text-gray-500">No</span>}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${statusColor(r.status)}`}>{r.status}</span></td>
                  <td className="p-3 text-sm text-gray-300">{r.riskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

**Step 6: Create Returns.jsx**

Create `src/pages/Returns.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { RotateCcw, AlertTriangle, DollarSign, XCircle } from 'lucide-react';

const API_BASE = 'http://localhost:3005/api';

export default function Returns() {
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/returns/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {});
    fetch(`${API_BASE}/returns?limit=20`).then(r => r.json()).then(d => d.success && setRecords(d.data)).catch(() => {});
  }, []);

  const statusColor = (s) => ({ REQUESTED: 'text-yellow-400 bg-yellow-400/10', APPROVED: 'text-blue-400 bg-blue-400/10', RECEIVED: 'text-cyan-400 bg-cyan-400/10', REFUNDED: 'text-emerald-400 bg-emerald-400/10', REJECTED: 'text-red-400 bg-red-400/10', UNDER_REVIEW: 'text-orange-400 bg-orange-400/10' }[s] || 'text-gray-400 bg-gray-400/10');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-pink-500/20 rounded-lg"><RotateCcw className="w-6 h-6 text-pink-400" /></div>
        <div><h1 className="text-2xl font-bold text-white">Returns</h1><p className="text-sm text-gray-400">Return/refund processing, abuse detection</p></div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Returns', value: stats.total, icon: RotateCcw, color: 'pink' },
            { label: 'Total Refunds', value: `$${stats.totalRefunds?.toLocaleString()}`, icon: DollarSign, color: 'cyan' },
            { label: 'Rejected', value: stats.byStatus?.REJECTED || 0, icon: XCircle, color: 'red' },
            { label: 'Flagged', value: stats.flagged, icon: AlertTriangle, color: 'orange' }
          ].map(card => (
            <div key={card.label} className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{card.label}</span>
                <card.icon className={`w-4 h-4 text-${card.color}-400`} />
              </div>
              <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[#1a1f2e] rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800"><h2 className="text-lg font-semibold text-white">Recent Returns</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="p-3">Return ID</th><th className="p-3">Reason</th><th className="p-3">Purchase</th><th className="p-3">Refund</th><th className="p-3">Paid By</th><th className="p-3">Status</th><th className="p-3">Risk</th>
            </tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.returnId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 text-sm text-pink-400 font-mono">{r.returnId}</td>
                  <td className="p-3 text-sm text-white">{r.reason?.replace(/_/g, ' ')}</td>
                  <td className="p-3 text-sm text-gray-400">${r.purchaseAmount}</td>
                  <td className="p-3 text-sm text-white">${r.refundAmount}</td>
                  <td className="p-3 text-sm text-gray-400">{r.returnShippingPaid}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${statusColor(r.status)}`}>{r.status}</span></td>
                  <td className="p-3 text-sm text-gray-300">{r.riskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

**Step 7: Commit all frontend pages**

```bash
git add src/pages/AccountSetup.jsx src/pages/ItemSetup.jsx src/pages/Pricing.jsx src/pages/ProfileUpdates.jsx src/pages/Shipments.jsx src/pages/Returns.jsx
git commit -m "feat: add 6 frontend pages for new business services"
```

---

## Task 12: Wire Navigation and Routes

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Layout.jsx`

**Step 1: Add imports to App.jsx**

After line 19 (`import CaseQueue from './pages/CaseQueue'`), add:

```js
import AccountSetup from './pages/AccountSetup'
import ItemSetup from './pages/ItemSetup'
import Pricing from './pages/Pricing'
import ProfileUpdates from './pages/ProfileUpdates'
import Shipments from './pages/Shipments'
import Returns from './pages/Returns'
```

**Step 2: Add routes to App.jsx**

After line 162 (`<Route path="/risk-profiles" ...`), add:

```jsx
          <Route path="/account-setup" element={<AccountSetup />} />
          <Route path="/item-setup" element={<ItemSetup />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/profile-updates" element={<ProfileUpdates />} />
          <Route path="/shipments" element={<Shipments />} />
          <Route path="/returns" element={<Returns />} />
```

**Step 3: Update Layout.jsx navigation**

Add the "Business Services" expandable group to the `navigation` array. Add after the "Seller Onboarding" entry (after line 81) and before "Risk Rules":

```js
    {
      name: 'Business Services',
      href: '/account-setup',
      icon: Settings,
      color: 'text-cyan-400',
      children: [
        { name: 'Account Setup', href: '/account-setup' },
        { name: 'Item Setup', href: '/item-setup' },
        { name: 'Pricing', href: '/pricing' },
        { name: 'Profile Updates', href: '/profile-updates' },
        { name: 'Shipments', href: '/shipments' },
        { name: 'Returns', href: '/returns' }
      ]
    },
```

**Step 4: Add Settings import to Layout.jsx**

Update the lucide-react import in Layout.jsx to include `Settings`:

```js
import {
  Shield, Activity, Database, Brain, Cog, FlaskConical,
  Home, RefreshCw, Menu, X, ChevronDown, Server, Bot, Users, ShieldAlert, Eye, BookOpen, FolderOpen, Settings
} from 'lucide-react'
```

**Step 5: Fix Business Services nav active state**

The `NavItem` uses `location.pathname.startsWith(item.href)` for highlighting. Since the group href is `/account-setup`, only Account Setup would highlight. Update the `isActive` logic to handle children. No change needed — the existing `NavItem` already expands and highlights based on `location.pathname.startsWith(item.href)` or matches child hrefs. Children each have their own href that the NavItem highlights individually.

However, the group needs to expand when ANY child is active. The existing code only checks `location.pathname.startsWith(item.href)`. We should update the `expanded` initialization to also check children:

In the `NavItem` component, update the `expanded` useState:

```js
const [expanded, setExpanded] = useState(
  (location.pathname.startsWith(item.href) && item.href !== '/') ||
  (item.children && item.children.some(c => location.pathname === c.href))
)
```

And update `isActive`:

```js
const isActive = location.pathname === item.href ||
  (item.href !== '/' && location.pathname.startsWith(item.href)) ||
  (item.children && item.children.some(c => location.pathname === c.href))
```

**Step 6: Commit**

```bash
git add src/App.jsx src/components/Layout.jsx
git commit -m "feat: wire navigation and routes for 6 new business services"
```

---

## Task 13: Verify Everything Works

**Step 1: Restart the backend**

```bash
cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard
lsof -ti:3005 | xargs kill -9 2>/dev/null
PORT=3005 node backend/gateway/server.js
```

Expected: Server starts, seeds new data, shows counts for all 6 new collections.

**Step 2: Verify API endpoints**

Test each new service:
```bash
curl -s http://localhost:3005/api/account-setup/stats | jq .
curl -s http://localhost:3005/api/item-setup/stats | jq .
curl -s http://localhost:3005/api/pricing/stats | jq .
curl -s http://localhost:3005/api/profile-updates/stats | jq .
curl -s http://localhost:3005/api/shipments/stats | jq .
curl -s http://localhost:3005/api/returns/stats | jq .
```

Expected: Each returns `{ success: true, data: { total: 50, ... } }`.

**Step 3: Verify health check**

```bash
curl -s http://localhost:3005/api/health | jq .
```

Expected: All 18+ services listed as "running".

**Step 4: Verify risk profiles show new domains**

```bash
curl -s http://localhost:3005/api/risk-profile/stats | jq .
```

Expected: Domain scores now include all 12 domains in seller profiles.

**Step 5: Verify frontend**

Open `http://localhost:5173` and navigate to each new page via the "Business Services" nav group. Each page should show stats cards and a table of records.

**Step 6: Verify checkpoint rules**

```bash
curl -s 'http://localhost:3005/api/rules/by-checkpoint' | jq '.data | keys'
```

Expected: Should include `account_setup`, `item_setup`, `pricing`, `profile_updates`, `shipments`, `returns`.

**Step 7: Commit verification notes (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address any issues found during verification"
```
