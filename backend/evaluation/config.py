"""Configuration for the evaluation service."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root (two levels up from backend/evaluation/)
_project_root = Path(__file__).resolve().parent.parent.parent
load_dotenv(_project_root / ".env")

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "fraud-detection-rag")
PINECONE_CLOUD = os.getenv("PINECONE_CLOUD", "aws")
PINECONE_REGION = os.getenv("PINECONE_REGION", "us-east-1")
EVAL_STORE_PATH = os.getenv("EVAL_STORE_PATH", "./eval_results.db")
NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:3001")
EVAL_SERVICE_PORT = int(os.getenv("EVAL_SERVICE_PORT", "8000"))

EMBEDDING_MODEL = "multilingual-e5-large"
EMBEDDING_FIELD_MAP = {"text": "text"}

NAMESPACES = [
    "fraud-cases",
    "onboarding-knowledge",
    "risk-patterns",
    "investigations",
]
