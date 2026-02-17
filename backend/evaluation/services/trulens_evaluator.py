"""TruLens feedback function evaluator."""

import os
import uuid
from datetime import datetime, timezone

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
        "timestamp": datetime.now(timezone.utc).isoformat(),
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
