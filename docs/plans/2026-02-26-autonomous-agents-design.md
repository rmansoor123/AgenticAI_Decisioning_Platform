# Autonomous Agents Design — Cross-Domain Correlation & Policy Evolution

**Goal:** Build two truly autonomous agents that self-initiate, detect multi-step fraud patterns across domains, autonomously create and graduate fraud rules, and implement every agentic AI concept in the framework.

**Architecture:** Interval-based scan loops with event acceleration, built on a new `AutonomousAgent` base class extending `BaseAgent`. Both agents run full TPAOR reasoning per cycle, coordinate with each other and existing agents, and manage their own learning and adaptation.

**Tech Stack:** Node.js ES modules, BaseAgent framework, event bus, agent-messenger, orchestrator, simulation service, decision engine, risk-profile service, confidence-calibrator, adversarial-tester, citation-tracker, pattern-memory, knowledge-base.

---

## Section 1: AutonomousAgent Base Class

A new abstract base class extending `BaseAgent` that adds autonomous operation. Every future self-initiating agent inherits from this.

### Lifecycle

```
start() → _runLoop() cycles indefinitely
                ↓
         _collectSignals()     ← accumulates events between runs
                ↓
         _shouldRunNow()       ← interval elapsed OR urgent event threshold hit
                ↓ yes
         reason(accumulatedInput)   ← full TPAOR loop from BaseAgent
                ↓
         _postCycle(result)    ← emit findings, schedule next
                ↓
         sleep until next trigger
```

### Properties Added Over BaseAgent

| Property | Purpose |
|---|---|
| `scanIntervalMs` | Base interval between runs (configurable per agent) |
| `eventAccelerationThreshold` | Number of urgent events that trigger an early run |
| `eventBuffer` | Accumulates risk events, decisions, and signals between scans |
| `isRunning` | Boolean — prevents overlapping runs |
| `lastRunAt` | Timestamp of last completed cycle |
| `runHistory` | Circular buffer of last 50 cycle summaries (for observability) |
| `subscribedTopics` | Event bus topics this agent listens to |

### Key Methods

- **`start()`** — Registers event bus listeners, starts the interval timer, logs to metrics.
- **`stop()`** — Clears interval, unsubscribes from events, flushes state.
- **`_onEvent(event)`** — Pushes to `eventBuffer`, checks if `eventAccelerationThreshold` reached → triggers early run.
- **`_shouldRunNow()`** — Returns true if interval elapsed OR buffer has enough urgent signals.
- **`_buildScanInput()`** — Abstract. Each agent transforms its event buffer into structured input for TPAOR.
- **`_postCycle(result)`** — Abstract. Each agent acts on findings (emit risk events, create rules, broadcast alerts).
- **`getCycleHistory()`** — Returns run history for the observability page.

### Event Bus Integration

Subscribes to topics like `risk:event:created`, `decision:made`, `case:resolved`, `rule:triggered`. Events accumulate in the buffer. When the buffer reaches the acceleration threshold (or the interval fires), the agent wakes up and reasons over the batch.

### Observability

Every cycle records: cycle ID, start/end timestamps, duration, input size (events processed), output summary (findings count), confidence score, actions taken, full chain-of-thought trace.

---

## Section 2: Cross-Domain Correlation Agent

### Purpose

Detects multi-step attack sequences spanning all 11 seller lifecycle domains. Individual checkpoints each see one piece — this agent sees the trajectory and catches bust-out fraud, triangulation, slow-burn abuse, and ATO escalation that no single-domain agent can detect.

### Scan Configuration

- **Interval**: 5 minutes
- **Event acceleration**: 3+ CRITICAL/HIGH risk events within 60 seconds
- **Subscribed topics**: `risk:event:created`, `case:resolved`, `decision:made`

### Cycle Steps

1. **Collect** — Pull all risk events since last scan, grouped by seller.
2. **Think** — For each seller with new events, analyze the event sequence across domains. LLM evaluates trajectory suspicion even when each individual action passed.
3. **Plan** — Select investigation actions: pull full risk profile, check network connections, query related sellers, check velocity.
4. **Act** — Execute tools.
5. **Observe** — Synthesize cross-domain pattern into trajectory assessment with citations.
6. **Reflect** — "Could this be legitimate? What's my false positive risk?"
7. **Output** — Emit risk events, escalate cases, broadcast to other agents.

### Attack Sequence Library

Known multi-step patterns defined as ordered domain event sequences with timing constraints:

**BUST_OUT**: onboarding(APPROVED) → account_setup(OK) → listing(APPROVED) → transaction(volume_ramp, 7-30d) → profile_updates(BANK_CHANGE) → payout(LARGE_AMOUNT). Full sequence within 60 days. Seller builds trust then extracts value.

**TRIANGULATION**: onboarding(APPROVED) → listing(BELOW_MARKET_PRICE) → transaction(HIGH_VOLUME) → shipping(THIRD_PARTY_ADDRESS) → returns(HIGH_RATE). Listings within 7 days of onboarding. Selling goods they don't possess.

**ATO_ESCALATION**: ato(NEW_DEVICE) → profile_updates(BANK_CHANGE, within 24h) → payout(VELOCITY_SPIKE, within 48h). Compressed timeline. Compromised account being drained.

**SLOW_BURN**: onboarding(APPROVED) → [90+ days clean] → pricing(GRADUAL_INCREASE) → listing(CATEGORY_SHIFT) → transaction(CROSS_BORDER, new pattern) → returns(DISPUTE_SPIKE). Behavior shift after trust period.

Each pattern has: patternId, name, description, sequence (ordered {domain, eventTypes[], timeConstraint}), minConfidence (default 0.6), expectedAction, severity.

### Sequence Matching Algorithm

For each seller with new events:
1. Retrieve full event timeline from risk-profile service.
2. For each pattern, check if seller's sequence matches using sliding window with timing constraints.
3. Compute match score (0-1): steps matched, timing fit, signal strength.
4. LLM evaluates partial matches: probability of sequence completion.
5. Output: `{sellerId, patternId, matchScore, stepsCompleted, stepsRemaining, predictedCompletion, confidence}`.

### Tools (6)

| Tool | Purpose |
|---|---|
| `get_seller_timeline` | Full cross-domain event timeline for a seller |
| `get_domain_velocity` | Event frequency per domain over time windows |
| `compare_seller_trajectories` | Find sellers with similar event sequences |
| `check_sequence_pattern` | Match seller timeline against a specific attack pattern |
| `get_network_peers` | Connected sellers for coordinated behavior check |
| `predict_next_step` | LLM prediction of seller's next action given trajectory |

### Outputs Per Cycle

- Risk events emitted (domain of latest step, tagged `crossDomain: true`, `patternId`).
- Cases created for match score > 0.7.
- Broadcasts via messenger to all agents on new pattern detection.
- Pattern memory updates — reinforce confirmed, weaken unconfirmed.
- Knowledge write-back — confirmed instances stored for retrieval.

### Self-Correction

Tracks trajectory predictions vs actual outcomes. Correction cycle at accuracy < 70% adjusts per-pattern minConfidence thresholds.

### Confidence Calibration

Raw match score → calibrated via confidence-calibrator using historical match→outcome data → determines auto-escalate vs. review.

---

## Section 3: Policy Evolution Agent

### Purpose

Autonomously creates, tests, and graduates fraud rules. Watches the decision stream for false negatives (fraud approved) and false positives (legitimate blocked), identifies common feature patterns, drafts rules, simulates impact, deploys to shadow, evaluates performance, and promotes to active.

### Scan Configuration

- **Interval**: 30 minutes
- **Event acceleration**: 5+ false negatives within 10 minutes
- **Subscribed topics**: `decision:made`, `agent:outcome:received`, `case:resolved`, `rule:triggered`

### Cycle Tracks

**Track A — Gap Detection (False Negatives):**
1. Collect recent decisions where outcome was fraud but decision was APPROVE.
2. Think — LLM clusters by common features.
3. Plan — Draft rule per cluster: checkpoint, conditions, threshold, action.
4. Act — Run simulation via simulation service.
5. Observe — Synthesize simulation results with citations.
6. Reflect — Evaluate catch rate vs false positive trade-off.

**Track B — Friction Reduction (False Positives):**
1. Collect recent decisions where outcome was legitimate but decision was BLOCK/REVIEW.
2. Think — Identify highest-FP rules and why.
3. Plan — Draft modifications: relax thresholds, add exceptions, narrow conditions.
4. Act — Simulate proposed changes.
5. Observe/Reflect — Ensure relaxation doesn't open fraud gaps.

### Rule Lifecycle State Machine

```
PROPOSED → SIMULATED → SHADOW → ACTIVE
    ↓          ↓          ↓        ↓
 REJECTED  REJECTED   REJECTED  DEPRECATED
```

| Stage | Duration | Graduation Criteria |
|---|---|---|
| **PROPOSED** | Instant | Simulation shows positive net impact |
| **SIMULATED** | Instant | Catch rate > 10%, FP rate < 5% |
| **SHADOW** | 24-72 hours | Shadow results match projections within 20% tolerance |
| **ACTIVE** | Ongoing | Deprecated if catch rate < 5% or FP rate > 10% |
| **REJECTED** | Permanent | Failed at any stage, reason logged |
| **DEPRECATED** | Permanent | Active rule degraded |

### Tools (10)

| Tool | Purpose |
|---|---|
| `get_false_negatives` | Recent fraud-approved decisions |
| `get_false_positives` | Recent legitimate-blocked decisions |
| `get_rule_performance` | Existing rule stats (catch rate, FP rate) |
| `cluster_features` | LLM-based feature clustering on transactions/sellers |
| `draft_rule` | Generate rule structure from feature pattern |
| `simulate_rule` | Run through simulation service |
| `deploy_shadow` | Deploy to decision engine in SHADOW status |
| `check_shadow_results` | Evaluate shadow performance |
| `promote_rule` | Graduate SHADOW → ACTIVE |
| `deprecate_rule` | Deactivate underperforming rule |

### Autonomous Decision Boundaries

Fully autonomous for: proposing, simulating, shadow deployment, promotion (if criteria met), deprecation.

Escalates to humans via case queue for: rules affecting >5% of transaction volume, rules targeting specific seller segments (fairness), conflicting rules, calibrated confidence < 0.6.

### Coordination

- Receives broadcasts from Cross-Domain Correlation Agent → drafts targeted rules for detected attack patterns.
- Rule Optimization Agent monitors ongoing performance → Policy Evolution evaluates degradation signals.
- After promotion, triggers adversarial tester to verify no exploitable gaps.

### Self-Correction

Tracks every self-created rule's outcome. When rules get deprecated, stores failure pattern to avoid repeating. Adjusts graduation criteria based on historical rule success rates.

### Confidence Calibration

Raw simulation impact score → calibrated via historical proposed-vs-actual performance → determines auto-promote vs human review.

---

## Section 4: Agentic AI Concept Coverage

Both agents implement every concept in the framework:

| Concept | Cross-Domain | Policy Evolution |
|---|---|---|
| Full TPAOR Loop | Every scan cycle | Each track per cycle |
| Autonomous Self-Initiation | 5-min interval + event acceleration | 30-min interval + event acceleration |
| Tool Use | 6 tools | 10 tools |
| Multi-Agent Coordination | Broadcasts detections, requests help from Fraud Investigation | Receives Cross-Domain broadcasts, coordinates with Rule Optimization + Adversarial Tester |
| Pattern Memory | Attack sequences reinforced/weakened on outcomes | Rule-drafting patterns reinforced/weakened |
| Self-Correction | Trajectory prediction accuracy tracking, correction at <70% | Rule outcome tracking, failure pattern storage |
| Confidence Calibration | Match score → calibrated → auto-escalate vs review | Simulation impact → calibrated → auto-promote vs human review |
| Citation Grounding | Every detection cites specific events from tools | Every rule proposal cites false negatives and simulation results |
| Knowledge Write-Back | Confirmed patterns → KB + Pinecone | Rules, simulations, outcomes → KB + Pinecone |
| Closed-Loop Learning | Detect → case → resolve → reinforce/weaken → better detection | Create rule → shadow → active → monitor → deprecate → lesson → better rules |
| Re-Planning | Falls back to local buffer analysis if services down | Uses historical data as proxy if simulation service fails |
| Policy Engine Check | All escalations checked against hard policies | All promotions verified against hard policy conflicts |
| Adversarial Self-Testing | Monthly synthetic trajectory test against own detection | Post-promotion adversarial test against updated rule set |
| Chain-of-Thought | Full trace per cycle with pattern reasoning | Full trace per track with feature clustering + simulation reasoning |
| Outcome Simulation | Projects trajectory completion probability from historical rates | Projects enforcement impact during shadow period |
| Threshold Adaptation | Adjusts minConfidence per pattern on FP rates | Adjusts graduation criteria on historical rule success |
| Circuit Breaker | 3 consecutive failures → stop scanning → alert → cooldown → half-open | Same |
| Explainability | Pattern match, contributing events, score breakdown, narrative | Motivating false negatives, feature clusters, simulation results, promotion rationale |

---

## Section 5: Platform Integration & Frontend

### Server Integration

Both agents initialize at startup after ML model warmup, register with orchestrator, and call `start()`. Graceful shutdown via `process.on('SIGTERM')` calls `stop()`.

### API Endpoints

**Cross-Domain (`/api/agents/cross-domain/`):**
- `GET /status` — Running state, last/next run, events buffered
- `GET /detections` — Recent detections with seller, pattern, score, status
- `GET /patterns` — Attack sequence library
- `GET /history` — Cycle history (last 50)
- `POST /scan` — Force immediate scan

**Policy Evolution (`/api/agents/policy-evolution/`):**
- `GET /status` — Running state, rules per lifecycle stage
- `GET /proposals` — All proposed rules with stage and performance
- `GET /pipeline` — Rules in SHADOW with live vs projected performance
- `GET /history` — Cycle history (last 50)
- `POST /scan` — Force immediate cycle
- `POST /promote/:ruleId` — Manual promotion
- `POST /reject/:ruleId` — Manual rejection

### Frontend — New Page: Autonomous Agents (`/autonomous`)

Added to Platform section in sidebar after Observability.

**Tab 1: Cross-Domain Correlation**
- Status card: running/stopped, last/next scan, events buffered, cycle count
- Live detections table: seller, pattern, match score, steps completed/total, confidence, status, timestamp
- Pattern library: cards per attack sequence with step visualization, detection count, accuracy
- Cycle history: expandable runs with events processed, detections, duration, chain-of-thought

**Tab 2: Policy Evolution**
- Status card: running/stopped, rules per pipeline stage
- Rule pipeline: kanban columns (PROPOSED → SIMULATED → SHADOW → ACTIVE) with rule cards showing name, checkpoint, catch rate, FP rate, time in stage
- Active agent-created rules: table with performance metrics
- Cycle history: expandable Track A + Track B results per cycle

### WebSocket Events

- `cross-domain:detection` — New pattern detection
- `cross-domain:cycle-complete` — Scan cycle finished
- `policy-evolution:rule-promoted` — Rule graduated to ACTIVE
- `policy-evolution:rule-rejected` — Rule failed
- `policy-evolution:cycle-complete` — Cycle finished

### Existing Page Touchpoints

- Observability: Both agents appear in Agent Health, traces in Traces tab
- Case Queue: Cross-Domain cases appear with `source: 'CROSS_DOMAIN_CORRELATION'`
- Risk Rules: Policy Evolution rules show `createdBy: 'POLICY_EVOLUTION'` badge
- Risk Profiles: Cross-domain events show `crossDomain: true` tag in seller timeline
