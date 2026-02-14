# Fraud Detection Dashboard – Project Overview

This document explains what this project is and how it works end-to-end.

---

## What This Project Is

**Fraud Shield** is a **fraud detection and risk decisioning platform** for eCommerce. It focuses on **seller risk** (onboarding, transactions, payouts, listings, shipping) and uses an **agentic AI** layer to evaluate sellers and transactions with explainable decisions.

In short:

- **Frontend**: React (Vite) dashboard that shows metrics, agents, onboarding, rules, ML models, experiments, and real-time transaction stream.
- **Backend**: Node/Express API gateway that:
  - Serves REST APIs for onboarding, agents, rules, ML, data, experiments.
  - Runs **AI agents** (Think–Plan–Act–Observe, chain-of-thought, pattern memory).
  - Uses **in-memory or SQLite** storage and **synthetic data** (Faker) for demos.
- **Real-time**: WebSocket (`/ws`) for live transactions and metrics to the UI.

There is no real payment processor or external KYC/fraud APIs in the box; many checks are simulated. The value is the **architecture**, **agent framework**, and **dashboard** for risk and fraud workflows.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                                 │
│  React app (Vite) – Dashboard, Onboarding, Agents, Rules, ML, etc.        │
│  http://localhost:5176                                                    │
└─────────────────────────────────────────────────────────────────────────┘
         │                              │
         │ HTTP (API_BASE)               │ WebSocket (WS_URL)
         ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BACKEND – Express API Gateway (port 3001)                               │
│  • REST: /api/health, /api/onboarding, /api/agents, /api/rules, ...      │
│  • WebSocket: /ws (transactions, metrics)                                │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ├── Services (business + platform)
         │     • seller-onboarding (uses Seller Onboarding Agent)
         │     • seller-ato, seller-payout, seller-listing, seller-shipping
         │     • data-platform (ingestion, catalog, query)
         │     • ml-platform (inference, governance, monitoring)
         │     • decision-engine (rules, execution)
         │     • experimentation (ab-testing, simulation)
         │     • agents (agent list, workflows, onboarding eval, collaborate)
         │
         ├── Agents (backend/agents/)
         │     • Core: base-agent, chain-of-thought, pattern-memory,
         │             agent-messenger, agent-orchestrator
         │     • Specialized: SellerOnboardingAgent, FraudInvestigationAgent,
         │                    AlertTriageAgent, RuleOptimizationAgent
         │
         └── Data
               • shared/common/database.js → SQLite or in-memory Maps
               • shared/synthetic-data/ → Faker-based generators + seed
```

- **Frontend** talks to the backend over HTTP and WebSocket; all API calls use `API_BASE = 'http://localhost:3001/api'`.
- **Backend** owns agents, services, and data; it seeds synthetic sellers, transactions, rules, experiments, etc., on startup.

---

## What the Frontend Does

- **Single-page app** (React Router) with a sidebar and multiple sections.
- **Dashboard (`/`)**: Platform metrics, architecture layers (Data, ML, Decision Engine, Experimentation), recent transactions (from WebSocket or fallback mock), links to other pages.
- **Data Foundation (`/data`)**: Data ingestion, catalog, query federation – backed by stub/synthetic APIs.
- **ML Platform (`/ml`)**: Model registry, inference, monitoring – backed by ML services and synthetic models.
- **Decision Engine (`/decisions`)**: Rules list, rule builder, execution – backed by rules API.
- **Experimentation (`/experiments`)**: A/B tests and simulation – backed by experiments API.
- **Transaction Flow (`/flow`)**: Real-time transaction pipeline visualization; can call ingestion, ML inference, and decision APIs.
- **Agentic AI (`/agents`)**: Lists agents and workflows, runs “demo” and “collaborate investigate” – calls `/api/agents/*`.
- **Seller Onboarding (`/onboarding`)**: Table of recent sellers, “Run Onboarding Demo” (POST seller, then show agent evaluation).
- **Onboard New Seller (`/onboarding/form`)**: Form (business, email, country, etc.) + optional ID verification (camera/upload). Submit → POST `/api/onboarding/sellers` → agent evaluates → show decision and reasoning.
- **Seller Risk Lifecycle (`/seller-risk`)**: Risk by lifecycle stage (onboarding, active selling, transactions, payout, listing, shipping); uses onboarding data and risk factors.
- **Seller Network Analysis (`/seller-network`)**: Graph of sellers and connections; data from onboarding API.

So: the frontend is a **control plane and visualization** for platform metrics, agents, onboarding, rules, ML, and experiments, plus real-time transaction stream.

---

## What the Backend Does

### 1. API gateway (`backend/gateway/server.js`)

- Starts Express and a WebSocket server on the same port (default 3001).
- CORS, JSON body parsing, request logging.
- On startup: **initializeDatabase()** (SQLite or in-memory), **seedDatabase()** (sellers, transactions, listings, payouts, ATO events, shipments, ML models, rules, experiments, datasets) if not already seeded.
- Mounts all service routers under `/api/...`.
- Serves:
  - `GET /` – short welcome + links to `/api` and dashboard.
  - `GET /api`, `GET /api/health` – API info and health.
  - `GET /api/metrics`, `GET /api/metrics/history` – platform metrics (synthetic).
  - `GET /api/architecture` – layers and business services.
- 404 → `{ success: false, error: 'Endpoint not found', path }`.
- WebSocket: on connection, registers client; pipeline + interval broadcast **transactions** and **metrics** to all clients.

So the backend is the **single entry point** for all REST and WebSocket traffic.

### 2. Database layer (`backend/shared/common/database.js`)

- Tries to use **better-sqlite3**; if missing, uses **in-memory Maps** (sellers, transactions, listings, payouts, ato_events, shipments, ml_models, rules, experiments, datasets, seller_images, etc.).
- Exposes `db_ops`: insert, update, getById, getAll, count, delete by collection and id field.
- Migrations run when SQLite is used (e.g. create tables). So: **one logical “database”** (SQLite or memory) used by all services and agents.

### 3. Synthetic data (`backend/shared/synthetic-data/`)

- **generators.js**: Faker-based generators for sellers, transactions, listings, payouts, ATO events, shipments, ML models, rules, experiments, datasets.
- **seed.js**: Script to seed the DB (used implicitly by server’s seedDatabase() or explicitly via `npm run seed`).
- Purpose: **demo and development** without real external systems.

### 4. Business services (e.g. seller onboarding)

- **Seller onboarding** (`backend/services/business/seller-onboarding/index.js`):
  - `GET/POST /api/onboarding/sellers`, `GET /api/onboarding/sellers/:id`, `PATCH .../status`, `GET .../kyc`, `GET .../agent-evaluation`, `GET /api/onboarding/stats`, etc.
  - **POST /api/onboarding/sellers**: Accepts seller payload (and optional `idVerification`). Calls **Seller Onboarding Agent** (`sellerOnboarding.evaluateSeller(sellerId, sellerData)`). Agent returns decision (APPROVE/REVIEW/REJECT), risk score, risk factors, reasoning. Service sets seller status (e.g. BLOCKED, UNDER_REVIEW, PENDING), stores seller and risk assessment, returns response with `agentEvaluation`.
- Other business services (ATO, payout, listing, shipping) follow a similar pattern: CRUD and domain logic, often with stub or synthetic behavior.

So the backend **implements the real workflow**: receive seller, run agent, persist result, expose via API.

### 5. Agentic AI (`backend/agents/`)

- **Core**:
  - **base-agent.js**: Think–Plan–Act–Observe loop, tool registry, short/long/working memory, pattern memory, chain-of-thought, messenger registration, requestHelp, handleMessage (help/task/info).
  - **chain-of-thought.js**: Steps (observation, hypothesis, evidence, analysis, inference, conclusion), confidence, trace generation for explainability.
  - **pattern-memory.js**: Learn/match patterns (e.g. fraud indicators), reinforce on success, recommend action from similar cases.
  - **agent-messenger.js**: Send, broadcast, requestHelp, respondToHelp, task delegation; in-memory queue and routing.
  - **agent-orchestrator.js**: Register agents, define workflows (steps + inputMapper/outputKey), execute workflows, route help requests by capability, human escalation, collaborate (sequential/parallel/consensus).

- **Specialized agents**:
  - **Seller Onboarding Agent**: KYC/verification tools (identity, email, business, address, watchlist, fraud DBs, bank, financial history, IP, duplicates, historical patterns, etc.). Think → risk indicators and strategy; Plan → list of tools; Act → run tools; Observe → aggregate evidence, risk score, decision; Learn → update pattern memory.
  - **Fraud Investigation Agent**: Tools for transaction/velocity/device/network/location/ML/fraud lists/consortium. Used for transaction alerts and when onboarding agent requests help.
  - **Alert Triage Agent**, **Rule Optimization Agent**: Used in workflows (triage → investigate → rule check).

- **agents/index.js**: Instantiates the four agents, registers them with the orchestrator, defines workflows (e.g. fraud_investigation, continuous_optimization, full_case_review). Exports `sellerOnboarding`, `fraudInvestigator`, etc., and `orchestrator`.

So the backend is **running the actual agent logic**: reasoning, tools, memory, and orchestration.

### 6. Agent API (`backend/services/agents/index.js`)

- Exposes agent operations to the frontend:
  - List agents, list workflows.
  - **POST /api/agents/onboarding/evaluate**: Evaluate a seller (body: sellerId/sellerData); calls `sellerOnboarding.evaluateSeller(...)`; returns evaluation, decision, reasoning, chainOfThought.
  - **POST /api/agents/collaborate/investigate**: Run a collaborative investigation (e.g. fraud investigator + context); returns result.
  - Other routes for triage, workflows, etc., as defined in that file.

So the **agents are not just internal**: they are explicitly called by the onboarding service and by the Agentic AI UI.

### 7. Other services (short)

- **Data platform**: Ingestion, catalog, query – stub/synthetic.
- **ML platform**: Inference (e.g. fraud model), governance (models), monitoring – TensorFlow.js optional, synthetic models.
- **Decision engine**: Rules CRUD, execution – evaluates rules + optional ML score.
- **Experimentation**: A/B experiments, simulation – stub/synthetic.

They all read/write the same DB (or in-memory store) and are used by the dashboard and Transaction Flow.

### 8. WebSocket and real-time

- **Transaction pipeline** and a **setInterval** generate synthetic transactions and broadcast them (and metrics) to all connected WebSocket clients.
- Frontend subscribes to `ws://localhost:3001/ws` and updates Dashboard and any real-time views.

So the backend is also the **real-time event source** for the UI.

---

## End-to-End Flows (Examples)

### 1. Onboard a new seller (with agent)

1. User opens **Onboard New Seller** (`/onboarding/form`), fills form, optionally does ID verification, submits.
2. Frontend **POST**s to `http://localhost:3001/api/onboarding/sellers` with seller data (and optional idVerification).
3. Onboarding service generates/uses sellerId, then calls **sellerOnboarding.evaluateSeller(sellerId, sellerData)**.
4. Agent runs **Think** (risk indicators, strategy) → **Plan** (list of tools) → **Act** (run tools: email, identity, duplicates, watchlist, business, bank, fraud DBs, etc.) → **Observe** (evidence → risk score → APPROVE/REVIEW/REJECT) → **Learn** (pattern memory). Optionally requests help from Fraud Investigation Agent.
5. Service sets seller status from decision, stores seller + onboardingRiskAssessment (including chainOfThought), returns response.
6. Frontend shows decision, risk score, and reasoning.

So: **one HTTP request** triggers the full agent loop and persistence; the UI only displays the result.

### 2. View dashboard and real-time stream

1. User opens **Dashboard** (`/`).
2. Frontend fetches `/api/metrics`, `/api/ml/governance/models`, `/api/rules`, `/api/experiments/experiments`, `/api/metrics/history` and connects to `ws://localhost:3001/ws`.
3. Backend sends synthetic transactions and metrics over WebSocket; frontend updates state and shows “live” transactions and metrics.

So: **dashboard is a mix of REST and WebSocket**, with synthetic data.

### 3. Run “Agentic AI” demo

1. User opens **Agentic AI** (`/agents`), clicks a demo button.
2. Frontend **POST**s to `/api/agents/demo` or `/api/agents/collaborate/investigate` (depending on button).
3. Backend runs the corresponding agent(s) (e.g. fraud investigator, or workflow) and returns result.
4. Frontend displays agents, workflows, and demo result.

So: **agents are callable from the UI** for demos and investigations.

---

## Data and “Production” Readiness

- **Data**: All core entities (sellers, transactions, rules, models, experiments, etc.) are either **generated by Faker** in seed/generators or created by the app (e.g. onboarding). No real payment or KYC data.
- **Tools**: Many agent “tools” (e.g. email, IP, fraud DB) are **simulated** or call optional real APIs (when keys exist). The platform is built to swap in real integrations later.
- **Storage**: SQLite (if better-sqlite3 installed) or **in-memory**; no production-grade DB setup.
- **Auth**: No authentication or authorization in the codebase; it’s a demo platform.

So: the project is a **full-stack demo/reference** for a fraud and risk platform with agentic AI, not a production deployment as-is.

---

## Summary Table

| Layer        | Role |
|-------------|------|
| **Frontend** | React dashboard: metrics, onboarding, agents, rules, ML, experiments, transaction stream, seller risk and network views. |
| **Backend**  | Express API + WebSocket: REST for all services and agents, real-time events, single process. |
| **Agents**   | Think–Plan–Act–Observe + chain-of-thought + pattern memory; onboarding and fraud investigation drive decisions. |
| **Data**     | SQLite or in-memory + Faker/synthetic seed; no real payment/KYC data. |
| **Real-time** | WebSocket broadcasts synthetic transactions and metrics to the UI. |

**In one sentence**: This project is a **fraud detection and seller risk platform** with a React dashboard and a Node backend that uses **agentic AI** (TPAO, chain-of-thought, pattern memory, multi-agent orchestration) to evaluate sellers and transactions, backed by synthetic data and optional real API integrations.
