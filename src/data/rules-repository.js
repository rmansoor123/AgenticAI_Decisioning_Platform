// eBay-caliber marketplace fraud detection rules repository
// Organized by fraud typology AND business service with marketplace-specific signals

// ── SERVICE CATALOG ──────────────────────────────────────────────
// Each rule maps to a primary owning service. Services marked exists:false
// are proposed microservices that SHOULD exist to own those rules.
export const SERVICES = [
  { id: 'all', label: 'All Services', exists: true, color: 'text-white' },
  // ── Existing Services (backend/services/business/) ──
  { id: 'seller-onboarding', label: 'Seller Onboarding', exists: true, path: 'backend/services/business/seller-onboarding', description: 'KYC, identity verification, seller registration and vetting', color: 'text-blue-400' },
  { id: 'account-setup', label: 'Account Setup', exists: true, path: 'backend/services/business/account-setup', description: 'Account configuration, bank linking, tax setup, payment methods', color: 'text-sky-400' },
  { id: 'item-setup', label: 'Item Setup', exists: true, path: 'backend/services/business/item-setup', description: 'Product catalog, SKU creation, UPC/EAN management, item attributes', color: 'text-violet-400' },
  { id: 'seller-listing', label: 'Seller Listing', exists: true, path: 'backend/services/business/seller-listing', description: 'Listing creation, publishing, images, descriptions, search optimization', color: 'text-purple-400' },
  { id: 'pricing', label: 'Pricing', exists: true, path: 'backend/services/business/pricing', description: 'Price setting, repricing, promotions, discounts, MAP compliance', color: 'text-emerald-400' },
  { id: 'seller-shipping', label: 'Seller Shipping', exists: true, path: 'backend/services/business/seller-shipping', description: 'Shipping labels, tracking, fulfillment, carrier integration', color: 'text-teal-400' },
  { id: 'seller-payout', label: 'Seller Payout', exists: true, path: 'backend/services/business/seller-payout', description: 'Payment disbursement, earnings, withdrawals, holdbacks', color: 'text-green-400' },
  { id: 'returns', label: 'Returns', exists: true, path: 'backend/services/business/returns', description: 'Return processing, refunds, disputes, inspection', color: 'text-pink-400' },
  { id: 'seller-ato', label: 'Seller ATO', exists: true, path: 'backend/services/business/seller-ato', description: 'Account takeover protection, authentication, session security', color: 'text-amber-400' },
  { id: 'profile-updates', label: 'Profile Updates', exists: true, path: 'backend/services/business/profile-updates', description: 'Profile modifications, settings changes, contact info updates', color: 'text-rose-400' },
  // ── Proposed Services (do not exist yet) ──
  { id: 'transaction-processing', label: 'Transaction Processing', exists: false, description: 'Order processing, checkout, bidding, cart management — currently handled inline in gateway', color: 'text-orange-400' },
  { id: 'payment-processing', label: 'Payment Processing', exists: false, description: 'Payment acceptance, card validation, payment method risk screening', color: 'text-red-400' },
  { id: 'buyer-trust', label: 'Buyer Trust', exists: false, description: 'Buyer-side risk scoring, abuse detection, buyer reputation management', color: 'text-fuchsia-400' },
  { id: 'network-intelligence', label: 'Network Intelligence', exists: false, description: 'Graph analysis, ring detection, entity resolution, community detection', color: 'text-cyan-400' },
  { id: 'review-integrity', label: 'Review Integrity', exists: false, description: 'Review/feedback authenticity, manipulation detection, reputation systems', color: 'text-yellow-400' },
  { id: 'policy-enforcement', label: 'Policy Enforcement', exists: false, description: 'Policy compliance, violation tracking, sanctions, repeat offender escalation', color: 'text-lime-400' },
  { id: 'compliance-aml', label: 'Compliance & AML', exists: false, description: 'Anti-money laundering, BSA reporting, sanctions screening, OFAC/SDN', color: 'text-red-300' },
  { id: 'behavioral-analytics', label: 'Behavioral Analytics', exists: false, description: 'Velocity monitoring, anomaly detection, biometrics, device reputation', color: 'text-indigo-400' },
];

export const CATEGORIES = [
  { id: 'all', label: 'All Rules', color: 'text-white' },
  { id: 'SELLER_IDENTITY', label: 'Seller Identity', color: 'text-blue-400' },
  { id: 'LISTING_INTEGRITY', label: 'Listing Integrity', color: 'text-purple-400' },
  { id: 'TRANSACTION_MANIPULATION', label: 'Transaction Manipulation', color: 'text-orange-400' },
  { id: 'FULFILLMENT_FRAUD', label: 'Fulfillment & Shipping', color: 'text-teal-400' },
  { id: 'BUYER_ABUSE', label: 'Buyer Abuse', color: 'text-pink-400' },
  { id: 'PAYMENT_FRAUD', label: 'Payment & AML', color: 'text-red-400' },
  { id: 'ACCOUNT_TAKEOVER', label: 'Account Takeover', color: 'text-amber-400' },
  { id: 'NETWORK_RINGS', label: 'Network & Rings', color: 'text-cyan-400' },
  { id: 'POLICY_ABUSE', label: 'Policy Abuse', color: 'text-lime-400' },
  { id: 'VELOCITY_BEHAVIORAL', label: 'Velocity & Behavioral', color: 'text-indigo-400' },
];

export const CHECKPOINTS = [
  'ONBOARDING', 'LISTING', 'BIDDING', 'TRANSACTION', 'PAYMENT',
  'PAYOUT', 'SHIPPING', 'RETURNS', 'ACCOUNT_CHANGE', 'CONTINUOUS',
];

export const RULES = [
  // ============================================================
  // CATEGORY 1: SELLER IDENTITY & ACCOUNT INTEGRITY (25 rules)
  // ============================================================
  {
    id: 'SI-001', name: 'Stealth Account Detection', category: 'SELLER_IDENTITY',
    service: 'seller-onboarding', checkpoint: 'ONBOARDING', severity: 'CRITICAL', score: 95, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'New account shares ≥3 of: device fingerprint, IP subnet /24, browser canvas hash, WiFi BSSID, or payment instrument with a previously banned account',
    description: 'Detects banned sellers creating new accounts with slight variations. Uses fuzzy matching across 12 identity signals with a weighted Jaccard similarity threshold of 0.65.',
    conditions: [
      { field: 'device.fingerprintHash', operator: 'FUZZY_MATCH', value: 'banned_accounts.fingerprints', threshold: 0.85 },
      { field: 'ip.subnet_24', operator: 'IN', value: 'banned_accounts.ip_subnets' },
      { field: 'browser.canvasHash', operator: 'EQUALS', value: 'banned_accounts.canvas_hashes' },
    ],
    tags: ['ban-evasion', 'identity', 'high-confidence'],
    performance: { triggered: 4821, truePositives: 4533, falsePositives: 288, catchRate: 0.94, falsePositiveRate: 0.06 },
  },
  {
    id: 'SI-002', name: 'Synthetic Identity Fusion', category: 'SELLER_IDENTITY',
    service: 'seller-onboarding', checkpoint: 'ONBOARDING', severity: 'CRITICAL', score: 90, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'SSN issued after 2011 (randomized) + name/DOB combination not found in credit bureau header files + address is a CMRA (Commercial Mail Receiving Agency)',
    description: 'Identifies fabricated identities by cross-referencing SSN issuance patterns, credit bureau thin-file indicators, and address type classification. Post-2011 SSNs are randomized, making synthetic detection harder.',
    conditions: [
      { field: 'identity.ssn_issue_date', operator: 'AFTER', value: '2011-06-25' },
      { field: 'identity.credit_bureau_match', operator: 'EQUALS', value: false },
      { field: 'identity.address_type', operator: 'IN', value: ['CMRA', 'PO_BOX', 'VIRTUAL_OFFICE'] },
    ],
    tags: ['synthetic-identity', 'KYC', 'credit-bureau'],
    performance: { triggered: 1247, truePositives: 1122, falsePositives: 125, catchRate: 0.90, falsePositiveRate: 0.10 },
  },
  {
    id: 'SI-003', name: 'Document Forgery — Pixel Analysis', category: 'SELLER_IDENTITY',
    service: 'seller-onboarding', checkpoint: 'ONBOARDING', severity: 'CRITICAL', score: 88, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Uploaded ID document shows EXIF metadata inconsistencies, JPEG error level analysis (ELA) reveals editing artifacts, or font rendering doesn\'t match known government document templates',
    description: 'ML model (ResNet-50 fine-tuned on 2M document images) detects alterations in government IDs. Checks EXIF stripping, compression artifact patterns, microprint integrity, and hologram absence in photo.',
    conditions: [
      { field: 'document.ela_score', operator: 'GREATER_THAN', value: 0.72 },
      { field: 'document.font_match_score', operator: 'LESS_THAN', value: 0.60 },
      { field: 'document.exif_stripped', operator: 'EQUALS', value: true },
    ],
    tags: ['document-fraud', 'ML-model', 'KYC'],
    performance: { triggered: 3891, truePositives: 3580, falsePositives: 311, catchRate: 0.92, falsePositiveRate: 0.08 },
  },
  {
    id: 'SI-004', name: 'Shell Company Front', category: 'SELLER_IDENTITY',
    service: 'seller-onboarding', checkpoint: 'ONBOARDING', severity: 'HIGH', score: 72, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Business registered <90 days ago + registered agent address (not principal) + no employees on state filing + no web presence (domain, social, reviews) + category is high-value electronics or luxury',
    description: 'Identifies businesses created solely for marketplace fraud. Checks state SOS filings, web presence via Clearbit/BuiltWith, and employee counts from data aggregators.',
    conditions: [
      { field: 'business.registration_age_days', operator: 'LESS_THAN', value: 90 },
      { field: 'business.address_type', operator: 'EQUALS', value: 'REGISTERED_AGENT' },
      { field: 'business.web_presence_score', operator: 'LESS_THAN', value: 10 },
      { field: 'business.employee_count', operator: 'EQUALS', value: 0 },
    ],
    tags: ['shell-company', 'business-verification', 'KYC'],
    performance: { triggered: 2156, truePositives: 1724, falsePositives: 432, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'SI-005', name: 'Phone Number Recycling Detection', category: 'SELLER_IDENTITY',
    service: 'seller-onboarding', checkpoint: 'ONBOARDING', severity: 'HIGH', score: 65, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Phone number linked to 3+ distinct accounts in last 12 months, OR phone carrier reports number as recently ported (within 7 days of application)',
    description: 'Detects phone numbers shared across multiple accounts or recently ported numbers (common in account takeover and stealth account creation). Uses carrier lookup API for port detection.',
    conditions: [
      { field: 'phone.linked_account_count_12m', operator: 'GREATER_THAN', value: 2 },
      { field: 'phone.days_since_port', operator: 'LESS_THAN', value: 7 },
    ],
    tags: ['phone-fraud', 'SIM-swap', 'identity'],
    performance: { triggered: 8934, truePositives: 7147, falsePositives: 1787, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'SI-006', name: 'Address Intelligence — Mail Drop', category: 'SELLER_IDENTITY',
    service: 'seller-onboarding', checkpoint: 'ONBOARDING', severity: 'MEDIUM', score: 45, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Business address resolves to UPS Store, FedEx Office, Regus virtual office, or residential address with >5 business registrations at same unit',
    description: 'Cross-references address against USPS CMRA database, commercial mail receiving agency registrations, and state business filing density per address.',
    conditions: [
      { field: 'address.is_cmra', operator: 'EQUALS', value: true },
      { field: 'address.business_registrations_at_unit', operator: 'GREATER_THAN', value: 5 },
    ],
    tags: ['address-fraud', 'mail-drop', 'business-verification'],
    performance: { triggered: 12456, truePositives: 7473, falsePositives: 4983, catchRate: 0.60, falsePositiveRate: 0.40 },
  },
  {
    id: 'SI-007', name: 'Email Age & Reputation Check', category: 'SELLER_IDENTITY',
    service: 'seller-onboarding', checkpoint: 'ONBOARDING', severity: 'MEDIUM', score: 40, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Email account created <14 days before application + no social media profiles linked + email provider is privacy-focused (ProtonMail, Tutanota) + high entropy username',
    description: 'Scores email reputation using creation date, social graph connectivity, provider risk, and username pattern analysis. High entropy usernames (e.g., xK9mPq2z@) suggest auto-generated accounts.',
    conditions: [
      { field: 'email.age_days', operator: 'LESS_THAN', value: 14 },
      { field: 'email.social_profiles_count', operator: 'EQUALS', value: 0 },
      { field: 'email.username_entropy', operator: 'GREATER_THAN', value: 3.5 },
    ],
    tags: ['email-risk', 'new-account', 'identity'],
    performance: { triggered: 18234, truePositives: 10940, falsePositives: 7294, catchRate: 0.60, falsePositiveRate: 0.40 },
  },
  {
    id: 'SI-008', name: 'Cross-Platform Ban Match', category: 'SELLER_IDENTITY',
    service: 'seller-onboarding', checkpoint: 'ONBOARDING', severity: 'HIGH', score: 78, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Applicant identity (name + DOB or SSN or EIN) matches entity banned on consortium partner platforms (Amazon, Etsy, Shopify, Walmart Marketplace)',
    description: 'Queries fraud consortium database (MFAC — Merchant Fraud Advisory Consortium) for cross-platform bans. Uses fuzzy name matching with Jaro-Winkler similarity > 0.92.',
    conditions: [
      { field: 'consortium.ban_match', operator: 'EQUALS', value: true },
      { field: 'consortium.name_similarity', operator: 'GREATER_THAN', value: 0.92 },
    ],
    tags: ['consortium', 'cross-platform', 'ban-match'],
    performance: { triggered: 892, truePositives: 802, falsePositives: 90, catchRate: 0.90, falsePositiveRate: 0.10 },
  },
  {
    id: 'SI-009', name: 'Beneficial Owner Opacity', category: 'SELLER_IDENTITY',
    service: 'seller-onboarding', checkpoint: 'ONBOARDING', severity: 'HIGH', score: 60, action: 'REVIEW',
    status: 'SHADOW',
    trigger: 'Business structure has >2 layers of holding entities + beneficial owner cannot be traced to natural person + jurisdiction is opacity-haven (Delaware, Wyoming, Nevada, BVI, Cayman)',
    description: 'Traces corporate ownership chains through state SOS filings and FinCEN BOI reports. Flags structures designed to obscure beneficial ownership.',
    conditions: [
      { field: 'business.ownership_layers', operator: 'GREATER_THAN', value: 2 },
      { field: 'business.beneficial_owner_identified', operator: 'EQUALS', value: false },
      { field: 'business.jurisdiction', operator: 'IN', value: ['DE', 'WY', 'NV', 'BVI', 'KY'] },
    ],
    tags: ['AML', 'beneficial-ownership', 'FinCEN'],
    performance: { triggered: 567, truePositives: 340, falsePositives: 227, catchRate: 0.60, falsePositiveRate: 0.40 },
  },
  {
    id: 'SI-010', name: 'Device Farm Fingerprint', category: 'SELLER_IDENTITY',
    service: 'seller-onboarding', checkpoint: 'ONBOARDING', severity: 'CRITICAL', score: 92, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Device fingerprint matches known device farm signature: identical hardware specs + sequential MAC addresses + timezone mismatch with IP geolocation + >20 accounts from same /16 subnet',
    description: 'Detects organized fraud operations using device farms. Identifies clusters of devices with suspiciously similar hardware profiles and network characteristics.',
    conditions: [
      { field: 'device.farm_signature_match', operator: 'EQUALS', value: true },
      { field: 'device.subnet_account_count', operator: 'GREATER_THAN', value: 20 },
      { field: 'device.timezone_ip_mismatch', operator: 'EQUALS', value: true },
    ],
    tags: ['device-farm', 'organized-fraud', 'automation'],
    performance: { triggered: 2341, truePositives: 2270, falsePositives: 71, catchRate: 0.97, falsePositiveRate: 0.03 },
  },

  // ============================================================
  // CATEGORY 2: LISTING INTEGRITY & COUNTERFEIT (25 rules)
  // ============================================================
  {
    id: 'LI-001', name: 'Counterfeit Brand Signal — Deep Discount', category: 'LISTING_INTEGRITY',
    service: 'seller-listing', checkpoint: 'LISTING', severity: 'HIGH', score: 75, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Branded item listed at >65% below median market price + seller account <90 days old + seller has no prior sales in this brand + listing uses stock/manufacturer photos',
    description: 'Flags suspected counterfeit listings by combining price anomaly detection with seller history and image provenance. Price thresholds are category-specific and updated weekly from market data.',
    conditions: [
      { field: 'listing.price_vs_median', operator: 'LESS_THAN', value: 0.35 },
      { field: 'seller.account_age_days', operator: 'LESS_THAN', value: 90 },
      { field: 'seller.brand_sales_history', operator: 'EQUALS', value: 0 },
      { field: 'listing.image_source', operator: 'EQUALS', value: 'STOCK_PHOTO' },
    ],
    tags: ['counterfeit', 'brand-protection', 'price-anomaly'],
    performance: { triggered: 34521, truePositives: 27617, falsePositives: 6904, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'LI-002', name: 'Image Reverse Search — Stolen Photos', category: 'LISTING_INTEGRITY',
    service: 'seller-listing', checkpoint: 'LISTING', severity: 'MEDIUM', score: 55, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Listing images match >90% perceptual hash similarity with images from other active listings by different sellers OR from known manufacturer catalogs',
    description: 'Uses perceptual hashing (pHash) and CNN embeddings to detect image reuse. Images are compared against a 500M+ image index of active listings and manufacturer product catalogs.',
    conditions: [
      { field: 'image.phash_match_score', operator: 'GREATER_THAN', value: 0.90 },
      { field: 'image.source_seller_id', operator: 'NOT_EQUALS', value: 'listing.seller_id' },
    ],
    tags: ['image-fraud', 'stolen-photos', 'perceptual-hash'],
    performance: { triggered: 89234, truePositives: 62464, falsePositives: 26770, catchRate: 0.70, falsePositiveRate: 0.30 },
  },
  {
    id: 'LI-003', name: 'Keyword Stuffing & SEO Manipulation', category: 'LISTING_INTEGRITY',
    service: 'seller-listing', checkpoint: 'LISTING', severity: 'MEDIUM', score: 35, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Listing title contains ≥3 unrelated brand names OR description keyword density >5% for brand terms not matching actual item OR hidden text (white-on-white, 1px font)',
    description: 'NLP analysis of listing text to detect keyword manipulation. Uses BERT-based classifier trained on 1M+ manually labeled listings to distinguish legitimate multi-brand compatibility claims from SEO abuse.',
    conditions: [
      { field: 'listing.unrelated_brand_count', operator: 'GREATER_THAN', value: 2 },
      { field: 'listing.brand_keyword_density', operator: 'GREATER_THAN', value: 0.05 },
      { field: 'listing.has_hidden_text', operator: 'EQUALS', value: true },
    ],
    tags: ['SEO-abuse', 'keyword-stuffing', 'listing-quality'],
    performance: { triggered: 45678, truePositives: 36542, falsePositives: 9136, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'LI-004', name: 'Phantom Inventory — Drop Ship Arbitrage', category: 'LISTING_INTEGRITY',
    service: 'seller-listing', checkpoint: 'LISTING', severity: 'HIGH', score: 68, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Seller lists >50 SKUs in first week + 0 items in own possession (no warehouse) + all tracking numbers originate from retail fulfillment centers (Amazon FC, Walmart DC) + average margin <8%',
    description: 'Identifies unauthorized drop shipping where sellers list items they don\'t own, purchasing from retailers only after receiving buyer payment. Detected via shipping origin analysis and inventory-to-listing ratio.',
    conditions: [
      { field: 'seller.sku_count_first_week', operator: 'GREATER_THAN', value: 50 },
      { field: 'seller.verified_inventory', operator: 'EQUALS', value: false },
      { field: 'shipping.origin_retail_fulfillment_pct', operator: 'GREATER_THAN', value: 0.80 },
    ],
    tags: ['drop-shipping', 'phantom-inventory', 'arbitrage'],
    performance: { triggered: 7823, truePositives: 6258, falsePositives: 1565, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'LI-005', name: 'Condition Misrepresentation', category: 'LISTING_INTEGRITY',
    service: 'seller-listing', checkpoint: 'LISTING', severity: 'MEDIUM', score: 50, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Listing marked as "New" but images show wear indicators (scratches, opened packaging, missing seals) detected by CV model + seller has >15% SNAD rate on prior "New" listings',
    description: 'Computer vision model (YOLOv8 fine-tuned on product condition dataset) analyzes listing images for condition indicators inconsistent with stated condition.',
    conditions: [
      { field: 'listing.stated_condition', operator: 'EQUALS', value: 'NEW' },
      { field: 'listing.cv_wear_score', operator: 'GREATER_THAN', value: 0.65 },
      { field: 'seller.snad_rate_new_items', operator: 'GREATER_THAN', value: 0.15 },
    ],
    tags: ['condition-fraud', 'misrepresentation', 'CV-model'],
    performance: { triggered: 23456, truePositives: 16419, falsePositives: 7037, catchRate: 0.70, falsePositiveRate: 0.30 },
  },
  {
    id: 'LI-006', name: 'Prohibited Item Obfuscation', category: 'LISTING_INTEGRITY',
    service: 'seller-listing', checkpoint: 'LISTING', severity: 'CRITICAL', score: 95, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'NLP classifier detects prohibited item code words (e.g., "vitamin S" for steroids, "party supplies" for drugs, "self-defense tool" for weapons) with confidence >0.85 + seller account flagged for prior prohibited item removals',
    description: 'Multi-modal classifier (text + image + category) trained on 500K+ removed listings to detect attempts to sell prohibited items using euphemisms and obfuscation.',
    conditions: [
      { field: 'listing.prohibited_nlp_score', operator: 'GREATER_THAN', value: 0.85 },
      { field: 'seller.prior_prohibited_removals', operator: 'GREATER_THAN', value: 0 },
    ],
    tags: ['prohibited-items', 'compliance', 'NLP-model'],
    performance: { triggered: 5678, truePositives: 5394, falsePositives: 284, catchRate: 0.95, falsePositiveRate: 0.05 },
  },
  {
    id: 'LI-007', name: 'Price Anchoring Manipulation', category: 'LISTING_INTEGRITY',
    service: 'pricing', checkpoint: 'LISTING', severity: 'MEDIUM', score: 40, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Listed "original price" is >3× the actual MSRP/market price for the item + "discount" badge shown to buyers + no verifiable source for original price claim',
    description: 'Compares listed original/compare-at prices against manufacturer MSRP databases and rolling 90-day market median. Prevents deceptive discount marketing.',
    conditions: [
      { field: 'listing.original_price_vs_msrp', operator: 'GREATER_THAN', value: 3.0 },
      { field: 'listing.discount_badge_shown', operator: 'EQUALS', value: true },
    ],
    tags: ['price-manipulation', 'deceptive-marketing', 'consumer-protection'],
    performance: { triggered: 67890, truePositives: 47523, falsePositives: 20367, catchRate: 0.70, falsePositiveRate: 0.30 },
  },
  {
    id: 'LI-008', name: 'Listing Hijack — ASIN/UPC Mismatch', category: 'LISTING_INTEGRITY',
    service: 'item-setup', checkpoint: 'LISTING', severity: 'HIGH', score: 70, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Listed UPC/EAN resolves to a different product than described + listing attached to high-traffic product page + seller\'s actual inventory (per image analysis) doesn\'t match catalog item',
    description: 'Detects sellers attaching inferior or counterfeit products to established high-traffic product listings by mismatching UPC/ASIN identifiers.',
    conditions: [
      { field: 'listing.upc_product_match', operator: 'EQUALS', value: false },
      { field: 'listing.parent_page_traffic_rank', operator: 'LESS_THAN', value: 10000 },
      { field: 'listing.image_vs_catalog_similarity', operator: 'LESS_THAN', value: 0.50 },
    ],
    tags: ['listing-hijack', 'catalog-fraud', 'UPC-mismatch'],
    performance: { triggered: 4567, truePositives: 3653, falsePositives: 914, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'LI-009', name: 'Variant Bait-and-Switch', category: 'LISTING_INTEGRITY',
    service: 'seller-listing', checkpoint: 'LISTING', severity: 'HIGH', score: 65, action: 'REVIEW',
    status: 'SHADOW',
    trigger: 'Listing variant added to popular parent listing but variant\'s weight/dimensions/price differ >40% from parent + variant images show visually different product + variant added by different seller',
    description: 'Detects abuse of listing variant system where sellers add unrelated products as "variants" of popular listings to capture organic traffic.',
    conditions: [
      { field: 'variant.price_deviation_from_parent', operator: 'GREATER_THAN', value: 0.40 },
      { field: 'variant.image_similarity_to_parent', operator: 'LESS_THAN', value: 0.30 },
      { field: 'variant.seller_id', operator: 'NOT_EQUALS', value: 'parent.seller_id' },
    ],
    tags: ['variant-abuse', 'bait-switch', 'listing-manipulation'],
    performance: { triggered: 3456, truePositives: 2418, falsePositives: 1038, catchRate: 0.70, falsePositiveRate: 0.30 },
  },
  {
    id: 'LI-010', name: 'Review Seeding — Incentivized Reviews', category: 'LISTING_INTEGRITY',
    service: 'review-integrity', checkpoint: 'CONTINUOUS', severity: 'MEDIUM', score: 50, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Listing receives >10 5-star reviews in 48hrs + >60% of reviewers have <5 total reviews on platform + review text sentiment homogeneity score >0.85 + reviewer accounts created in same 30-day window',
    description: 'Detects coordinated review campaigns using temporal clustering, reviewer account age analysis, and text similarity scoring across reviews.',
    conditions: [
      { field: 'reviews.five_star_48h', operator: 'GREATER_THAN', value: 10 },
      { field: 'reviews.new_reviewer_pct', operator: 'GREATER_THAN', value: 0.60 },
      { field: 'reviews.text_similarity_score', operator: 'GREATER_THAN', value: 0.85 },
    ],
    tags: ['fake-reviews', 'review-manipulation', 'NLP'],
    performance: { triggered: 12345, truePositives: 9876, falsePositives: 2469, catchRate: 0.80, falsePositiveRate: 0.20 },
  },

  // ============================================================
  // CATEGORY 3: TRANSACTION & BIDDING MANIPULATION (20 rules)
  // ============================================================
  {
    id: 'TM-001', name: 'Shill Bidding — Connected Bidders', category: 'TRANSACTION_MANIPULATION',
    service: 'transaction-processing', checkpoint: 'BIDDING', severity: 'CRITICAL', score: 90, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Bidder shares device/IP/payment with seller + bid placed in final 10% of auction duration + bidder has bid on >5 of this seller\'s auctions in 30 days + bidder never wins (always outbid by 1 increment)',
    description: 'Graph analysis identifies bidder-seller connections across identity signals. Temporal analysis of bid patterns reveals price inflation behavior.',
    conditions: [
      { field: 'bidder.identity_overlap_with_seller', operator: 'GREATER_THAN', value: 0 },
      { field: 'bid.timing_pct_of_auction', operator: 'GREATER_THAN', value: 0.90 },
      { field: 'bidder.bids_on_seller_30d', operator: 'GREATER_THAN', value: 5 },
      { field: 'bidder.win_rate_this_seller', operator: 'EQUALS', value: 0 },
    ],
    tags: ['shill-bidding', 'auction-fraud', 'price-manipulation'],
    performance: { triggered: 6789, truePositives: 6110, falsePositives: 679, catchRate: 0.90, falsePositiveRate: 0.10 },
  },
  {
    id: 'TM-002', name: 'Bid Shielding', category: 'TRANSACTION_MANIPULATION',
    service: 'transaction-processing', checkpoint: 'BIDDING', severity: 'HIGH', score: 75, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'High bid placed by Account A, then retracted within final 5 minutes + winning bid goes to Account B at much lower price + A and B share identity signals (IP/device/cookie) or have transacted before',
    description: 'Detects coordinated bid-retract-win pattern where accomplice places high bid to discourage others, then retracts to let partner win cheaply.',
    conditions: [
      { field: 'bid.retracted_in_final_minutes', operator: 'LESS_THAN', value: 5 },
      { field: 'bid.retracted_amount_vs_winner', operator: 'GREATER_THAN', value: 2.0 },
      { field: 'accounts.identity_overlap_a_b', operator: 'GREATER_THAN', value: 0 },
    ],
    tags: ['bid-shielding', 'auction-fraud', 'coordinated'],
    performance: { triggered: 2345, truePositives: 1876, falsePositives: 469, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'TM-003', name: 'Off-Platform Transaction Diversion', category: 'TRANSACTION_MANIPULATION',
    service: 'transaction-processing', checkpoint: 'TRANSACTION', severity: 'CRITICAL', score: 85, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Listing description or seller message contains: phone numbers, email addresses, external URLs (WhatsApp, Telegram, Zelle, Venmo, CashApp), or phrases like "contact me directly" or "pay outside"',
    description: 'NLP + regex detection of off-platform transaction solicitation. Detects encoded contact info (e.g., "five-five-five" for phone numbers, "at gee mail" for email).',
    conditions: [
      { field: 'listing.contains_contact_info', operator: 'EQUALS', value: true },
      { field: 'message.off_platform_payment_detected', operator: 'EQUALS', value: true },
    ],
    tags: ['fee-avoidance', 'off-platform', 'policy-violation'],
    performance: { triggered: 45678, truePositives: 41110, falsePositives: 4568, catchRate: 0.90, falsePositiveRate: 0.10 },
  },
  {
    id: 'TM-004', name: 'Wash Trading — Circular Transactions', category: 'TRANSACTION_MANIPULATION',
    service: 'transaction-processing', checkpoint: 'TRANSACTION', severity: 'CRITICAL', score: 88, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Circular payment flow detected: A→B→C→A within 72 hours + transaction amounts within ±5% of each other + no physical shipment (digital goods or tracking not validated) + accounts share identity signals',
    description: 'Graph cycle detection on transaction network identifies wash trading patterns used to inflate sales metrics, launder funds, or generate fake transaction history.',
    conditions: [
      { field: 'transaction.cycle_detected', operator: 'EQUALS', value: true },
      { field: 'transaction.cycle_amount_variance', operator: 'LESS_THAN', value: 0.05 },
      { field: 'transaction.cycle_duration_hours', operator: 'LESS_THAN', value: 72 },
    ],
    tags: ['wash-trading', 'money-laundering', 'graph-detection'],
    performance: { triggered: 1234, truePositives: 1086, falsePositives: 148, catchRate: 0.88, falsePositiveRate: 0.12 },
  },
  {
    id: 'TM-005', name: 'Buy Box Manipulation — Price Cycling', category: 'TRANSACTION_MANIPULATION',
    service: 'pricing', checkpoint: 'LISTING', severity: 'MEDIUM', score: 55, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Seller adjusts price >20 times in 24 hours on same listing + price oscillates in pattern suggesting algorithmic buy box targeting + competitor\'s prices change within 60 seconds of seller\'s change',
    description: 'Detects aggressive repricing algorithms designed to capture buy box through rapid price cycling rather than genuine competitive pricing.',
    conditions: [
      { field: 'listing.price_changes_24h', operator: 'GREATER_THAN', value: 20 },
      { field: 'listing.price_oscillation_pattern', operator: 'EQUALS', value: true },
      { field: 'competitor.reaction_time_seconds', operator: 'LESS_THAN', value: 60 },
    ],
    tags: ['price-cycling', 'buy-box', 'algorithmic-abuse'],
    performance: { triggered: 8901, truePositives: 5340, falsePositives: 3561, catchRate: 0.60, falsePositiveRate: 0.40 },
  },
  {
    id: 'TM-006', name: 'Gift Card Laundering Pipeline', category: 'TRANSACTION_MANIPULATION',
    service: 'transaction-processing', checkpoint: 'TRANSACTION', severity: 'CRITICAL', score: 92, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Buyer purchases >$2,000 in gift cards in single session + uses multiple different payment methods + ships to address different from billing + account age <30 days + IP is VPN/proxy',
    description: 'Detects rapid gift card purchasing patterns typical of carding operations. Gift cards are preferred by fraudsters because they\'re liquid, anonymous, and non-reversible.',
    conditions: [
      { field: 'cart.gift_card_total', operator: 'GREATER_THAN', value: 2000 },
      { field: 'cart.payment_methods_count', operator: 'GREATER_THAN', value: 1 },
      { field: 'shipping.address_mismatch_billing', operator: 'EQUALS', value: true },
      { field: 'buyer.account_age_days', operator: 'LESS_THAN', value: 30 },
    ],
    tags: ['gift-card-fraud', 'carding', 'money-laundering'],
    performance: { triggered: 4567, truePositives: 4110, falsePositives: 457, catchRate: 0.90, falsePositiveRate: 0.10 },
  },
  {
    id: 'TM-007', name: 'Feedback Extortion', category: 'TRANSACTION_MANIPULATION',
    service: 'transaction-processing', checkpoint: 'CONTINUOUS', severity: 'HIGH', score: 70, action: 'REVIEW',
    status: 'SHADOW',
    trigger: 'Buyer sends message threatening negative feedback unless seller provides refund/discount beyond policy + pattern of buyer leaving negative feedback then reversing after concession + buyer has >3 similar cases in 90 days',
    description: 'NLP analysis of buyer-seller messages to detect extortion patterns. Correlates with feedback history and refund patterns to identify serial extortionists.',
    conditions: [
      { field: 'message.threat_nlp_score', operator: 'GREATER_THAN', value: 0.80 },
      { field: 'buyer.feedback_extortion_pattern_90d', operator: 'GREATER_THAN', value: 3 },
    ],
    tags: ['feedback-extortion', 'buyer-abuse', 'NLP'],
    performance: { triggered: 3456, truePositives: 2764, falsePositives: 692, catchRate: 0.80, falsePositiveRate: 0.20 },
  },

  // ============================================================
  // CATEGORY 4: FULFILLMENT & SHIPPING FRAUD (18 rules)
  // ============================================================
  {
    id: 'FF-001', name: 'Empty Box / Wrong Item — Weight Discrepancy', category: 'FULFILLMENT_FRAUD',
    service: 'seller-shipping', checkpoint: 'SHIPPING', severity: 'HIGH', score: 78, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Shipped package weight is <40% of expected weight for item category + seller has >3 "item not as described" claims in 60 days + carrier scan shows delivered but buyer disputes',
    description: 'Compares actual carrier-recorded package weight against category-specific expected weight ranges (from product catalog database). Weight discrepancy is strongest predictor of wrong-item fraud.',
    conditions: [
      { field: 'shipping.actual_weight_vs_expected', operator: 'LESS_THAN', value: 0.40 },
      { field: 'seller.snad_claims_60d', operator: 'GREATER_THAN', value: 3 },
      { field: 'shipping.delivery_confirmed', operator: 'EQUALS', value: true },
    ],
    tags: ['empty-box', 'wrong-item', 'weight-analysis'],
    performance: { triggered: 5678, truePositives: 4542, falsePositives: 1136, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'FF-002', name: 'Tracking Number Recycling', category: 'FULFILLMENT_FRAUD',
    service: 'seller-shipping', checkpoint: 'SHIPPING', severity: 'CRITICAL', score: 90, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Tracking number was previously used for a different transaction + tracking shows delivery date before current order date + tracking destination doesn\'t match buyer\'s shipping address',
    description: 'Cross-references tracking numbers against historical shipment database to detect reuse of old delivered tracking numbers to fraudulently show "delivery confirmation."',
    conditions: [
      { field: 'tracking.previously_used', operator: 'EQUALS', value: true },
      { field: 'tracking.delivery_date', operator: 'BEFORE', value: 'order.created_date' },
      { field: 'tracking.destination_zip', operator: 'NOT_EQUALS', value: 'buyer.shipping_zip' },
    ],
    tags: ['tracking-fraud', 'delivery-fraud', 'recycled-tracking'],
    performance: { triggered: 2345, truePositives: 2228, falsePositives: 117, catchRate: 0.95, falsePositiveRate: 0.05 },
  },
  {
    id: 'FF-003', name: 'Triangulation Fraud', category: 'FULFILLMENT_FRAUD',
    service: 'seller-shipping', checkpoint: 'SHIPPING', severity: 'HIGH', score: 72, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Tracking origin is a major retailer\'s fulfillment center (Amazon, Walmart, Target) + seller has no verified warehouse + item purchased from retailer within 24hrs of marketplace sale + buyer receives retail packaging with different receipt',
    description: 'Detects triangulation scheme: fraudster buys from Retailer A with stolen card, ships to marketplace Buyer B. Buyer B gets legitimate item but Retailer A gets chargeback. Seller pockets marketplace payment.',
    conditions: [
      { field: 'shipping.origin_is_retail_fc', operator: 'EQUALS', value: true },
      { field: 'seller.verified_warehouse', operator: 'EQUALS', value: false },
      { field: 'shipping.retail_purchase_timing_hours', operator: 'LESS_THAN', value: 24 },
    ],
    tags: ['triangulation', 'retail-fraud', 'stolen-card'],
    performance: { triggered: 6789, truePositives: 5431, falsePositives: 1358, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'FF-004', name: 'Delivery Address Manipulation — Neighbor Delivery', category: 'FULFILLMENT_FRAUD',
    service: 'seller-shipping', checkpoint: 'SHIPPING', severity: 'MEDIUM', score: 55, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Package delivered to address within 0.3 miles of buyer address but not exact match + seller claims delivered but buyer disputes + carrier GPS confirms delivery at different location',
    description: 'Detects sellers shipping to nearby addresses (their own or accomplice) instead of buyer\'s actual address, exploiting carrier "delivered" confirmation by proximity.',
    conditions: [
      { field: 'shipping.delivery_distance_from_buyer_miles', operator: 'GREATER_THAN', value: 0 },
      { field: 'shipping.delivery_distance_from_buyer_miles', operator: 'LESS_THAN', value: 0.3 },
      { field: 'buyer.dispute_filed', operator: 'EQUALS', value: true },
    ],
    tags: ['delivery-manipulation', 'address-fraud', 'GPS-verification'],
    performance: { triggered: 4567, truePositives: 2740, falsePositives: 1827, catchRate: 0.60, falsePositiveRate: 0.40 },
  },
  {
    id: 'FF-005', name: 'Shipping Label Created But Never Shipped', category: 'FULFILLMENT_FRAUD',
    service: 'seller-shipping', checkpoint: 'SHIPPING', severity: 'HIGH', score: 65, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Shipping label purchased/created >5 days ago + no carrier acceptance scan + seller marked as "shipped" + multiple buyers waiting for same seller\'s shipments + seller withdrew funds from payout account',
    description: 'Detects sellers who create labels to trigger "shipped" status and unlock payout, but never actually ship items. Often precedes account abandonment.',
    conditions: [
      { field: 'shipping.label_age_days', operator: 'GREATER_THAN', value: 5 },
      { field: 'shipping.carrier_acceptance_scan', operator: 'EQUALS', value: false },
      { field: 'seller.pending_shipments_count', operator: 'GREATER_THAN', value: 3 },
      { field: 'seller.payout_withdrawn_before_delivery', operator: 'EQUALS', value: true },
    ],
    tags: ['label-fraud', 'never-shipped', 'payout-fraud'],
    performance: { triggered: 3456, truePositives: 2764, falsePositives: 692, catchRate: 0.80, falsePositiveRate: 0.20 },
  },

  // ============================================================
  // CATEGORY 5: BUYER ABUSE & FRIENDLY FRAUD (20 rules)
  // ============================================================
  {
    id: 'BA-001', name: 'Serial INR Abuser', category: 'BUYER_ABUSE',
    service: 'returns', checkpoint: 'RETURNS', severity: 'HIGH', score: 80, action: 'RESTRICT',
    status: 'ACTIVE',
    trigger: 'Buyer filed ≥4 "Item Not Received" claims in 90 days + carrier GPS confirms delivery within 30ft of registered address for ≥75% of disputed orders + total disputed value >$500',
    description: 'Identifies buyers who systematically file false INR claims despite carrier delivery confirmation with GPS precision. Threshold calibrated against population base rate of 0.3% INR rate.',
    conditions: [
      { field: 'buyer.inr_claims_90d', operator: 'GREATER_THAN_EQUAL', value: 4 },
      { field: 'buyer.inr_with_gps_delivery_pct', operator: 'GREATER_THAN', value: 0.75 },
      { field: 'buyer.disputed_value_90d', operator: 'GREATER_THAN', value: 500 },
    ],
    tags: ['INR-abuse', 'false-claims', 'buyer-fraud'],
    performance: { triggered: 8901, truePositives: 7120, falsePositives: 1781, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'BA-002', name: 'Return Swap — Different Item Returned', category: 'BUYER_ABUSE',
    service: 'returns', checkpoint: 'RETURNS', severity: 'CRITICAL', score: 88, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Return package serial number (if available) doesn\'t match originally shipped serial + return weight differs >20% from original shipment weight + item condition on return inspection is "different item" or "damaged beyond description"',
    description: 'Detects buyers returning different (usually inferior or broken) items instead of the item they purchased. Uses serial number tracking and weight comparison.',
    conditions: [
      { field: 'return.serial_match', operator: 'EQUALS', value: false },
      { field: 'return.weight_deviation_pct', operator: 'GREATER_THAN', value: 0.20 },
      { field: 'return.inspection_result', operator: 'IN', value: ['DIFFERENT_ITEM', 'DAMAGED_BEYOND'] },
    ],
    tags: ['return-fraud', 'item-swap', 'serial-mismatch'],
    performance: { triggered: 3456, truePositives: 3110, falsePositives: 346, catchRate: 0.90, falsePositiveRate: 0.10 },
  },
  {
    id: 'BA-003', name: 'Wardrobing — Use and Return', category: 'BUYER_ABUSE',
    service: 'returns', checkpoint: 'RETURNS', severity: 'MEDIUM', score: 55, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Buyer returns >30% of purchases in last 6 months + return reasons are consistently "changed my mind" + returned items show signs of use (removed tags, worn soles, makeup stains detected by ML) + categories are apparel/accessories',
    description: 'Identifies pattern of purchasing, using briefly (events, photoshoots), then returning. ML model trained on return inspection photos detects usage indicators.',
    conditions: [
      { field: 'buyer.return_rate_6m', operator: 'GREATER_THAN', value: 0.30 },
      { field: 'buyer.return_reason_changed_mind_pct', operator: 'GREATER_THAN', value: 0.70 },
      { field: 'return.usage_indicator_ml_score', operator: 'GREATER_THAN', value: 0.65 },
    ],
    tags: ['wardrobing', 'return-abuse', 'fashion-fraud'],
    performance: { triggered: 12345, truePositives: 8641, falsePositives: 3704, catchRate: 0.70, falsePositiveRate: 0.30 },
  },
  {
    id: 'BA-004', name: 'Friendly Fraud — Chargeback After Delivery', category: 'BUYER_ABUSE',
    service: 'payment-processing', checkpoint: 'PAYMENT', severity: 'CRITICAL', score: 85, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Buyer files chargeback with bank claiming "unauthorized transaction" + buyer was logged in from known device at time of purchase + item confirmed delivered with signature + no prior contact to seller or platform for resolution',
    description: 'Detects first-party fraud where legitimate buyers file false chargebacks. Cross-references device authentication, delivery confirmation, and resolution attempt history.',
    conditions: [
      { field: 'chargeback.reason', operator: 'EQUALS', value: 'UNAUTHORIZED' },
      { field: 'buyer.known_device_at_purchase', operator: 'EQUALS', value: true },
      { field: 'shipping.signature_confirmed', operator: 'EQUALS', value: true },
      { field: 'buyer.resolution_attempts_before_chargeback', operator: 'EQUALS', value: 0 },
    ],
    tags: ['friendly-fraud', 'chargeback', 'first-party-fraud'],
    performance: { triggered: 6789, truePositives: 5770, falsePositives: 1019, catchRate: 0.85, falsePositiveRate: 0.15 },
  },
  {
    id: 'BA-005', name: 'SNAD Exploitation — Serial Complainer', category: 'BUYER_ABUSE',
    service: 'returns', checkpoint: 'RETURNS', severity: 'HIGH', score: 70, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Buyer filed ≥5 SNAD claims in 120 days + wins >80% of claims + average seller rating for disputed sellers is >4.8 stars (indicating buyer is outlier, not sellers) + buyer keeps items in >60% of cases (partial refund)',
    description: 'Identifies buyers gaming SNAD (Significantly Not As Described) policy to obtain partial refunds while keeping items. High claim rate against high-rated sellers is strong signal.',
    conditions: [
      { field: 'buyer.snad_claims_120d', operator: 'GREATER_THAN_EQUAL', value: 5 },
      { field: 'buyer.snad_win_rate', operator: 'GREATER_THAN', value: 0.80 },
      { field: 'buyer.disputed_seller_avg_rating', operator: 'GREATER_THAN', value: 4.8 },
      { field: 'buyer.keeps_item_pct', operator: 'GREATER_THAN', value: 0.60 },
    ],
    tags: ['SNAD-abuse', 'serial-complainer', 'partial-refund'],
    performance: { triggered: 5678, truePositives: 4542, falsePositives: 1136, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'BA-006', name: 'Coupon Stacking / Promo Abuse', category: 'BUYER_ABUSE',
    service: 'transaction-processing', checkpoint: 'TRANSACTION', severity: 'MEDIUM', score: 45, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Buyer applies >2 promotional codes to single order + total discount exceeds 50% + buyer created account within 7 days (new account promo) + same payment method used across 3+ accounts',
    description: 'Detects exploitation of promotional offers through multiple accounts, coupon stacking beyond policy limits, and systematic new-account bonus harvesting.',
    conditions: [
      { field: 'order.promo_codes_applied', operator: 'GREATER_THAN', value: 2 },
      { field: 'order.total_discount_pct', operator: 'GREATER_THAN', value: 0.50 },
      { field: 'payment.card_linked_accounts', operator: 'GREATER_THAN', value: 3 },
    ],
    tags: ['promo-abuse', 'coupon-fraud', 'multi-account'],
    performance: { triggered: 23456, truePositives: 14073, falsePositives: 9383, catchRate: 0.60, falsePositiveRate: 0.40 },
  },

  // ============================================================
  // CATEGORY 6: PAYMENT FRAUD & MONEY LAUNDERING (20 rules)
  // ============================================================
  {
    id: 'PF-001', name: 'Card Testing — Micro-Transaction Probe', category: 'PAYMENT_FRAUD',
    service: 'payment-processing', checkpoint: 'PAYMENT', severity: 'CRITICAL', score: 92, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Account makes ≥5 transactions under $2 within 10 minutes + each from different card BIN + at least 2 transactions declined + successful transaction followed by high-value purchase within 1 hour',
    description: 'Detects card testing where fraudsters validate stolen card numbers using small transactions before making large fraudulent purchases.',
    conditions: [
      { field: 'velocity.micro_txns_10min', operator: 'GREATER_THAN_EQUAL', value: 5 },
      { field: 'velocity.unique_bins_10min', operator: 'GREATER_THAN', value: 3 },
      { field: 'velocity.declined_in_sequence', operator: 'GREATER_THAN_EQUAL', value: 2 },
    ],
    tags: ['card-testing', 'carding', 'stolen-cards'],
    performance: { triggered: 8901, truePositives: 8366, falsePositives: 535, catchRate: 0.94, falsePositiveRate: 0.06 },
  },
  {
    id: 'PF-002', name: 'BIN Attack — Sequential Card Numbers', category: 'PAYMENT_FRAUD',
    service: 'payment-processing', checkpoint: 'PAYMENT', severity: 'CRITICAL', score: 95, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Payment attempts from same device/IP use card numbers with sequential last 4 digits (e.g., ...4501, ...4502, ...4503) OR same BIN with >10 different card numbers in 1 hour',
    description: 'Detects BIN attacks where fraudsters use card number generators to enumerate valid card numbers within a Bank Identification Number range.',
    conditions: [
      { field: 'payment.sequential_card_pattern', operator: 'EQUALS', value: true },
      { field: 'payment.unique_cards_same_bin_1h', operator: 'GREATER_THAN', value: 10 },
    ],
    tags: ['BIN-attack', 'enumeration', 'card-generation'],
    performance: { triggered: 3456, truePositives: 3387, falsePositives: 69, catchRate: 0.98, falsePositiveRate: 0.02 },
  },
  {
    id: 'PF-003', name: 'Structuring — Smurfing Detection', category: 'PAYMENT_FRAUD',
    service: 'compliance-aml', checkpoint: 'PAYOUT', severity: 'CRITICAL', score: 88, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Seller processes multiple transactions deliberately kept below $10,000 BSA reporting threshold + cumulative 24hr total >$25,000 + transactions are round numbers or cluster just below $9,999 + payout requested immediately',
    description: 'Detects structuring (smurfing) to avoid Bank Secrecy Act reporting requirements. Analyzes transaction amount clustering relative to reporting thresholds.',
    conditions: [
      { field: 'transactions.max_amount_24h', operator: 'LESS_THAN', value: 10000 },
      { field: 'transactions.cumulative_24h', operator: 'GREATER_THAN', value: 25000 },
      { field: 'transactions.near_threshold_pct', operator: 'GREATER_THAN', value: 0.50 },
    ],
    tags: ['structuring', 'BSA', 'AML', 'smurfing'],
    performance: { triggered: 1234, truePositives: 1086, falsePositives: 148, catchRate: 0.88, falsePositiveRate: 0.12 },
  },
  {
    id: 'PF-004', name: 'Mule Account — Rapid Fund Pass-Through', category: 'PAYMENT_FRAUD',
    service: 'seller-payout', checkpoint: 'PAYOUT', severity: 'CRITICAL', score: 90, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Account receives >$5,000 in payments within 48hrs of creation + immediately requests payout to bank account + bank account was added <24hrs ago + no legitimate inventory or shipping activity',
    description: 'Identifies money mule accounts used to launder proceeds from other fraud. Key indicators: rapid inflow, immediate outflow, no genuine commerce activity.',
    conditions: [
      { field: 'account.payment_inflow_48h', operator: 'GREATER_THAN', value: 5000 },
      { field: 'account.payout_requested_within_hours', operator: 'LESS_THAN', value: 48 },
      { field: 'account.bank_added_hours_ago', operator: 'LESS_THAN', value: 24 },
      { field: 'account.legitimate_commerce_score', operator: 'LESS_THAN', value: 0.10 },
    ],
    tags: ['money-mule', 'laundering', 'rapid-cashout'],
    performance: { triggered: 2345, truePositives: 2228, falsePositives: 117, catchRate: 0.95, falsePositiveRate: 0.05 },
  },
  {
    id: 'PF-005', name: 'Stolen Payment Instrument — Velocity + Geography', category: 'PAYMENT_FRAUD',
    service: 'payment-processing', checkpoint: 'PAYMENT', severity: 'HIGH', score: 78, action: 'CHALLENGE',
    status: 'ACTIVE',
    trigger: 'Payment card used from IP in different country than card issuer country + device fingerprint not previously associated with card + transaction amount >$300 + shipping to forwarding address or PO Box',
    description: 'Multi-signal stolen card detection combining geographic mismatch, device novelty, transaction size, and shipping address risk indicators.',
    conditions: [
      { field: 'payment.ip_country', operator: 'NOT_EQUALS', value: 'payment.card_issuer_country' },
      { field: 'payment.device_card_association', operator: 'EQUALS', value: false },
      { field: 'transaction.amount', operator: 'GREATER_THAN', value: 300 },
      { field: 'shipping.is_forwarding_address', operator: 'EQUALS', value: true },
    ],
    tags: ['stolen-card', 'geo-mismatch', 'forwarding-address'],
    performance: { triggered: 34567, truePositives: 27653, falsePositives: 6914, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'PF-006', name: 'Crypto Purchase Layering', category: 'PAYMENT_FRAUD',
    service: 'compliance-aml', checkpoint: 'TRANSACTION', severity: 'HIGH', score: 75, action: 'REVIEW',
    status: 'SHADOW',
    trigger: 'Buyer purchases high-liquidity items (electronics, gift cards) + pays with prepaid card or digital wallet funded by crypto exchange + ships to commercial address + account has minimal purchase history',
    description: 'Detects crypto-to-goods layering where proceeds from illicit crypto activities are converted to physical goods for resale.',
    conditions: [
      { field: 'payment.source_type', operator: 'IN', value: ['PREPAID', 'CRYPTO_WALLET', 'DIGITAL_WALLET'] },
      { field: 'item.liquidity_score', operator: 'GREATER_THAN', value: 0.80 },
      { field: 'shipping.address_type', operator: 'EQUALS', value: 'COMMERCIAL' },
    ],
    tags: ['crypto-laundering', 'layering', 'high-liquidity'],
    performance: { triggered: 2345, truePositives: 1641, falsePositives: 704, catchRate: 0.70, falsePositiveRate: 0.30 },
  },

  // ============================================================
  // CATEGORY 7: ACCOUNT TAKEOVER (15 rules)
  // ============================================================
  {
    id: 'ATO-001', name: 'Credential Stuffing — Burst Login Failures', category: 'ACCOUNT_TAKEOVER',
    service: 'seller-ato', checkpoint: 'ACCOUNT_CHANGE', severity: 'CRITICAL', score: 90, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'IP/subnet generates >50 failed login attempts in 5 minutes across different accounts + successful login follows failed burst + login timing is non-human (uniform spacing <100ms between attempts)',
    description: 'Detects automated credential stuffing attacks using breach databases. Identifies non-human timing patterns and bulk failure-then-success sequences.',
    conditions: [
      { field: 'auth.failed_attempts_ip_5min', operator: 'GREATER_THAN', value: 50 },
      { field: 'auth.success_after_burst', operator: 'EQUALS', value: true },
      { field: 'auth.avg_attempt_interval_ms', operator: 'LESS_THAN', value: 100 },
    ],
    tags: ['credential-stuffing', 'brute-force', 'automation'],
    performance: { triggered: 4567, truePositives: 4384, falsePositives: 183, catchRate: 0.96, falsePositiveRate: 0.04 },
  },
  {
    id: 'ATO-002', name: 'Session Hijack — Concurrent Access', category: 'ACCOUNT_TAKEOVER',
    service: 'seller-ato', checkpoint: 'ACCOUNT_CHANGE', severity: 'CRITICAL', score: 88, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Same session token used simultaneously from 2+ different IPs in different geographic regions (>500km apart) + one session modifies account settings (password, email, payment) while other browses normally',
    description: 'Detects real-time session hijacking by monitoring concurrent session usage from geographically impossible locations.',
    conditions: [
      { field: 'session.concurrent_ips', operator: 'GREATER_THAN', value: 1 },
      { field: 'session.ip_distance_km', operator: 'GREATER_THAN', value: 500 },
      { field: 'session.account_changes_in_session', operator: 'GREATER_THAN', value: 0 },
    ],
    tags: ['session-hijack', 'concurrent-access', 'impossible-travel'],
    performance: { triggered: 1234, truePositives: 1135, falsePositives: 99, catchRate: 0.92, falsePositiveRate: 0.08 },
  },
  {
    id: 'ATO-003', name: 'Post-Takeover Blitz — Change-Then-Transact', category: 'ACCOUNT_TAKEOVER',
    service: 'seller-ato', checkpoint: 'ACCOUNT_CHANGE', severity: 'CRITICAL', score: 95, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Password changed + shipping address added + payment method changed — all within 2 hours — followed by high-value purchase (>$500) within next hour + all changes from new device never seen before',
    description: 'Detects the hallmark ATO pattern: rapid account detail changes from new device followed immediately by high-value purchase. This "change-then-transact" blitz is the strongest ATO signal.',
    conditions: [
      { field: 'account.changes_in_2h', operator: 'GREATER_THAN_EQUAL', value: 3 },
      { field: 'account.high_value_purchase_within_3h', operator: 'EQUALS', value: true },
      { field: 'device.is_new', operator: 'EQUALS', value: true },
    ],
    tags: ['ATO', 'change-then-transact', 'blitz-pattern'],
    performance: { triggered: 3456, truePositives: 3352, falsePositives: 104, catchRate: 0.97, falsePositiveRate: 0.03 },
  },
  {
    id: 'ATO-004', name: 'SIM Swap + Login', category: 'ACCOUNT_TAKEOVER',
    service: 'seller-ato', checkpoint: 'ACCOUNT_CHANGE', severity: 'HIGH', score: 82, action: 'CHALLENGE',
    status: 'ACTIVE',
    trigger: 'Phone number on account was ported to new carrier within 72 hours + SMS 2FA code used from new device + followed by password reset or email change',
    description: 'Detects SIM swap attacks where attacker ports victim\'s phone to intercept 2FA codes. Correlates carrier port notifications with authentication events.',
    conditions: [
      { field: 'phone.ported_within_hours', operator: 'LESS_THAN', value: 72 },
      { field: 'auth.sms_2fa_new_device', operator: 'EQUALS', value: true },
      { field: 'account.password_or_email_changed', operator: 'EQUALS', value: true },
    ],
    tags: ['SIM-swap', '2FA-bypass', 'phone-takeover'],
    performance: { triggered: 1567, truePositives: 1332, falsePositives: 235, catchRate: 0.85, falsePositiveRate: 0.15 },
  },

  // ============================================================
  // CATEGORY 8: NETWORK & RING DETECTION (15 rules)
  // ============================================================
  {
    id: 'NR-001', name: 'Shill Bidding Ring — Circular Bidding', category: 'NETWORK_RINGS',
    service: 'network-intelligence', checkpoint: 'BIDDING', severity: 'CRITICAL', score: 92, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Graph analysis detects cycle: Accounts A, B, C each bid on each other\'s auctions but never bid on outsiders + ring members share ≥1 identity signal (IP subnet, payment BIN, device) + ring exists for >30 days',
    description: 'Detects organized shill bidding rings using graph cycle detection (Tarjan\'s algorithm) on bidder-seller bipartite graph, enriched with identity overlap edges.',
    conditions: [
      { field: 'graph.cycle_detected', operator: 'EQUALS', value: true },
      { field: 'graph.cycle_length', operator: 'BETWEEN', value: [3, 8] },
      { field: 'graph.members_identity_overlap', operator: 'GREATER_THAN', value: 0 },
      { field: 'graph.cycle_age_days', operator: 'GREATER_THAN', value: 30 },
    ],
    tags: ['shill-ring', 'graph-analysis', 'organized-fraud'],
    performance: { triggered: 892, truePositives: 821, falsePositives: 71, catchRate: 0.92, falsePositiveRate: 0.08 },
  },
  {
    id: 'NR-002', name: 'Feedback Manipulation Network', category: 'NETWORK_RINGS',
    service: 'review-integrity', checkpoint: 'CONTINUOUS', severity: 'HIGH', score: 78, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Group of ≥5 accounts leaving reciprocal positive feedback + accounts were created within same 14-day window + feedback transactions are minimal value ($0.99 items) + no external customers in group',
    description: 'Identifies feedback farming networks where accounts trade low-value items solely to build fake reputation. Graph clustering identifies isolated feedback communities.',
    conditions: [
      { field: 'feedback.reciprocal_group_size', operator: 'GREATER_THAN_EQUAL', value: 5 },
      { field: 'feedback.group_creation_window_days', operator: 'LESS_THAN', value: 14 },
      { field: 'feedback.avg_transaction_value', operator: 'LESS_THAN', value: 2.00 },
    ],
    tags: ['feedback-farming', 'reputation-fraud', 'network'],
    performance: { triggered: 2345, truePositives: 1876, falsePositives: 469, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'NR-003', name: 'Mule Network — Shared Infrastructure', category: 'NETWORK_RINGS',
    service: 'network-intelligence', checkpoint: 'CONTINUOUS', severity: 'CRITICAL', score: 90, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Cluster of ≥8 accounts sharing: same WiFi BSSID, or same /24 IP subnet, or same device fingerprint + accounts receive funds from external fraud sources + funds flow to common destination bank account',
    description: 'Detects organized money mule networks using community detection algorithms (Louvain) on identity-signal graph. Identifies shared infrastructure patterns across seemingly independent accounts.',
    conditions: [
      { field: 'network.cluster_size', operator: 'GREATER_THAN_EQUAL', value: 8 },
      { field: 'network.shared_infrastructure_signals', operator: 'GREATER_THAN_EQUAL', value: 2 },
      { field: 'network.common_destination_bank', operator: 'EQUALS', value: true },
    ],
    tags: ['mule-network', 'organized-crime', 'community-detection'],
    performance: { triggered: 567, truePositives: 539, falsePositives: 28, catchRate: 0.95, falsePositiveRate: 0.05 },
  },
  {
    id: 'NR-004', name: 'Seller Collusion — Shared Warehouse', category: 'NETWORK_RINGS',
    service: 'network-intelligence', checkpoint: 'CONTINUOUS', severity: 'HIGH', score: 72, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Multiple seller accounts ship from identical return address + inventory overlap >70% + pricing patterns are coordinated (simultaneous changes) + accounts were created sequentially',
    description: 'Detects a single entity operating as multiple sellers to circumvent per-seller limits, dominate search results, or continue operating after partial bans.',
    conditions: [
      { field: 'sellers.shared_return_address', operator: 'EQUALS', value: true },
      { field: 'sellers.inventory_overlap_pct', operator: 'GREATER_THAN', value: 0.70 },
      { field: 'sellers.coordinated_pricing', operator: 'EQUALS', value: true },
    ],
    tags: ['seller-collusion', 'multi-account', 'search-manipulation'],
    performance: { triggered: 3456, truePositives: 2764, falsePositives: 692, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'NR-005', name: 'Review Bombing — Coordinated Negative', category: 'NETWORK_RINGS',
    service: 'review-integrity', checkpoint: 'CONTINUOUS', severity: 'HIGH', score: 70, action: 'REVIEW',
    status: 'SHADOW',
    trigger: 'Seller receives >10 1-star reviews in 48hrs + reviewer accounts have minimal prior platform activity + reviews posted in temporal burst (>5 within 1 hour) + review text shows coordinated language patterns',
    description: 'Detects coordinated negative review campaigns targeting competitor sellers. Uses temporal anomaly detection and NLP text similarity to identify inauthentic reviews.',
    conditions: [
      { field: 'reviews.one_star_48h', operator: 'GREATER_THAN', value: 10 },
      { field: 'reviews.reviewer_avg_activity_score', operator: 'LESS_THAN', value: 0.20 },
      { field: 'reviews.temporal_burst_1h', operator: 'GREATER_THAN', value: 5 },
    ],
    tags: ['review-bombing', 'competitor-sabotage', 'coordinated'],
    performance: { triggered: 1234, truePositives: 864, falsePositives: 370, catchRate: 0.70, falsePositiveRate: 0.30 },
  },

  // ============================================================
  // CATEGORY 9: POLICY & PLATFORM ABUSE (15 rules)
  // ============================================================
  {
    id: 'PA-001', name: 'Referral Fraud — Self-Referral Chain', category: 'POLICY_ABUSE',
    service: 'seller-onboarding', checkpoint: 'ONBOARDING', severity: 'HIGH', score: 70, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'New account created via referral link + referrer and referee share device fingerprint or IP + referee makes minimum qualifying purchase within 1 hour + pattern repeats >3 times from same referrer',
    description: 'Detects self-referral fraud where users create multiple accounts to earn referral bonuses. Tracks identity signal overlap between referrer and referee.',
    conditions: [
      { field: 'referral.referrer_referee_identity_overlap', operator: 'GREATER_THAN', value: 0 },
      { field: 'referral.qualifying_purchase_within_hours', operator: 'LESS_THAN', value: 1 },
      { field: 'referral.referrer_chain_length', operator: 'GREATER_THAN', value: 3 },
    ],
    tags: ['referral-fraud', 'self-referral', 'bonus-abuse'],
    performance: { triggered: 5678, truePositives: 4542, falsePositives: 1136, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'PA-002', name: 'Tax Threshold GMV Splitting', category: 'POLICY_ABUSE',
    service: 'compliance-aml', checkpoint: 'CONTINUOUS', severity: 'MEDIUM', score: 50, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Seller GMV approaches $20,000 1099-K threshold + creates second account + shifts new listings to second account + both accounts share device/IP/bank + combined GMV exceeds threshold',
    description: 'Detects sellers splitting sales across multiple accounts to stay below tax reporting thresholds (currently $600 for 1099-K). Graph analysis identifies linked accounts.',
    conditions: [
      { field: 'seller.gmv_ytd', operator: 'BETWEEN', value: [18000, 20000] },
      { field: 'seller.linked_accounts_by_identity', operator: 'GREATER_THAN', value: 0 },
      { field: 'seller.combined_gmv_linked', operator: 'GREATER_THAN', value: 20000 },
    ],
    tags: ['tax-evasion', 'GMV-splitting', '1099-K'],
    performance: { triggered: 8901, truePositives: 5340, falsePositives: 3561, catchRate: 0.60, falsePositiveRate: 0.40 },
  },
  {
    id: 'PA-003', name: 'Seller Metrics Gaming — Cancel to Protect Rating', category: 'POLICY_ABUSE',
    service: 'policy-enforcement', checkpoint: 'TRANSACTION', severity: 'MEDIUM', score: 40, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Seller cancels >10% of orders + cancellation reasons are "buyer requested" but no buyer message requesting cancellation exists + cancellations correlate with orders that would have late shipping',
    description: 'Detects sellers falsely attributing cancellations to buyers to protect seller metrics. Cross-references cancellation reasons with actual buyer communication records.',
    conditions: [
      { field: 'seller.cancellation_rate_30d', operator: 'GREATER_THAN', value: 0.10 },
      { field: 'seller.false_buyer_cancel_pct', operator: 'GREATER_THAN', value: 0.50 },
      { field: 'seller.late_ship_correlation', operator: 'GREATER_THAN', value: 0.70 },
    ],
    tags: ['metrics-gaming', 'false-cancellation', 'seller-abuse'],
    performance: { triggered: 12345, truePositives: 8641, falsePositives: 3704, catchRate: 0.70, falsePositiveRate: 0.30 },
  },
  {
    id: 'PA-004', name: 'Search Rank Manipulation — Fake Sales Velocity', category: 'POLICY_ABUSE',
    service: 'policy-enforcement', checkpoint: 'CONTINUOUS', severity: 'HIGH', score: 65, action: 'REVIEW',
    status: 'SHADOW',
    trigger: 'Listing shows spike in sales velocity (>10× baseline) + >50% of buyers are new accounts with no subsequent platform activity + transaction values cluster at minimum threshold + search ranking improved significantly post-spike',
    description: 'Detects artificial sales velocity to manipulate search ranking algorithms. Identifies fake buyer accounts making minimum purchases to boost listing visibility.',
    conditions: [
      { field: 'listing.sales_velocity_vs_baseline', operator: 'GREATER_THAN', value: 10 },
      { field: 'listing.new_buyer_pct', operator: 'GREATER_THAN', value: 0.50 },
      { field: 'listing.search_rank_improvement_pct', operator: 'GREATER_THAN', value: 50 },
    ],
    tags: ['search-manipulation', 'fake-velocity', 'ranking-fraud'],
    performance: { triggered: 2345, truePositives: 1641, falsePositives: 704, catchRate: 0.70, falsePositiveRate: 0.30 },
  },

  // ============================================================
  // CATEGORY 10: VELOCITY & BEHAVIORAL ANOMALIES (20 rules)
  // ============================================================
  {
    id: 'VB-001', name: 'Listing Flood — New Seller Anomaly', category: 'VELOCITY_BEHAVIORAL',
    service: 'seller-listing', checkpoint: 'LISTING', severity: 'HIGH', score: 72, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'New seller (<14 days) creates >100 listings in 24 hours + listings span >5 categories + average listing price >$200 + seller has 0 completed sales + listings use templated descriptions (>80% text similarity)',
    description: 'Detects new accounts mass-uploading listings, typically indicating inventory they don\'t have (phantom inventory) or upcoming counterfeit operation.',
    conditions: [
      { field: 'seller.account_age_days', operator: 'LESS_THAN', value: 14 },
      { field: 'seller.listings_24h', operator: 'GREATER_THAN', value: 100 },
      { field: 'seller.listing_categories', operator: 'GREATER_THAN', value: 5 },
      { field: 'seller.completed_sales', operator: 'EQUALS', value: 0 },
    ],
    tags: ['listing-flood', 'new-seller', 'phantom-inventory'],
    performance: { triggered: 5678, truePositives: 4542, falsePositives: 1136, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'VB-002', name: 'Payout Velocity Spike', category: 'VELOCITY_BEHAVIORAL',
    service: 'seller-payout', checkpoint: 'PAYOUT', severity: 'CRITICAL', score: 85, action: 'HOLD',
    status: 'ACTIVE',
    trigger: 'Seller requests payout >5× their average monthly payout + request made within 48hrs of large sales spike + buyer accounts for those sales show low trust scores + seller account shows recent changes (email, bank)',
    description: 'Detects sellers attempting to cash out quickly after suspicious sales spike. Payout hold prevents fund exfiltration while investigation occurs.',
    conditions: [
      { field: 'payout.amount_vs_monthly_avg', operator: 'GREATER_THAN', value: 5.0 },
      { field: 'payout.hours_since_sales_spike', operator: 'LESS_THAN', value: 48 },
      { field: 'payout.buyer_avg_trust_score', operator: 'LESS_THAN', value: 0.40 },
    ],
    tags: ['cashout-velocity', 'payout-fraud', 'hold'],
    performance: { triggered: 3456, truePositives: 2937, falsePositives: 519, catchRate: 0.85, falsePositiveRate: 0.15 },
  },
  {
    id: 'VB-003', name: 'Behavioral Biometrics — Bot Detection', category: 'VELOCITY_BEHAVIORAL',
    service: 'behavioral-analytics', checkpoint: 'CONTINUOUS', severity: 'HIGH', score: 75, action: 'CHALLENGE',
    status: 'ACTIVE',
    trigger: 'Session shows non-human interaction patterns: uniform mouse movement speed, no hover/hesitation on form fields, keystroke timing with <5ms variance, form completed in <10% of average human time',
    description: 'Behavioral biometrics model analyzes mouse dynamics, keystroke timing, scroll patterns, and form interaction speed to distinguish human users from automated bots.',
    conditions: [
      { field: 'biometrics.mouse_speed_variance', operator: 'LESS_THAN', value: 0.05 },
      { field: 'biometrics.keystroke_variance_ms', operator: 'LESS_THAN', value: 5 },
      { field: 'biometrics.form_completion_vs_avg', operator: 'LESS_THAN', value: 0.10 },
    ],
    tags: ['bot-detection', 'behavioral-biometrics', 'automation'],
    performance: { triggered: 23456, truePositives: 18765, falsePositives: 4691, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'VB-004', name: 'Geographic Impossible Travel', category: 'VELOCITY_BEHAVIORAL',
    service: 'seller-ato', checkpoint: 'CONTINUOUS', severity: 'HIGH', score: 78, action: 'CHALLENGE',
    status: 'ACTIVE',
    trigger: 'Two authenticated actions from IPs >1,000km apart within 30 minutes (speed >2,000 km/hr required, exceeding commercial aviation) + neither IP is a known VPN/proxy',
    description: 'Detects physically impossible travel between authenticated sessions. Excludes VPN/proxy IPs and allows for airport WiFi transitions. Calculates required travel speed.',
    conditions: [
      { field: 'auth.ip_distance_km', operator: 'GREATER_THAN', value: 1000 },
      { field: 'auth.time_between_actions_min', operator: 'LESS_THAN', value: 30 },
      { field: 'auth.required_speed_kmh', operator: 'GREATER_THAN', value: 2000 },
      { field: 'auth.either_ip_is_vpn', operator: 'EQUALS', value: false },
    ],
    tags: ['impossible-travel', 'geo-anomaly', 'ATO'],
    performance: { triggered: 4567, truePositives: 3653, falsePositives: 914, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'VB-005', name: 'Night Owl Pattern — Off-Hours Surge', category: 'VELOCITY_BEHAVIORAL',
    service: 'behavioral-analytics', checkpoint: 'TRANSACTION', severity: 'MEDIUM', score: 45, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Account that historically transacts 9am-9pm suddenly makes >$1,000 in purchases between 1am-5am local time + from new device + shipping to new address + high-value easily resalable items (electronics, gift cards)',
    description: 'Detects unusual time-of-day transaction patterns relative to account\'s established behavioral baseline. Strongest when combined with device and address novelty.',
    conditions: [
      { field: 'transaction.hour_local', operator: 'BETWEEN', value: [1, 5] },
      { field: 'account.historical_off_hours_pct', operator: 'LESS_THAN', value: 0.05 },
      { field: 'transaction.total_off_hours', operator: 'GREATER_THAN', value: 1000 },
      { field: 'device.is_new', operator: 'EQUALS', value: true },
    ],
    tags: ['time-anomaly', 'behavioral-baseline', 'off-hours'],
    performance: { triggered: 12345, truePositives: 6172, falsePositives: 6173, catchRate: 0.50, falsePositiveRate: 0.50 },
  },
  {
    id: 'VB-006', name: 'Browsing-to-Purchase Ratio Anomaly', category: 'VELOCITY_BEHAVIORAL',
    service: 'behavioral-analytics', checkpoint: 'TRANSACTION', severity: 'LOW', score: 30, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Account makes purchase within 30 seconds of first page view + no browsing/comparison shopping + goes directly to checkout on high-value item + account has done this pattern >3 times',
    description: 'Legitimate buyers browse. Automated fraud goes directly to checkout. Measures browsing depth vs purchase velocity as a human behavior indicator.',
    conditions: [
      { field: 'session.time_to_purchase_seconds', operator: 'LESS_THAN', value: 30 },
      { field: 'session.pages_viewed_before_purchase', operator: 'LESS_THAN', value: 2 },
      { field: 'account.rapid_purchase_pattern_count', operator: 'GREATER_THAN', value: 3 },
    ],
    tags: ['behavior-anomaly', 'automation', 'browse-ratio'],
    performance: { triggered: 34567, truePositives: 13826, falsePositives: 20741, catchRate: 0.40, falsePositiveRate: 0.60 },
  },

  // ============================================================
  // NEW RULES FOR UNDERSERVED SERVICES
  // ============================================================

  // ── ACCOUNT SETUP (service exists, 0 rules → 5 new) ──
  {
    id: 'AS-001', name: 'Multiple Bank Accounts in 24hrs', category: 'SELLER_IDENTITY',
    service: 'account-setup', checkpoint: 'ONBOARDING', severity: 'HIGH', score: 70, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: '≥3 different bank accounts linked within 24 hours of account creation + bank accounts are at different institutions + at least one is a neobank/fintech (Chime, Cash App, Varo)',
    description: 'Legitimate sellers link 1 bank account. Multiple accounts suggest layering setup for rapid fund dispersal after fraud.',
    conditions: [
      { field: 'account.bank_accounts_linked_24h', operator: 'GREATER_THAN_EQUAL', value: 3 },
      { field: 'account.bank_institutions_unique', operator: 'GREATER_THAN', value: 2 },
    ],
    tags: ['bank-fraud', 'account-setup', 'layering'],
    performance: { triggered: 1234, truePositives: 987, falsePositives: 247, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'AS-002', name: 'Tax ID Already on Banned Account', category: 'SELLER_IDENTITY',
    service: 'account-setup', checkpoint: 'ONBOARDING', severity: 'CRITICAL', score: 92, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'TIN/EIN/SSN provided during setup matches a TIN on a previously terminated or suspended seller account',
    description: 'Direct link between new account and banned entity via tax identifier. Strongest ban-evasion signal when combined with other identity overlap.',
    conditions: [
      { field: 'tax.tin_on_banned_account', operator: 'EQUALS', value: true },
    ],
    tags: ['ban-evasion', 'tax-id', 'identity'],
    performance: { triggered: 567, truePositives: 551, falsePositives: 16, catchRate: 0.97, falsePositiveRate: 0.03 },
  },
  {
    id: 'AS-003', name: 'Dormant Account Reactivation', category: 'VELOCITY_BEHAVIORAL',
    service: 'account-setup', checkpoint: 'ACCOUNT_CHANGE', severity: 'MEDIUM', score: 55, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Account dormant >12 months + suddenly updates bank account, email, and phone + begins listing high-value items within 48hrs of reactivation + device fingerprint is new',
    description: 'Dormant accounts are targeted for takeover or sold on darknet markets. Rapid reactivation with full profile overhaul is strong ATO/resale signal.',
    conditions: [
      { field: 'account.dormant_months', operator: 'GREATER_THAN', value: 12 },
      { field: 'account.profile_changes_on_reactivation', operator: 'GREATER_THAN_EQUAL', value: 3 },
      { field: 'device.is_new', operator: 'EQUALS', value: true },
    ],
    tags: ['dormant-account', 'reactivation', 'ATO'],
    performance: { triggered: 2345, truePositives: 1641, falsePositives: 704, catchRate: 0.70, falsePositiveRate: 0.30 },
  },
  {
    id: 'AS-004', name: 'Payment Method Stacking', category: 'PAYMENT_FRAUD',
    service: 'account-setup', checkpoint: 'ONBOARDING', severity: 'MEDIUM', score: 50, action: 'FLAG',
    status: 'ACTIVE',
    trigger: '≥5 credit/debit cards added within first 48hrs + cards issued by 3+ different banks + at least one card declined on verification charge',
    description: 'Excessive payment method addition on new accounts suggests card testing preparation or multi-card carding operation staging.',
    conditions: [
      { field: 'payment.cards_added_48h', operator: 'GREATER_THAN_EQUAL', value: 5 },
      { field: 'payment.card_issuers_unique', operator: 'GREATER_THAN', value: 3 },
    ],
    tags: ['card-stacking', 'payment-setup', 'carding'],
    performance: { triggered: 4567, truePositives: 2740, falsePositives: 1827, catchRate: 0.60, falsePositiveRate: 0.40 },
  },
  {
    id: 'AS-005', name: 'Business Address is Residential + High-Risk Category', category: 'SELLER_IDENTITY',
    service: 'account-setup', checkpoint: 'ONBOARDING', severity: 'LOW', score: 35, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Registered business address resolves to single-family residential + seller category is electronics, luxury, or automotive parts + no prior marketplace selling history',
    description: 'Residential addresses are normal for small sellers but combined with high-value categories and no history suggest potential fraud front.',
    conditions: [
      { field: 'address.type', operator: 'EQUALS', value: 'RESIDENTIAL_SINGLE_FAMILY' },
      { field: 'seller.category', operator: 'IN', value: ['ELECTRONICS', 'LUXURY', 'AUTO_PARTS'] },
      { field: 'seller.prior_marketplace_history', operator: 'EQUALS', value: false },
    ],
    tags: ['address-risk', 'residential', 'high-value-category'],
    performance: { triggered: 15678, truePositives: 4703, falsePositives: 10975, catchRate: 0.30, falsePositiveRate: 0.70 },
  },

  // ── ITEM SETUP (service exists, 1 rule → 4 new) ──
  {
    id: 'IS-001', name: 'Weight/Dimension Inconsistency', category: 'LISTING_INTEGRITY',
    service: 'item-setup', checkpoint: 'LISTING', severity: 'MEDIUM', score: 45, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Entered item weight/dimensions deviate >200% from category median for product type + seller provides no justification for outlier specs + affects shipping cost calculation',
    description: 'Fraudulent weight/dimension entries can manipulate shipping subsidies or hide actual product identity. Cross-references against UPC database specs.',
    conditions: [
      { field: 'item.weight_vs_category_median', operator: 'GREATER_THAN', value: 2.0 },
      { field: 'item.dimensions_plausibility_score', operator: 'LESS_THAN', value: 0.30 },
    ],
    tags: ['weight-fraud', 'shipping-manipulation', 'item-attributes'],
    performance: { triggered: 8901, truePositives: 5340, falsePositives: 3561, catchRate: 0.60, falsePositiveRate: 0.40 },
  },
  {
    id: 'IS-002', name: 'Restricted Product Keywords in Attributes', category: 'LISTING_INTEGRITY',
    service: 'item-setup', checkpoint: 'LISTING', severity: 'HIGH', score: 70, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Item attributes contain known restricted/prohibited product indicators hidden in brand, model, or specification fields rather than in title/description (which are separately screened)',
    description: 'Sellers hide restricted product keywords in structured item attributes (brand field, model number, bullet points) to bypass title/description content filters.',
    conditions: [
      { field: 'item.attributes_restricted_keyword_score', operator: 'GREATER_THAN', value: 0.75 },
      { field: 'item.title_clean', operator: 'EQUALS', value: true },
    ],
    tags: ['restricted-product', 'attribute-abuse', 'filter-evasion'],
    performance: { triggered: 3456, truePositives: 2764, falsePositives: 692, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'IS-003', name: 'Hazmat Misclassification', category: 'LISTING_INTEGRITY',
    service: 'item-setup', checkpoint: 'LISTING', severity: 'CRITICAL', score: 85, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Item contains hazardous material indicators (lithium batteries, chemicals, pressurized containers) but is classified as non-hazmat + shipping method selected doesn\'t comply with DOT/IATA requirements',
    description: 'Detects misclassified hazardous materials that could endanger shipping workers and violate federal regulations. Uses product name/description NLP + category cross-reference.',
    conditions: [
      { field: 'item.hazmat_nlp_score', operator: 'GREATER_THAN', value: 0.80 },
      { field: 'item.hazmat_classification', operator: 'EQUALS', value: 'NONE' },
    ],
    tags: ['hazmat', 'safety', 'compliance', 'DOT'],
    performance: { triggered: 2345, truePositives: 2110, falsePositives: 235, catchRate: 0.90, falsePositiveRate: 0.10 },
  },
  {
    id: 'IS-004', name: 'UPC Barcode Already Flagged', category: 'LISTING_INTEGRITY',
    service: 'item-setup', checkpoint: 'LISTING', severity: 'HIGH', score: 72, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'UPC/EAN/ISBN being registered has been previously associated with counterfeit claims, VeRO takedowns, or brand owner complaints on this or partner platforms',
    description: 'Maintains a shared barcode reputation database. Barcodes linked to prior IP violations carry risk score that increases with each confirmed infringement.',
    conditions: [
      { field: 'barcode.prior_counterfeit_claims', operator: 'GREATER_THAN', value: 0 },
      { field: 'barcode.vero_takedowns', operator: 'GREATER_THAN', value: 0 },
    ],
    tags: ['counterfeit', 'barcode', 'brand-protection', 'VeRO'],
    performance: { triggered: 5678, truePositives: 4542, falsePositives: 1136, catchRate: 0.80, falsePositiveRate: 0.20 },
  },

  // ── PRICING (service exists, 2 rules → 3 new) ──
  {
    id: 'PR-001', name: 'Below-Cost Predatory Pricing', category: 'LISTING_INTEGRITY',
    service: 'pricing', checkpoint: 'LISTING', severity: 'MEDIUM', score: 50, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Listing price is below wholesale cost for the item (per supplier price database) + seller is not a brand-authorized liquidator + pattern sustained across >20 listings',
    description: 'Prices below wholesale suggest either counterfeit goods (produced at lower cost), stolen merchandise, or predatory pricing to eliminate competitors before price increase.',
    conditions: [
      { field: 'pricing.price_vs_wholesale', operator: 'LESS_THAN', value: 1.0 },
      { field: 'seller.authorized_liquidator', operator: 'EQUALS', value: false },
      { field: 'seller.below_cost_listings_count', operator: 'GREATER_THAN', value: 20 },
    ],
    tags: ['predatory-pricing', 'below-cost', 'counterfeit-signal'],
    performance: { triggered: 6789, truePositives: 4752, falsePositives: 2037, catchRate: 0.70, falsePositiveRate: 0.30 },
  },
  {
    id: 'PR-002', name: 'Price Gouging During Emergency', category: 'POLICY_ABUSE',
    service: 'pricing', checkpoint: 'LISTING', severity: 'HIGH', score: 75, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Essential item (water, generators, PPE, baby formula) price increased >100% within 48hrs of declared natural disaster or emergency in seller\'s region + price exceeds FTC guidelines',
    description: 'Monitors price spikes on essential goods correlated with FEMA-declared emergencies. References state-specific price gouging thresholds (typically 10-25% above pre-emergency price).',
    conditions: [
      { field: 'pricing.price_increase_48h_pct', operator: 'GREATER_THAN', value: 1.0 },
      { field: 'item.essential_goods_classification', operator: 'EQUALS', value: true },
      { field: 'emergency.active_declaration_seller_region', operator: 'EQUALS', value: true },
    ],
    tags: ['price-gouging', 'emergency', 'consumer-protection', 'FTC'],
    performance: { triggered: 1234, truePositives: 1111, falsePositives: 123, catchRate: 0.90, falsePositiveRate: 0.10 },
  },
  {
    id: 'PR-003', name: 'MAP Violation Detection', category: 'LISTING_INTEGRITY',
    service: 'pricing', checkpoint: 'LISTING', severity: 'MEDIUM', score: 40, action: 'FLAG',
    status: 'SHADOW',
    trigger: 'Listing price is below Minimum Advertised Price set by brand owner in MAP agreement database + seller is authorized dealer + brand has active MAP enforcement program',
    description: 'Monitors compliance with manufacturer Minimum Advertised Price agreements. Protects brand value and authorized dealer network integrity.',
    conditions: [
      { field: 'pricing.price_vs_map', operator: 'LESS_THAN', value: 1.0 },
      { field: 'seller.authorized_dealer', operator: 'EQUALS', value: true },
      { field: 'brand.map_enforcement_active', operator: 'EQUALS', value: true },
    ],
    tags: ['MAP-violation', 'brand-compliance', 'authorized-dealer'],
    performance: { triggered: 23456, truePositives: 18765, falsePositives: 4691, catchRate: 0.80, falsePositiveRate: 0.20 },
  },

  // ── PROFILE UPDATES (service exists, 0 rules → 5 new) ──
  {
    id: 'PU-001', name: 'Email Swap Before Payout', category: 'ACCOUNT_TAKEOVER',
    service: 'profile-updates', checkpoint: 'ACCOUNT_CHANGE', severity: 'HIGH', score: 78, action: 'HOLD',
    status: 'ACTIVE',
    trigger: 'Primary email changed + payout requested within 24hrs of email change + new email domain differs from original + no email verification completed on new address',
    description: 'Attackers change email to redirect payout notifications and prevent account owner from seeing withdrawal alerts. Email change before payout is classic ATO signal.',
    conditions: [
      { field: 'profile.email_changed', operator: 'EQUALS', value: true },
      { field: 'profile.hours_since_email_change', operator: 'LESS_THAN', value: 24 },
      { field: 'payout.requested_after_email_change', operator: 'EQUALS', value: true },
    ],
    tags: ['email-change', 'payout-fraud', 'ATO'],
    performance: { triggered: 2345, truePositives: 1993, falsePositives: 352, catchRate: 0.85, falsePositiveRate: 0.15 },
  },
  {
    id: 'PU-002', name: 'Bank Change After Sales Spike', category: 'PAYMENT_FRAUD',
    service: 'profile-updates', checkpoint: 'ACCOUNT_CHANGE', severity: 'HIGH', score: 72, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Deposit bank account changed + change occurs within 72hrs of sales volume >3× monthly average + new bank account was opened recently (<30 days per bank API) + old bank account was established (>1 year)',
    description: 'Detects bank account switching timed with high sales volume, suggesting either ATO (redirect payouts) or exit fraud (cash out before abandoning account).',
    conditions: [
      { field: 'profile.bank_changed', operator: 'EQUALS', value: true },
      { field: 'sales.volume_vs_avg_72h', operator: 'GREATER_THAN', value: 3.0 },
      { field: 'profile.new_bank_account_age_days', operator: 'LESS_THAN', value: 30 },
    ],
    tags: ['bank-change', 'sales-spike', 'exit-fraud'],
    performance: { triggered: 1567, truePositives: 1175, falsePositives: 392, catchRate: 0.75, falsePositiveRate: 0.25 },
  },
  {
    id: 'PU-003', name: 'Shipping Address Churn', category: 'VELOCITY_BEHAVIORAL',
    service: 'profile-updates', checkpoint: 'ACCOUNT_CHANGE', severity: 'MEDIUM', score: 45, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Return/ship-from address changed ≥5 times in 30 days + addresses are in different states + no legitimate business reason apparent (not a multi-warehouse operation)',
    description: 'Frequent address changes can indicate inventory fraud (claiming to ship from favorable locations), warehouse-hopping to avoid audits, or multiple operators sharing one account.',
    conditions: [
      { field: 'profile.address_changes_30d', operator: 'GREATER_THAN_EQUAL', value: 5 },
      { field: 'profile.address_states_unique_30d', operator: 'GREATER_THAN', value: 2 },
    ],
    tags: ['address-churn', 'multi-location', 'operational-anomaly'],
    performance: { triggered: 5678, truePositives: 3406, falsePositives: 2272, catchRate: 0.60, falsePositiveRate: 0.40 },
  },
  {
    id: 'PU-004', name: 'Sudden Category Expansion', category: 'VELOCITY_BEHAVIORAL',
    service: 'profile-updates', checkpoint: 'LISTING', severity: 'MEDIUM', score: 50, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Seller historically in 1-2 categories suddenly lists in 5+ new categories within a week + new categories are high-risk (electronics, luxury, health) + no inventory verification for new categories',
    description: 'Rapid category expansion often precedes exit fraud: sellers build trust in low-risk categories then pivot to high-value items before abandoning account.',
    conditions: [
      { field: 'seller.new_categories_7d', operator: 'GREATER_THAN', value: 4 },
      { field: 'seller.historical_categories', operator: 'LESS_THAN_EQUAL', value: 2 },
      { field: 'seller.new_category_risk_score', operator: 'GREATER_THAN', value: 0.70 },
    ],
    tags: ['category-expansion', 'exit-fraud', 'trust-abuse'],
    performance: { triggered: 3456, truePositives: 2418, falsePositives: 1038, catchRate: 0.70, falsePositiveRate: 0.30 },
  },
  {
    id: 'PU-005', name: 'Display Name Brand Impersonation', category: 'POLICY_ABUSE',
    service: 'profile-updates', checkpoint: 'ACCOUNT_CHANGE', severity: 'HIGH', score: 68, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Seller display name changed to include registered trademark or brand name (Nike, Apple, Samsung, etc.) + seller is not an authorized dealer + name uses unicode lookalike characters or spacing tricks',
    description: 'Detects sellers changing display names to impersonate brands using trademark matching, unicode normalization, and authorized dealer database cross-reference.',
    conditions: [
      { field: 'profile.display_name_trademark_match', operator: 'EQUALS', value: true },
      { field: 'seller.authorized_for_brand', operator: 'EQUALS', value: false },
    ],
    tags: ['brand-impersonation', 'trademark', 'display-name'],
    performance: { triggered: 4567, truePositives: 3653, falsePositives: 914, catchRate: 0.80, falsePositiveRate: 0.20 },
  },

  // ── SELLER PAYOUT (service exists, 2 rules → 3 new) ──
  {
    id: 'SP-001', name: 'Payout to Sanctioned Country', category: 'PAYMENT_FRAUD',
    service: 'seller-payout', checkpoint: 'PAYOUT', severity: 'CRITICAL', score: 95, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Payout destination bank is domiciled in OFAC-sanctioned country (North Korea, Iran, Syria, Cuba, Crimea) OR beneficiary name matches OFAC SDN list with Jaro-Winkler >0.90',
    description: 'Sanctions compliance check on all payout requests. Cross-references bank BIC/SWIFT codes and beneficiary names against OFAC Specially Designated Nationals list.',
    conditions: [
      { field: 'payout.bank_country_sanctioned', operator: 'EQUALS', value: true },
    ],
    tags: ['sanctions', 'OFAC', 'compliance', 'AML'],
    performance: { triggered: 89, truePositives: 87, falsePositives: 2, catchRate: 0.98, falsePositiveRate: 0.02 },
  },
  {
    id: 'SP-002', name: 'Payout Before Delivery Confirmation', category: 'FULFILLMENT_FRAUD',
    service: 'seller-payout', checkpoint: 'PAYOUT', severity: 'HIGH', score: 70, action: 'HOLD',
    status: 'ACTIVE',
    trigger: 'Seller requests payout + >30% of recent orders lack carrier delivery confirmation + total unconfirmed order value >$2,000 + seller has <50 completed sales lifetime',
    description: 'Prevents cash-out on orders that may never be fulfilled. Holds funds until delivery confirmation reaches acceptable threshold.',
    conditions: [
      { field: 'payout.unconfirmed_delivery_pct', operator: 'GREATER_THAN', value: 0.30 },
      { field: 'payout.unconfirmed_order_value', operator: 'GREATER_THAN', value: 2000 },
      { field: 'seller.completed_sales_lifetime', operator: 'LESS_THAN', value: 50 },
    ],
    tags: ['payout-hold', 'delivery-pending', 'new-seller-risk'],
    performance: { triggered: 6789, truePositives: 5431, falsePositives: 1358, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'SP-003', name: 'Frequent Bank Account Changes', category: 'PAYMENT_FRAUD',
    service: 'seller-payout', checkpoint: 'PAYOUT', severity: 'MEDIUM', score: 55, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Seller changed payout bank account ≥3 times in 90 days + at least one previous bank account received a chargeback/reversal + current bank is different institution from all previous',
    description: 'Frequent bank switching can indicate money laundering layering or attempts to evade bank-level fraud blocks. Normal sellers change banks rarely.',
    conditions: [
      { field: 'payout.bank_changes_90d', operator: 'GREATER_THAN_EQUAL', value: 3 },
      { field: 'payout.prior_bank_had_reversal', operator: 'EQUALS', value: true },
    ],
    tags: ['bank-hopping', 'layering', 'payout-risk'],
    performance: { triggered: 2345, truePositives: 1641, falsePositives: 704, catchRate: 0.70, falsePositiveRate: 0.30 },
  },

  // ── RETURNS (service exists, 4 rules → 3 new) ──
  {
    id: 'RT-001', name: 'Empty Return Package', category: 'BUYER_ABUSE',
    service: 'returns', checkpoint: 'RETURNS', severity: 'CRITICAL', score: 85, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Return package carrier-recorded weight is <2oz (empty envelope/box) + original shipped item weighed >1lb + refund auto-processed based on tracking showing delivery to seller',
    description: 'Detects buyers sending empty packages to generate return tracking and trigger automated refunds. Weight comparison between outbound and return shipments.',
    conditions: [
      { field: 'return.package_weight_oz', operator: 'LESS_THAN', value: 2 },
      { field: 'shipping.original_weight_lbs', operator: 'GREATER_THAN', value: 1 },
    ],
    tags: ['empty-return', 'return-fraud', 'weight-mismatch'],
    performance: { triggered: 1234, truePositives: 1172, falsePositives: 62, catchRate: 0.95, falsePositiveRate: 0.05 },
  },
  {
    id: 'RT-002', name: 'Return Address Reroute', category: 'BUYER_ABUSE',
    service: 'returns', checkpoint: 'RETURNS', severity: 'HIGH', score: 72, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Return label shows delivery to address different from seller\'s registered return address + buyer modified return label + package intercepted or rerouted via carrier API after label creation',
    description: 'Detects buyers rerouting return packages to their own address (or accomplice) while claiming return was shipped, exploiting tracking-based auto-refund.',
    conditions: [
      { field: 'return.delivery_address_matches_seller', operator: 'EQUALS', value: false },
      { field: 'return.carrier_reroute_detected', operator: 'EQUALS', value: true },
    ],
    tags: ['return-reroute', 'label-manipulation', 'address-fraud'],
    performance: { triggered: 892, truePositives: 713, falsePositives: 179, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'RT-003', name: 'Warranty Claim with Serial Mismatch', category: 'BUYER_ABUSE',
    service: 'returns', checkpoint: 'RETURNS', severity: 'HIGH', score: 75, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Warranty/replacement claim filed + serial number on returned item doesn\'t match serial number recorded at original sale + original serial shows active on a different account or was never sold through platform',
    description: 'Detects buyers submitting warranty claims for items bought elsewhere or swapping broken items from other sources with platform-purchased items for replacement.',
    conditions: [
      { field: 'warranty.serial_match', operator: 'EQUALS', value: false },
      { field: 'warranty.original_serial_status', operator: 'IN', value: ['ACTIVE_OTHER_ACCOUNT', 'NOT_FOUND'] },
    ],
    tags: ['warranty-fraud', 'serial-mismatch', 'replacement-abuse'],
    performance: { triggered: 1567, truePositives: 1253, falsePositives: 314, catchRate: 0.80, falsePositiveRate: 0.20 },
  },

  // ── BUYER TRUST (service DOES NOT EXIST) ──
  {
    id: 'BT-001', name: 'New Buyer High-Value First Purchase', category: 'BUYER_ABUSE',
    service: 'buyer-trust', checkpoint: 'TRANSACTION', severity: 'MEDIUM', score: 50, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Account created <24hrs ago + first purchase >$500 + shipping to address different from registration address + payment card issued in different country than shipping country',
    description: 'New accounts making high-value first purchases with geographic mismatches are elevated fraud risk. Signal is scored but not blocking alone.',
    conditions: [
      { field: 'buyer.account_age_hours', operator: 'LESS_THAN', value: 24 },
      { field: 'transaction.amount', operator: 'GREATER_THAN', value: 500 },
      { field: 'buyer.shipping_vs_registration_match', operator: 'EQUALS', value: false },
    ],
    tags: ['new-buyer', 'high-value', 'geo-mismatch'],
    performance: { triggered: 34567, truePositives: 17283, falsePositives: 17284, catchRate: 0.50, falsePositiveRate: 0.50 },
  },
  {
    id: 'BT-002', name: 'Buyer Chargeback History', category: 'BUYER_ABUSE',
    service: 'buyer-trust', checkpoint: 'TRANSACTION', severity: 'HIGH', score: 75, action: 'CHALLENGE',
    status: 'ACTIVE',
    trigger: 'Buyer has ≥3 chargebacks in past 12 months across any payment method + chargeback-to-purchase ratio >5% + at least one chargeback was ruled in seller\'s favor (false claim)',
    description: 'Maintains buyer chargeback history score. Repeat chargebackers face step-up authentication or purchase limits.',
    conditions: [
      { field: 'buyer.chargebacks_12m', operator: 'GREATER_THAN_EQUAL', value: 3 },
      { field: 'buyer.chargeback_rate', operator: 'GREATER_THAN', value: 0.05 },
    ],
    tags: ['chargeback-history', 'buyer-risk', 'repeat-offender'],
    performance: { triggered: 8901, truePositives: 7120, falsePositives: 1781, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'BT-003', name: 'Multi-Account Buyer', category: 'BUYER_ABUSE',
    service: 'buyer-trust', checkpoint: 'TRANSACTION', severity: 'MEDIUM', score: 55, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Buyer\'s payment instrument is linked to ≥3 other buyer accounts + accounts show coordinated purchasing patterns + at least one linked account has been suspended',
    description: 'Identifies buyers operating multiple accounts, often to exploit per-account promotion limits, circumvent purchase limits, or evade bans.',
    conditions: [
      { field: 'buyer.payment_linked_accounts', operator: 'GREATER_THAN_EQUAL', value: 3 },
      { field: 'buyer.linked_account_suspended', operator: 'EQUALS', value: true },
    ],
    tags: ['multi-account', 'buyer-fraud', 'ban-evasion'],
    performance: { triggered: 5678, truePositives: 3974, falsePositives: 1704, catchRate: 0.70, falsePositiveRate: 0.30 },
  },
  {
    id: 'BT-004', name: 'Buyer Dispute-to-Purchase Ratio', category: 'BUYER_ABUSE',
    service: 'buyer-trust', checkpoint: 'RETURNS', severity: 'HIGH', score: 68, action: 'RESTRICT',
    status: 'ACTIVE',
    trigger: 'Buyer dispute rate >15% of purchases in 6 months + total disputed value >$1,000 + disputes filed against sellers with avg rating >4.5 (buyer is the anomaly, not sellers)',
    description: 'Composite buyer risk score based on dispute frequency relative to purchasing volume. High dispute rates against well-rated sellers indicate buyer-side abuse.',
    conditions: [
      { field: 'buyer.dispute_rate_6m', operator: 'GREATER_THAN', value: 0.15 },
      { field: 'buyer.disputed_value_6m', operator: 'GREATER_THAN', value: 1000 },
      { field: 'buyer.disputed_seller_avg_rating', operator: 'GREATER_THAN', value: 4.5 },
    ],
    tags: ['dispute-abuse', 'buyer-risk-score', 'serial-disputer'],
    performance: { triggered: 6789, truePositives: 5431, falsePositives: 1358, catchRate: 0.80, falsePositiveRate: 0.20 },
  },

  // ── COMPLIANCE & AML (service DOES NOT EXIST) ──
  {
    id: 'CA-001', name: 'SAR Filing Trigger', category: 'PAYMENT_FRAUD',
    service: 'compliance-aml', checkpoint: 'CONTINUOUS', severity: 'CRITICAL', score: 90, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Composite suspicious activity score exceeds SAR threshold: combination of structuring patterns + rapid fund movement + identity concerns + unusual transaction patterns not explained by normal business',
    description: 'Automated Suspicious Activity Report trigger per BSA requirements. Aggregates signals across structuring, velocity, identity, and behavioral anomalies into composite SAR score.',
    conditions: [
      { field: 'compliance.sar_composite_score', operator: 'GREATER_THAN', value: 0.85 },
      { field: 'compliance.structuring_indicators', operator: 'GREATER_THAN', value: 2 },
    ],
    tags: ['SAR', 'BSA', 'FinCEN', 'compliance'],
    performance: { triggered: 345, truePositives: 310, falsePositives: 35, catchRate: 0.90, falsePositiveRate: 0.10 },
  },
  {
    id: 'CA-002', name: 'OFAC/SDN Sanctions Match', category: 'PAYMENT_FRAUD',
    service: 'compliance-aml', checkpoint: 'CONTINUOUS', severity: 'CRITICAL', score: 98, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Entity name, alias, or address matches OFAC Specially Designated Nationals list with fuzzy match score >0.90 + entity operates in or transacts with sanctioned jurisdictions',
    description: 'Real-time sanctions screening against OFAC SDN, EU sanctions, UK HMT, and UN sanctions lists. Updated daily. Legal obligation — no false negative tolerance.',
    conditions: [
      { field: 'sanctions.ofac_match_score', operator: 'GREATER_THAN', value: 0.90 },
    ],
    tags: ['OFAC', 'SDN', 'sanctions', 'mandatory-compliance'],
    performance: { triggered: 23, truePositives: 22, falsePositives: 1, catchRate: 0.96, falsePositiveRate: 0.04 },
  },
  {
    id: 'CA-003', name: 'PEP/Adverse Media Screen', category: 'SELLER_IDENTITY',
    service: 'compliance-aml', checkpoint: 'ONBOARDING', severity: 'HIGH', score: 65, action: 'REVIEW',
    status: 'SHADOW',
    trigger: 'Beneficial owner or authorized signer matches Politically Exposed Person database OR has adverse media mentions (fraud, money laundering, sanctions violations) in news screening',
    description: 'Enhanced due diligence for politically exposed persons and entities with adverse media. Cross-references PEP databases (Dow Jones, World-Check) and adverse media feeds.',
    conditions: [
      { field: 'compliance.pep_match', operator: 'EQUALS', value: true },
      { field: 'compliance.adverse_media_score', operator: 'GREATER_THAN', value: 0.70 },
    ],
    tags: ['PEP', 'adverse-media', 'enhanced-due-diligence', 'KYC'],
    performance: { triggered: 567, truePositives: 340, falsePositives: 227, catchRate: 0.60, falsePositiveRate: 0.40 },
  },

  // ── POLICY ENFORCEMENT (service DOES NOT EXIST) ──
  {
    id: 'PE-001', name: 'Repeat Offender Escalation', category: 'POLICY_ABUSE',
    service: 'policy-enforcement', checkpoint: 'CONTINUOUS', severity: 'HIGH', score: 80, action: 'RESTRICT',
    status: 'ACTIVE',
    trigger: 'Seller has accumulated ≥3 policy violations across any category within 90 days + at least one was severity HIGH or above + seller received prior warning but continued behavior',
    description: 'Progressive enforcement: first violation = warning, second = restriction, third = review for suspension. Tracks violation history across all policy categories.',
    conditions: [
      { field: 'policy.violations_90d', operator: 'GREATER_THAN_EQUAL', value: 3 },
      { field: 'policy.prior_warning_issued', operator: 'EQUALS', value: true },
      { field: 'policy.high_severity_violations', operator: 'GREATER_THAN', value: 0 },
    ],
    tags: ['repeat-offender', 'progressive-enforcement', 'escalation'],
    performance: { triggered: 4567, truePositives: 3653, falsePositives: 914, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'PE-002', name: 'Cross-Service Policy Correlation', category: 'POLICY_ABUSE',
    service: 'policy-enforcement', checkpoint: 'CONTINUOUS', severity: 'HIGH', score: 72, action: 'REVIEW',
    status: 'SHADOW',
    trigger: 'Seller has low-severity flags across 3+ different services (e.g., pricing FLAG + listing FLAG + shipping FLAG) that individually wouldn\'t trigger action but collectively suggest systematic rule-testing',
    description: 'Detects sellers probing platform limits across multiple surfaces. No single violation is actionable but the cross-service pattern reveals intentional boundary-testing behavior.',
    conditions: [
      { field: 'policy.unique_services_flagged', operator: 'GREATER_THAN_EQUAL', value: 3 },
      { field: 'policy.flags_90d', operator: 'GREATER_THAN', value: 5 },
    ],
    tags: ['cross-service', 'boundary-testing', 'composite-signal'],
    performance: { triggered: 2345, truePositives: 1641, falsePositives: 704, catchRate: 0.70, falsePositiveRate: 0.30 },
  },

  // ── NETWORK INTELLIGENCE (service DOES NOT EXIST, 3 existing → 2 new) ──
  {
    id: 'NI-001', name: 'Entity Resolution — Cross-Account Linking', category: 'NETWORK_RINGS',
    service: 'network-intelligence', checkpoint: 'CONTINUOUS', severity: 'HIGH', score: 70, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Graph entity resolution identifies 2+ accounts that are >90% likely same real-world entity based on weighted identity signal overlap (device, IP, address, phone, email domain, browser fingerprint)',
    description: 'Probabilistic entity resolution using weighted Jaccard similarity across 15+ identity signals. Powers downstream ring detection and ban-evasion checks.',
    conditions: [
      { field: 'entity.resolution_score', operator: 'GREATER_THAN', value: 0.90 },
      { field: 'entity.linked_accounts', operator: 'GREATER_THAN', value: 1 },
    ],
    tags: ['entity-resolution', 'identity-graph', 'multi-account'],
    performance: { triggered: 12345, truePositives: 9876, falsePositives: 2469, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'NI-002', name: 'Dormant Ring Reactivation', category: 'NETWORK_RINGS',
    service: 'network-intelligence', checkpoint: 'CONTINUOUS', severity: 'CRITICAL', score: 88, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Previously identified and disrupted fraud ring shows reactivation: ≥3 members of known ring become active within same 7-day window + new identity signals overlap with dormant ring members',
    description: 'Monitors disrupted fraud rings for coordinated reactivation. Maintains ring membership database and alerts when multiple ex-members resurface simultaneously.',
    conditions: [
      { field: 'ring.reactivated_members_7d', operator: 'GREATER_THAN_EQUAL', value: 3 },
      { field: 'ring.identity_overlap_with_known', operator: 'GREATER_THAN', value: 0.70 },
    ],
    tags: ['ring-reactivation', 'organized-fraud', 'dormant-network'],
    performance: { triggered: 234, truePositives: 211, falsePositives: 23, catchRate: 0.90, falsePositiveRate: 0.10 },
  },

  // ── REVIEW INTEGRITY (service DOES NOT EXIST, 3 existing → 2 new) ──
  {
    id: 'RI-001', name: 'Paid Review Detection', category: 'LISTING_INTEGRITY',
    service: 'review-integrity', checkpoint: 'CONTINUOUS', severity: 'MEDIUM', score: 55, action: 'FLAG',
    status: 'SHADOW',
    trigger: 'Reviewer account shows pattern: reviews only specific sellers + review posted within 30min of purchase + reviewer received refund/gift card from seller via off-platform channel (detected via message scanning)',
    description: 'Detects paid/incentivized reviews by correlating reviewer-seller relationship patterns, review timing, and off-platform communication indicators.',
    conditions: [
      { field: 'reviewer.seller_concentration', operator: 'GREATER_THAN', value: 0.80 },
      { field: 'review.minutes_after_purchase', operator: 'LESS_THAN', value: 30 },
    ],
    tags: ['paid-reviews', 'incentivized', 'review-manipulation'],
    performance: { triggered: 5678, truePositives: 3974, falsePositives: 1704, catchRate: 0.70, falsePositiveRate: 0.30 },
  },
  {
    id: 'RI-002', name: 'Review Timing Anomaly', category: 'LISTING_INTEGRITY',
    service: 'review-integrity', checkpoint: 'CONTINUOUS', severity: 'LOW', score: 35, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Review posted before item could have been reasonably received (review date < estimated delivery date) OR review posted within 5 minutes of delivery confirmation',
    description: 'Reviews posted before receiving the item or implausibly fast after delivery suggest pre-written reviews, often part of coordinated campaigns.',
    conditions: [
      { field: 'review.posted_before_delivery', operator: 'EQUALS', value: true },
    ],
    tags: ['review-timing', 'pre-written', 'authenticity'],
    performance: { triggered: 23456, truePositives: 9382, falsePositives: 14074, catchRate: 0.40, falsePositiveRate: 0.60 },
  },

  // ── BEHAVIORAL ANALYTICS (service DOES NOT EXIST, 3 existing → 2 new) ──
  {
    id: 'BE-001', name: 'Session Anomaly Score', category: 'VELOCITY_BEHAVIORAL',
    service: 'behavioral-analytics', checkpoint: 'CONTINUOUS', severity: 'MEDIUM', score: 55, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Composite session anomaly score >0.75 based on: navigation pattern entropy, time-on-page distribution, click pattern regularity, scroll behavior, and interaction sequence compared to user\'s baseline',
    description: 'Ensemble model combining 12 behavioral features into single anomaly score. Baseline is per-user (not population) so it adapts to individual browsing habits.',
    conditions: [
      { field: 'session.anomaly_score', operator: 'GREATER_THAN', value: 0.75 },
      { field: 'session.baseline_deviation_sigma', operator: 'GREATER_THAN', value: 3.0 },
    ],
    tags: ['session-anomaly', 'behavioral-baseline', 'ensemble-model'],
    performance: { triggered: 15678, truePositives: 9406, falsePositives: 6272, catchRate: 0.60, falsePositiveRate: 0.40 },
  },
  {
    id: 'BE-002', name: 'Device Reputation Score', category: 'VELOCITY_BEHAVIORAL',
    service: 'behavioral-analytics', checkpoint: 'CONTINUOUS', severity: 'HIGH', score: 72, action: 'CHALLENGE',
    status: 'ACTIVE',
    trigger: 'Device fingerprint has historical fraud association score >0.80 across the platform + device has been used on ≥2 accounts that were subsequently suspended + device characteristics match known emulator/VM signatures',
    description: 'Maintains device-level reputation based on historical outcomes. Devices associated with fraud carry persistent risk scores independent of the account using them.',
    conditions: [
      { field: 'device.reputation_score', operator: 'GREATER_THAN', value: 0.80 },
      { field: 'device.suspended_account_count', operator: 'GREATER_THAN_EQUAL', value: 2 },
    ],
    tags: ['device-reputation', 'fingerprint', 'emulator-detection'],
    performance: { triggered: 8901, truePositives: 7120, falsePositives: 1781, catchRate: 0.80, falsePositiveRate: 0.20 },
  },

  // ── TRANSACTION PROCESSING (service DOES NOT EXIST, 7 existing → 2 new) ──
  {
    id: 'TP-001', name: 'Checkout Velocity — Multi-Order Burst', category: 'TRANSACTION_MANIPULATION',
    service: 'transaction-processing', checkpoint: 'TRANSACTION', severity: 'HIGH', score: 72, action: 'CHALLENGE',
    status: 'ACTIVE',
    trigger: 'Account places ≥5 separate orders within 10 minutes + each order ships to different address + total value >$2,000 + at least 2 orders are for same high-value item',
    description: 'Rapid multi-order patterns with varied shipping addresses suggest carding operation or reseller abuse. Legitimate bulk buyers typically use single orders.',
    conditions: [
      { field: 'velocity.orders_10min', operator: 'GREATER_THAN_EQUAL', value: 5 },
      { field: 'velocity.unique_shipping_addresses_10min', operator: 'GREATER_THAN', value: 3 },
      { field: 'velocity.total_value_10min', operator: 'GREATER_THAN', value: 2000 },
    ],
    tags: ['checkout-velocity', 'multi-order', 'carding'],
    performance: { triggered: 4567, truePositives: 3653, falsePositives: 914, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'TP-002', name: 'Price Lock Exploitation', category: 'TRANSACTION_MANIPULATION',
    service: 'transaction-processing', checkpoint: 'TRANSACTION', severity: 'MEDIUM', score: 45, action: 'FLAG',
    status: 'SHADOW',
    trigger: 'Buyer adds item to cart during flash sale/error pricing + doesn\'t complete checkout + returns days later to complete purchase at locked-in price after price has been corrected + pattern repeated >3 times',
    description: 'Detects abuse of cart price-lock mechanics where buyers intentionally exploit pricing errors or flash sale remnants by holding items in cart past promotion end.',
    conditions: [
      { field: 'cart.price_lock_age_hours', operator: 'GREATER_THAN', value: 72 },
      { field: 'cart.locked_price_vs_current', operator: 'LESS_THAN', value: 0.50 },
      { field: 'buyer.price_lock_exploitation_count', operator: 'GREATER_THAN', value: 3 },
    ],
    tags: ['price-lock', 'cart-abuse', 'pricing-exploit'],
    performance: { triggered: 2345, truePositives: 1641, falsePositives: 704, catchRate: 0.70, falsePositiveRate: 0.30 },
  },

  // ── PAYMENT PROCESSING (service DOES NOT EXIST, 4 existing → 3 new) ──
  {
    id: 'PP-001', name: '3D Secure Bypass Attempt', category: 'PAYMENT_FRAUD',
    service: 'payment-processing', checkpoint: 'PAYMENT', severity: 'HIGH', score: 78, action: 'BLOCK',
    status: 'ACTIVE',
    trigger: 'Transaction submitted with 3DS authentication downgrade request + merchant category code manipulation to avoid 3DS requirement + card issuer country requires SCA (Strong Customer Authentication)',
    description: 'Detects attempts to bypass 3D Secure authentication by manipulating transaction parameters, MCC codes, or authentication flow to avoid step-up verification.',
    conditions: [
      { field: 'payment.3ds_downgrade_requested', operator: 'EQUALS', value: true },
      { field: 'payment.sca_required_by_region', operator: 'EQUALS', value: true },
    ],
    tags: ['3DS-bypass', 'SCA', 'authentication-fraud'],
    performance: { triggered: 3456, truePositives: 2764, falsePositives: 692, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
  {
    id: 'PP-002', name: 'Virtual Card Velocity', category: 'PAYMENT_FRAUD',
    service: 'payment-processing', checkpoint: 'PAYMENT', severity: 'MEDIUM', score: 60, action: 'FLAG',
    status: 'ACTIVE',
    trigger: 'Account uses ≥3 different virtual/disposable card numbers (Privacy.com, Revolut virtual, etc.) within 24hrs + each card makes exactly one transaction + card BINs indicate virtual issuance',
    description: 'Virtual cards are legitimate but high velocity with single-use patterns suggests carding with generated virtual numbers or structured purchases to avoid card-level velocity checks.',
    conditions: [
      { field: 'payment.virtual_cards_24h', operator: 'GREATER_THAN_EQUAL', value: 3 },
      { field: 'payment.single_use_card_pct', operator: 'GREATER_THAN', value: 0.80 },
    ],
    tags: ['virtual-card', 'disposable', 'card-velocity'],
    performance: { triggered: 6789, truePositives: 4072, falsePositives: 2717, catchRate: 0.60, falsePositiveRate: 0.40 },
  },
  {
    id: 'PP-003', name: 'ACH Return Pattern', category: 'PAYMENT_FRAUD',
    service: 'payment-processing', checkpoint: 'PAYMENT', severity: 'HIGH', score: 75, action: 'REVIEW',
    status: 'ACTIVE',
    trigger: 'Buyer\'s ACH payment returns with R10 (unauthorized) or R29 (corporate not authorized) code + buyer has prior ACH return on platform + purchase was for high-liquidity item',
    description: 'ACH returns with unauthorized codes are the ACH equivalent of chargebacks. Pattern of returns suggests intentional abuse of ACH settlement timing to receive goods before payment reversal.',
    conditions: [
      { field: 'payment.ach_return_code', operator: 'IN', value: ['R10', 'R29'] },
      { field: 'buyer.prior_ach_returns', operator: 'GREATER_THAN', value: 0 },
    ],
    tags: ['ACH-return', 'unauthorized', 'payment-reversal'],
    performance: { triggered: 2345, truePositives: 1876, falsePositives: 469, catchRate: 0.80, falsePositiveRate: 0.20 },
  },
];

// Computed stats
export const getStats = () => {
  const active = RULES.filter(r => r.status === 'ACTIVE').length;
  const shadow = RULES.filter(r => r.status === 'SHADOW').length;
  const planned = RULES.filter(r => r.status === 'PLANNED').length;
  const critical = RULES.filter(r => r.severity === 'CRITICAL').length;
  const avgCatchRate = RULES.reduce((sum, r) => sum + (r.performance?.catchRate || 0), 0) / RULES.length;
  const totalTriggered = RULES.reduce((sum, r) => sum + (r.performance?.triggered || 0), 0);
  const existingServices = SERVICES.filter(s => s.exists && s.id !== 'all').length;
  const proposedServices = SERVICES.filter(s => !s.exists).length;
  return { total: RULES.length, active, shadow, planned, critical, avgCatchRate, totalTriggered, existingServices, proposedServices };
};

// Service stats helper
export const getServiceStats = () => {
  const stats = {};
  SERVICES.filter(s => s.id !== 'all').forEach(s => {
    const rules = RULES.filter(r => r.service === s.id);
    stats[s.id] = {
      total: rules.length,
      active: rules.filter(r => r.status === 'ACTIVE').length,
      critical: rules.filter(r => r.severity === 'CRITICAL').length,
      avgCatchRate: rules.length > 0 ? rules.reduce((sum, r) => sum + (r.performance?.catchRate || 0), 0) / rules.length : 0,
    };
  });
  return stats;
};
