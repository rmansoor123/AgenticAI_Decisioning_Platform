# What the Project Does, Available Agents, and How to Enhance Them

## What the Project Does

**Fraud Shield** is a **fraud detection and seller risk platform** for eCommerce. It:

1. **Evaluates new sellers** at onboarding using an AI agent that runs 15+ verification checks (identity, email, business, watchlists, fraud DBs, bank, etc.) and returns **APPROVE**, **REVIEW**, or **REJECT** with a risk score and full reasoning.
2. **Investigates suspicious transactions** via a Fraud Investigation Agent (velocity, device, location, IP, email, fraud lists, consortium data, ML score) and recommends BLOCK / REVIEW / MONITOR / APPROVE.
3. **Triages fraud alerts** (prioritize, group, route to teams) and **optimizes rules** (performance, overlap, thresholds, new rule suggestions).
4. **Orchestrates multi-agent workflows** (e.g. triage → investigate → rule check) and lets agents **request help** from each other (e.g. onboarding can call the fraud investigator).
5. **Exposes a dashboard** (metrics, rules, ML models, experiments, transaction stream) and **real-time updates** over WebSocket.

So: the project **automates seller and transaction risk decisions** using **agentic AI** (Think–Plan–Act–Observe, chain-of-thought, pattern memory) and provides a **single place** to see risk, agents, and platform health.

---

## Available Agents

There are **four specialized agents**, all built on the same base (TPAO loop, chain-of-thought, pattern memory, messenger).

| Agent | Role | Main job |
|-------|------|----------|
| **Seller Onboarding Agent** | `SELLER_ONBOARDING` | Evaluate new seller applications → APPROVE / REVIEW / REJECT. |
| **Fraud Investigation Agent** | `FRAUD_INVESTIGATOR` | Investigate suspicious transactions → BLOCK / REVIEW / MONITOR / APPROVE. |
| **Alert Triage Agent** | `ALERT_TRIAGE` | Prioritize and route fraud alerts to teams/analysts. |
| **Rule Optimization Agent** | `RULE_OPTIMIZER` | Analyze and optimize fraud rules (performance, overlap, thresholds). |

They are registered with the **Agent Orchestrator**, which runs workflows and routes help requests by capability.

---

## What Each Agent Does

### 1. Seller Onboarding Agent

- **Purpose**: Decide whether to approve, send to review, or reject a new seller application.
- **Capabilities**: KYC verification, business verification, risk assessment, document analysis, watchlist screening, bank verification, address verification, decision making, compliance check, pattern recognition.
- **Flow**:
  - **Think**: Parse seller data, identify risk indicators (e.g. KYC not verified, high-risk country, disposable email, ID issues), choose strategy (BASIC / STANDARD / COMPREHENSIVE).
  - **Plan**: Build a list of tools to run (always: identity, email, duplicates, watchlist; conditional: business, bank, address, fraud DBs, category, financial history, historical patterns, IP; optional: request help from Fraud Investigation Agent).
  - **Act**: Run each tool (e.g. verify_email, check_fraud_databases, screen_watchlist).
  - **Observe**: Turn tool outputs into risk factors and severity, compute overall risk score (0–100), apply fixed thresholds (APPROVE ≤30, REVIEW 31–60, REJECT ≥61 or critical factors).
  - **Learn**: Store pattern in pattern memory for future similar cases.
- **Tools (examples)**: verify_identity, verify_business, verify_address, screen_watchlist, check_fraud_databases, verify_bank_account, check_financial_history, verify_email, check_ip_reputation, analyze_business_category, check_duplicates, analyze_historical_patterns, request_fraud_investigation.
- **Used by**: Onboarding service when a seller is submitted (`POST /api/onboarding/sellers`); also callable via `POST /api/agents/onboarding/evaluate`.

---

### 2. Fraud Investigation Agent

- **Purpose**: Deep-dive on suspicious transactions and produce a recommendation with evidence.
- **Capabilities**: transaction_analysis, pattern_detection, evidence_gathering, risk_assessment, case_building, recommendation_generation, ip_analysis, email_verification, device_analysis, fraud_list_check, consortium_check.
- **Flow**:
  - **Think**: Use alert type (e.g. HIGH_VALUE, NEW_DEVICE, VELOCITY_SPIKE) to pick an investigation template (list of tools).
  - **Plan**: Build actions from that template + ML model query + similar-case search; for high risk, add request to Rule Optimizer.
  - **Act**: Run tools (get_transaction, check_velocity, verify_device, analyze_location, check_ip_reputation, verify_email, check_fraud_list, check_consortium_data, etc.).
  - **Observe**: Map evidence to risk factors and severity, compute overall risk, output BLOCK / REVIEW / MONITOR / APPROVE with confidence and reasoning.
- **Tools (examples)**: get_transaction, check_velocity, verify_device, analyze_history, check_network, analyze_location, query_ml_model, search_similar_cases, check_ip_reputation, verify_email, check_device_reputation, check_fraud_list, check_consortium_data, check_consortium_velocity, request_rule_analysis.
- **Used by**: Workflows (e.g. fraud_investigation, full_case_review); onboarding agent when it requests help with capability `transaction_analysis`; and directly via agent API (e.g. collaborate investigate).

---

### 3. Alert Triage Agent

- **Purpose**: Prioritize pending fraud alerts and route them to the right team/analyst.
- **Capabilities**: alert_prioritization, alert_grouping, routing_optimization, workload_balancing, sla_monitoring.
- **Flow**:
  - **Think**: Understand intent (e.g. triage_queue vs prioritize_recommendations).
  - **Plan**: Get pending alerts, analyst availability, related alerts, resolution history; then assign by priority/routing rules.
  - **Act**: Run get_pending_alerts, get_analyst_availability, find_related_alerts, get_resolution_history, assign_alert.
  - **Observe**: Return prioritized alerts and assignment results.
- **Tools**: get_pending_alerts, get_analyst_availability, find_related_alerts, get_resolution_history, assign_alert.
- **Routing**: HIGH_VALUE → senior_analyst, ATO → ato_team, CHARGEBACK → disputes_team, NEW_PATTERN → ml_team, else general_queue.
- **Used by**: Workflows (e.g. fraud_investigation as first step; continuous_optimization for prioritizing recommendations).

---

### 4. Rule Optimization Agent

- **Purpose**: Improve the rules engine (performance, redundancy, thresholds, new rules).
- **Capabilities**: rule_analysis, performance_monitoring, threshold_optimization, rule_generation, ab_test_design, impact_simulation.
- **Flow**:
  - **Think**: Determine optimization type (e.g. performance, coverage) and context.
  - **Plan**: Load rules + performance, analyze overlap, simulate thresholds, analyze fraud patterns; optionally propose new rules or A/B tests.
  - **Act**: get_rules_performance, analyze_rule_overlap, simulate_threshold, analyze_fraud_patterns, (optionally) propose_new_rule, design_ab_test.
  - **Observe**: Return recommendations (e.g. disable redundant rule, adjust threshold, add new rule).
- **Tools**: get_rules_performance, analyze_rule_overlap, simulate_threshold, analyze_fraud_patterns, propose_new_rule, design_ab_test.
- **Used by**: Workflows (fraud_investigation, full_case_review, continuous_optimization); Fraud Investigation Agent when it requests rule_analysis for high-risk cases.

---

## How Agents Can Be Enhanced

The framework doc (`AGENTIC_AI_FRAMEWORK.md`) and code already describe limitations and an enhancement plan. Below is a concise, agent-aware summary.

### Cross-cutting (all / most agents)

| Enhancement | Current | Improvement |
|-------------|---------|-------------|
| **Parallel tool execution** | Tools run one-by-one. | Run independent tools in parallel (e.g. verify_email + check_duplicates + screen_watchlist together). Faster evaluations and lower latency. |
| **Adaptive tool selection** | Plan runs a fixed set of tools; no early exit. | Add early-exit conditions (e.g. if watchlist hit → REJECT and stop) and conditional tools (e.g. run financial_history only if risk &gt; 40). Fewer API calls, better focus. |
| **Self-reflection & confidence calibration** | Decision is final; confidence is not re-checked. | Add a REFLECT step: assess evidence strength, find contradictions/gaps; if low confidence or conflicts, run more tools or adjust confidence. |
| **Meta-learning (tool effectiveness)** | All tools treated equally. | Track per-tool usefulness by context/outcome; prefer or skip tools based on past effectiveness. |
| **Reinforcement from feedback** | Pattern memory learns from outcomes; no explicit human/outcome feedback. | Feed human reviewer decisions and actual outcomes (chargeback, etc.) into pattern memory and tool-effectiveness; calibrate over time. |
| **Explainability** | Chain-of-thought and reasoning text exist. | Add counterfactuals (“what if risk was lower?”), confidence breakdown, and clearer audit export. |

### Seller Onboarding Agent

| Enhancement | Current | Improvement |
|-------------|---------|-------------|
| **Adaptive risk thresholds** | Fixed: APPROVE ≤30, REVIEW 31–60, REJECT ≥61. | Adjust by business category, country fraud rate, time, and recent trends (e.g. stricter for high-risk categories). |
| **Strategy and tools** | Strategy (BASIC/STANDARD/COMPREHENSIVE) is based on initial indicators; then a fixed tool set. | Make strategy and tool set more adaptive to intermediate results (e.g. escalate to COMPREHENSIVE if early tools show high risk). |
| **Real APIs** | Many tools are simulated or optional. | Replace with real KYC, email, IP, fraud-DB, and bank verification APIs where needed. |

### Fraud Investigation Agent

| Enhancement | Current | Improvement |
|-------------|---------|-------------|
| **Templates** | Alert type maps to a fixed list of tools. | Allow dynamic tool selection and early exit (e.g. if blocklist hit, stop and BLOCK). |
| **ML and rules** | Calls ML model and can request rule analysis. | Tighten integration: use ML score to decide which tools to run; use rule-optimizer output to suggest rule changes from investigations. |

### Alert Triage Agent

| Enhancement | Current | Improvement |
|-------------|---------|-------------|
| **Data** | Simulated alerts and analysts. | Connect to real alert queue and analyst/team availability. |
| **Learning** | No learning from resolution outcomes. | Use resolution history (true fraud vs false positive, SLA) to refine priority weights and routing. |

### Rule Optimization Agent

| Enhancement | Current | Improvement |
|-------------|---------| Improvement |
| **Metrics** | Simulated rule performance. | Use real trigger counts, true/false positive rates, and latency. |
| **Actions** | Suggests changes. | Auto-apply low-risk changes (e.g. threshold tweaks) with guardrails and A/B tests; escalate riskier changes to humans. |

### Multi-agent system

| Enhancement | Current | Improvement |
|-------------|---------|-------------|
| **Collaboration** | Help requests and task delegation exist. | Add proactive sharing (e.g. “pattern learned” broadcasts), shared pattern memory or summaries across agents, and clearer contracts for when to call which agent. |
| **Orchestrator** | Workflows are fixed steps; human escalation is supported. | Add conditional steps, retries, and timeouts; richer escalation metadata for human review. |

---

## Summary

- **Project**: Fraud and seller-risk platform that uses agentic AI to evaluate sellers and transactions and to triage alerts and optimize rules; dashboard and real-time stream included.
- **Agents**: **Seller Onboarding** (approve/review/reject sellers), **Fraud Investigation** (block/review/monitor/approve transactions), **Alert Triage** (prioritize and route alerts), **Rule Optimization** (improve rules).
- **Enhancements**: Parallel and adaptive tool use, reflection and confidence calibration, meta-learning and feedback loops, adaptive thresholds, better explainability, real data/APIs where possible, and stronger multi-agent collaboration and orchestration.

Implementing the high-priority items (parallel execution, adaptive tool selection, feedback learning) will make the agents faster, cheaper to run, and more accurate over time.
