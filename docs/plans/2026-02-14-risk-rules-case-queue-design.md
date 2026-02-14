# Risk Rules Library & Case Investigation Queue — Design

## Goal

Add two integrated features: a Risk Rules Library that organizes detection rules by checkpoint/domain across the seller lifecycle, and a Case Investigation Queue where flagged transactions automatically become cases for human review.

## Architecture

Both features extend the existing rules engine and execution pipeline. Rules gain a `checkpoint` dimension; the execution engine auto-creates cases when rules trigger REVIEW or BLOCK decisions. No new microservices — we extend existing services and add one new service (`case-queue`).

**Flow:**
```
Event at checkpoint → Rules evaluated (filtered by checkpoint) → Decision
  → If REVIEW/BLOCK → Case auto-created in queue
  → Analyst picks up case → Investigates → Resolves
```

## Feature 1: Risk Rules Library

### Data Model Extension

Extend existing rule structure with:
- `checkpoint`: "onboarding" | "ato" | "payout" | "listing" | "shipping" | "transaction"
- `tags`: string[] (e.g. ["velocity", "high-value", "geo"])
- `severity`: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
- `description`: string (human-readable explanation)

### Pre-built Rules (30+ across 6 checkpoints)

| Checkpoint | Rules |
|-----------|-------|
| Onboarding | High-risk country, disposable email, business category mismatch, duplicate identity |
| ATO | Multiple failed logins, new device + password change, impossible travel, session anomaly |
| Payout | First payout > threshold, velocity spike, bank change + immediate payout, round amounts |
| Listing | Below-market price, prohibited keywords, bulk creation, copied content |
| Shipping | Address mismatch, freight forwarder, multiple same-address, delivery region anomaly |
| Transaction | Velocity spike, amount threshold, high-risk MCC, cross-border + new account |

### Backend Changes

- Extend `rules/index.js`: Add `checkpoint` filter to GET, add `GET /rules/by-checkpoint` and `GET /rules/templates`
- Extend `generators.js`: `generateRule()` includes checkpoint, tags, severity
- Seed 30+ checkpoint-specific rules

### Frontend: Risk Rules Page (`/risk-rules`)

- Checkpoint selector (6 tabs across top)
- Rule cards per checkpoint: name, type badge, severity, trigger rate, status toggle
- Template library panel with one-click activation
- Expandable rule detail with conditions, actions, performance

## Feature 2: Case Investigation Queue

### Data Model

```
Case:
  caseId: "CASE-XXXXX"
  status: "OPEN" | "IN_REVIEW" | "RESOLVED"
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  sourceType: "transaction" | "risk_event" | "alert"
  sourceId: string
  checkpoint: string
  sellerId: string
  riskScore: number
  triggeredRules: string[]
  decision: string
  assignee: string | null
  notes: { author: string, text: string, timestamp: string }[]
  resolution: null | "CONFIRMED_FRAUD" | "FALSE_POSITIVE" | "ESCALATED"
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
```

### Case Creation Pipeline

Execution engine evaluates rules. On REVIEW or BLOCK decision, auto-creates a case:
- Pulls seller info, triggered rules, risk score
- Priority from risk score: >80 CRITICAL, >60 HIGH, >40 MEDIUM, else LOW
- Status = OPEN

### Backend: `services/case-queue/index.js`

| Method | Path | Purpose |
|--------|------|---------|
| GET | /cases | List with filters (status, priority, checkpoint, assignee) |
| GET | /cases/stats | Queue stats: counts by status/priority/checkpoint, avg age |
| GET | /cases/:caseId | Full detail with seller info and triggered rules |
| PATCH | /cases/:caseId/status | Update status flow |
| PATCH | /cases/:caseId/assign | Assign to analyst |
| POST | /cases/:caseId/notes | Add investigation note |

### Frontend: Case Queue Page (`/case-queue`)

- Stats bar: Open count, In Review, Critical count, avg time open
- Filterable table: Case ID, Priority, Checkpoint, Seller, Risk Score, Rules count, Status, Age
- Case detail panel: seller info, transaction details, triggered rules, risk breakdown, notes timeline
- Actions: Take Case, Resolve (Confirmed Fraud / False Positive / Escalated)
- Priority color coding: CRITICAL=red, HIGH=orange, MEDIUM=yellow

## Integration & Navigation

- New migration `008-case-queue.js` for cases table
- Mount `/api/case-queue` in server.js
- Add "Risk Rules" and "Case Queue" to sidebar nav
- Seed ~20 cases during database startup
- Modify execution engine to auto-create cases on REVIEW/BLOCK

## Tech Stack

- Backend: Express.js routes, db_ops for SQLite/memory storage
- Frontend: React + Tailwind CSS v4 + Recharts
- Same patterns as existing codebase (no new dependencies)
