"""
Weaviate vector search service — local vector store alternative.
Uses sentence-transformers for local embeddings + weaviate-client for vector storage.

Collections mirror Pinecone namespaces:
  - onboarding-knowledge  → OnboardingKnowledge
  - fraud-cases           → FraudCases
  - risk-patterns         → RiskPatterns
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_weaviate_client = None
_embedding_model = None

# Map collection names (kebab-case) to Weaviate class names (PascalCase)
_COLLECTION_CLASS_MAP = {
    "onboarding-knowledge": "OnboardingKnowledge",
    "fraud-cases": "FraudCases",
    "risk-patterns": "RiskPatterns",
}


def _collection_to_class(collection: str) -> str:
    """Convert collection name to Weaviate class name."""
    if collection in _COLLECTION_CLASS_MAP:
        return _COLLECTION_CLASS_MAP[collection]
    # Convert kebab-case to PascalCase
    return "".join(word.capitalize() for word in collection.split("-"))


def _get_weaviate_client():
    """Lazy-initialize Weaviate client."""
    global _weaviate_client
    if _weaviate_client is not None:
        return _weaviate_client

    import weaviate
    from urllib.parse import urlparse

    url = os.getenv("WEAVIATE_URL", "http://localhost:8081")
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 8081

        _weaviate_client = weaviate.connect_to_custom(
            http_host=host,
            http_port=port,
            http_secure=parsed.scheme == "https",
            grpc_host=host,
            grpc_port=int(os.getenv("WEAVIATE_GRPC_PORT", "50051")),
            grpc_secure=False,
        )
        # Verify connectivity
        _weaviate_client.is_ready()
        logger.info(f"[weaviate_service] Connected to {url}")
    except Exception as e:
        logger.warning(f"[weaviate_service] Connection failed: {e}")
        _weaviate_client = None
    return _weaviate_client


def _get_embedding_model():
    """Lazy-load the sentence-transformers embedding model."""
    global _embedding_model
    if _embedding_model is not None:
        return _embedding_model

    from sentence_transformers import SentenceTransformer

    model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    try:
        _embedding_model = SentenceTransformer(model_name)
        logger.info(f"[weaviate_service] Loaded embedding model: {model_name}")
    except Exception as e:
        logger.error(f"[weaviate_service] Failed to load model {model_name}: {e}")
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


def _ensure_collection(client, class_name: str, vector_size: int = 384):
    """Create Weaviate collection (class) if it doesn't exist."""
    import weaviate.classes.config as wc

    if not client.collections.exists(class_name):
        client.collections.create(
            name=class_name,
            vectorizer_config=wc.Configure.Vectorizer.none(),
            properties=[
                wc.Property(name="text", data_type=wc.DataType.TEXT),
                wc.Property(name="source", data_type=wc.DataType.TEXT, skip_vectorization=True),
                wc.Property(name="category", data_type=wc.DataType.TEXT, skip_vectorization=True),
                wc.Property(name="outcome", data_type=wc.DataType.TEXT, skip_vectorization=True),
                wc.Property(name="domain", data_type=wc.DataType.TEXT, skip_vectorization=True),
            ],
        )
        logger.info(f"[weaviate_service] Created collection: {class_name}")


def _convert_filter(filter_dict: Optional[dict]):
    """Convert MongoDB-style filter to Weaviate filter."""
    if not filter_dict:
        return None

    import weaviate.classes.query as wq

    filters = []
    for key, value in filter_dict.items():
        if isinstance(value, dict):
            for op, op_val in value.items():
                if op == "$eq":
                    filters.append(wq.Filter.by_property(key).equal(op_val))
                elif op == "$ne":
                    filters.append(wq.Filter.by_property(key).not_equal(op_val))
                elif op == "$gt":
                    filters.append(wq.Filter.by_property(key).greater_than(op_val))
                elif op == "$gte":
                    filters.append(wq.Filter.by_property(key).greater_or_equal(op_val))
                elif op == "$lt":
                    filters.append(wq.Filter.by_property(key).less_than(op_val))
                elif op == "$lte":
                    filters.append(wq.Filter.by_property(key).less_or_equal(op_val))
                elif op == "$in":
                    filters.append(wq.Filter.by_property(key).contains_any(op_val))
        else:
            filters.append(wq.Filter.by_property(key).equal(value))

    if not filters:
        return None
    if len(filters) == 1:
        return filters[0]

    # Combine with AND
    combined = filters[0]
    for f in filters[1:]:
        combined = combined & f
    return combined


async def search(collection: str, query_text: str, top_k: int = 10, filter_dict: Optional[dict] = None) -> list[dict]:
    """Search a Weaviate collection by text query."""
    client = _get_weaviate_client()
    if not client:
        return []

    class_name = _collection_to_class(collection)
    vector_size = _get_embedding_model().get_sentence_embedding_dimension()
    _ensure_collection(client, class_name, vector_size)

    query_vector = embed_text(query_text)
    weaviate_filter = _convert_filter(filter_dict)

    coll = client.collections.get(class_name)
    kwargs = {
        "near_vector": query_vector,
        "limit": top_k,
        "return_metadata": ["distance"],
    }
    if weaviate_filter:
        kwargs["filters"] = weaviate_filter

    results = coll.query.near_vector(**kwargs)

    return [
        {
            "id": str(obj.uuid),
            "score": 1 - (obj.metadata.distance or 0),  # Convert distance to similarity
            "metadata": obj.properties or {},
        }
        for obj in results.objects
    ]


async def ingest(collection: str, documents: list[dict]) -> dict:
    """Ingest documents into a Weaviate collection.

    Each document should have:
      - id: str
      - text: str (content to embed)
      - metadata: dict (optional payload)
    """
    client = _get_weaviate_client()
    if not client:
        return {"ingested": 0, "error": "Weaviate not available"}

    class_name = _collection_to_class(collection)
    vector_size = _get_embedding_model().get_sentence_embedding_dimension()
    _ensure_collection(client, class_name, vector_size)

    texts = [doc.get("text", "") for doc in documents]
    vectors = embed_texts(texts)

    import uuid as uuid_lib

    coll = client.collections.get(class_name)
    ingested = 0

    with coll.batch.dynamic() as batch:
        for i, doc in enumerate(documents):
            properties = doc.get("metadata", {})
            properties["text"] = doc.get("text", "")
            doc_uuid = uuid_lib.uuid5(uuid_lib.NAMESPACE_DNS, str(doc.get("id", f"doc-{i}")))
            batch.add_object(
                properties=properties,
                vector=vectors[i],
                uuid=doc_uuid,
            )
            ingested += 1

    return {"ingested": ingested, "collection": collection}


async def health() -> dict:
    """Check Weaviate health."""
    client = _get_weaviate_client()
    if not client:
        return {"status": "unavailable", "backend": "weaviate"}

    try:
        is_ready = client.is_ready()
        collections = [c for c in client.collections.list_all().keys()]
        return {
            "status": "healthy" if is_ready else "unhealthy",
            "backend": "weaviate",
            "collections": collections,
        }
    except Exception as e:
        return {"status": "unhealthy", "backend": "weaviate", "error": str(e)}
