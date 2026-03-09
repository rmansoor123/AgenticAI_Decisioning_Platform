"""
Arize Phoenix observability service — tracing and evaluation.
Sends traces to a self-hosted Phoenix instance for visualization and analysis.

Env:
  PHOENIX_URL=http://localhost:6006
"""

import os
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

_phoenix_initialized = False


def init_phoenix():
    """Initialize Phoenix tracing if available."""
    global _phoenix_initialized
    if _phoenix_initialized:
        return True

    try:
        import phoenix as px

        phoenix_url = os.getenv("PHOENIX_URL", "http://localhost:6006")

        # Register Phoenix as the trace provider
        from phoenix.otel import register
        tracer_provider = register(
            project_name="fraud-detection",
            endpoint=f"{phoenix_url}/v1/traces",
        )

        _phoenix_initialized = True
        logger.info(f"[phoenix_service] Initialized, sending traces to {phoenix_url}")
        return True

    except ImportError:
        logger.warning("[phoenix_service] arize-phoenix not installed")
        return False
    except Exception as e:
        logger.warning(f"[phoenix_service] Init failed: {e}")
        return False


def log_trace(trace_data: dict) -> dict:
    """Log a trace to Phoenix via OTLP.

    trace_data should contain:
      - trace_id: str
      - agent_id: str
      - spans: list of span dicts with {name, duration_ms, attributes}
      - input: str or dict
      - output: str or dict
      - metadata: dict (optional)
    """
    if not init_phoenix():
        return {"status": "skipped", "reason": "Phoenix not available"}

    try:
        from opentelemetry import trace as otel_trace

        tracer = otel_trace.get_tracer("fraud-detection-agents")
        trace_id = trace_data.get("trace_id", f"trace-{int(time.time())}")
        agent_id = trace_data.get("agent_id", "unknown")

        with tracer.start_as_current_span(
            name=f"agent.reason.{agent_id}",
            attributes={
                "agent.id": agent_id,
                "trace.id": trace_id,
                "input": str(trace_data.get("input", ""))[:1000],
                "output": str(trace_data.get("output", ""))[:1000],
            },
        ) as root_span:
            # Create child spans for each step
            for span_data in trace_data.get("spans", []):
                with tracer.start_as_current_span(
                    name=span_data.get("name", "step"),
                    attributes={
                        k: str(v) for k, v in span_data.get("attributes", {}).items()
                    },
                ) as child_span:
                    pass  # Span auto-closes

        return {"status": "logged", "trace_id": trace_id}

    except Exception as e:
        logger.warning(f"[phoenix_service] Trace logging failed: {e}")
        return {"status": "error", "error": str(e)}


def get_trace_url(trace_id: str) -> Optional[str]:
    """Get the Phoenix UI URL for a specific trace."""
    phoenix_url = os.getenv("PHOENIX_URL", "http://localhost:6006")
    return f"{phoenix_url}/projects/fraud-detection/traces/{trace_id}"


async def health() -> dict:
    """Check Phoenix health."""
    phoenix_url = os.getenv("PHOENIX_URL", "http://localhost:6006")

    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{phoenix_url}/healthz")
            if resp.status_code == 200:
                return {
                    "status": "healthy",
                    "backend": "phoenix",
                    "url": phoenix_url,
                    "initialized": _phoenix_initialized,
                }
    except Exception as e:
        pass

    return {
        "status": "unavailable",
        "backend": "phoenix",
        "url": phoenix_url,
        "initialized": _phoenix_initialized,
    }
