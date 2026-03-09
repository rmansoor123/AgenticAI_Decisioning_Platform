"""
FastAPI router for Mem0 agent memory.

Endpoints:
  POST   /memory/add              — Add a memory for an agent
  POST   /memory/search           — Search agent memories by query
  GET    /memory/{agent_id}       — Get all memories for an agent
  DELETE /memory/{memory_id}      — Delete a specific memory
  DELETE /memory/agent/{agent_id} — Delete all memories for an agent
  GET    /memory/health           — Health check
"""

import os
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/memory", tags=["memory"])


class AddMemoryRequest(BaseModel):
    agent_id: str
    content: str
    metadata: Optional[dict] = {}


class SearchMemoryRequest(BaseModel):
    agent_id: str
    query: str
    limit: int = 5


def _check_backend():
    backend = os.getenv("MEMORY_BACKEND", "sqlite").lower()
    if backend != "mem0":
        raise HTTPException(
            status_code=400,
            detail=f"Memory backend is '{backend}', not 'mem0'. Set MEMORY_BACKEND=mem0 to enable.",
        )


@router.post("/add")
async def add_memory(req: AddMemoryRequest):
    """Add a memory for an agent."""
    _check_backend()
    from services.mem0_service import add_memory
    result = await add_memory(req.agent_id, req.content, req.metadata)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.post("/search")
async def search_memory(req: SearchMemoryRequest):
    """Search agent memories by semantic similarity."""
    _check_backend()
    from services.mem0_service import search_memory
    results = await search_memory(req.agent_id, req.query, req.limit)
    return {"results": results}


@router.get("/{agent_id}")
async def get_agent_memories(agent_id: str):
    """Get all memories for an agent."""
    _check_backend()
    from services.mem0_service import get_all_memories
    memories = await get_all_memories(agent_id)
    return {"memories": memories, "count": len(memories)}


@router.delete("/{memory_id}")
async def delete_memory(memory_id: str):
    """Delete a specific memory by ID."""
    _check_backend()
    from services.mem0_service import delete_memory
    result = await delete_memory(memory_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.delete("/agent/{agent_id}")
async def delete_agent_memories(agent_id: str):
    """Delete all memories for an agent."""
    _check_backend()
    from services.mem0_service import delete_agent_memories
    result = await delete_agent_memories(agent_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.get("/health", response_model=None)
async def memory_health():
    """Check Mem0 health."""
    from services.mem0_service import health
    return await health()
