"""Retrieval evaluation router — hit rate, MRR, NDCG metrics."""

import math
from fastapi import APIRouter
from models.schemas import RetrievalEvalRequest, RetrievalEvalResponse

router = APIRouter(prefix="/evaluate/retrieval", tags=["retrieval-eval"])


def _compute_hit_rate(retrieved_ids: list[str], relevant_ids: list[str]) -> float:
    """Fraction of relevant docs found in retrieved set."""
    if not relevant_ids:
        return 0.0
    if not retrieved_ids:
        return 0.0
    retrieved_set = set(retrieved_ids)
    hits = sum(1 for rid in relevant_ids if rid in retrieved_set)
    return hits / len(relevant_ids)


def _compute_mrr(retrieved_ids: list[str], relevant_ids: list[str]) -> float:
    """1 / rank of first relevant document in retrieved list."""
    if not retrieved_ids or not relevant_ids:
        return 0.0
    relevant_set = set(relevant_ids)
    for i, rid in enumerate(retrieved_ids):
        if rid in relevant_set:
            return 1.0 / (i + 1)
    return 0.0


def _compute_ndcg(retrieved_ids: list[str], relevant_ids: list[str], k: int = 5) -> float:
    """Normalized Discounted Cumulative Gain at k (binary relevance)."""
    if not retrieved_ids or not relevant_ids:
        return 0.0
    relevant_set = set(relevant_ids)

    # DCG
    limit = min(k, len(retrieved_ids))
    dcg = 0.0
    for i in range(limit):
        if retrieved_ids[i] in relevant_set:
            dcg += 1.0 / math.log2(i + 2)

    # IDCG
    ideal_count = min(k, len(relevant_ids))
    idcg = 0.0
    for i in range(ideal_count):
        idcg += 1.0 / math.log2(i + 2)

    if idcg == 0:
        return 0.0
    return dcg / idcg


@router.post("", response_model=RetrievalEvalResponse)
async def evaluate_retrieval(req: RetrievalEvalRequest):
    """Evaluate retrieval quality with hit rate, MRR, and NDCG."""
    k = req.k or 5
    hit_rate = _compute_hit_rate(req.retrieved_ids, req.relevant_ids)
    mrr = _compute_mrr(req.retrieved_ids, req.relevant_ids)
    ndcg_at_k = _compute_ndcg(req.retrieved_ids, req.relevant_ids, k)

    return RetrievalEvalResponse(
        hit_rate=hit_rate,
        mrr=mrr,
        ndcg_at_k=ndcg_at_k,
        k=k,
    )
