"""Evaluate router — run TruLens + RAGAS + DeepEval on agent decisions."""

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
async def evaluate_single(req: EvaluateRequest, background_tasks: BackgroundTasks):
    """Run TruLens + RAGAS + DeepEval evaluation on a single agent decision."""
    # TruLens evaluation
    trulens_result = evaluate_rag(
        query=req.query,
        retrieved_contexts=req.retrieved_contexts,
        agent_response=req.agent_response,
        ground_truth=req.ground_truth,
        use_case=req.use_case,
        agent_id=req.agent_id,
    )

    # RAGAS evaluation — requires non-empty retrieved_contexts
    ragas_scores = {}
    if req.retrieved_contexts and len(req.retrieved_contexts) > 0:
        try:
            ragas_scores = evaluate_with_ragas(
                query=req.query,
                retrieved_contexts=req.retrieved_contexts,
                agent_response=req.agent_response,
                ground_truth=req.ground_truth,
            )
        except Exception as e:
            import logging
            logging.warning(f"RAGAS evaluation failed for agent {req.agent_id}: {e}")

    # DeepEval evaluation
    deepeval_scores = []
    try:
        from services.deepeval_evaluator import evaluate_with_deepeval

        deepeval_result = evaluate_with_deepeval(
            query=req.query,
            retrieved_contexts=req.retrieved_contexts,
            agent_response=req.agent_response,
            ground_truth=req.ground_truth,
            use_case=req.use_case,
            agent_id=req.agent_id,
        )
        deepeval_scores = deepeval_result.get("scores", [])
    except Exception:
        pass

    # Combine scores
    scores = [EvalScore(**s) for s in trulens_result["scores"]]
    for metric, value in ragas_scores.items():
        scores.append(EvalScore(metric=f"ragas_{metric}", score=value, details=None))
    for s in deepeval_scores:
        scores.append(EvalScore(**s))

    # BrainTrust logging (fire-and-forget)
    try:
        from services.braintrust_service import log_evaluation

        combined_score_map = {s.metric: s.score for s in scores}
        background_tasks.add_task(
            log_evaluation,
            project="fraud-detection",
            experiment=f"eval-{req.use_case}",
            input_data={"query": req.query, "contexts": req.retrieved_contexts},
            output=req.agent_response,
            scores=combined_score_map,
            metadata={"agent_id": req.agent_id, **req.metadata},
        )
    except Exception:
        pass

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
