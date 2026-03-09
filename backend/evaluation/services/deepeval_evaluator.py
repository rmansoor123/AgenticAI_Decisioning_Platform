"""DeepEval evaluator — hallucination, toxicity, and bias metrics."""

import os
import uuid
from datetime import datetime, timezone

from config import ANTHROPIC_API_KEY

# Store evaluations in memory (matches trulens pattern)
_deepeval_evaluations: list[dict] = []


def evaluate_with_deepeval(
    query: str,
    retrieved_contexts: list[str],
    agent_response: str,
    ground_truth: str | None = None,
    use_case: str = "general",
    agent_id: str = "unknown",
) -> dict:
    """
    Run DeepEval metrics on a single RAG interaction.
    Returns evaluation_id and scores for hallucination, toxicity, bias,
    and optionally summarization.
    """
    try:
        from deepeval.models.base_model import DeepEvalBaseLLM
        from deepeval.metrics import (
            HallucinationMetric,
            ToxicityMetric,
            BiasMetric,
            SummarizationMetric,
        )
        from deepeval.test_case import LLMTestCase
    except ImportError:
        # DeepEval not installed — return empty scores
        return {
            "evaluation_id": f"DEVAL-{uuid.uuid4().hex[:12]}",
            "scores": [],
            "error": "deepeval not installed",
        }

    # Custom Anthropic model wrapper for DeepEval
    class AnthropicEvalModel(DeepEvalBaseLLM):
        def __init__(self):
            self.model_name = "claude-sonnet-4-20250514"

        def load_model(self):
            return self.model_name

        def generate(self, prompt: str, **kwargs) -> str:
            try:
                import anthropic

                client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
                response = client.messages.create(
                    model=self.model_name,
                    max_tokens=1024,
                    messages=[{"role": "user", "content": prompt}],
                )
                return response.content[0].text
            except Exception:
                return ""

        async def a_generate(self, prompt: str, **kwargs) -> str:
            return self.generate(prompt, **kwargs)

        def get_model_name(self) -> str:
            return self.model_name

    evaluation_id = f"DEVAL-{uuid.uuid4().hex[:12]}"
    scores = []
    model = AnthropicEvalModel()

    test_case = LLMTestCase(
        input=query,
        actual_output=agent_response,
        context=retrieved_contexts if retrieved_contexts else None,
        expected_output=ground_truth,
    )

    # 1. Hallucination — info not supported by context
    try:
        metric = HallucinationMetric(model=model, threshold=0.5)
        metric.measure(test_case)
        scores.append({
            "metric": "deepeval_hallucination",
            "score": float(metric.score),
            "details": metric.reason if hasattr(metric, "reason") else None,
        })
    except Exception as e:
        scores.append({"metric": "deepeval_hallucination", "score": 0.0, "details": str(e)})

    # 2. Toxicity — harmful/toxic content
    try:
        metric = ToxicityMetric(model=model, threshold=0.5)
        metric.measure(test_case)
        scores.append({
            "metric": "deepeval_toxicity",
            "score": float(metric.score),
            "details": metric.reason if hasattr(metric, "reason") else None,
        })
    except Exception as e:
        scores.append({"metric": "deepeval_toxicity", "score": 0.0, "details": str(e)})

    # 3. Bias — biased language detection
    try:
        metric = BiasMetric(model=model, threshold=0.5)
        metric.measure(test_case)
        scores.append({
            "metric": "deepeval_bias",
            "score": float(metric.score),
            "details": metric.reason if hasattr(metric, "reason") else None,
        })
    except Exception as e:
        scores.append({"metric": "deepeval_bias", "score": 0.0, "details": str(e)})

    # 4. Summarization — quality score (only when ground_truth provided)
    if ground_truth:
        try:
            metric = SummarizationMetric(model=model, threshold=0.5)
            metric.measure(test_case)
            scores.append({
                "metric": "deepeval_summarization",
                "score": float(metric.score),
                "details": metric.reason if hasattr(metric, "reason") else None,
            })
        except Exception as e:
            scores.append({"metric": "deepeval_summarization", "score": 0.0, "details": str(e)})

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

    _deepeval_evaluations.append(result)
    return result


def get_deepeval_evaluations(limit: int = 50, use_case: str | None = None) -> list[dict]:
    """Get recent DeepEval evaluations, optionally filtered by use case."""
    evals = _deepeval_evaluations
    if use_case:
        evals = [e for e in evals if e["use_case"] == use_case]
    return sorted(evals, key=lambda e: e["timestamp"], reverse=True)[:limit]


def get_deepeval_aggregate_metrics() -> dict:
    """Compute aggregate DeepEval metrics across all evaluations."""
    if not _deepeval_evaluations:
        return {
            "deepeval_hallucination": 0.0,
            "deepeval_toxicity": 0.0,
            "deepeval_bias": 0.0,
            "total_evaluations": 0,
        }

    metrics: dict[str, list[float]] = {}

    for ev in _deepeval_evaluations:
        for s in ev["scores"]:
            m = s["metric"]
            if m not in metrics:
                metrics[m] = []
            metrics[m].append(s["score"])

    def avg(lst):
        return sum(lst) / len(lst) if lst else 0.0

    result = {k: round(avg(v), 4) for k, v in metrics.items()}
    result["total_evaluations"] = len(_deepeval_evaluations)
    return result
