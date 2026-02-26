"""FastAPI evaluation service — Pinecone + TruLens + RAGAS."""

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown."""
    print("[EvalService] Starting up...")
    try:
        get_pinecone_service()
    except Exception as e:
        print(f"[EvalService] Pinecone init failed (will retry on first request): {e}")
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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "fraud-detection-evaluation", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=EVAL_SERVICE_PORT, reload=True)
