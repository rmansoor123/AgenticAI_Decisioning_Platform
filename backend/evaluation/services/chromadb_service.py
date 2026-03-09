"""
ChromaDB vector search service — local vector store alternative.
Uses sentence-transformers for local embeddings + chromadb for vector storage.

Collections mirror Pinecone namespaces:
  - onboarding-knowledge
  - fraud-cases
  - risk-patterns
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_chroma_client = None
_embedding_model = None


def _get_chromadb_client():
    """Lazy-initialize ChromaDB client."""
    global _chroma_client
    if _chroma_client is not None:
        return _chroma_client

    import chromadb

    url = os.getenv("CHROMADB_URL", "http://localhost:8100")
    try:
        # Parse host and port from URL
        from urllib.parse import urlparse
        parsed = urlparse(url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 8100

        _chroma_client = chromadb.HttpClient(host=host, port=port)
        # Verify connectivity
        _chroma_client.heartbeat()
        logger.info(f"[chromadb_service] Connected to {url}")
    except Exception as e:
        logger.warning(f"[chromadb_service] Connection failed: {e}")
        _chroma_client = None
    return _chroma_client


def _get_embedding_model():
    """Lazy-load the sentence-transformers embedding model."""
    global _embedding_model
    if _embedding_model is not None:
        return _embedding_model

    from sentence_transformers import SentenceTransformer

    model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    try:
        _embedding_model = SentenceTransformer(model_name)
        logger.info(f"[chromadb_service] Loaded embedding model: {model_name}")
    except Exception as e:
        logger.error(f"[chromadb_service] Failed to load model {model_name}: {e}")
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


def _get_or_create_collection(client, collection_name: str):
    """Get or create a ChromaDB collection."""
    return client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )


def _convert_filter(filter_dict: Optional[dict]) -> Optional[dict]:
    """Convert MongoDB-style filter to ChromaDB where clause."""
    if not filter_dict:
        return None

    conditions = {}
    for key, value in filter_dict.items():
        if isinstance(value, dict):
            for op, op_val in value.items():
                chroma_op = {
                    "$eq": "$eq", "$ne": "$ne",
                    "$gt": "$gt", "$gte": "$gte",
                    "$lt": "$lt", "$lte": "$lte",
                    "$in": "$in", "$nin": "$nin",
                }.get(op)
                if chroma_op:
                    conditions[key] = {chroma_op: op_val}
        else:
            conditions[key] = {"$eq": value}

    if not conditions:
        return None

    if len(conditions) == 1:
        key = list(conditions.keys())[0]
        return {key: conditions[key]}

    return {"$and": [{k: v} for k, v in conditions.items()]}


async def search(collection: str, query_text: str, top_k: int = 10, filter_dict: Optional[dict] = None) -> list[dict]:
    """Search a ChromaDB collection by text query."""
    client = _get_chromadb_client()
    if not client:
        return []

    coll = _get_or_create_collection(client, collection)
    query_embedding = embed_text(query_text)
    where_filter = _convert_filter(filter_dict)

    kwargs = {
        "query_embeddings": [query_embedding],
        "n_results": top_k,
        "include": ["metadatas", "distances", "documents"],
    }
    if where_filter:
        kwargs["where"] = where_filter

    results = coll.query(**kwargs)

    output = []
    if results and results["ids"] and results["ids"][0]:
        for i, doc_id in enumerate(results["ids"][0]):
            distance = results["distances"][0][i] if results["distances"] else 0
            score = 1 - distance  # ChromaDB returns distances, convert to similarity
            metadata = results["metadatas"][0][i] if results["metadatas"] else {}
            output.append({
                "id": doc_id,
                "score": score,
                "metadata": metadata,
            })

    return output


async def ingest(collection: str, documents: list[dict]) -> dict:
    """Ingest documents into a ChromaDB collection.

    Each document should have:
      - id: str
      - text: str (content to embed)
      - metadata: dict (optional payload)
    """
    client = _get_chromadb_client()
    if not client:
        return {"ingested": 0, "error": "ChromaDB not available"}

    coll = _get_or_create_collection(client, collection)

    ids = []
    texts = []
    metadatas = []

    for doc in documents:
        doc_id = str(doc.get("id", ""))
        text = doc.get("text", "")
        metadata = doc.get("metadata", {})
        metadata["text"] = text  # Store original text in metadata

        ids.append(doc_id)
        texts.append(text)
        metadatas.append(metadata)

    embeddings = embed_texts(texts)

    coll.upsert(
        ids=ids,
        embeddings=embeddings,
        metadatas=metadatas,
        documents=texts,
    )

    return {"ingested": len(ids), "collection": collection}


async def health() -> dict:
    """Check ChromaDB health."""
    client = _get_chromadb_client()
    if not client:
        return {"status": "unavailable", "backend": "chromadb"}

    try:
        heartbeat = client.heartbeat()
        collections = [c.name for c in client.list_collections()]
        return {
            "status": "healthy",
            "backend": "chromadb",
            "heartbeat": heartbeat,
            "collections": collections,
        }
    except Exception as e:
        return {"status": "unhealthy", "backend": "chromadb", "error": str(e)}
