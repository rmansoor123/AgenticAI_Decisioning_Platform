"""Pydantic models for request/response schemas."""

from __future__ import annotations
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
