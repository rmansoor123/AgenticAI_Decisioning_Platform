"""Pinecone vector database service — index management, upsert, query."""

from pinecone import Pinecone

from config import (
    PINECONE_API_KEY,
    PINECONE_INDEX_NAME,
    PINECONE_CLOUD,
    PINECONE_REGION,
    EMBEDDING_MODEL,
    EMBEDDING_FIELD_MAP,
    NAMESPACES,
)


class PineconeService:
    def __init__(self):
        self.pc = Pinecone(api_key=PINECONE_API_KEY)
        self.index_name = PINECONE_INDEX_NAME
        self.index = None
        self._ensure_index()

    def _ensure_index(self):
        """Create index if it doesn't exist, then get a handle."""
        existing = [idx.name for idx in self.pc.list_indexes()]
        if self.index_name not in existing:
            self.pc.create_index_for_model(
                name=self.index_name,
                cloud=PINECONE_CLOUD,
                region=PINECONE_REGION,
                embed={
                    "model": EMBEDDING_MODEL,
                    "field_map": EMBEDDING_FIELD_MAP,
                },
            )
            print(f"[Pinecone] Created index: {self.index_name}")
        self.index = self.pc.Index(self.index_name)
        print(f"[Pinecone] Connected to index: {self.index_name}")

    def upsert(self, namespace: str, records: list[dict]) -> int:
        """Upsert records into a namespace. Each record must have _id and text."""
        if not records:
            return 0
        self.index.upsert_records(namespace=namespace, records=records)
        return len(records)

    def search(
        self,
        namespace: str,
        query: str,
        top_k: int = 5,
        filters: dict | None = None,
        rerank: bool = False,
    ) -> list[dict]:
        """Search a namespace by text query."""
        search_params = {
            "namespace": namespace,
            "query": {"top_k": top_k, "inputs": {"text": query}},
        }
        if filters:
            search_params["query"]["filter"] = filters
        if rerank:
            search_params["rerank"] = {
                "model": "pinecone-rerank-v0",
                "rank_fields": ["text"],
                "top_n": top_k,
            }

        results = self.index.search(**search_params)

        hits = []
        for match in results.get("result", {}).get("hits", []):
            hits.append({
                "id": match.get("_id", ""),
                "text": match.get("fields", {}).get("text", ""),
                "score": match.get("_score", 0.0),
                "metadata": {
                    k: v for k, v in match.get("fields", {}).items() if k != "text"
                },
            })
        return hits

    def get_stats(self) -> dict:
        """Get index statistics."""
        stats = self.index.describe_index_stats()
        return {
            "index_name": self.index_name,
            "total_vectors": stats.get("total_vector_count", 0),
            "namespaces": {
                ns: info.get("vector_count", 0)
                for ns, info in stats.get("namespaces", {}).items()
            },
        }


# Singleton
_instance: PineconeService | None = None


def get_pinecone_service() -> PineconeService:
    global _instance
    if _instance is None:
        _instance = PineconeService()
    return _instance
