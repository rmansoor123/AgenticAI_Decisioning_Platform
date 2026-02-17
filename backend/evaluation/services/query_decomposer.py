"""Query Decomposer — breaks complex queries into sub-queries using Claude."""

import os
from anthropic import Anthropic

_client = None


def _get_client():
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return None
        _client = Anthropic(api_key=api_key)
    return _client


def decompose_query(query: str, max_sub_queries: int = 3) -> list[str]:
    """Decompose a complex query into simpler sub-queries using Claude.

    Falls back to returning the original query if Claude is unavailable.
    """
    client = _get_client()
    if client is None:
        return [query]

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=512,
            temperature=0.2,
            system=(
                "You decompose complex fraud investigation queries into simpler sub-queries. "
                "Return a JSON array of strings, each a focused sub-query. "
                f"Maximum {max_sub_queries} sub-queries. "
                "Return ONLY the JSON array, no explanation."
            ),
            messages=[{"role": "user", "content": f"Decompose this query: {query}"}],
        )
        import json

        text = response.content[0].text.strip()
        parsed = json.loads(text)
        if isinstance(parsed, list) and len(parsed) > 0:
            return parsed[:max_sub_queries]
    except Exception:
        pass

    return [query]
