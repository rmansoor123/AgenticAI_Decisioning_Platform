"""
FastAPI router for Arize Phoenix observability.

Endpoints:
  POST /phoenix/trace   — Log a trace to Phoenix
  GET  /phoenix/health  — Health check for Phoenix
"""

import logging
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/phoenix", tags=["phoenix"])


class SpanData(BaseModel):
    name: str
    duration_ms: Optional[float] = None
    attributes: Optional[dict] = {}


class TraceRequest(BaseModel):
    trace_id: str
    agent_id: str
    spans: Optional[list[SpanData]] = []
    input: Optional[str] = ""
    output: Optional[str] = ""
    metadata: Optional[dict] = {}


@router.post("/trace")
async def phoenix_trace(req: TraceRequest):
    """Log a trace to Arize Phoenix."""
    from services.phoenix_service import log_trace

    result = log_trace({
        "trace_id": req.trace_id,
        "agent_id": req.agent_id,
        "spans": [s.model_dump() for s in req.spans],
        "input": req.input,
        "output": req.output,
        "metadata": req.metadata,
    })
    return result


@router.get("/health")
async def phoenix_health():
    """Check Arize Phoenix health."""
    from services.phoenix_service import health
    return await health()
