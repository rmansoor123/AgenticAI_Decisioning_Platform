"""Letta memory router — archival storage and core memory management."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/memory/letta", tags=["letta-memory"])


class AddArchivalRequest(BaseModel):
    agent_id: str
    content: str
    metadata: dict = {}


class SearchArchivalRequest(BaseModel):
    agent_id: str
    query: str
    limit: int = 5


class UpdateCoreMemoryRequest(BaseModel):
    block: str
    content: str


@router.post("/add")
async def add_to_archival(req: AddArchivalRequest):
    """Add content to Letta archival memory."""
    from services.letta_service import add_to_archival as letta_add

    result = letta_add(
        agent_id=req.agent_id,
        content=req.content,
        metadata=req.metadata if req.metadata else None,
    )
    return result


@router.post("/search")
async def search_archival(req: SearchArchivalRequest):
    """Search Letta archival memory."""
    from services.letta_service import search_archival as letta_search

    return letta_search(
        agent_id=req.agent_id,
        query=req.query,
        limit=req.limit,
    )


@router.get("/core/{agent_id}")
async def get_core_memory(agent_id: str):
    """Get core memory blocks for a Letta agent."""
    from services.letta_service import get_core_memory as letta_get_core

    return letta_get_core(agent_id)


@router.put("/core/{agent_id}")
async def update_core_memory(agent_id: str, req: UpdateCoreMemoryRequest):
    """Update a core memory block for a Letta agent."""
    from services.letta_service import update_core_memory as letta_update_core

    return letta_update_core(
        agent_id=agent_id,
        block=req.block,
        content=req.content,
    )


@router.get("/health")
async def letta_health():
    """Check Letta connectivity."""
    from services.letta_service import health

    return health()
