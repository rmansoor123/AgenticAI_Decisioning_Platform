# RAG Pipeline + TruLens + RAGAS Evaluation — Design Document

**Date**: 2026-02-16
**Status**: Approved

---

## Overview

Add advanced vector-based retrieval (Pinecone) and comprehensive RAG evaluation (TruLens + RAGAS) to the fraud detection platform. This upgrades the existing TF-IDF keyword search to semantic vector search and adds quantitative measurement of retrieval and generation quality.

---

## Architecture: Python Sidecar Service

A FastAPI Python microservice (`backend/evaluation/`) runs alongside the Node backend on port 8000. It owns all Pinecone, TruLens, and RAGAS logic. The Node backend calls it via HTTP for retrieval and evaluation.

```
React Frontend (Vite :5176)
    │
    ├── HTTP ──→ Node Backend (Express :3001)
    │               ├── Agents (existing, unchanged)
    │               ├── Context Engine (upgraded: calls Python for retrieval)
    │               └── HTTP ──→ Python Eval Service (FastAPI :8000)
    │                               ├── Pinecone vector search
    │                               ├── TruLens evaluation
    │                               ├── RAGAS metrics
    │                               └── /api/* endpoints
    │
    └── HTTP ──→ Python Eval Service (for dashboard data)
                    └── GET /metrics, /evaluations
```

### Communication Flow

1. **Retrieval**: Node context engine → `POST :8000/search` → Pinecone results → injected into agent prompt
2. **Evaluation**: After agent decision → `POST :8000/evaluate` → TruLens + RAGAS scores → stored
3. **Dashboard**: React → `GET :8000/metrics` → aggregated evaluation data
4. **Fallback**: If Python service is down, Node falls back to existing TF-IDF keyword search

---

## Use Cases

### UC1: Fraud Case Similarity Search

Find similar past fraud cases when investigating a new seller.

- **Input**: Seller profile + risk indicators
- **Retrieval**: Pinecone similarity search across `fraud-cases` namespace
- **Output**: Top-K similar cases with outcomes
- **Value**: Agent sees "sellers with this profile were fraudulent 80% of the time"

### UC2: Knowledge-Augmented Onboarding Decisions

Upgrade the context engine's RAG step from TF-IDF to vector search.

- **Input**: Seller onboarding data
- **Retrieval**: Pinecone search across `onboarding-knowledge` namespace
- **Output**: Relevant historical decisions, patterns, rules
- **Value**: Better context = more accurate APPROVE/REVIEW/REJECT decisions

### UC3: Historical Pattern Matching

Semantic similarity for pattern memory — catches cases keyword matching misses.

- **Input**: Current risk pattern description
- **Retrieval**: Pinecone search across `risk-patterns` namespace
- **Output**: Similar patterns with success rates and actions
- **Value**: "This pattern is 85% similar to a known fraud ring pattern"

### UC4: Investigation Q&A Assistant

Natural language queries over investigation history.

- **Input**: Free-text question (e.g., "What fraud patterns from electronics sellers in SE Asia?")
- **Retrieval**: Pinecone search + reranking across all namespaces
- **Output**: Synthesized answer from retrieved records
- **Value**: Analysts can query the knowledge base conversationally

---

## Pinecone Index Structure

```
Index: fraud-detection-rag
  Embedding model: multilingual-e5-large (or llama-text-embed-v2)
  Field map: text → embedded

  Namespaces:
  ├── fraud-cases           (UC1) — past fraud case summaries + outcomes
  ├── onboarding-knowledge  (UC2) — historical onboarding decisions + reasoning
  ├── risk-patterns         (UC3) — learned risk patterns + success rates
  └── investigations        (UC4) — investigation reports + findings
```

### Record Schema (consistent across namespaces)

```json
{
  "_id": "KB-<uuid>",
  "text": "Seller XYZ Corp was rejected due to ...",
  "category": "ELECTRONICS",
  "domain": "onboarding",
  "outcome": "REJECT",
  "riskScore": 78,
  "sellerId": "SELLER-123",
  "country": "NG",
  "timestamp": "2026-02-15T10:30:00Z",
  "source": "seller-onboarding-agent"
}
```

---

## Python Evaluation Service

### Directory Structure

```
backend/evaluation/
├── pyproject.toml              # Dependencies
├── .env.example                # PINECONE_API_KEY, ANTHROPIC_API_KEY
├── main.py                     # FastAPI app, startup, CORS
├── config.py                   # Settings, index names, model config
├── routers/
│   ├── ingest.py               # POST /ingest, /ingest/bulk
│   ├── search.py               # POST /search, /search/similar-cases, etc.
│   ├── evaluate.py             # POST /evaluate, /evaluate/batch
│   └── dashboard.py            # GET /metrics, /metrics/history, /metrics/leaderboard
├── services/
│   ├── pinecone_service.py     # Pinecone client, index ops, upsert, query
│   ├── rag_pipeline.py         # Retrieve → Generate → Rerank
│   ├── trulens_evaluator.py    # TruLens feedback functions
│   └── ragas_evaluator.py      # RAGAS metrics
├── models/
│   └── schemas.py              # Pydantic request/response models
└── seed/
    └── seed_pinecone.py        # Seed Pinecone from existing knowledge base
```

### Dependencies (pyproject.toml)

```toml
[project]
name = "fraud-detection-evaluation"
version = "1.0.0"
requires-python = ">=3.11"

dependencies = [
    "fastapi>=0.115.0",
    "uvicorn>=0.34.0",
    "pinecone>=5.0.0",
    "trulens>=1.0.0",
    "ragas>=0.2.0",
    "langchain>=0.3.0",
    "langchain-anthropic>=0.3.0",
    "langchain-pinecone>=0.2.0",
    "pydantic>=2.0.0",
    "httpx>=0.27.0",
    "python-dotenv>=1.0.0",
]
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Service health + Pinecone connection status |
| `/ingest` | POST | Embed text and upsert records to Pinecone |
| `/ingest/bulk` | POST | Bulk ingest from existing knowledge base |
| `/search` | POST | Generic vector similarity search |
| `/search/similar-cases` | POST | UC1: Find similar fraud cases |
| `/search/knowledge` | POST | UC2: Knowledge-augmented retrieval |
| `/search/patterns` | POST | UC3: Pattern similarity search |
| `/search/investigate` | POST | UC4: Investigation Q&A |
| `/evaluate` | POST | Run TruLens + RAGAS on a single decision |
| `/evaluate/batch` | POST | Batch evaluate multiple decisions |
| `/metrics` | GET | Aggregated evaluation metrics |
| `/metrics/history` | GET | Evaluation scores over time |
| `/metrics/leaderboard` | GET | Per-use-case evaluation rankings |

---

## TruLens Feedback Functions

```python
feedbacks = {
    "answer_relevance":  "Is the agent's decision relevant to the query?",
    "context_relevance": "Are the retrieved documents relevant to the query?",
    "groundedness":      "Is the agent's reasoning supported by retrieved context?",
    "harmfulness":       "Does the response contain harmful recommendations?",
    "coherence":         "Is the reasoning chain logically coherent?"
}
```

## RAGAS Metrics

```python
metrics = [
    faithfulness,           # Is the answer faithful to the context?
    answer_relevancy,       # Is the answer relevant to the question?
    context_precision,      # Are relevant docs ranked higher?
    context_recall,         # Were all relevant docs retrieved?
    context_entity_recall,  # Were key entities in the context?
]
```

---

## Node Backend Integration

### Context Engine Upgrade

`backend/agents/core/context-engine.js` gets a new retrieval path:

```javascript
// Step 4 in assembleContext() — RAG results
// Before: knowledge base TF-IDF search
// After:  HTTP call to Python service, fallback to TF-IDF

async function fetchRAGResults(queryText, namespace, sellerId) {
  try {
    const response = await fetch('http://localhost:8000/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: queryText,
        namespace,
        filters: sellerId ? { sellerId } : {},
        top_k: 5
      })
    });
    if (response.ok) return (await response.json()).results;
  } catch (e) {
    // Fallback to TF-IDF
  }
  return knowledgeBase.searchKnowledge(namespace, queryText, {}, 5);
}
```

### Auto-Evaluation Trigger

After every Nth agent decision (configurable via `EVAL_INTERVAL` env var, default: 5):

```javascript
if (evaluationCounter % EVAL_INTERVAL === 0) {
  fetch('http://localhost:8000/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query, retrieved_contexts, agent_response,
      use_case, agent_id
    })
  }).catch(() => {}); // fire-and-forget
}
```

---

## React Frontend — RAG Evaluation Page

### New Route: `/rag-evaluation`

Added to sidebar under existing navigation. Page components:

1. **Score Cards** — 4 aggregate metric cards (answer relevance, context precision, groundedness, faithfulness) with color-coded thresholds
2. **Trend Chart** — Recharts line chart showing scores over time
3. **Use Case Breakdown** — Bar chart comparing metrics per use case (UC1-UC4)
4. **Evaluations Table** — Sortable, filterable table of individual evaluation runs
5. **Detail Drawer** — Expandable row: full query, retrieved contexts, agent response, per-metric scores
6. **Run Evaluation Button** — Dropdown: "Evaluate Last N Decisions" or "Full Batch Evaluation"

### Data Fetching

- Score cards + trend: `GET :8000/metrics` and `GET :8000/metrics/history`
- Evaluations table: `GET :8000/metrics/leaderboard` with pagination
- Manual eval trigger: `POST :8000/evaluate/batch`

---

## Seeding Pinecone

`seed_pinecone.py` reads existing knowledge base data from the Node backend (`GET :3001/api/observability/knowledge-base`) and bulk-upserts to Pinecone. Also seeds synthetic fraud cases, patterns, and investigation records for demo purposes.

---

## Environment Variables

```bash
# Python service (.env)
PINECONE_API_KEY=<user-provided>
ANTHROPIC_API_KEY=<user-provided>
PINECONE_INDEX_NAME=fraud-detection-rag
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
EVAL_STORE_PATH=./eval_results.db    # SQLite for TruLens results
NODE_BACKEND_URL=http://localhost:3001

# Node backend (.env addition)
EVAL_SERVICE_URL=http://localhost:8000
EVAL_INTERVAL=5                       # Evaluate every Nth decision
```

---

## Startup Sequence

1. Start Node backend: `cd backend && npm run dev` (port 3001)
2. Start Python eval service: `cd backend/evaluation && uvicorn main:app --port 8000`
3. Seed Pinecone (first time): `cd backend/evaluation && python seed/seed_pinecone.py`
4. Start React frontend: `npm run dev` (port 5176)

---

## Summary

| Component | Technology | Port |
|-----------|-----------|------|
| Frontend | React + Vite + Recharts | 5176 |
| Backend API | Node + Express | 3001 |
| Eval Service | Python + FastAPI | 8000 |
| Vector DB | Pinecone (cloud) | — |
| RAG Eval | TruLens + RAGAS | — |
| Embedding | multilingual-e5-large (via Pinecone) | — |
