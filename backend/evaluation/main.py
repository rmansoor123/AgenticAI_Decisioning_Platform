"""FastAPI evaluation service — Pinecone + TruLens + RAGAS + DeepEval + BrainTrust + Qdrant + Mem0 + Letta."""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import EVAL_SERVICE_PORT
from services.pinecone_service import get_pinecone_service
from routers.ingest import router as ingest_router
from routers.search import router as search_router
from routers.evaluate import router as evaluate_router
from routers.dashboard import router as dashboard_router
from routers.retrieval_eval import router as retrieval_eval_router
from routers.vector_search import router as vector_search_router
from routers.memory import router as memory_router
from routers.braintrust import router as braintrust_router
from routers.letta_memory import router as letta_memory_router
from routers.phoenix import router as phoenix_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown."""
    print("[EvalService] Starting up...")
    try:
        get_pinecone_service()
    except Exception as e:
        print(f"[EvalService] Pinecone init failed (will retry on first request): {e}")

    # Initialize Qdrant if configured
    vector_backend = os.getenv("VECTOR_BACKEND", "pinecone").lower()
    if vector_backend == "qdrant":
        try:
            from services.qdrant_service import _get_qdrant_client, _get_embedding_model
            _get_qdrant_client()
            _get_embedding_model()
            print("[EvalService] Qdrant + embedding model initialized")
        except Exception as e:
            print(f"[EvalService] Qdrant init failed (will retry on first request): {e}")

    # Initialize Letta if configured as memory backend
    memory_backend = os.getenv("MEMORY_BACKEND", "sqlite").lower()
    if memory_backend == "letta":
        try:
            from services.letta_service import health as letta_health

            status = letta_health()
            if status.get("status") == "ok":
                print("[EvalService] Letta memory service connected")
            else:
                print(f"[EvalService] Letta not reachable: {status}")
        except Exception as e:
            print(f"[EvalService] Letta init check failed: {e}")

    # Initialize Phoenix if configured
    obs_backend = os.getenv("OBSERVABILITY_BACKEND", "sqlite").lower()
    if obs_backend == "phoenix":
        try:
            from services.phoenix_service import init_phoenix
            if init_phoenix():
                print("[EvalService] Phoenix tracing initialized")
            else:
                print("[EvalService] Phoenix init failed (will retry on first trace)")
        except Exception as e:
            print(f"[EvalService] Phoenix init failed: {e}")

    # Initialize ChromaDB if configured
    if vector_backend == "chromadb":
        try:
            from services.chromadb_service import _get_chromadb_client, _get_embedding_model
            _get_chromadb_client()
            _get_embedding_model()
            print("[EvalService] ChromaDB + embedding model initialized")
        except Exception as e:
            print(f"[EvalService] ChromaDB init failed (will retry on first request): {e}")

    # Initialize Weaviate if configured
    if vector_backend == "weaviate":
        try:
            from services.weaviate_service import _get_weaviate_client, _get_embedding_model as _get_weaviate_emb
            _get_weaviate_client()
            _get_weaviate_emb()
            print("[EvalService] Weaviate + embedding model initialized")
        except Exception as e:
            print(f"[EvalService] Weaviate init failed (will retry on first request): {e}")

    yield
    print("[EvalService] Shutting down...")


app = FastAPI(
    title="Fraud Detection RAG Evaluation Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5176", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest_router)
app.include_router(search_router)
app.include_router(evaluate_router)
app.include_router(dashboard_router)
app.include_router(retrieval_eval_router)
app.include_router(vector_search_router)
app.include_router(memory_router)
app.include_router(braintrust_router)
app.include_router(letta_memory_router)
app.include_router(phoenix_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "fraud-detection-evaluation", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=EVAL_SERVICE_PORT, reload=True)
