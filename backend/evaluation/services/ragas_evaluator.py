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
