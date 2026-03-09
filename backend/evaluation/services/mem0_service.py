"""
Mem0 memory service — semantic memory for agents.
Uses Qdrant as the vector store backend (shares Layer 3 infrastructure).

Mem0 provides:
  - Automatic deduplication of similar memories
  - Semantic search over agent memories
  - Memory summarization and consolidation
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_mem0_client = None


def _get_mem0_client():
    """Lazy-initialize Mem0 client with Qdrant as vector store."""
    global _mem0_client
    if _mem0_client is not None:
        return _mem0_client

    from mem0 import Memory

    qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
    embedding_model = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

    config = {
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "url": qdrant_url,
                "collection_name": "agent_memories",
                "embedding_model_dims": 384,
            },
        },
        "embedder": {
            "provider": "huggingface",
            "config": {
                "model": embedding_model,
            },
        },
    }

    try:
        _mem0_client = Memory.from_config(config)
        logger.info(f"[mem0_service] Initialized with Qdrant at {qdrant_url}")
    except Exception as e:
        logger.error(f"[mem0_service] Init failed: {e}")
        _mem0_client = None
    return _mem0_client


async def add_memory(agent_id: str, content: str, metadata: Optional[dict] = None) -> dict:
    """Add a memory for an agent."""
    client = _get_mem0_client()
    if not client:
        return {"error": "Mem0 not available"}

    try:
        result = client.add(
            content,
            user_id=agent_id,
            metadata=metadata or {},
        )
        return {"success": True, "result": result}
    except Exception as e:
        logger.error(f"[mem0_service] add_memory error: {e}")
        return {"error": str(e)}


async def search_memory(agent_id: str, query: str, limit: int = 5) -> list[dict]:
    """Search memories for an agent by semantic similarity."""
    client = _get_mem0_client()
    if not client:
        return []

    try:
        results = client.search(
            query,
            user_id=agent_id,
            limit=limit,
        )
        return [
            {
                "id": str(r.get("id", "")),
                "memory": r.get("memory", ""),
                "score": r.get("score", 0),
                "metadata": r.get("metadata", {}),
                "created_at": r.get("created_at", ""),
            }
            for r in results
        ]
    except Exception as e:
        logger.error(f"[mem0_service] search_memory error: {e}")
        return []


async def get_all_memories(agent_id: str) -> list[dict]:
    """Get all memories for an agent."""
    client = _get_mem0_client()
    if not client:
        return []

    try:
        results = client.get_all(user_id=agent_id)
        return [
            {
                "id": str(r.get("id", "")),
                "memory": r.get("memory", ""),
                "metadata": r.get("metadata", {}),
                "created_at": r.get("created_at", ""),
            }
            for r in results
        ]
    except Exception as e:
        logger.error(f"[mem0_service] get_all_memories error: {e}")
        return []


async def delete_memory(memory_id: str) -> dict:
    """Delete a specific memory by ID."""
    client = _get_mem0_client()
    if not client:
        return {"error": "Mem0 not available"}

    try:
        client.delete(memory_id)
        return {"success": True, "deleted": memory_id}
    except Exception as e:
        logger.error(f"[mem0_service] delete_memory error: {e}")
        return {"error": str(e)}


async def delete_agent_memories(agent_id: str) -> dict:
    """Delete all memories for an agent."""
    client = _get_mem0_client()
    if not client:
        return {"error": "Mem0 not available"}

    try:
        client.delete_all(user_id=agent_id)
        return {"success": True, "agent_id": agent_id}
    except Exception as e:
        logger.error(f"[mem0_service] delete_agent_memories error: {e}")
        return {"error": str(e)}


async def health() -> dict:
    """Check Mem0 health."""
    client = _get_mem0_client()
    if not client:
        return {"status": "unavailable", "backend": "mem0"}
    return {"status": "healthy", "backend": "mem0"}
