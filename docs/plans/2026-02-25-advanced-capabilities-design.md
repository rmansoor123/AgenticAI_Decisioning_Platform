# Advanced Capabilities — Design Document

**Date:** 2026-02-25
**Status:** Approved

## Overview

13 enhancements across RAG, Context, Knowledge Graph, and Reliability to close all major gaps identified in the platform's architecture audit.

---

## 1. RAG Enhancements

### 1A. Chunking Pipeline

**New file:** `backend/agents/core/chunker.js`

Adaptive chunking for knowledge base entries:
- Sentence-based splitting (`. `, `? `, `! ` boundaries)
- Target: 256 tokens (~1024 chars), max 512 tokens
- 2-sentence overlap between chunks for context continuity
- Each chunk carries: parentId, chunkIndex, totalChunks, plus original metadata
- Auto-called during `addKnowledge()` and Pinecone ingest for long texts

### 1B. Parent Document Retrieval

**Modify:** `knowledge-base.js`, `pinecone_service.py`

- Full documents stored with `documentId` in a `documents` namespace
- Chunks reference `parentDocumentId`
- On retrieval: fetch matching chunks → look up parent documents → return full context
- New `getParentDocument(chunkId)` method

### 1C. Self-Query

**New file:** `backend/agents/core/self-query.js`

- Claude generates metadata filters from natural language queries before vector search
- Example: "high-risk electronics sellers from US" → `{ category: "ELECTRONICS", country: "US", riskScore: { $gt: 60 } }`
- Filters passed to Pinecone's `filter` parameter
- Falls back to unfiltered search on failure

### 1D. Citation Grounding

**Modify:** `base-agent.js` OBSERVE phase, `prompt-templates.js`
**New file:** `backend/agents/core/citation-tracker.js`

- Observe prompt instructs LLM to tag claims with `[source:tool_name:index]` markers
- `citation-tracker.js` parses citations from LLM output
- Decision results include `citations[]`: `{ claim, source, toolName, evidenceSnippet, confidence }`
- Frontend displays citations alongside decision reasoning

### 1E. Retrieval Evaluation

**New file:** `backend/agents/core/retrieval-evaluator.js`
**New Python endpoint:** `POST /evaluate/retrieval`

- Measures retrieval quality separately from generation quality
- Metrics: Hit Rate, Mean Reciprocal Rank, NDCG@5
- Logged per query via eval-tracker alongside TruLens/RAGAS scores

---

## 2. Context Layer Enhancement

### 2A. Global Context Reranking

**New file:** `backend/agents/core/context-ranker.js`
**Modify:** `context-engine.js`

Two-pass context assembly:

**Pass 1 — Gather:** Fetch all 6 sources with raw content. Score each item by TF-IDF relevance to current query.

**Pass 2 — Allocate:** Rank all items across all sources by relevance. Allocate 4,000 token budget greedily (highest relevance first). Guarantee minimums (system: 200, task: 300). Distribute remaining budget by relevance ranking.

Log per-decision token allocation for analysis.

---

## 3. Knowledge Graph Integration

### 3A. Graph Queries in Agent Reasoning

**New file:** `backend/agents/tools/graph-tools.js`
**Modify:** `base-agent.js`, specialized agents

THINK phase integration:
- `getNeighbors(sellerId, depth=2)` — connected entities
- `findClusters()` filtered to seller — cluster risk context
- Injected as "Network Context" in think prompt

PLAN phase — new registered tools:
- `graph_find_connections` — entities sharing attributes
- `graph_risk_propagation` — propagated risk from fraud nodes
- `graph_find_rings` — cycles involving the subject
- `graph_community` — community and aggregate risk

### 3B. Graph-Based Multi-Hop Reasoning

**Modify:** `graph-queries.js`, `graph-tools.js`

- `graph_multi_hop_investigate` tool — traverse up to 3 hops on high-weight edges (>0.7)
- Collect risk signals at each hop (fraud history, risk scores, watchlist matches)
- Return structured evidence chain: `[{ entity, hop, relationship, riskSignals }]`
- LLM uses chain in OBSERVE phase for network-level risk assessment

---

## 4. Self-Correction & Reliability

### 4A. Confidence Calibration

**New file:** `backend/agents/core/confidence-calibrator.js`

- Buckets predictions into 5 confidence ranges (0-0.2 through 0.8-1.0)
- Tracks: prediction count, correct count, actual accuracy per bucket
- Calibration error = avg |predicted - actual| per bucket
- `getCalibratedConfidence(raw)` adjusts using historical mapping
- Integrated into OBSERVE phase — calibrates raw LLM confidence
- Persisted to SQLite `agent_calibration` table

### 4B. LLM Retry on Parse Failure

**Modify:** `prompt-templates.js`, `llm-client.js`

- On parse failure, retry with repair prompt including raw output + expected schema
- Max 1 repair retry (2 total LLM calls for JSON)
- New `llmClient.completeWithJsonRetry(system, user, schema, fallback)` method
- Track repair success rate in metrics collector

### 4C. Multi-Turn Re-Planning

**Modify:** `base-agent.js` reasoning loop

- After ACT phase, if failure rate > 50% and tool budget allows:
  - Build re-plan prompt with: original goal, successes, failures
  - LLM generates revised action plan
  - Execute revised actions
  - Max 1 re-plan cycle per decision
- OBSERVE receives both original and re-planned results
- Chain of thought records re-planning decision

### 4D. Human Feedback UI

**Backend:**
- New file: `backend/services/feedback/index.js` — Express router
- `POST /api/feedback` — Submit feedback (decisionId, correctLabel, reason, analystId)
- `GET /api/feedback/queue` — Decisions pending review (sorted by confidence ASC)
- `GET /api/feedback/stats` — Feedback statistics
- Persists to `agent_feedback` table, calls `handleOutcomeFeedback()`

**Frontend — Inline:**
- Modify `AgenticAI.jsx` and `CaseQueue.jsx` — add thumbs up/down + reason dropdown on decisions

**Frontend — Dedicated page:**
- New file: `src/pages/FeedbackReview.jsx`
- Route: `/feedback-review` under Risk Operations
- Decision queue sorted by lowest confidence
- Cards: decision summary, risk score, confidence, evidence, reasoning
- Actions: Correct/Incorrect + reason dropdown + free text
- Stats header + filters (agent, date range, confidence range)

### 4E. Adversarial Testing

**New file:** `backend/agents/core/adversarial-tester.js`

Scenario generator (Claude-powered):
- Synthetic identity patterns
- Contradictory signals
- Boundary cases (at thresholds)
- Evasion patterns

Batch runner: runs scenarios through agents, collects decisions.
Vulnerability report: false negatives, inconsistencies, threshold sensitivity.

**Backend endpoints:**
- `POST /api/agents/adversarial/run` — Trigger test suite (async)
- `GET /api/agents/adversarial/:executionId` — Get results

**Frontend:** New tab on Observability page for adversarial test results.

---

## Files Summary

**New files (8):**
1. `backend/agents/core/chunker.js`
2. `backend/agents/core/self-query.js`
3. `backend/agents/core/citation-tracker.js`
4. `backend/agents/core/retrieval-evaluator.js`
5. `backend/agents/core/context-ranker.js`
6. `backend/agents/tools/graph-tools.js`
7. `backend/agents/core/confidence-calibrator.js`
8. `backend/agents/core/adversarial-tester.js`
9. `backend/services/feedback/index.js`
10. `src/pages/FeedbackReview.jsx`

**Modified files (~12):**
- `backend/agents/core/base-agent.js`
- `backend/agents/core/knowledge-base.js`
- `backend/agents/core/context-engine.js`
- `backend/agents/core/prompt-templates.js`
- `backend/agents/core/llm-client.js`
- `backend/agents/core/self-correction.js`
- `backend/graph/graph-queries.js`
- `backend/evaluation/services/pinecone_service.py`
- `backend/evaluation/routers/search.py` (or new evaluate router)
- `backend/gateway/server.js`
- `src/App.jsx`
- `src/components/Layout.jsx`
- `src/pages/AgenticAI.jsx`
- `src/pages/CaseQueue.jsx`
- `src/pages/Observability.jsx`

**New routes:** `/api/feedback`, adversarial endpoints on `/api/agents`
**New frontend page:** `/feedback-review`
