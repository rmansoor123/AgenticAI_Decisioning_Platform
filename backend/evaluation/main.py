"""FastAPI evaluation service — Pinecone + TruLens + RAGAS."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import EVAL_SERVICE_PORT


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown."""
    print("[EvalService] Starting up...")
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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "fraud-detection-evaluation", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=EVAL_SERVICE_PORT, reload=True)
