"""
Qdrant vector search service — local replacement for Pinecone.
Uses sentence-transformers for local embeddings + qdrant-client for vector storage.

Collections mirror Pinecone namespaces:
  - onboarding-knowledge
  - fraud-cases
  - risk-patterns
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_qdrant_client = None
_embedding_model = None


def _get_qdrant_client():
    """Lazy-initialize Qdrant client."""
    global _qdrant_client
    if _qdrant_client is not None:
        return _qdrant_client

    from qdrant_client import QdrantClient

    url = os.getenv("QDRANT_URL", "http://localhost:6333")
    try:
        _qdrant_client = QdrantClient(url=url, timeout=10)
        # Verify connectivity
        _qdrant_client.get_collections()
        logger.info(f"[qdrant_service] Connected to {url}")
    except Exception as e:
        logger.warning(f"[qdrant_service] Connection failed: {e}")
        _qdrant_client = None
    return _qdrant_client


def _get_embedding_model():
    """Lazy-load the sentence-transformers embedding model."""
    global _embedding_model
    if _embedding_model is not None:
        return _embedding_model

    from sentence_transformers import SentenceTransformer

    model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    try:
        _embedding_model = SentenceTransformer(model_name)
        logger.info(f"[qdrant_service] Loaded embedding model: {model_name}")
    except Exception as e:
        logger.error(f"[qdrant_service] Failed to load model {model_name}: {e}")
        raise
    return _embedding_model


def embed_text(text: str) -> list[float]:
    """Embed a single text string into a vector."""
    model = _get_embedding_model()
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding.tolist()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed multiple text strings into vectors (batched)."""
    model = _get_embedding_model()
    embeddings = model.encode(texts, normalize_embeddings=True, batch_size=32)
    return [e.tolist() for e in embeddings]


def _ensure_collection(client, collection_name: str, vector_size: int = 384):
    """Create collection if it doesn't exist."""
    from qdrant_client.models import Distance, VectorParams

    collections = [c.name for c in client.get_collections().collections]
    if collection_name not in collections:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )
        logger.info(f"[qdrant_service] Created collection: {collection_name}")


def _convert_filter(filter_dict: Optional[dict]) -> Optional[object]:
    """Convert MongoDB-style filter to Qdrant filter format."""
    if not filter_dict:
        return None

    from qdrant_client.models import Filter, FieldCondition, MatchValue, Range

    conditions = []
    for key, value in filter_dict.items():
        if isinstance(value, dict):
            # Operator-style: { "$gt": 5, "$lt": 10 }
            for op, op_val in value.items():
                if op == "$eq":
                    conditions.append(FieldCondition(key=key, match=MatchValue(value=op_val)))
                elif op == "$gt":
                    conditions.append(FieldCondition(key=key, range=Range(gt=op_val)))
                elif op == "$gte":
                    conditions.append(FieldCondition(key=key, range=Range(gte=op_val)))
                elif op == "$lt":
                    conditions.append(FieldCondition(key=key, range=Range(lt=op_val)))
                elif op == "$lte":
                    conditions.append(FieldCondition(key=key, range=Range(lte=op_val)))
                elif op == "$ne":
                    # Qdrant doesn't have native $ne; skip for now
                    pass
                elif op == "$in":
                    for v in op_val:
                        conditions.append(FieldCondition(key=key, match=MatchValue(value=v)))
        else:
            # Simple equality: { "type": "fraud" }
            conditions.append(FieldCondition(key=key, match=MatchValue(value=value)))

    return Filter(must=conditions) if conditions else None


async def search(collection: str, query_text: str, top_k: int = 10, filter_dict: Optional[dict] = None) -> list[dict]:
    """Search a Qdrant collection by text query."""
    client = _get_qdrant_client()
    if not client:
        return []

    vector_size = _get_embedding_model().get_sentence_embedding_dimension()
    _ensure_collection(client, collection, vector_size)

    query_vector = embed_text(query_text)
    qdrant_filter = _convert_filter(filter_dict)

    results = client.search(
        collection_name=collection,
        query_vector=query_vector,
        query_filter=qdrant_filter,
        limit=top_k,
        with_payload=True,
    )

    return [
        {
            "id": str(hit.id),
            "score": hit.score,
            "metadata": hit.payload or {},
        }
        for hit in results
    ]


async def ingest(collection: str, documents: list[dict]) -> dict:
    """Ingest documents into a Qdrant collection.

    Each document should have:
      - id: str
      - text: str (content to embed)
      - metadata: dict (optional payload)
    """
    client = _get_qdrant_client()
    if not client:
        return {"ingested": 0, "error": "Qdrant not available"}

    from qdrant_client.models import PointStruct

    vector_size = _get_embedding_model().get_sentence_embedding_dimension()
    _ensure_collection(client, collection, vector_size)

    texts = [doc.get("text", "") for doc in documents]
    vectors = embed_texts(texts)

    points = []
    for i, doc in enumerate(documents):
        payload = doc.get("metadata", {})
        payload["text"] = doc.get("text", "")
        points.append(
            PointStruct(
                id=hash(doc["id"]) % (2**63),  # Qdrant needs int IDs
                vector=vectors[i],
                payload=payload,
            )
        )

    client.upsert(collection_name=collection, points=points)
    return {"ingested": len(points), "collection": collection}


async def health() -> dict:
    """Check Qdrant health."""
    client = _get_qdrant_client()
    if not client:
        return {"status": "unavailable", "backend": "qdrant"}

    try:
        collections = client.get_collections()
        return {
            "status": "healthy",
            "backend": "qdrant",
            "collections": [c.name for c in collections.collections],
        }
    except Exception as e:
        return {"status": "unhealthy", "backend": "qdrant", "error": str(e)}
