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
