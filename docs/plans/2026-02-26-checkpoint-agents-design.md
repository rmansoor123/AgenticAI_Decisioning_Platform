# Checkpoint Agents Design — Domain-Specific Autonomous Monitoring

**Goal:** Build 4 autonomous checkpoint agents that continuously monitor their respective seller lifecycle domains, detect domain-specific fraud patterns, and coordinate with existing agents (especially Cross-Domain Correlation and Policy Evolution).

**Architecture:** Each agent extends `AutonomousAgent`, runs on its own interval, subscribes to domain-specific event bus topics, and implements `_buildScanInput()` and `_postCycle()`. All follow the established singleton pattern with `getXxxAgent()` factory functions.

**Tech Stack:** Node.js ES modules, `AutonomousAgent` base class, event bus, agent-messenger, `db_ops`, risk-profile service, knowledge-base, confidence-calibrator, self-correction, pattern-memory.

---

## Section 1: Payout Risk Agent

### Purpose

Monitors payout requests and bank account changes to detect cash-out fraud, velocity anomalies, and post-ATO extraction patterns. Payouts are the final extraction point — catching fraud here prevents actual financial loss.

### Scan Configuration

- **agentId**: `PAYOUT_RISK`
- **name**: `Payout Risk Monitor`
- **Interval**: 10 minutes (600000ms)
- **Event acceleration**: 3+ payout events within 5 minutes
- **Subscribed topics**: `risk:event:created` (filtered to payout domain), `decision:made`, `profile:updated`

### Cycle Steps

1. **Collect** — Pull new payout-related risk events since last scan
2. **Think** — Analyze payout patterns per seller: velocity, amounts, timing relative to bank changes
3. **Plan** — Select investigation tools based on suspicion level
4. **Act** — Execute tools
5. **Observe** — Synthesize findings with citations
6. **Reflect** — Evaluate false positive risk for each flagged seller

### Fraud Patterns Detected

- **CASH_OUT_VELOCITY**: >3 payouts in 24h OR payout amount > 2x seller's 30-day average
- **BANK_CHANGE_PAYOUT**: Bank account changed within 48h of a large payout request
- **FIRST_PAYOUT_ANOMALY**: First payout on account < 14 days old AND amount > $1000
- **PAYOUT_AFTER_DISPUTES**: Payout requested while seller has 2+ open disputes
- **ROUND_AMOUNT_CLUSTER**: 3+ payouts with exact round amounts ($1000, $5000) within 7 days

### Tools (5)

| Tool | Purpose |
|---|---|
| `get_payout_history` | Full payout timeline for a seller with amounts and statuses |
| `get_payout_velocity` | Payout frequency/amounts over configurable time windows |
| `check_bank_change_timing` | Time between most recent bank change and payout requests |
| `get_seller_dispute_status` | Open disputes, chargeback history, resolution rates |
| `compare_payout_to_revenue` | Payout amounts vs actual transaction revenue for the seller |

### Outputs Per Cycle

- Risk events emitted with domain `payout`, tagged with pattern type
- Cases created for high-confidence detections (calibrated score > 0.7)
- Broadcasts to Cross-Domain Correlation Agent for trajectory analysis
- Knowledge write-back for confirmed patterns

---

## Section 2: Listing Intelligence Agent

### Purpose

Monitors listing creation and modification to detect counterfeit goods, catalog manipulation, below-market pricing schemes, and coordinated bulk listing fraud. Listings are the entry point for triangulation and dropship fraud.

### Scan Configuration

- **agentId**: `LISTING_INTELLIGENCE`
- **name**: `Listing Intelligence Monitor`
- **Interval**: 15 minutes (900000ms)
- **Event acceleration**: 5+ listing events within 5 minutes (bulk creation burst)
- **Subscribed topics**: `risk:event:created` (filtered to listing domain), `listing:created`, `listing:updated`

### Cycle Steps

1. **Collect** — Pull new listing-related events since last scan
2. **Think** — Analyze listing patterns: pricing anomalies, bulk creation, content similarity
3. **Plan** — Select investigation tools
4. **Act** — Execute tools
5. **Observe** — Synthesize with citations
6. **Reflect** — Consider legitimate reasons (clearance sales, new inventory drops)

### Fraud Patterns Detected

- **BELOW_MARKET_PRICING**: Listing price < 50% of category median
- **BULK_CREATION_BURST**: >10 listings created within 1 hour on a single account
- **CATEGORY_MISMATCH**: Listing category doesn't match seller's historical pattern
- **DUPLICATE_CONTENT**: Listing description similarity > 90% across different sellers
- **PROHIBITED_KEYWORDS**: Listing contains terms associated with restricted/counterfeit goods

### Tools (5)

| Tool | Purpose |
|---|---|
| `get_listing_history` | Full listing timeline for a seller with statuses and changes |
| `get_category_pricing` | Median/mean/stddev pricing for a product category |
| `check_listing_velocity` | Listing creation rate over time windows |
| `find_similar_listings` | Content similarity search across listings (TF-IDF based) |
| `get_seller_category_profile` | Seller's historical category distribution and shifts |

### Outputs Per Cycle

- Risk events emitted with domain `listing`, tagged with pattern type
- Cases created for high-confidence detections
- Broadcasts to Cross-Domain Correlation Agent
- Similar listing clusters stored to knowledge base

---

## Section 3: Profile Mutation Agent

### Purpose

Monitors seller profile changes (bank account, address, email, phone, identity documents) to detect account takeover follow-through, identity manipulation, and evasion patterns. Profile changes are the canary signal for ATO and pre-cash-out activity.

### Scan Configuration

- **agentId**: `PROFILE_MUTATION`
- **name**: `Profile Mutation Tracker`
- **Interval**: 10 minutes (600000ms)
- **Event acceleration**: 3+ profile change events within 5 minutes
- **Subscribed topics**: `risk:event:created` (filtered to profile_updates domain), `profile:updated`

### Cycle Steps

1. **Collect** — Pull new profile update events since last scan
2. **Think** — Analyze change velocity, change types, device/IP context
3. **Plan** — Select tools based on change patterns
4. **Act** — Execute tools
5. **Observe** — Synthesize with citations
6. **Reflect** — Consider legitimate reasons (business relocation, name change)

### Fraud Patterns Detected

- **RAPID_IDENTITY_CHANGES**: 3+ identity document uploads within 24h (especially after rejection)
- **BANK_CHANGE_NEAR_DISPUTE**: Bank account changed while disputes are open
- **CONTACT_CHANGE_NEW_DEVICE**: Email or phone changed from a device not in seller's history
- **ADDRESS_ROTATION**: 3+ address changes within 7 days
- **MULTI_FIELD_CHANGE**: Bank + email + phone all changed within 24h (ATO signature)

### Tools (5)

| Tool | Purpose |
|---|---|
| `get_profile_change_history` | Full profile change timeline for a seller |
| `get_change_velocity` | Profile change frequency by type over time windows |
| `check_device_history` | Whether the device used for changes is known for this seller |
| `get_dispute_context` | Open disputes and their timing relative to profile changes |
| `compare_identity_documents` | Compare current vs previous identity submissions |

### Outputs Per Cycle

- Risk events emitted with domain `profile_updates`, tagged with pattern type
- Cases created for high-confidence ATO-follow-through detections
- Broadcasts to Cross-Domain Correlation Agent (profile changes feed into trajectory)
- Knowledge write-back for confirmed identity manipulation patterns

---

## Section 4: Returns Abuse Agent

### Purpose

Monitors return requests and refund patterns to detect buyer-side fraud (serial returners, empty box schemes, wardrobing), return timing collusion, and refund abuse. Returns are the primary vector for buyer-initiated fraud on the platform.

### Scan Configuration

- **agentId**: `RETURNS_ABUSE`
- **name**: `Returns Abuse Detector`
- **Interval**: 20 minutes (1200000ms)
- **Event acceleration**: 4+ return events within 10 minutes
- **Subscribed topics**: `risk:event:created` (filtered to returns domain), `return:created`, `return:refunded`

### Cycle Steps

1. **Collect** — Pull new return events since last scan
2. **Think** — Analyze return patterns: frequency, reasons, amounts, timing
3. **Plan** — Select tools
4. **Act** — Execute tools
5. **Observe** — Synthesize with citations
6. **Reflect** — Consider legitimate high-return categories (apparel, electronics)

### Fraud Patterns Detected

- **SERIAL_RETURNER**: >5 returns in 30 days from a single buyer/seller combination
- **REFUND_EXCEEDS_PURCHASE**: Refund amount > original purchase price
- **EMPTY_BOX_SIGNAL**: Return filed with "item not as described" + weight discrepancy
- **WARDROBING**: Return of high-value items after single brief use (apparel, electronics)
- **POST_PAYOUT_RETURNS**: Cluster of returns filed within 48h of seller's payout (collusion signal)

### Tools (5)

| Tool | Purpose |
|---|---|
| `get_return_history` | Full return timeline for a seller with reasons and statuses |
| `get_return_rate_stats` | Return rates by category, buyer, and time window |
| `check_refund_amount_validity` | Compare refund amounts to original transaction amounts |
| `get_buyer_return_profile` | Buyer's return history across all sellers (serial returner check) |
| `check_payout_return_timing` | Correlation between seller payouts and return filing times |

### Outputs Per Cycle

- Risk events emitted with domain `returns`, tagged with pattern type
- Cases created for confirmed abuse patterns
- Broadcasts to Cross-Domain Correlation Agent
- Knowledge write-back for new abuse patterns discovered

---

## Section 5: Platform Integration

### Server Integration

All 4 agents initialize at startup after existing autonomous agents, register with orchestrator, and call `start()`. Graceful shutdown via SIGTERM calls `stop()` on all.

### API Endpoints

Each agent gets a router at `/api/agents/{agent-slug}/` with standard endpoints:

- `GET /status` — Running state, last/next run, events buffered
- `GET /detections` — Recent detections with pattern, score, status
- `GET /history` — Cycle history (last 50)
- `POST /scan` — Force immediate scan

**Payout Risk** → `/api/agents/payout-risk/`
**Listing Intelligence** → `/api/agents/listing-intelligence/`
**Profile Mutation** → `/api/agents/profile-mutation/`
**Returns Abuse** → `/api/agents/returns-abuse/`

### Frontend

Add all 4 agents as tabs on the existing `/autonomous` page (`AutonomousAgents.jsx`). Each tab shows:

- Status card (running/stopped, last scan, events buffered, cycle count)
- Detections table (seller, pattern, score, confidence, status, timestamp)
- Cycle history (expandable runs)

### WebSocket Events

- `payout-risk:detection`, `payout-risk:cycle-complete`
- `listing-intelligence:detection`, `listing-intelligence:cycle-complete`
- `profile-mutation:detection`, `profile-mutation:cycle-complete`
- `returns-abuse:detection`, `returns-abuse:cycle-complete`

### Agent Coordination

All 4 agents:

- Broadcast detections to Cross-Domain Correlation Agent (feeds trajectory analysis)
- Receive rule updates from Policy Evolution Agent
- Register with orchestrator for help-request routing
- Write confirmed patterns to knowledge base for retrieval

### AGENT_PROMPT_MAP Additions

```javascript
'PAYOUT_RISK': 'payout-risk',
'LISTING_INTELLIGENCE': 'listing-intelligence',
'PROFILE_MUTATION': 'profile-mutation',
'RETURNS_ABUSE': 'returns-abuse'
```
