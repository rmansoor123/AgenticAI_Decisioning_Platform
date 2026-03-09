"""
FastAPI router for vector search — routes to Qdrant, Pinecone, ChromaDB, or Weaviate
based on VECTOR_BACKEND env var.

Endpoints:
  POST /vector/search   — Search a collection by text query
  POST /vector/ingest   — Ingest documents into a collection
  POST /vector/embed    — Embed text(s) into vectors
  GET  /vector/health   — Health check for vector backend
"""

import os
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vector", tags=["vector"])


class SearchRequest(BaseModel):
    collection: str
    query: str
    top_k: int = 10
    filter: Optional[dict] = None


class IngestDocument(BaseModel):
    id: str
    text: str
    metadata: Optional[dict] = {}


class IngestRequest(BaseModel):
    collection: str
    documents: list[IngestDocument]


class EmbedRequest(BaseModel):
    texts: list[str]


def _get_backend():
    return os.getenv("VECTOR_BACKEND", "pinecone").lower()


@router.post("/search")
async def vector_search(req: SearchRequest):
    """Search for similar documents in a vector collection."""
    backend = _get_backend()

    if backend == "qdrant":
        from services.qdrant_service import search
        results = await search(req.collection, req.query, req.top_k, req.filter)
        return {"results": results, "backend": "qdrant"}

    elif backend == "pinecone":
        from services.pinecone_service import get_pinecone_service
        svc = get_pinecone_service()
        results = await svc.search(req.query, req.collection, req.top_k)
        return {"results": results, "backend": "pinecone"}

    elif backend == "chromadb":
        from services.chromadb_service import search
        results = await search(req.collection, req.query, req.top_k, req.filter)
        return {"results": results, "backend": "chromadb"}

    elif backend == "weaviate":
        from services.weaviate_service import search
        results = await search(req.collection, req.query, req.top_k, req.filter)
        return {"results": results, "backend": "weaviate"}

    else:
        raise HTTPException(status_code=400, detail=f"Unknown vector backend: {backend}")


@router.post("/ingest")
async def vector_ingest(req: IngestRequest):
    """Ingest documents into a vector collection."""
    backend = _get_backend()
    docs = [{"id": d.id, "text": d.text, "metadata": d.metadata} for d in req.documents]

    if backend == "qdrant":
        from services.qdrant_service import ingest
        return await ingest(req.collection, docs)

    elif backend == "pinecone":
        from services.pinecone_service import get_pinecone_service
        svc = get_pinecone_service()
        return await svc.ingest(docs, req.collection)

    elif backend == "chromadb":
        from services.chromadb_service import ingest
        return await ingest(req.collection, docs)

    elif backend == "weaviate":
        from services.weaviate_service import ingest
        return await ingest(req.collection, docs)

    else:
        raise HTTPException(status_code=400, detail=f"Unknown vector backend: {backend}")


@router.post("/embed")
async def vector_embed(req: EmbedRequest):
    """Embed text(s) into vectors using the local embedding model."""
    backend = _get_backend()
    try:
        if backend == "chromadb":
            from services.chromadb_service import embed_texts
        elif backend == "weaviate":
            from services.weaviate_service import embed_texts
        else:
            from services.qdrant_service import embed_texts
        vectors = embed_texts(req.texts)
        return {"vectors": vectors, "model": os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")


@router.get("/health")
async def vector_health():
    """Check the health of the active vector backend."""
    backend = _get_backend()

    if backend == "qdrant":
        from services.qdrant_service import health
        return await health()

    elif backend == "pinecone":
        try:
            from services.pinecone_service import get_pinecone_service
            svc = get_pinecone_service()
            return {"status": "healthy", "backend": "pinecone"}
        except Exception as e:
            return {"status": "unhealthy", "backend": "pinecone", "error": str(e)}

    elif backend == "chromadb":
        from services.chromadb_service import health
        return await health()

    elif backend == "weaviate":
        from services.weaviate_service import health
        return await health()

    else:
        return {"status": "unknown", "backend": backend}
