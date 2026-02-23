# Domain Knowledge Prompts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a markdown-based domain knowledge prompt library that agents load and inject into LLM context at decision time, making them genuine fraud domain experts.

**Architecture:** Markdown files with YAML frontmatter live in `backend/agents/prompts/`. A `PromptRegistry` singleton loads them at startup, indexes by agent and phase. Each `buildXxxPrompt()` function receives domain knowledge and injects it into the system prompt. BaseAgent queries the registry before every LLM call.

**Tech Stack:** Node.js (ES modules), fs/path for file loading, simple YAML frontmatter parsing (no dependency — regex-based).

---

### Task 1: Create the PromptRegistry Module

**Files:**
- Create: `backend/agents/core/prompt-registry.js`

**Step 1: Create `prompt-registry.js`**

```javascript
/**
 * PromptRegistry — Loads and serves domain knowledge prompts from markdown files.
 *
 * Scans backend/agents/prompts/ for .md files with YAML frontmatter,
 * indexes by agent and phase, serves concatenated knowledge per request.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.join(__dirname, '../prompts');
const DEFAULT_TOKEN_BUDGET = 4000;
const CHARS_PER_TOKEN = 4;

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { metadata, content } where metadata is the parsed frontmatter
 * and content is the markdown body after the frontmatter.
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, content: raw.trim() };

  const yamlBlock = match[1];
  const content = match[2].trim();
  const metadata = {};

  for (const line of yamlBlock.split('\n')) {
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      let value = kvMatch[2].trim();
      // Parse arrays: [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim());
      }
      metadata[key] = value;
    }
  }

  return { metadata, content };
}

class PromptRegistry {
  constructor() {
    this.prompts = new Map();        // id → { metadata, content, filePath }
    this.byAgent = new Map();        // agentKey → [prompt ids]
    this.byPhase = new Map();        // phase → [prompt ids]
    this.loaded = false;
  }

  /**
   * Load all .md files from the prompts directory.
   */
  loadPrompts() {
    this.prompts.clear();
    this.byAgent.clear();
    this.byPhase.clear();

    if (!existsSync(PROMPTS_DIR)) {
      console.warn('[PromptRegistry] Prompts directory not found:', PROMPTS_DIR);
      this.loaded = true;
      return;
    }

    this._scanDirectory(PROMPTS_DIR);
    this.loaded = true;
    console.log(`[PromptRegistry] Loaded ${this.prompts.size} domain knowledge prompts`);
  }

  _scanDirectory(dir) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        this._scanDirectory(fullPath);
      } else if (entry.endsWith('.md')) {
        this._loadFile(fullPath);
      }
    }
  }

  _loadFile(filePath) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const { metadata, content } = parseFrontmatter(raw);

      // Derive ID from filename if not in frontmatter
      const id = metadata.id || path.basename(filePath, '.md');
      // Derive agent from parent directory if not in frontmatter
      const agent = metadata.agent || path.basename(path.dirname(filePath));
      const phases = Array.isArray(metadata.phases) ? metadata.phases : ['think', 'observe'];
      const priority = metadata.priority || 'medium';

      const prompt = { id, agent, phases, priority, content, filePath, version: metadata.version || '1' };
      this.prompts.set(id, prompt);

      // Index by agent
      if (!this.byAgent.has(agent)) this.byAgent.set(agent, []);
      this.byAgent.get(agent).push(id);

      // Index by phase
      for (const phase of phases) {
        if (!this.byPhase.has(phase)) this.byPhase.set(phase, []);
        this.byPhase.get(phase).push(id);
      }
    } catch (e) {
      console.warn(`[PromptRegistry] Failed to load ${filePath}:`, e.message);
    }
  }

  /**
   * Get concatenated domain knowledge for a specific agent and phase.
   * @param {string} agentKey - Agent prompt directory name (e.g., 'seller-onboarding')
   * @param {string} phase - Reasoning phase ('think', 'plan', 'observe', 'reflect')
   * @param {number} tokenBudget - Maximum tokens for domain knowledge
   * @returns {string} Concatenated markdown or empty string
   */
  getPrompts(agentKey, phase, tokenBudget = DEFAULT_TOKEN_BUDGET) {
    if (!this.loaded) this.loadPrompts();

    // Collect matching prompts: shared + agent-specific, filtered by phase
    const candidateIds = new Set();
    const sharedIds = this.byAgent.get('shared') || [];
    const agentIds = this.byAgent.get(agentKey) || [];

    for (const id of [...sharedIds, ...agentIds]) {
      const prompt = this.prompts.get(id);
      if (prompt && prompt.phases.includes(phase)) {
        candidateIds.add(id);
      }
    }

    if (candidateIds.size === 0) return '';

    // Sort by priority: high > medium > low
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = [...candidateIds]
      .map(id => this.prompts.get(id))
      .sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));

    // Concatenate within token budget
    const maxChars = tokenBudget * CHARS_PER_TOKEN;
    let result = '';
    for (const prompt of sorted) {
      const section = `### ${prompt.id}\n\n${prompt.content}\n\n`;
      if (result.length + section.length > maxChars) {
        // Try to fit a truncated version
        const remaining = maxChars - result.length;
        if (remaining > 200) {
          result += section.slice(0, remaining - 3) + '...';
        }
        break;
      }
      result += section;
    }

    return result.trim();
  }

  /**
   * Get a specific prompt by ID.
   */
  getPromptById(id) {
    if (!this.loaded) this.loadPrompts();
    return this.prompts.get(id) || null;
  }

  /**
   * Reload all prompts from disk.
   */
  reload() {
    this.loaded = false;
    this.loadPrompts();
  }

  /**
   * Get registry statistics.
   */
  getStats() {
    if (!this.loaded) this.loadPrompts();
    return {
      totalPrompts: this.prompts.size,
      byAgent: Object.fromEntries([...this.byAgent].map(([k, v]) => [k, v.length])),
      byPhase: Object.fromEntries([...this.byPhase].map(([k, v]) => [k, v.length])),
      prompts: [...this.prompts.values()].map(p => ({ id: p.id, agent: p.agent, phases: p.phases, priority: p.priority }))
    };
  }
}

// Singleton
let instance = null;
export function getPromptRegistry() {
  if (!instance) {
    instance = new PromptRegistry();
    instance.loadPrompts();
  }
  return instance;
}
```

**Step 2: Verify the module loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/prompt-registry.js').then(m => { const r = m.getPromptRegistry(); console.log('PromptRegistry OK, stats:', JSON.stringify(r.getStats())); process.exit(0); })"`
Expected: `PromptRegistry OK` with `totalPrompts: 0` (no prompt files yet)

**Step 3: Commit**

```bash
git add backend/agents/core/prompt-registry.js
git commit -m "feat: add PromptRegistry for loading domain knowledge prompts

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Create Shared Domain Knowledge Prompts

**Files:**
- Create: `backend/agents/prompts/shared/fraud-patterns.md`
- Create: `backend/agents/prompts/shared/risk-signals.md`
- Create: `backend/agents/prompts/shared/regional-risk-factors.md`

**Step 1: Create `fraud-patterns.md`**

```markdown
---
id: fraud-patterns
agent: shared
phases: [think, observe, reflect]
priority: high
version: 1
---

# Common Fraud Typologies

## First-Party Fraud
The seller or buyer themselves commit fraud, not an external attacker.
- **Friendly fraud / chargeback abuse:** Legitimate purchase followed by false dispute. Look for: repeat dispute history, disputes filed after delivery confirmation, disputes on digital goods.
- **Return fraud:** Returning used, stolen, or counterfeit items. Look for: high return rates, returns of different items than ordered, wardrobing patterns.
- **Promotion abuse:** Creating multiple accounts to exploit signup bonuses or coupons. Look for: shared device fingerprints, similar email patterns, same payment methods across accounts.

## Third-Party Fraud
An external actor uses stolen or fabricated credentials.
- **Stolen identity:** Real person's documents used without consent. Look for: address mismatches with credit bureau, unusual login locations, sudden behavior change on established accounts.
- **Synthetic identity:** Fabricated identity combining real and fake data. Look for: thin credit file, no social media presence, SSN issued recently or to different age range, pristine credit history with no normal usage patterns.
- **Account takeover (ATO):** Legitimate account hijacked. Look for: password reset followed by immediate high-value activity, new device + new shipping address, email or phone number change followed by large transactions.

## Organized Fraud
Coordinated fraud involving multiple actors or accounts.
- **Fraud rings:** Multiple accounts operated by same group. Look for: shared attributes (IP, device, address, phone), coordinated timing of activity, similar listing patterns.
- **Money laundering:** Using the platform to move illicit funds. Look for: rapid buy-sell cycles with minimal margin, transactions with no economic rationale, sellers in high-risk jurisdictions with unusual volume.
- **Collusion:** Buyer and seller working together. Look for: reciprocal transactions, artificially inflated prices, no genuine shipping activity.

## Platform-Specific Fraud
Fraud targeting marketplace mechanics.
- **Dropship fraud:** Seller lists items they don't possess, ships from third party. Look for: shipping from different location than seller address, long fulfillment times, tracking numbers from retail stores.
- **Counterfeit goods:** Selling fake branded items. Look for: prices significantly below market, generic product photos, seller location inconsistent with brand distribution.
- **Review manipulation:** Fake reviews to boost reputation. Look for: burst of positive reviews in short window, reviewer accounts with thin history, identical review language patterns.
```

**Step 2: Create `risk-signals.md`**

```markdown
---
id: risk-signals
agent: shared
phases: [think, observe]
priority: high
version: 1
---

# Risk Signal Interpretation Guide

## Velocity Signals
Velocity measures how quickly actions occur. Abnormal velocity is one of the strongest fraud indicators.
- **Transaction velocity:** More than 5 transactions in 1 hour from same account is suspicious. More than 20 in 24 hours is highly suspicious.
- **Account creation velocity:** Multiple accounts from same device/IP in short window indicates organized fraud.
- **Listing velocity:** Seller creating 50+ listings in first hour suggests automated or fraudulent activity.
- **Failed attempt velocity:** Multiple failed payment attempts indicate card testing. 3+ failures in 10 minutes is a strong signal.

## Device Signals
Device characteristics reveal fraud infrastructure.
- **Emulators/VMs:** Detected virtual environments suggest fraud tooling. Weight: HIGH risk.
- **VPN/Proxy:** IP anonymization tools. Common in legitimate use, but combined with other signals becomes significant. Weight: MEDIUM alone, HIGH with other signals.
- **Device age:** New/never-seen devices are riskier. Devices seen across multiple accounts are very suspicious.
- **Browser fingerprint anomalies:** Mismatched timezone/language/screen resolution suggest spoofing.

## Behavioral Signals
How users interact with the platform reveals intent.
- **Session duration:** Very short sessions with high-value actions suggest automated fraud. Very long sessions with no action may indicate reconnaissance.
- **Navigation patterns:** Jumping directly to checkout without browsing is suspicious for buyers. Rapid form completion on seller onboarding may indicate pre-filled data.
- **Copy-paste behavior:** Pasting in all form fields suggests using pre-prepared data, common in synthetic identity fraud.

## Network Signals
Connections between entities reveal hidden relationships.
- **Shared payment methods:** Same card or bank account across multiple accounts is a strong fraud ring indicator.
- **Shared contact info:** Same phone or email (or slight variations) across accounts.
- **Address clustering:** Multiple accounts at the same physical address, especially if combined with different identities.
- **IP clustering:** Many accounts from same IP range, especially residential IPs that shouldn't have high account density.

## Interpreting Signal Combinations
Single signals are often benign. Signal combinations are what matter:
- VPN alone = LOW risk. VPN + new device + high-value transaction = HIGH risk.
- New account alone = LOW risk. New account + high-risk category + international = HIGH risk.
- Address mismatch alone = MEDIUM risk. Address mismatch + failed KYC + velocity spike = CRITICAL risk.
```

**Step 3: Create `regional-risk-factors.md`**

```markdown
---
id: regional-risk-factors
agent: shared
phases: [think, observe]
priority: medium
version: 1
---

# Regional Risk Factors

## High-Risk Jurisdictions
These regions have elevated fraud rates or regulatory concerns. Apply enhanced due diligence.
- **FATF Grey List countries:** Increased monitoring for money laundering. Check current FATF list for updates.
- **Sanctioned jurisdictions:** OFAC, EU, UN sanctions lists. Any match is a hard block — cannot approve.
- **Fraud hotspot regions:** Certain regions have disproportionate fraud origination rates. This is a risk factor, not a block — always combine with other signals.

## Cross-Border Risk
International transactions carry inherent additional risk.
- **Currency mismatch:** Seller in Country A, pricing in Country B's currency without clear business reason.
- **Shipping destination vs seller location:** Large geographic distance between seller and shipping origin may indicate dropshipping or triangulation fraud.
- **Time zone inconsistencies:** Account activity patterns inconsistent with claimed location.

## Document Verification by Region
Document reliability varies significantly by country.
- **Tier 1 (most reliable):** US, UK, EU, Canada, Australia, Japan — standardized documents, strong verification databases.
- **Tier 2 (reliable with caveats):** Brazil, India, Mexico, South Africa — valid documents but verification databases may be incomplete.
- **Tier 3 (enhanced verification needed):** Countries with less standardized document systems — require additional verification steps like video KYC or utility bill verification.

## Regulatory Context
Different regions have different compliance requirements.
- **EU/UK:** GDPR data handling, PSD2 strong customer authentication, 5AMLD/6AMLD anti-money laundering.
- **US:** BSA/AML requirements, state-specific money transmitter laws, FCRA for credit data.
- **APAC:** Varied — Singapore has strict AML, others may have less developed frameworks. Apply the strictest applicable standard.
```

**Step 4: Commit**

```bash
git add backend/agents/prompts/shared/
git commit -m "feat: add shared domain knowledge prompts (fraud patterns, risk signals, regional factors)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Create Seller Onboarding Prompts

**Files:**
- Create: `backend/agents/prompts/seller-onboarding/kyc-verification.md`
- Create: `backend/agents/prompts/seller-onboarding/business-categories.md`
- Create: `backend/agents/prompts/seller-onboarding/identity-red-flags.md`

**Step 1: Create `kyc-verification.md`**

```markdown
---
id: kyc-verification
agent: seller-onboarding
phases: [think, observe, reflect]
priority: high
version: 1
---

# KYC Verification Domain Knowledge

## Document Verification Best Practices

### Identity Documents
When evaluating identity documents, assess:
- **Format consistency:** Does the document number match the expected format for the issuing country? (e.g., US passports: 9 digits; UK passports: 9 digits starting with specific prefixes)
- **Expiry status:** Expired documents are not acceptable for onboarding. Documents expiring within 30 days warrant a flag.
- **Photo quality:** Low resolution, inconsistent lighting, or visible editing artifacts suggest manipulation.
- **MRZ (Machine Readable Zone):** If present, MRZ data should match the visual zone. Mismatches indicate forgery.
- **Security features:** Holograms, watermarks, microprinting. Absence on document types that should have them is a red flag.

### Business Documents
- **Registration validity:** Business registration should be current and active. Check registration number format against country standards.
- **Age of business:** Businesses less than 6 months old carry higher risk. Businesses less than 30 days old are very high risk.
- **Registered agent vs applicant:** If the registered agent is different from the applicant, verify the relationship.
- **Registered address:** PO boxes and virtual office addresses are higher risk. Verify the address exists and is appropriate for the business type.

## Name and Address Matching
- **Exact match not required:** Allow for common variations (Jr/Jr., Street/St, etc.)
- **Transliteration issues:** Names from non-Latin scripts may have multiple valid romanizations.
- **Maiden name / married name:** Document may show different surname than application.
- **Flag but don't auto-reject:** Minor mismatches should trigger REVIEW, not REJECT.

## Verification Failure Handling
- **Single verification failure:** If one check fails but others pass, route to REVIEW with the specific failure noted.
- **Multiple verification failures:** Two or more failures in critical checks (identity + business) → recommend REJECT.
- **Infrastructure failures:** If a verification service is down, do NOT auto-approve. Reduce confidence and note incomplete verification.
```

**Step 2: Create `business-categories.md`**

```markdown
---
id: business-categories
agent: seller-onboarding
phases: [think, plan, observe]
priority: high
version: 1
---

# Business Category Risk Profiles

## High-Risk Categories (Enhanced Due Diligence Required)
These categories have elevated fraud rates and require comprehensive verification.

- **Cryptocurrency / Digital Assets:** High money laundering risk, regulatory complexity. Require: enhanced KYC, source of funds verification, ongoing monitoring.
- **Adult Content / Services:** High chargeback rates, regulatory restrictions. Require: age verification infrastructure, content compliance checks.
- **Gambling / Gaming Credits:** Money laundering channel, regulatory licensing needed. Require: license verification, transaction monitoring.
- **Pharmaceuticals / Supplements:** Counterfeit risk, health safety concerns. Require: license verification, supply chain documentation.
- **Dropshipping (declared):** Quality control issues, fulfillment delays, high dispute rates. Require: supplier verification, shipping SLA commitments.
- **Firearms / Weapons:** Strict regulatory compliance needed. Require: FFL verification (US), export control checks.
- **CBD / Cannabis:** Legal status varies by jurisdiction. Require: jurisdiction-specific compliance verification.

## Medium-Risk Categories (Standard+ Verification)
- **Electronics:** High-value items attractive to fraudsters. Watch for: pricing significantly below market, bulk listings of latest devices.
- **Luxury Goods / Designer Items:** Counterfeit risk. Watch for: inconsistent pricing, lack of authenticity documentation, seller location inconsistent with supply chain.
- **Event Tickets:** Scalping and counterfeit tickets. Watch for: volume of listings, pricing patterns, delivery method.
- **Gift Cards / Stored Value:** Money laundering vehicle. Watch for: bulk purchases, resale patterns, source verification.
- **Automotive Parts:** Safety concerns with counterfeits. Watch for: pricing anomalies, brand inconsistencies.

## Low-Risk Categories (Standard Verification)
- **Books, Media, Music:** Low fraud rates, low average transaction value.
- **Clothing & Apparel (non-luxury):** Moderate return rates but low fraud.
- **Home & Garden:** Generally legitimate sellers, moderate risk.
- **Toys & Games:** Seasonal patterns but generally low risk.

## Category-Specific Decision Guidance
- For HIGH risk categories: minimum verification strategy should be COMPREHENSIVE (all tools run).
- For MEDIUM risk: STANDARD strategy is sufficient unless other risk signals are present.
- For LOW risk: BASIC strategy is acceptable for established-looking sellers.
- A seller in a HIGH risk category with a clean verification should still get APPROVE — category risk elevates scrutiny, not the decision itself.
```

**Step 3: Create `identity-red-flags.md`**

```markdown
---
id: identity-red-flags
agent: seller-onboarding
phases: [think, observe, reflect]
priority: high
version: 1
---

# Identity Fraud Indicators

## Synthetic Identity Patterns
Synthetic identities are fabricated by combining real and fake data elements. They are the hardest to detect.

- **Thin credit file:** The identity has little or no credit history. Legitimate thin files exist (young adults, immigrants), but combined with other signals this is significant.
- **Credit file age mismatch:** The credit file was established recently but the claimed date of birth suggests an older person.
- **No digital footprint:** No social media, no online presence matching the identity. Not definitive alone (some people are private), but a contributing signal.
- **Authorized user history:** Identity was built by being added as an authorized user on established accounts — a known synthetic identity tactic.
- **SSN/Tax ID anomalies:** Number was issued recently, or issued in a state different from claimed history. Number associated with a deceased individual.

## Stolen Identity Indicators
When a real person's identity is used without their consent.
- **Address doesn't match credit bureau:** The address provided doesn't appear in the identity's known address history.
- **Phone number is VOIP/prepaid:** Disposable phone numbers are higher risk. Traditional mobile or landline numbers linked to the identity are lower risk.
- **Email domain age:** Email created very recently (days before application) is suspicious. Established email (years old) with consistent usage is positive.
- **Rapid identity usage:** The same identity being used for multiple applications across platforms in a short window (consortium data).
- **Device not associated with identity:** The device used has never been seen with this identity before, and IS associated with other identities.

## Document Fraud Techniques
Common forgery methods to watch for:
- **Template-based forgery:** Documents created from templates. Often have consistent formatting errors across multiple fake documents.
- **Photo substitution:** Original document with replaced photo. Look for: inconsistent resolution between photo and document background, misaligned elements.
- **Data alteration:** Legitimate document with modified fields. Look for: font inconsistencies, alignment issues, pixel artifacts around changed areas.
- **Complete fabrication:** Entirely fake documents. Often fail format validation (wrong number of digits, invalid check digits).

## Decision Guidance
- **Single red flag:** Note it, increase scrutiny, but don't auto-reject. Many have innocent explanations.
- **Two correlated red flags:** Route to REVIEW. Example: thin credit file + VOIP phone.
- **Three or more red flags:** Strong REJECT recommendation. Example: thin credit + VOIP + recently created email + address mismatch.
- **Any sanctioned/watchlist match:** Hard REJECT regardless of other factors. This is a policy override.
```

**Step 4: Commit**

```bash
git add backend/agents/prompts/seller-onboarding/
git commit -m "feat: add seller onboarding domain knowledge prompts (KYC, categories, identity)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Create Fraud Investigation and Remaining Agent Prompts

**Files:**
- Create: `backend/agents/prompts/fraud-investigation/transaction-patterns.md`
- Create: `backend/agents/prompts/fraud-investigation/consortium-signals.md`
- Create: `backend/agents/prompts/alert-triage/priority-guidelines.md`
- Create: `backend/agents/prompts/rule-optimization/rule-design-principles.md`

**Step 1: Create `transaction-patterns.md`**

```markdown
---
id: transaction-patterns
agent: fraud-investigation
phases: [think, observe, reflect]
priority: high
version: 1
---

# Transaction Analysis Domain Knowledge

## Velocity Analysis
- **Normal velocity baseline:** Most legitimate sellers process 1-20 transactions per day. Spikes above 3x normal daily volume warrant investigation.
- **Micro-transaction patterns:** Many small transactions ($1-5) in rapid succession indicate card testing. The fraudster tests stolen cards before making large purchases.
- **Escalation pattern:** Gradually increasing transaction amounts over hours/days. Starts small to build trust, then one large fraudulent transaction.

## Amount Analysis
- **Round number transactions:** Legitimate purchases rarely end in .00 at high values. Multiple $500.00 or $1000.00 transactions are suspicious.
- **Just-below-threshold:** Transactions clustered just below review thresholds (e.g., multiple $499 transactions when $500 triggers review) indicate threshold knowledge.
- **Inconsistent with business type:** A book seller processing $5,000 transactions, or a luxury goods seller processing $5 transactions.

## Geographic Analysis
- **Impossible travel:** Two transactions from locations that are geographically impossible to travel between in the elapsed time. (e.g., New York and London 30 minutes apart)
- **Shipping/billing mismatch:** Especially significant when shipping address is in a different country than billing address.
- **High-risk origin + high-value:** Transaction originating from high-risk region with above-average value.

## Device and Session Analysis
- **Device switching:** Same account using multiple devices in short window. One device per session is normal; 3+ devices in an hour is suspicious.
- **Session anomalies:** Very short session with high-value purchase (under 60 seconds from login to checkout).
- **Fingerprint mismatch:** Browser reports one OS/device but behavioral signals suggest another.

## ML Model Signal Interpretation
When ML models provide a fraud score:
- **Score 0-30:** Low risk. Approve unless other strong signals present.
- **Score 31-60:** Medium risk. Combine with rule-based signals for final decision.
- **Score 61-85:** High risk. Should trigger investigation regardless of other signals.
- **Score 86-100:** Very high risk. Strong recommendation to block.
- **Model confidence matters:** A score of 70 with high model confidence is more actionable than 80 with low confidence.
```

**Step 2: Create `consortium-signals.md`**

```markdown
---
id: consortium-signals
agent: fraud-investigation
phases: [think, observe]
priority: medium
version: 1
---

# Consortium and Shared Intelligence

## What Consortium Data Means
Consortium data is shared fraud intelligence across multiple merchants/platforms. It provides signals you cannot generate from your own data alone.

## Interpreting Consortium Signals
- **Consortium velocity:** Number of applications or transactions across ALL participating platforms. High consortium velocity means the identity/payment method is being used aggressively across the ecosystem — strong fraud signal.
- **Shared negative data:** Chargebacks, fraud confirmations, account closures from other platforms. Any confirmed fraud at another platform is a strong signal but not definitive (false positives happen).
- **Consortium fraud score:** Aggregate risk score across platforms. Treat as HIGH confidence signal — it represents collective intelligence.

## Freshness and Confidence
- **Data within 24 hours:** Very high confidence. The signal is current and actionable.
- **Data 1-7 days old:** High confidence. Still very relevant.
- **Data 7-30 days old:** Medium confidence. May reflect resolved issues.
- **Data older than 30 days:** Low confidence. Use as context, not as primary decision factor.

## Cross-Merchant Pattern Detection
- **Same identity, multiple merchants:** If the same identity is onboarding at 3+ platforms simultaneously, this is a strong synthetic identity or fraud ring indicator.
- **Same payment method, different identities:** Different people using the same payment method across platforms — indicates shared fraudulent payment instruments.
- **Velocity across merchants:** Even if each merchant sees low individual velocity, the aggregate velocity across the consortium reveals the true activity level.
```

**Step 3: Create `priority-guidelines.md`**

```markdown
---
id: priority-guidelines
agent: alert-triage
phases: [think, plan, observe]
priority: high
version: 1
---

# Alert Prioritization Guidelines

## Priority Framework
Prioritize alerts based on three dimensions: financial impact, time sensitivity, and evidence strength.

### Financial Impact
- **CRITICAL (>$10,000):** Large-value transactions or accounts with high cumulative exposure. Assign to senior analyst immediately.
- **HIGH ($1,000-$10,000):** Significant financial exposure. Process within 1 hour SLA.
- **MEDIUM ($100-$1,000):** Moderate exposure. Process within 4 hour SLA.
- **LOW (<$100):** Minimal financial exposure. Process within 24 hour SLA. Consider auto-decisioning.

### Time Sensitivity
- **Account takeover alerts:** CRITICAL time sensitivity. The longer an ATO persists, the more damage occurs. Prioritize above all else.
- **Active transaction alerts:** HIGH. Transaction may still be reversible if caught quickly.
- **Onboarding alerts:** MEDIUM. Seller hasn't transacted yet, so exposure is limited. But don't delay excessively — fraudsters may list items quickly.
- **Rule performance alerts:** LOW. These are optimization opportunities, not active threats.

### Evidence Strength
- **Multiple strong signals:** Alerts with 3+ corroborating signals should be prioritized. The investigation is likely to be conclusive.
- **Single signal alerts:** May be false positives. Lower priority unless the single signal is very strong (e.g., confirmed consortium fraud).

## Analyst Matching
- **ATO alerts → ATO specialist team:** Domain expertise matters for account takeover.
- **High-value/complex → Senior analysts:** Experience matters for nuanced decisions.
- **Pattern-based / rule-triggered → Junior analysts:** Good training opportunities, lower complexity.
- **Workload balancing:** No analyst should have more than 20 active alerts. Redistribute if thresholds exceeded.

## Alert Fatigue Management
- **Group related alerts:** Multiple alerts about the same seller/buyer should be grouped as one case.
- **Suppress duplicates:** If an alert is generated for a seller already under active investigation, suppress the new alert and add it as context to the existing case.
- **Auto-close low-confidence:** Alerts from rules with >50% false positive rate in the past 30 days should be flagged for rule review, not assigned to analysts.
```

**Step 4: Create `rule-design-principles.md`**

```markdown
---
id: rule-design-principles
agent: rule-optimization
phases: [think, observe, reflect]
priority: high
version: 1
---

# Rule Engineering Best Practices

## Rule Quality Metrics
- **Precision:** Of all transactions the rule flags, what percentage are actually fraudulent? Target: >60% for production rules.
- **Recall:** Of all fraudulent transactions, what percentage does this rule catch? Balance against precision.
- **False positive rate:** Percentage of legitimate transactions incorrectly flagged. Target: <5% for customer-facing rules.
- **Coverage:** What percentage of total fraud does this rule address? Rules covering <1% of fraud may not be worth the operational cost.

## Threshold Tuning Methodology
- **Never change thresholds by more than 10% in a single adjustment.** Large changes can have unpredictable effects.
- **Use simulation before deploying.** Run proposed threshold against historical data to predict impact.
- **Monitor for 7 days after change.** Track precision, recall, and false positive rate daily.
- **Revert if false positive rate increases by >20% relative.** Customer friction costs compound quickly.

## Rule Overlap and Redundancy
- **Identify overlapping rules:** Two rules catching the same transactions add operational cost without additional fraud prevention.
- **Consolidate or specialize:** Either merge overlapping rules or specialize each to catch distinct fraud subtypes.
- **Measure marginal value:** If removing a rule would miss <0.1% of fraud, consider retiring it.

## Rule Lifecycle
- **New rule (0-30 days):** Shadow mode — log but don't block. Measure precision on flagged transactions.
- **Validated rule (30-90 days):** Production mode with close monitoring. Weekly precision reviews.
- **Established rule (90+ days):** Standard monitoring. Monthly performance reviews.
- **Deprecated rule:** If precision drops below 40% for 30 consecutive days, recommend retirement.

## A/B Testing Rule Changes
- **Traffic split:** 50/50 is ideal for statistical significance. Minimum 20% treatment group.
- **Duration:** Minimum 7 days, ideally 14 days to capture weekly patterns.
- **Success metric:** Primary metric should be fraud catch rate. Secondary: false positive rate, customer escalation rate.
- **Statistical significance:** Require p < 0.05 before declaring a winner. Don't peek at results before minimum duration.
```

**Step 5: Commit**

```bash
git add backend/agents/prompts/fraud-investigation/ backend/agents/prompts/alert-triage/ backend/agents/prompts/rule-optimization/
git commit -m "feat: add fraud investigation, alert triage, and rule optimization domain prompts

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Integrate PromptRegistry into Prompt Templates

**Files:**
- Modify: `backend/agents/core/prompt-templates.js`

**Step 1: Add `domainKnowledge` parameter to all 4 prompt builders**

In `buildThinkPrompt`, add `domainKnowledge` to the destructured params and inject it into the system prompt:

Change the function signature from:
```javascript
export function buildThinkPrompt({ agentName, agentRole, input, recentMemory, knowledgeResults, patternMatches, tools }) {
```
to:
```javascript
export function buildThinkPrompt({ agentName, agentRole, input, recentMemory, knowledgeResults, patternMatches, tools, domainKnowledge }) {
```

Change the system prompt to include domain knowledge:
```javascript
  const domainSection = domainKnowledge ? `\n\n## Domain Expertise\n${domainKnowledge}\n` : '';

  const system = `You are ${agentName}, a ${agentRole} agent in a fraud detection platform.
${domainSection}
Your job is to analyze the input and provide a structured understanding of the situation.
...rest unchanged...`;
```

Apply the **same pattern** to `buildPlanPrompt`, `buildObservePrompt`, and `buildReflectPrompt`:
1. Add `domainKnowledge` to the destructured params
2. Build the `domainSection` string
3. Insert `${domainSection}` after the first line of the system prompt

For `buildPlanPrompt`:
```javascript
export function buildPlanPrompt({ agentName, agentRole, thinkResult, longTermMemory, tools, input, domainKnowledge }) {
  const domainSection = domainKnowledge ? `\n\n## Domain Expertise\n${domainKnowledge}\n` : '';
  const system = `You are ${agentName}, a ${agentRole} agent. Based on your analysis, decide which tools to use and in what order.
${domainSection}
You MUST return valid JSON...`;
```

For `buildObservePrompt`:
```javascript
export function buildObservePrompt({ agentName, agentRole, actions, input, domainKnowledge }) {
  const domainSection = domainKnowledge ? `\n\n## Domain Expertise\n${domainKnowledge}\n` : '';
  const system = `You are ${agentName}, a ${agentRole} agent. You have completed your investigation. Synthesize all evidence into a final assessment.
${domainSection}
You MUST return valid JSON...`;
```

For `buildReflectPrompt`:
```javascript
export function buildReflectPrompt({ agentName, agentRole, input, evidence, proposedDecision, riskScore, confidence, chainOfThought, domainKnowledge }) {
  const domainSection = domainKnowledge ? `\n\n## Domain Expertise\n${domainKnowledge}\n` : '';
  const system = `You are a critical reviewer auditing a ${agentRole} agent's decision in a fraud detection platform.
${domainSection}
Your job is to find flaws...`;
```

**Step 2: Verify module loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/prompt-templates.js').then(m => { const r = m.buildThinkPrompt({ agentName: 'Test', agentRole: 'test', input: {}, domainKnowledge: 'TEST KNOWLEDGE' }); console.log('Has domain:', r.system.includes('TEST KNOWLEDGE')); process.exit(0); })"`
Expected: `Has domain: true`

**Step 3: Commit**

```bash
git add backend/agents/core/prompt-templates.js
git commit -m "feat: add domainKnowledge parameter to all prompt template builders

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Integrate PromptRegistry into BaseAgent

**Files:**
- Modify: `backend/agents/core/base-agent.js`

**Step 1: Add import**

After the existing `import { getEvalTracker } from './eval-tracker.js';` line, add:

```javascript
import { getPromptRegistry } from './prompt-registry.js';
```

**Step 2: Add to constructor and agent-to-prompt mapping**

After `this.evalTracker = getEvalTracker();` in the constructor, add:

```javascript
    this.promptRegistry = getPromptRegistry();
```

Add a constant at the top of the file (after the eventBus import block, before the `export class BaseAgent`):

```javascript
// Map agent IDs to prompt directory names
const AGENT_PROMPT_MAP = {
  'SELLER_ONBOARDING': 'seller-onboarding',
  'FRAUD_INVESTIGATOR': 'fraud-investigation',
  'ALERT_TRIAGE': 'alert-triage',
  'RULE_OPTIMIZER': 'rule-optimization'
};
```

**Step 3: Add helper method to BaseAgent**

Add this method to the BaseAgent class (after the constructor):

```javascript
  /**
   * Get the prompt directory key for this agent.
   */
  getPromptKey() {
    return AGENT_PROMPT_MAP[this.agentId] || this.agentId.toLowerCase().replace(/_/g, '-');
  }
```

**Step 4: Wire domain knowledge into think()**

In the `think()` method, where `buildThinkPrompt` is called, add domain knowledge. Find:

```javascript
        const { system, user } = buildThinkPrompt({
          agentName: this.name,
          agentRole: this.role,
          input,
          recentMemory,
          knowledgeResults,
          patternMatches,
          tools: this.tools
        });
```

Change to:

```javascript
        const domainKnowledge = this.promptRegistry.getPrompts(this.getPromptKey(), 'think');
        const { system, user } = buildThinkPrompt({
          agentName: this.name,
          agentRole: this.role,
          input,
          recentMemory,
          knowledgeResults,
          patternMatches,
          tools: this.tools,
          domainKnowledge
        });
```

**Step 5: Wire domain knowledge into plan()**

Find the `buildPlanPrompt` call in `plan()` and add:

```javascript
        const domainKnowledge = this.promptRegistry.getPrompts(this.getPromptKey(), 'plan');
        const { system, user } = buildPlanPrompt({
          agentName: this.name,
          agentRole: this.role,
          thinkResult: analysis,
          longTermMemory,
          tools: this.tools,
          input: context?.input || context,
          domainKnowledge
        });
```

**Step 6: Wire domain knowledge into observe()**

Find the `buildObservePrompt` call in `observe()` and add:

```javascript
        const domainKnowledge = this.promptRegistry.getPrompts(this.getPromptKey(), 'observe');
        const { system, user } = buildObservePrompt({
          agentName: this.name,
          agentRole: this.role,
          actions,
          input: context?.input || context,
          domainKnowledge
        });
```

**Step 7: Wire domain knowledge into reflect()**

Find the `buildReflectPrompt` call in `reflect()` and add:

```javascript
        const domainKnowledge = this.promptRegistry.getPrompts(this.getPromptKey(), 'reflect');
        const { system, user } = buildReflectPrompt({
          agentName: this.name,
          agentRole: this.role,
          input,
          evidence: actions,
          proposedDecision,
          riskScore: observation?.riskScore || observation?.overallRisk?.score,
          confidence: observation?.confidence,
          domainKnowledge
        });
```

**Step 8: Verify module loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/base-agent.js').then(m => { console.log('BaseAgent OK'); process.exit(0); })"`
Expected: `BaseAgent OK`

**Step 9: Commit**

```bash
git add backend/agents/core/base-agent.js
git commit -m "feat: wire PromptRegistry into BaseAgent reasoning phases

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Integration Test

**Files:**
- Create: `backend/agents/core/__tests__/prompt-registry.test.js`

**Step 1: Create test file**

```javascript
/**
 * Integration test: verifies PromptRegistry loads and serves domain knowledge prompts.
 * Run with: node backend/agents/core/__tests__/prompt-registry.test.js
 */

import { getPromptRegistry } from '../prompt-registry.js';

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  const registry = getPromptRegistry();
  const stats = registry.getStats();

  // ── Test 1: Prompts loaded ──
  console.log('\nTest 1: Prompts loaded from disk');
  assert(stats.totalPrompts >= 10, `Loaded ${stats.totalPrompts} prompts (expected >= 10)`);

  // ── Test 2: Shared prompts exist ──
  console.log('\nTest 2: Shared prompts indexed');
  assert(stats.byAgent.shared >= 3, `Shared prompts: ${stats.byAgent.shared} (expected >= 3)`);

  // ── Test 3: Agent-specific prompts exist ──
  console.log('\nTest 3: Agent-specific prompts indexed');
  assert(stats.byAgent['seller-onboarding'] >= 3, `Seller onboarding prompts: ${stats.byAgent['seller-onboarding']}`);
  assert(stats.byAgent['fraud-investigation'] >= 2, `Fraud investigation prompts: ${stats.byAgent['fraud-investigation']}`);
  assert(stats.byAgent['alert-triage'] >= 1, `Alert triage prompts: ${stats.byAgent['alert-triage']}`);
  assert(stats.byAgent['rule-optimization'] >= 1, `Rule optimization prompts: ${stats.byAgent['rule-optimization']}`);

  // ── Test 4: getPrompts returns content for seller-onboarding think phase ──
  console.log('\nTest 4: getPrompts returns domain knowledge');
  const onboardingThink = registry.getPrompts('seller-onboarding', 'think');
  assert(onboardingThink.length > 0, 'Seller onboarding think phase has content');
  assert(onboardingThink.includes('KYC') || onboardingThink.includes('fraud') || onboardingThink.includes('risk'),
    'Content contains fraud domain knowledge');

  // ── Test 5: Shared prompts included in agent queries ──
  console.log('\nTest 5: Shared prompts merged with agent prompts');
  assert(onboardingThink.includes('fraud-patterns') || onboardingThink.includes('risk-signals') || onboardingThink.includes('Fraud'),
    'Shared knowledge merged into agent prompts');

  // ── Test 6: Unknown agent returns shared-only ──
  console.log('\nTest 6: Unknown agent gets shared prompts');
  const unknownAgent = registry.getPrompts('unknown-agent', 'think');
  assert(unknownAgent.length > 0, 'Unknown agent still gets shared prompts');

  // ── Test 7: Token budget respected ──
  console.log('\nTest 7: Token budget');
  const tiny = registry.getPrompts('seller-onboarding', 'think', 10); // 10 tokens = 40 chars
  assert(tiny.length <= 200, `Tiny budget output length: ${tiny.length} (expected <= 200)`);

  // ── Test 8: getPromptById works ──
  console.log('\nTest 8: getPromptById');
  const fraudPatterns = registry.getPromptById('fraud-patterns');
  assert(fraudPatterns !== null, 'fraud-patterns prompt found');
  assert(fraudPatterns.agent === 'shared', 'fraud-patterns is shared');
  assert(fraudPatterns.priority === 'high', 'fraud-patterns is high priority');

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
```

**Step 2: Run test**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && node backend/agents/core/__tests__/prompt-registry.test.js`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add backend/agents/core/__tests__/prompt-registry.test.js
git commit -m "test: add integration tests for PromptRegistry

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Final Verification

**Step 1: Run both test suites**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && node backend/agents/core/__tests__/prompt-registry.test.js && node backend/agents/core/__tests__/reflect-and-eval.test.js`
Expected: All tests PASS

**Step 2: Verify server starts**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "const t = setTimeout(() => { console.log('Server OK'); process.exit(0); }, 5000); import('./gateway/server.js').then(() => {}).catch(err => { console.error('ERROR:', err.message); process.exit(1); });"`
Expected: Server starts without import errors
