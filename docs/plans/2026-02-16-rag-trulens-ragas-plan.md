# RAG + TruLens + RAGAS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Pinecone vector search, TruLens evaluation, and RAGAS metrics to the fraud detection platform via a Python FastAPI sidecar service, upgrade the Node context engine to use vector retrieval, and build a React evaluation dashboard page.

**Architecture:** Python FastAPI service (port 8000) handles all Pinecone/TruLens/RAGAS logic. Node backend (port 3001) calls it via HTTP for retrieval and evaluation. React frontend gets a new `/rag-evaluation` page under Platform navigation.

**Tech Stack:** Python 3.13, FastAPI, Pinecone SDK, TruLens, RAGAS, LangChain + LangChain-Anthropic, Pydantic v2, httpx. Node/Express (existing). React + Recharts (existing).

---

## Task 1: Python Service Scaffolding

**Files:**
- Create: `backend/evaluation/pyproject.toml`
- Create: `backend/evaluation/.env.example`
- Create: `backend/evaluation/config.py`
- Create: `backend/evaluation/main.py`

**Step 1: Create pyproject.toml**

```toml
[project]
name = "fraud-detection-evaluation"
version = "1.0.0"
description = "RAG evaluation service with Pinecone, TruLens, and RAGAS"
requires-python = ">=3.11"

dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "pinecone>=5.0.0",
    "trulens>=1.0.0",
    "trulens-providers-litellm>=1.0.0",
    "ragas>=0.2.0",
    "langchain>=0.3.0",
    "langchain-anthropic>=0.3.0",
    "langchain-pinecone>=0.2.0",
    "pydantic>=2.0.0",
    "httpx>=0.27.0",
    "python-dotenv>=1.0.0",
    "datasets>=3.0.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0.0", "pytest-asyncio>=0.24.0", "httpx>=0.27.0"]
```

**Step 2: Create .env.example**

```bash
PINECONE_API_KEY=your_pinecone_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
PINECONE_INDEX_NAME=fraud-detection-rag
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
EVAL_STORE_PATH=./eval_results.db
NODE_BACKEND_URL=http://localhost:3001
EVAL_SERVICE_PORT=8000
```

**Step 3: Create config.py**

```python
"""Configuration for the evaluation service."""

import os
from dotenv import load_dotenv

load_dotenv()

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "fraud-detection-rag")
PINECONE_CLOUD = os.getenv("PINECONE_CLOUD", "aws")
PINECONE_REGION = os.getenv("PINECONE_REGION", "us-east-1")
EVAL_STORE_PATH = os.getenv("EVAL_STORE_PATH", "./eval_results.db")
NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:3001")
EVAL_SERVICE_PORT = int(os.getenv("EVAL_SERVICE_PORT", "8000"))

EMBEDDING_MODEL = "multilingual-e5-large"
EMBEDDING_FIELD_MAP = {"text": "text"}

NAMESPACES = [
    "fraud-cases",
    "onboarding-knowledge",
    "risk-patterns",
    "investigations",
]
```

**Step 4: Create main.py**

```python
"""FastAPI evaluation service — Pinecone + TruLens + RAGAS."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import EVAL_SERVICE_PORT


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown."""
    print("[EvalService] Starting up...")
    # Pinecone + TruLens init will be added in later tasks
    yield
    print("[EvalService] Shutting down...")


app = FastAPI(
    title="Fraud Detection RAG Evaluation Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5176", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "fraud-detection-evaluation", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=EVAL_SERVICE_PORT, reload=True)
```

**Step 5: Install dependencies and verify startup**

Run:
```bash
cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/evaluation
pip install -e .
python main.py &
sleep 2
curl http://localhost:8000/health
# Expected: {"status":"ok","service":"fraud-detection-evaluation","version":"1.0.0"}
kill %1
```

**Step 6: Commit**

```bash
git add backend/evaluation/
git commit -m "feat: scaffold Python evaluation service with FastAPI"
```

---

## Task 2: Pydantic Models (Schemas)

**Files:**
- Create: `backend/evaluation/models/__init__.py`
- Create: `backend/evaluation/models/schemas.py`

**Step 1: Create models/__init__.py**

Empty file.

**Step 2: Create models/schemas.py**

```python
"""Pydantic models for request/response schemas."""

from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field


# ── Ingest ────────────────────────────────────────────────────────────────────

class IngestRecord(BaseModel):
    id: str = Field(alias="_id", default=None)
    text: str
    category: str | None = None
    domain: str | None = None
    outcome: str | None = None
    risk_score: float | None = Field(None, alias="riskScore")
    seller_id: str | None = Field(None, alias="sellerId")
    country: str | None = None
    timestamp: str | None = None
    source: str | None = None

    model_config = {"populate_by_name": True}


class IngestRequest(BaseModel):
    namespace: str
    records: list[IngestRecord]


class IngestResponse(BaseModel):
    success: bool
    upserted_count: int
    namespace: str


# ── Search ────────────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    namespace: str
    top_k: int = 5
    filters: dict | None = None
    rerank: bool = False


class SearchResult(BaseModel):
    id: str
    text: str
    score: float
    metadata: dict = {}


class SearchResponse(BaseModel):
    success: bool
    results: list[SearchResult]
    namespace: str
    query: str


# ── Evaluate ──────────────────────────────────────────────────────────────────

class EvaluateRequest(BaseModel):
    query: str
    retrieved_contexts: list[str]
    agent_response: str
    ground_truth: str | None = None
    use_case: str
    agent_id: str
    metadata: dict = {}


class EvalScore(BaseModel):
    metric: str
    score: float
    details: str | None = None


class EvaluateResponse(BaseModel):
    success: bool
    evaluation_id: str
    scores: list[EvalScore]
    use_case: str
    timestamp: str


class BatchEvaluateRequest(BaseModel):
    evaluations: list[EvaluateRequest]


class BatchEvaluateResponse(BaseModel):
    success: bool
    count: int
    results: list[EvaluateResponse]


# ── Metrics ───────────────────────────────────────────────────────────────────

class MetricsSummary(BaseModel):
    answer_relevance: float
    context_precision: float
    groundedness: float
    faithfulness: float
    total_evaluations: int
    by_use_case: dict = {}


class MetricsHistoryPoint(BaseModel):
    timestamp: str
    answer_relevance: float
    context_precision: float
    groundedness: float
    faithfulness: float
```

**Step 3: Commit**

```bash
git add backend/evaluation/models/
git commit -m "feat: add Pydantic request/response schemas for eval service"
```

---

## Task 3: Pinecone Service

**Files:**
- Create: `backend/evaluation/services/__init__.py`
- Create: `backend/evaluation/services/pinecone_service.py`

**Step 1: Create services/__init__.py**

Empty file.

**Step 2: Create services/pinecone_service.py**

```python
"""Pinecone vector database service — index management, upsert, query."""

from pinecone import Pinecone

from config import (
    PINECONE_API_KEY,
    PINECONE_INDEX_NAME,
    PINECONE_CLOUD,
    PINECONE_REGION,
    EMBEDDING_MODEL,
    EMBEDDING_FIELD_MAP,
    NAMESPACES,
)


class PineconeService:
    def __init__(self):
        self.pc = Pinecone(api_key=PINECONE_API_KEY)
        self.index_name = PINECONE_INDEX_NAME
        self.index = None
        self._ensure_index()

    def _ensure_index(self):
        """Create index if it doesn't exist, then get a handle."""
        existing = [idx.name for idx in self.pc.list_indexes()]
        if self.index_name not in existing:
            self.pc.create_index_for_model(
                name=self.index_name,
                cloud=PINECONE_CLOUD,
                region=PINECONE_REGION,
                embed={
                    "model": EMBEDDING_MODEL,
                    "field_map": EMBEDDING_FIELD_MAP,
                },
            )
            print(f"[Pinecone] Created index: {self.index_name}")
        self.index = self.pc.Index(self.index_name)
        print(f"[Pinecone] Connected to index: {self.index_name}")

    def upsert(self, namespace: str, records: list[dict]) -> int:
        """Upsert records into a namespace. Each record must have _id and text."""
        if not records:
            return 0
        self.index.upsert_records(namespace=namespace, records=records)
        return len(records)

    def search(
        self,
        namespace: str,
        query: str,
        top_k: int = 5,
        filters: dict | None = None,
        rerank: bool = False,
    ) -> list[dict]:
        """Search a namespace by text query."""
        search_params = {
            "namespace": namespace,
            "query": {"top_k": top_k, "inputs": {"text": query}},
        }
        if filters:
            search_params["query"]["filter"] = filters
        if rerank:
            search_params["rerank"] = {
                "model": "pinecone-rerank-v0",
                "rank_fields": ["text"],
                "top_n": top_k,
            }

        results = self.index.search(**search_params)

        hits = []
        for match in results.get("result", {}).get("hits", []):
            hits.append({
                "id": match.get("_id", ""),
                "text": match.get("fields", {}).get("text", ""),
                "score": match.get("_score", 0.0),
                "metadata": {
                    k: v for k, v in match.get("fields", {}).items() if k != "text"
                },
            })
        return hits

    def get_stats(self) -> dict:
        """Get index statistics."""
        stats = self.index.describe_index_stats()
        return {
            "index_name": self.index_name,
            "total_vectors": stats.get("total_vector_count", 0),
            "namespaces": {
                ns: info.get("vector_count", 0)
                for ns, info in stats.get("namespaces", {}).items()
            },
        }


# Singleton
_instance: PineconeService | None = None


def get_pinecone_service() -> PineconeService:
    global _instance
    if _instance is None:
        _instance = PineconeService()
    return _instance
```

**Step 3: Wire into main.py lifespan**

Add to `main.py` lifespan startup:
```python
from services.pinecone_service import get_pinecone_service
# Inside lifespan, after print:
get_pinecone_service()
```

**Step 4: Verify Pinecone connection**

Run (requires PINECONE_API_KEY in .env):
```bash
cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/evaluation
cp .env.example .env
# User must edit .env with real PINECONE_API_KEY
python -c "from services.pinecone_service import get_pinecone_service; svc = get_pinecone_service(); print(svc.get_stats())"
```

**Step 5: Commit**

```bash
git add backend/evaluation/services/
git commit -m "feat: add Pinecone service with index management, upsert, and search"
```

---

## Task 4: Ingest Router

**Files:**
- Create: `backend/evaluation/routers/__init__.py`
- Create: `backend/evaluation/routers/ingest.py`
- Modify: `backend/evaluation/main.py` (add router)

**Step 1: Create routers/__init__.py**

Empty file.

**Step 2: Create routers/ingest.py**

```python
"""Ingest router — embed and upsert records to Pinecone."""

import uuid
from fastapi import APIRouter, HTTPException
import httpx

from config import NODE_BACKEND_URL
from models.schemas import IngestRequest, IngestResponse, IngestRecord
from services.pinecone_service import get_pinecone_service

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("", response_model=IngestResponse)
async def ingest_records(req: IngestRequest):
    """Upsert records into a Pinecone namespace."""
    svc = get_pinecone_service()
    records = []
    for r in req.records:
        record = {"_id": r.id or f"KB-{uuid.uuid4()}", "text": r.text}
        if r.category:
            record["category"] = r.category
        if r.domain:
            record["domain"] = r.domain
        if r.outcome:
            record["outcome"] = r.outcome
        if r.risk_score is not None:
            record["riskScore"] = r.risk_score
        if r.seller_id:
            record["sellerId"] = r.seller_id
        if r.country:
            record["country"] = r.country
        if r.timestamp:
            record["timestamp"] = r.timestamp
        if r.source:
            record["source"] = r.source
        records.append(record)

    count = svc.upsert(req.namespace, records)
    return IngestResponse(success=True, upserted_count=count, namespace=req.namespace)


@router.post("/bulk", response_model=IngestResponse)
async def bulk_ingest_from_node():
    """Pull knowledge base data from Node backend and upsert to Pinecone."""
    svc = get_pinecone_service()
    total = 0

    # Fetch existing knowledge from Node observability endpoint
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{NODE_BACKEND_URL}/api/observability/health")
            if resp.status_code == 200:
                data = resp.json()
                kb_stats = data.get("data", {}).get("knowledgeBase", {})
                print(f"[BulkIngest] Node KB stats: {kb_stats}")
    except Exception as e:
        print(f"[BulkIngest] Could not reach Node backend: {e}")

    # Fetch sellers for seeding onboarding-knowledge namespace
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{NODE_BACKEND_URL}/api/onboarding/sellers")
            if resp.status_code == 200:
                sellers_data = resp.json()
                sellers = sellers_data.get("data", {}).get("sellers", [])
                records = []
                for s in sellers[:100]:  # Limit to 100 for initial seed
                    text_parts = [
                        f"Seller: {s.get('businessName', 'Unknown')}",
                        f"Category: {s.get('businessCategory', 'Unknown')}",
                        f"Country: {s.get('country', 'Unknown')}",
                        f"Status: {s.get('status', 'Unknown')}",
                        f"Email: {s.get('email', 'Unknown')}",
                    ]
                    risk = s.get("onboardingRiskAssessment", {})
                    if risk:
                        text_parts.append(f"Risk Score: {risk.get('riskScore', 'N/A')}")
                        text_parts.append(f"Decision: {risk.get('decision', 'N/A')}")
                        factors = risk.get("riskFactors", [])
                        if factors:
                            text_parts.append(f"Risk Factors: {', '.join(str(f) for f in factors[:5])}")

                    records.append({
                        "_id": s.get("sellerId", f"SELLER-{uuid.uuid4().hex[:8]}"),
                        "text": ". ".join(text_parts),
                        "category": s.get("businessCategory", ""),
                        "domain": "onboarding",
                        "outcome": risk.get("decision", ""),
                        "riskScore": risk.get("riskScore", 0),
                        "sellerId": s.get("sellerId", ""),
                        "country": s.get("country", ""),
                        "source": "bulk-ingest",
                    })
                if records:
                    count = svc.upsert("onboarding-knowledge", records)
                    total += count
                    print(f"[BulkIngest] Upserted {count} sellers to onboarding-knowledge")
    except Exception as e:
        print(f"[BulkIngest] Seller fetch error: {e}")

    return IngestResponse(success=True, upserted_count=total, namespace="all")
```

**Step 3: Register router in main.py**

Add to main.py after CORS middleware:
```python
from routers.ingest import router as ingest_router
app.include_router(ingest_router)
```

**Step 4: Commit**

```bash
git add backend/evaluation/routers/
git commit -m "feat: add ingest router for Pinecone upsert and bulk import"
```

---

## Task 5: Search Router

**Files:**
- Create: `backend/evaluation/routers/search.py`
- Modify: `backend/evaluation/main.py` (add router)

**Step 1: Create routers/search.py**

```python
"""Search router — vector similarity search across Pinecone namespaces."""

from fastapi import APIRouter
from models.schemas import SearchRequest, SearchResponse, SearchResult
from services.pinecone_service import get_pinecone_service

router = APIRouter(prefix="/search", tags=["search"])


@router.post("", response_model=SearchResponse)
async def search(req: SearchRequest):
    """Generic vector similarity search."""
    svc = get_pinecone_service()
    hits = svc.search(
        namespace=req.namespace,
        query=req.query,
        top_k=req.top_k,
        filters=req.filters,
        rerank=req.rerank,
    )
    results = [
        SearchResult(id=h["id"], text=h["text"], score=h["score"], metadata=h["metadata"])
        for h in hits
    ]
    return SearchResponse(success=True, results=results, namespace=req.namespace, query=req.query)


@router.post("/similar-cases", response_model=SearchResponse)
async def search_similar_cases(req: SearchRequest):
    """UC1: Find similar fraud cases."""
    req.namespace = "fraud-cases"
    req.rerank = True
    return await search(req)


@router.post("/knowledge", response_model=SearchResponse)
async def search_knowledge(req: SearchRequest):
    """UC2: Knowledge-augmented context retrieval."""
    req.namespace = "onboarding-knowledge"
    return await search(req)


@router.post("/patterns", response_model=SearchResponse)
async def search_patterns(req: SearchRequest):
    """UC3: Pattern similarity search."""
    req.namespace = "risk-patterns"
    return await search(req)


@router.post("/investigate", response_model=SearchResponse)
async def search_investigate(req: SearchRequest):
    """UC4: Investigation Q&A — search across all namespaces, rerank."""
    svc = get_pinecone_service()
    all_results = []
    for ns in ["fraud-cases", "onboarding-knowledge", "risk-patterns", "investigations"]:
        hits = svc.search(namespace=ns, query=req.query, top_k=req.top_k, rerank=True)
        for h in hits:
            h["metadata"]["namespace"] = ns
            all_results.append(h)

    # Sort by score, take top_k
    all_results.sort(key=lambda x: x["score"], reverse=True)
    top = all_results[: req.top_k]

    results = [
        SearchResult(id=h["id"], text=h["text"], score=h["score"], metadata=h["metadata"])
        for h in top
    ]
    return SearchResponse(success=True, results=results, namespace="all", query=req.query)
```

**Step 2: Register in main.py**

```python
from routers.search import router as search_router
app.include_router(search_router)
```

**Step 3: Commit**

```bash
git add backend/evaluation/routers/search.py backend/evaluation/main.py
git commit -m "feat: add search router with 4 use-case endpoints"
```

---

## Task 6: TruLens Evaluator Service

**Files:**
- Create: `backend/evaluation/services/trulens_evaluator.py`

**Step 1: Create trulens_evaluator.py**

```python
"""TruLens feedback function evaluator."""

import os
import uuid
from datetime import datetime

from trulens.core import Feedback, TruSession
from trulens.providers.litellm import LiteLLM

from config import ANTHROPIC_API_KEY

# Store evaluations in memory (SQLite backing optional)
_evaluations: list[dict] = []


def _get_provider():
    """Get TruLens LLM provider for feedback functions."""
    os.environ["ANTHROPIC_API_KEY"] = ANTHROPIC_API_KEY
    return LiteLLM(model_engine="anthropic/claude-sonnet-4-20250514")


def evaluate_rag(
    query: str,
    retrieved_contexts: list[str],
    agent_response: str,
    ground_truth: str | None = None,
    use_case: str = "general",
    agent_id: str = "unknown",
) -> dict:
    """
    Run TruLens feedback functions on a single RAG interaction.
    Returns evaluation_id and scores.
    """
    provider = _get_provider()
    evaluation_id = f"EVAL-{uuid.uuid4().hex[:12]}"
    scores = []

    context_text = "\n---\n".join(retrieved_contexts) if retrieved_contexts else ""

    # 1. Answer Relevance — is the response relevant to the query?
    try:
        relevance = provider.relevance(query, agent_response)
        scores.append({"metric": "answer_relevance", "score": float(relevance), "details": None})
    except Exception as e:
        scores.append({"metric": "answer_relevance", "score": 0.0, "details": str(e)})

    # 2. Context Relevance — are retrieved docs relevant to the query?
    try:
        ctx_scores = []
        for ctx in retrieved_contexts[:5]:
            s = provider.context_relevance(query, ctx)
            ctx_scores.append(float(s))
        avg_ctx = sum(ctx_scores) / len(ctx_scores) if ctx_scores else 0.0
        scores.append({"metric": "context_relevance", "score": avg_ctx, "details": None})
    except Exception as e:
        scores.append({"metric": "context_relevance", "score": 0.0, "details": str(e)})

    # 3. Groundedness — is the response supported by context?
    try:
        grounded = provider.groundedness_measure_with_cot_reasons(agent_response, context_text)
        g_score = grounded[0] if isinstance(grounded, tuple) else float(grounded)
        scores.append({"metric": "groundedness", "score": float(g_score), "details": None})
    except Exception as e:
        scores.append({"metric": "groundedness", "score": 0.0, "details": str(e)})

    # 4. Coherence — is the reasoning logically coherent?
    try:
        coherence = provider.coherence(agent_response)
        scores.append({"metric": "coherence", "score": float(coherence), "details": None})
    except Exception as e:
        scores.append({"metric": "coherence", "score": 0.0, "details": str(e)})

    result = {
        "evaluation_id": evaluation_id,
        "query": query,
        "agent_response": agent_response,
        "retrieved_contexts": retrieved_contexts,
        "ground_truth": ground_truth,
        "scores": scores,
        "use_case": use_case,
        "agent_id": agent_id,
        "timestamp": datetime.utcnow().isoformat(),
    }

    _evaluations.append(result)
    return result


def get_evaluations(limit: int = 50, use_case: str | None = None) -> list[dict]:
    """Get recent evaluations, optionally filtered by use case."""
    evals = _evaluations
    if use_case:
        evals = [e for e in evals if e["use_case"] == use_case]
    return sorted(evals, key=lambda e: e["timestamp"], reverse=True)[:limit]


def get_aggregate_metrics() -> dict:
    """Compute aggregate metrics across all evaluations."""
    if not _evaluations:
        return {
            "answer_relevance": 0.0,
            "context_precision": 0.0,
            "groundedness": 0.0,
            "faithfulness": 0.0,
            "total_evaluations": 0,
            "by_use_case": {},
        }

    metrics = {"answer_relevance": [], "context_relevance": [], "groundedness": [], "coherence": []}
    by_use_case: dict[str, dict[str, list]] = {}

    for ev in _evaluations:
        uc = ev["use_case"]
        if uc not in by_use_case:
            by_use_case[uc] = {"answer_relevance": [], "context_relevance": [], "groundedness": [], "coherence": []}

        for s in ev["scores"]:
            m = s["metric"]
            if m in metrics:
                metrics[m].append(s["score"])
            if m in by_use_case[uc]:
                by_use_case[uc][m].append(s["score"])

    def avg(lst):
        return sum(lst) / len(lst) if lst else 0.0

    return {
        "answer_relevance": round(avg(metrics["answer_relevance"]), 4),
        "context_precision": round(avg(metrics["context_relevance"]), 4),
        "groundedness": round(avg(metrics["groundedness"]), 4),
        "faithfulness": round(avg(metrics["coherence"]), 4),
        "total_evaluations": len(_evaluations),
        "by_use_case": {
            uc: {
                "answer_relevance": round(avg(scores["answer_relevance"]), 4),
                "context_precision": round(avg(scores["context_relevance"]), 4),
                "groundedness": round(avg(scores["groundedness"]), 4),
                "faithfulness": round(avg(scores["coherence"]), 4),
                "count": len(scores["answer_relevance"]),
            }
            for uc, scores in by_use_case.items()
        },
    }
```

**Step 2: Commit**

```bash
git add backend/evaluation/services/trulens_evaluator.py
git commit -m "feat: add TruLens evaluator with 4 feedback functions"
```

---

## Task 7: RAGAS Evaluator Service

**Files:**
- Create: `backend/evaluation/services/ragas_evaluator.py`

**Step 1: Create ragas_evaluator.py**

```python
"""RAGAS metrics evaluator for RAG quality measurement."""

from ragas import evaluate as ragas_evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
    context_entity_recall,
)
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from langchain_anthropic import ChatAnthropic
from datasets import Dataset

from config import ANTHROPIC_API_KEY


def _get_llm():
    return LangchainLLMWrapper(
        ChatAnthropic(model="claude-sonnet-4-20250514", api_key=ANTHROPIC_API_KEY)
    )


def evaluate_with_ragas(
    query: str,
    retrieved_contexts: list[str],
    agent_response: str,
    ground_truth: str | None = None,
) -> dict:
    """
    Run RAGAS evaluation on a single RAG interaction.
    Returns per-metric scores.
    """
    data = {
        "question": [query],
        "answer": [agent_response],
        "contexts": [retrieved_contexts],
    }
    if ground_truth:
        data["ground_truth"] = [ground_truth]

    dataset = Dataset.from_dict(data)

    metrics = [faithfulness, answer_relevancy, context_precision]
    if ground_truth:
        metrics.append(context_recall)
        metrics.append(context_entity_recall)

    llm = _get_llm()

    result = ragas_evaluate(
        dataset=dataset,
        metrics=metrics,
        llm=llm,
    )

    scores = {}
    for metric_name in result.scores[0]:
        val = result.scores[0][metric_name]
        scores[metric_name] = round(float(val), 4) if val is not None else 0.0

    return scores


def batch_evaluate_with_ragas(
    evaluations: list[dict],
) -> list[dict]:
    """
    Run RAGAS on a batch of evaluations.
    Each item: {query, retrieved_contexts, agent_response, ground_truth?}
    """
    results = []
    for ev in evaluations:
        try:
            scores = evaluate_with_ragas(
                query=ev["query"],
                retrieved_contexts=ev["retrieved_contexts"],
                agent_response=ev["agent_response"],
                ground_truth=ev.get("ground_truth"),
            )
            results.append({"query": ev["query"], "scores": scores, "success": True})
        except Exception as e:
            results.append({"query": ev["query"], "scores": {}, "success": False, "error": str(e)})
    return results
```

**Step 2: Commit**

```bash
git add backend/evaluation/services/ragas_evaluator.py
git commit -m "feat: add RAGAS evaluator with faithfulness, relevancy, precision, recall"
```

---

## Task 8: Evaluate and Dashboard Routers

**Files:**
- Create: `backend/evaluation/routers/evaluate.py`
- Create: `backend/evaluation/routers/dashboard.py`
- Modify: `backend/evaluation/main.py` (register routers)

**Step 1: Create routers/evaluate.py**

```python
"""Evaluate router — run TruLens + RAGAS on agent decisions."""

from fastapi import APIRouter, BackgroundTasks
from models.schemas import (
    EvaluateRequest,
    EvaluateResponse,
    EvalScore,
    BatchEvaluateRequest,
    BatchEvaluateResponse,
)
from services.trulens_evaluator import evaluate_rag
from services.ragas_evaluator import evaluate_with_ragas

router = APIRouter(prefix="/evaluate", tags=["evaluate"])


@router.post("", response_model=EvaluateResponse)
async def evaluate_single(req: EvaluateRequest):
    """Run TruLens + RAGAS evaluation on a single agent decision."""
    # TruLens evaluation
    trulens_result = evaluate_rag(
        query=req.query,
        retrieved_contexts=req.retrieved_contexts,
        agent_response=req.agent_response,
        ground_truth=req.ground_truth,
        use_case=req.use_case,
        agent_id=req.agent_id,
    )

    # RAGAS evaluation
    try:
        ragas_scores = evaluate_with_ragas(
            query=req.query,
            retrieved_contexts=req.retrieved_contexts,
            agent_response=req.agent_response,
            ground_truth=req.ground_truth,
        )
    except Exception:
        ragas_scores = {}

    # Combine scores
    scores = [EvalScore(**s) for s in trulens_result["scores"]]
    for metric, value in ragas_scores.items():
        scores.append(EvalScore(metric=f"ragas_{metric}", score=value, details=None))

    return EvaluateResponse(
        success=True,
        evaluation_id=trulens_result["evaluation_id"],
        scores=scores,
        use_case=req.use_case,
        timestamp=trulens_result["timestamp"],
    )


@router.post("/batch", response_model=BatchEvaluateResponse)
async def evaluate_batch(req: BatchEvaluateRequest, background_tasks: BackgroundTasks):
    """Batch evaluate multiple decisions."""
    results = []
    for ev in req.evaluations:
        try:
            result = await evaluate_single(ev)
            results.append(result)
        except Exception as e:
            results.append(
                EvaluateResponse(
                    success=False,
                    evaluation_id="",
                    scores=[],
                    use_case=ev.use_case,
                    timestamp="",
                )
            )
    return BatchEvaluateResponse(success=True, count=len(results), results=results)
```

**Step 2: Create routers/dashboard.py**

```python
"""Dashboard router — aggregated metrics and evaluation history."""

from fastapi import APIRouter, Query
from services.trulens_evaluator import get_aggregate_metrics, get_evaluations

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("")
async def get_metrics():
    """Get aggregated evaluation metrics."""
    return {"success": True, "data": get_aggregate_metrics()}


@router.get("/history")
async def get_metrics_history(limit: int = Query(50, ge=1, le=500)):
    """Get evaluation scores over time."""
    evals = get_evaluations(limit=limit)
    history = []
    for ev in evals:
        point = {"timestamp": ev["timestamp"], "use_case": ev["use_case"], "agent_id": ev["agent_id"]}
        for s in ev["scores"]:
            point[s["metric"]] = s["score"]
        history.append(point)
    return {"success": True, "data": history}


@router.get("/leaderboard")
async def get_leaderboard():
    """Get per-use-case evaluation rankings."""
    metrics = get_aggregate_metrics()
    by_uc = metrics.get("by_use_case", {})
    leaderboard = sorted(by_uc.items(), key=lambda x: x[1].get("answer_relevance", 0), reverse=True)
    return {"success": True, "data": [{"use_case": uc, **scores} for uc, scores in leaderboard]}


@router.get("/evaluations")
async def list_evaluations(
    limit: int = Query(50, ge=1, le=500),
    use_case: str | None = None,
):
    """List individual evaluation records."""
    evals = get_evaluations(limit=limit, use_case=use_case)
    # Strip large fields for list view
    return {
        "success": True,
        "data": [
            {
                "evaluation_id": e["evaluation_id"],
                "query": e["query"][:200],
                "agent_response": e["agent_response"][:200],
                "use_case": e["use_case"],
                "agent_id": e["agent_id"],
                "scores": e["scores"],
                "timestamp": e["timestamp"],
            }
            for e in evals
        ],
    }
```

**Step 3: Register both routers in main.py**

Add to main.py:
```python
from routers.evaluate import router as evaluate_router
from routers.dashboard import router as dashboard_router
app.include_router(evaluate_router)
app.include_router(dashboard_router)
```

**Step 4: Verify all endpoints**

```bash
cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/evaluation
python main.py &
sleep 2
curl http://localhost:8000/health
curl http://localhost:8000/metrics
curl http://localhost:8000/docs  # FastAPI auto-generated Swagger UI
kill %1
```

**Step 5: Commit**

```bash
git add backend/evaluation/routers/ backend/evaluation/main.py
git commit -m "feat: add evaluate and dashboard routers for TruLens/RAGAS"
```

---

## Task 9: Seed Pinecone with Synthetic Data

**Files:**
- Create: `backend/evaluation/seed/__init__.py`
- Create: `backend/evaluation/seed/seed_pinecone.py`

**Step 1: Create seed/__init__.py**

Empty file.

**Step 2: Create seed/seed_pinecone.py**

```python
"""Seed Pinecone with synthetic fraud cases, patterns, and investigation data."""

import uuid
import random
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.pinecone_service import get_pinecone_service

CATEGORIES = ["ELECTRONICS", "CLOTHING", "JEWELRY", "GAMBLING", "CRYPTO", "PHARMACEUTICALS", "DIGITAL_GOODS", "FOOD"]
COUNTRIES = ["US", "GB", "DE", "NG", "IN", "CN", "BR", "RU", "PH", "VN"]
OUTCOMES = ["APPROVE", "REVIEW", "REJECT"]
RISK_FACTORS = [
    "disposable email domain",
    "high-risk geography",
    "business registration mismatch",
    "IP on proxy/VPN",
    "duplicate account indicators",
    "watchlist partial match",
    "new business less than 30 days",
    "bank account name mismatch",
    "excessive velocity in applications",
    "fraudulent document detected",
    "sanctions list match",
    "known fraud ring pattern",
    "synthetic identity indicators",
    "address does not match business type",
    "financial history shows liens",
]


def generate_fraud_cases(n: int = 50) -> list[dict]:
    records = []
    for _ in range(n):
        category = random.choice(CATEGORIES)
        country = random.choice(COUNTRIES)
        outcome = random.choice(OUTCOMES)
        risk_score = random.randint(10, 95)
        factors = random.sample(RISK_FACTORS, k=random.randint(1, 5))
        text = (
            f"Fraud case: {category} seller from {country}. "
            f"Risk score: {risk_score}. Decision: {outcome}. "
            f"Risk factors: {', '.join(factors)}. "
            f"{'Confirmed fraud after investigation.' if outcome == 'REJECT' else 'Cleared after manual review.' if outcome == 'REVIEW' else 'No issues found.'}"
        )
        records.append({
            "_id": f"FC-{uuid.uuid4().hex[:8]}",
            "text": text,
            "category": category,
            "domain": "fraud-cases",
            "outcome": outcome,
            "riskScore": risk_score,
            "country": country,
            "source": "seed",
        })
    return records


def generate_risk_patterns(n: int = 30) -> list[dict]:
    records = []
    pattern_templates = [
        "Pattern: {cat} sellers from {country} with {factor} have {rate}% fraud rate",
        "Pattern: Sellers using {factor} and {factor2} are {rate}% likely to be fraudulent",
        "Pattern: {cat} category in {country} shows elevated risk when {factor}",
        "Pattern: Combination of {factor} + {factor2} + {country} origin indicates organized fraud ring",
    ]
    for _ in range(n):
        cat = random.choice(CATEGORIES)
        country = random.choice(COUNTRIES)
        factors = random.sample(RISK_FACTORS, k=2)
        rate = random.randint(30, 95)
        template = random.choice(pattern_templates)
        text = template.format(cat=cat, country=country, factor=factors[0], factor2=factors[1], rate=rate)
        records.append({
            "_id": f"RP-{uuid.uuid4().hex[:8]}",
            "text": text,
            "category": cat,
            "domain": "risk-patterns",
            "riskScore": rate,
            "country": country,
            "source": "seed",
        })
    return records


def generate_investigations(n: int = 20) -> list[dict]:
    records = []
    for _ in range(n):
        cat = random.choice(CATEGORIES)
        country = random.choice(COUNTRIES)
        factors = random.sample(RISK_FACTORS, k=random.randint(2, 4))
        outcome = random.choice(["confirmed_fraud", "false_positive", "inconclusive"])
        text = (
            f"Investigation report: {cat} seller from {country}. "
            f"Investigated risk factors: {', '.join(factors)}. "
            f"Outcome: {outcome}. "
            f"{'Seller account terminated and funds held.' if outcome == 'confirmed_fraud' else 'Seller cleared for operation.' if outcome == 'false_positive' else 'Additional monitoring recommended.'}"
        )
        records.append({
            "_id": f"INV-{uuid.uuid4().hex[:8]}",
            "text": text,
            "category": cat,
            "domain": "investigations",
            "outcome": outcome,
            "country": country,
            "source": "seed",
        })
    return records


def main():
    print("[Seed] Starting Pinecone seeding...")
    svc = get_pinecone_service()

    fraud_cases = generate_fraud_cases(50)
    svc.upsert("fraud-cases", fraud_cases)
    print(f"[Seed] Upserted {len(fraud_cases)} fraud cases")

    patterns = generate_risk_patterns(30)
    svc.upsert("risk-patterns", patterns)
    print(f"[Seed] Upserted {len(patterns)} risk patterns")

    investigations = generate_investigations(20)
    svc.upsert("investigations", investigations)
    print(f"[Seed] Upserted {len(investigations)} investigations")

    print("[Seed] Done! Run /ingest/bulk to also import sellers from Node backend.")
    print(f"[Seed] Index stats: {svc.get_stats()}")


if __name__ == "__main__":
    main()
```

**Step 3: Run the seed**

```bash
cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/evaluation
python seed/seed_pinecone.py
```

**Step 4: Commit**

```bash
git add backend/evaluation/seed/
git commit -m "feat: add Pinecone seeder with synthetic fraud cases, patterns, investigations"
```

---

## Task 10: Upgrade Node Context Engine for Vector Retrieval

**Files:**
- Modify: `backend/agents/core/context-engine.js:110-131` (RAG results section)
- Modify: `backend/gateway/server.js` (add EVAL_SERVICE_URL config)

**Step 1: Add eval service URL to server.js**

Near the top of `backend/gateway/server.js`, add:
```javascript
const EVAL_SERVICE_URL = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
```

**Step 2: Upgrade context-engine.js RAG retrieval**

Replace the existing RAG results section (step 4, lines ~111-131 in `assembleContext`) with a version that tries the Python eval service first, then falls back to TF-IDF:

```javascript
// 4. RAG results — try vector search via Python eval service, fallback to TF-IDF
const queryText = typeof task === 'string' ? task : (task.type || task.eventType || JSON.stringify(task).slice(0, 200));
const namespace = domain ? (DOMAIN_TO_NAMESPACE[domain] || null) : null;
if (namespace) {
  let ragResults = [];

  // Try Python eval service (Pinecone vector search)
  const evalServiceUrl = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
  try {
    const vectorResponse = await fetch(`${evalServiceUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: queryText,
        namespace: namespace === 'onboarding' ? 'onboarding-knowledge' : namespace === 'risk-events' ? 'fraud-cases' : namespace,
        top_k: 5,
        filters: sellerId ? { sellerId } : null,
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (vectorResponse.ok) {
      const vectorData = await vectorResponse.json();
      ragResults = (vectorData.results || []).map(r => ({
        text: r.text,
        relevanceScore: r.score,
        outcome: r.metadata?.outcome || null,
        ...r.metadata,
      }));
    }
  } catch (e) {
    // Vector search unavailable — fall through to TF-IDF
  }

  // Fallback to TF-IDF if vector search returned nothing
  if (ragResults.length === 0) {
    try {
      ragResults = this.knowledgeBase.searchKnowledge(namespace, queryText, sellerId ? { sellerId } : {}, 5);
    } catch (e) {
      // TF-IDF also failed; skip
    }
  }

  if (ragResults.length > 0) {
    const ragText = this.promptBuilder.formatRAGResults(ragResults, 5);
    sections.ragResults = this.promptBuilder.truncateToTokenBudget(ragText, SOURCE_BUDGETS.ragResults.maxTokens);
    totalTokens += this.promptBuilder.estimateTokens(sections.ragResults);
    sourceMeta.ragResults = { included: true, results: ragResults.length, source: ragResults[0].relevanceScore ? 'vector' : 'tfidf', tokens: this.promptBuilder.estimateTokens(sections.ragResults) };
  }
}
```

**Step 3: Make assembleContext async**

The function signature changes from `assembleContext(agentId, task, options)` to `async assembleContext(agentId, task, options)`. Update all callers (search for `assembleContext(` in the codebase — likely `base-agent.js`) to `await` it.

**Step 4: Commit**

```bash
git add backend/agents/core/context-engine.js backend/gateway/server.js
git commit -m "feat: upgrade context engine to use Pinecone vector search with TF-IDF fallback"
```

---

## Task 11: Add Auto-Evaluation Trigger to Onboarding Agent

**Files:**
- Modify: `backend/services/business/seller-onboarding/index.js` (after agent evaluation call)

**Step 1: Add fire-and-forget evaluation after agent decision**

After the agent returns its evaluation (search for the line that calls `sellerOnboarding.evaluateSeller`), add:

```javascript
// Fire-and-forget evaluation via Python eval service
const evalInterval = parseInt(process.env.EVAL_INTERVAL || '5');
if (!global._evalCounter) global._evalCounter = 0;
global._evalCounter++;

if (global._evalCounter % evalInterval === 0) {
  const evalServiceUrl = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
  fetch(`${evalServiceUrl}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `Evaluate seller: ${sellerData.businessName || 'Unknown'} (${sellerData.businessCategory || 'Unknown'}) from ${sellerData.country || 'Unknown'}`,
      retrieved_contexts: (evaluation?.chainOfThought?.steps || []).map(s => s.content || JSON.stringify(s)).slice(0, 5),
      agent_response: `Decision: ${evaluation?.decision || 'UNKNOWN'}. Risk Score: ${evaluation?.riskScore || 0}. ${evaluation?.summary || ''}`,
      ground_truth: null,
      use_case: 'onboarding_decision',
      agent_id: 'seller-onboarding-agent',
    }),
  }).catch(() => {}); // fire-and-forget
}
```

**Step 2: Commit**

```bash
git add backend/services/business/seller-onboarding/index.js
git commit -m "feat: add auto-evaluation trigger to onboarding agent (every Nth decision)"
```

---

## Task 12: React RAG Evaluation Page

**Files:**
- Create: `src/pages/RAGEvaluation.jsx`
- Modify: `src/App.jsx` (add import + route)
- Modify: `src/components/Layout.jsx` (add nav item)

**Step 1: Create src/pages/RAGEvaluation.jsx**

```jsx
import { useState, useEffect } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Brain, Activity, Target, Shield, RefreshCw, TrendingUp } from 'lucide-react'

const EVAL_API = 'http://localhost:8000'

function ScoreCard({ title, score, icon: Icon, color }) {
  const pct = (score * 100).toFixed(1)
  const bgColor = score >= 0.8 ? 'bg-green-900/30 border-green-700' : score >= 0.6 ? 'bg-yellow-900/30 border-yellow-700' : 'bg-red-900/30 border-red-700'
  const textColor = score >= 0.8 ? 'text-green-400' : score >= 0.6 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className={`${bgColor} border rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">{title}</span>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className={`text-3xl font-bold ${textColor}`}>{pct}%</div>
      <div className="mt-1 w-full bg-gray-700 rounded-full h-2">
        <div className={`h-2 rounded-full ${score >= 0.8 ? 'bg-green-500' : score >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function RAGEvaluation() {
  const [metrics, setMetrics] = useState(null)
  const [history, setHistory] = useState([])
  const [evaluations, setEvaluations] = useState([])
  const [loading, setLoading] = useState(true)
  const [evalRunning, setEvalRunning] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [metricsRes, historyRes, evalsRes] = await Promise.all([
        fetch(`${EVAL_API}/metrics`).then(r => r.json()).catch(() => null),
        fetch(`${EVAL_API}/metrics/history?limit=100`).then(r => r.json()).catch(() => null),
        fetch(`${EVAL_API}/metrics/evaluations?limit=50`).then(r => r.json()).catch(() => null),
      ])
      if (metricsRes?.success) setMetrics(metricsRes.data)
      if (historyRes?.success) setHistory(historyRes.data)
      if (evalsRes?.success) setEvaluations(evalsRes.data)
    } catch (e) {
      console.error('Failed to fetch eval data:', e)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const runManualEval = async () => {
    setEvalRunning(true)
    try {
      await fetch(`${EVAL_API}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Evaluate electronics seller from Nigeria with disposable email',
          retrieved_contexts: [
            'Fraud case: ELECTRONICS seller from NG. Risk score: 82. Decision: REJECT. Risk factors: disposable email domain, high-risk geography.',
            'Pattern: ELECTRONICS sellers from NG with disposable email domain have 78% fraud rate',
          ],
          agent_response: 'Decision: REJECT. Risk Score: 82. High risk due to disposable email and high-risk geography combination.',
          use_case: 'onboarding_decision',
          agent_id: 'seller-onboarding-agent',
        }),
      })
      await fetchData()
    } catch (e) {
      console.error('Manual eval failed:', e)
    }
    setEvalRunning(false)
  }

  const getScoreColor = (score) => {
    if (score >= 0.8) return 'text-green-400'
    if (score >= 0.6) return 'text-yellow-400'
    return 'text-red-400'
  }

  // Prepare use-case chart data
  const useCaseData = metrics?.by_use_case ? Object.entries(metrics.by_use_case).map(([uc, scores]) => ({
    name: uc.replace(/_/g, ' '),
    'Answer Relevance': (scores.answer_relevance * 100).toFixed(1),
    'Context Precision': (scores.context_precision * 100).toFixed(1),
    'Groundedness': (scores.groundedness * 100).toFixed(1),
    'Faithfulness': (scores.faithfulness * 100).toFixed(1),
  })) : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">RAG Evaluation Dashboard</h1>
          <p className="text-gray-400 mt-1">TruLens + RAGAS metrics for retrieval-augmented generation quality</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={runManualEval} disabled={evalRunning} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition disabled:opacity-50">
            <Brain className="w-4 h-4" /> {evalRunning ? 'Running...' : 'Run Evaluation'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-20">Loading evaluation data...</div>
      ) : !metrics ? (
        <div className="text-center py-20">
          <Brain className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl text-gray-300 mb-2">No Evaluations Yet</h2>
          <p className="text-gray-500 mb-4">Run an evaluation or wait for auto-evaluation to trigger.</p>
          <button onClick={runManualEval} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500">
            Run First Evaluation
          </button>
        </div>
      ) : (
        <>
          {/* Score Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ScoreCard title="Answer Relevance" score={metrics.answer_relevance} icon={Target} color="text-blue-400" />
            <ScoreCard title="Context Precision" score={metrics.context_precision} icon={Activity} color="text-purple-400" />
            <ScoreCard title="Groundedness" score={metrics.groundedness} icon={Shield} color="text-green-400" />
            <ScoreCard title="Faithfulness" score={metrics.faithfulness} icon={Brain} color="text-amber-400" />
          </div>

          {/* Total evaluations badge */}
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <TrendingUp className="w-4 h-4" />
            <span>{metrics.total_evaluations} total evaluations</span>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score Trends */}
            {history.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Score Trends</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={history.slice().reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={t => new Date(t).toLocaleTimeString()} />
                    <YAxis domain={[0, 1]} tick={{ fill: '#9CA3AF' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }} />
                    <Legend />
                    <Line type="monotone" dataKey="answer_relevance" name="Answer Relevance" stroke="#60A5FA" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="groundedness" name="Groundedness" stroke="#34D399" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="coherence" name="Coherence" stroke="#FBBF24" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Use Case Breakdown */}
            {useCaseData.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Use Case Breakdown</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={useCaseData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#9CA3AF' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="Answer Relevance" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Groundedness" fill="#34D399" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Faithfulness" fill="#FBBF24" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Evaluations Table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">Recent Evaluations</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left p-3">Query</th>
                    <th className="text-left p-3">Use Case</th>
                    <th className="text-center p-3">Relevance</th>
                    <th className="text-center p-3">Grounded</th>
                    <th className="text-center p-3">Coherence</th>
                    <th className="text-left p-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((ev) => {
                    const scoreMap = {}
                    ev.scores.forEach(s => { scoreMap[s.metric] = s.score })
                    return (
                      <tr
                        key={ev.evaluation_id}
                        className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition"
                        onClick={() => setExpanded(expanded === ev.evaluation_id ? null : ev.evaluation_id)}
                      >
                        <td className="p-3 text-gray-300 max-w-xs truncate">{ev.query}</td>
                        <td className="p-3">
                          <span className="px-2 py-1 bg-indigo-900/50 text-indigo-300 text-xs rounded-full">
                            {ev.use_case.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className={`p-3 text-center font-mono ${getScoreColor(scoreMap.answer_relevance || 0)}`}>
                          {((scoreMap.answer_relevance || 0) * 100).toFixed(0)}%
                        </td>
                        <td className={`p-3 text-center font-mono ${getScoreColor(scoreMap.groundedness || 0)}`}>
                          {((scoreMap.groundedness || 0) * 100).toFixed(0)}%
                        </td>
                        <td className={`p-3 text-center font-mono ${getScoreColor(scoreMap.coherence || 0)}`}>
                          {((scoreMap.coherence || 0) * 100).toFixed(0)}%
                        </td>
                        <td className="p-3 text-gray-500 text-xs">{new Date(ev.timestamp).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                  {evaluations.length === 0 && (
                    <tr><td colSpan="6" className="p-8 text-center text-gray-500">No evaluations yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expanded Detail */}
          {expanded && evaluations.find(e => e.evaluation_id === expanded) && (() => {
            const ev = evaluations.find(e => e.evaluation_id === expanded)
            return (
              <div className="bg-gray-800 rounded-xl border border-indigo-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Evaluation Detail: {ev.evaluation_id}</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-400 text-sm">Query:</span>
                    <p className="text-gray-200 mt-1">{ev.query}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Agent Response:</span>
                    <p className="text-gray-200 mt-1">{ev.agent_response}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">All Scores:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {ev.scores.map((s, i) => (
                        <span key={i} className={`px-3 py-1 rounded-full text-xs font-mono ${getScoreColor(s.score)} bg-gray-700`}>
                          {s.metric}: {(s.score * 100).toFixed(1)}%
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
```

**Step 2: Add route to App.jsx**

In `src/App.jsx`:
- Add import: `import RAGEvaluation from './pages/RAGEvaluation'`
- Add route inside `<Routes>`: `<Route path="/rag-evaluation" element={<RAGEvaluation />} />`

**Step 3: Add nav item to Layout.jsx**

In the `navigation` array inside `src/components/Layout.jsx`, add to the Platform children array (after Observability):
```javascript
{ name: 'RAG Evaluation', href: '/rag-evaluation' }
```

**Step 4: Commit**

```bash
git add src/pages/RAGEvaluation.jsx src/App.jsx src/components/Layout.jsx
git commit -m "feat: add RAG Evaluation dashboard page with score cards, charts, and table"
```

---

## Task 13: Update MCP Server with Vector Search Tools

**Files:**
- Modify: `backend/mcp/server.js` (add search_knowledge_base upgrade and new evaluate tool)

**Step 1: Add vector-powered search tool to MCP server**

Add a new tool `vector_search` that calls the Python eval service:

```javascript
server.registerTool(
  'vector_search',
  {
    description: 'Search the vector knowledge base (Pinecone) for semantically similar fraud cases, patterns, or investigation records',
    inputSchema: {
      query: z.string().describe('Search query text'),
      namespace: z.enum(['fraud-cases', 'onboarding-knowledge', 'risk-patterns', 'investigations']).describe('Which namespace to search'),
      topK: z.number().optional().describe('Number of results (default 5)')
    }
  },
  async ({ query, namespace, topK }) => {
    const evalServiceUrl = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
    const response = await fetch(`${evalServiceUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, namespace, top_k: topK || 5 })
    });
    const data = await response.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);
```

**Step 2: Update tool count in startup message**

Change `console.error('Tools registered: 16')` to `console.error('Tools registered: 17')`.

**Step 3: Commit**

```bash
git add backend/mcp/server.js
git commit -m "feat: add vector_search MCP tool for Pinecone semantic search"
```

---

## Task 14: Environment Setup and Integration Test

**Files:**
- Create: `backend/evaluation/.env` (from .env.example, user provides keys)
- Modify: `backend/.env` (add EVAL_SERVICE_URL)

**Step 1: User provides Pinecone and Anthropic API keys**

Ask user for:
- `PINECONE_API_KEY`
- `ANTHROPIC_API_KEY` (if not already set)

Create `backend/evaluation/.env` with real keys.

**Step 2: Add EVAL_SERVICE_URL to Node backend .env**

```bash
echo "EVAL_SERVICE_URL=http://localhost:8000" >> backend/.env
echo "EVAL_INTERVAL=5" >> backend/.env
```

**Step 3: Full integration test**

```bash
# Terminal 1: Start Node backend
cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && npm run dev

# Terminal 2: Start Python eval service
cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/evaluation && python main.py

# Terminal 3: Seed Pinecone
cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/evaluation && python seed/seed_pinecone.py

# Terminal 4: Test endpoints
curl http://localhost:8000/health
curl http://localhost:8000/metrics
curl -X POST http://localhost:8000/search -H "Content-Type: application/json" -d '{"query":"electronics seller from Nigeria","namespace":"fraud-cases","top_k":3}'
curl -X POST http://localhost:8000/evaluate -H "Content-Type: application/json" -d '{"query":"evaluate electronics seller","retrieved_contexts":["fraud case for electronics"],"agent_response":"REJECT","use_case":"test","agent_id":"test"}'

# Terminal 5: Start frontend
cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && npm run dev
# Navigate to http://localhost:5176/rag-evaluation
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete RAG + TruLens + RAGAS integration"
```

---

## Summary

| Task | Component | Estimated Steps |
|------|-----------|----------------|
| 1 | Python service scaffolding | 6 |
| 2 | Pydantic schemas | 3 |
| 3 | Pinecone service | 5 |
| 4 | Ingest router | 4 |
| 5 | Search router | 3 |
| 6 | TruLens evaluator | 2 |
| 7 | RAGAS evaluator | 2 |
| 8 | Evaluate + Dashboard routers | 5 |
| 9 | Seed Pinecone | 4 |
| 10 | Node context engine upgrade | 4 |
| 11 | Auto-eval trigger | 2 |
| 12 | React RAG Evaluation page | 4 |
| 13 | MCP vector search tool | 3 |
| 14 | Environment + integration test | 4 |
| **Total** | **14 tasks** | **51 steps** |
