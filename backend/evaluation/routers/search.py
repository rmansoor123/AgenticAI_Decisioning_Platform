"""Search router — vector similarity search across Pinecone namespaces."""

from fastapi import APIRouter
from models.schemas import SearchRequest, SearchResponse, SearchResult
from services.pinecone_service import get_pinecone_service

router = APIRouter(prefix="/search", tags=["search"])


@router.post("", response_model=SearchResponse)
async def search(req: SearchRequest):
    """Generic vector similarity search."""
    svc = get_pinecone_service()
    hits = svc.search(
        namespace=req.namespace,
        query=req.query,
        top_k=req.top_k,
        filters=req.filters,
        rerank=req.rerank,
    )
    results = [
        SearchResult(id=h["id"], text=h["text"], score=h["score"], metadata=h["metadata"])
        for h in hits
    ]
    return SearchResponse(success=True, results=results, namespace=req.namespace, query=req.query)


@router.post("/similar-cases", response_model=SearchResponse)
async def search_similar_cases(req: SearchRequest):
    """UC1: Find similar fraud cases."""
    req.namespace = "fraud-cases"
    req.rerank = True
    return await search(req)


@router.post("/knowledge", response_model=SearchResponse)
async def search_knowledge(req: SearchRequest):
    """UC2: Knowledge-augmented context retrieval."""
    req.namespace = "onboarding-knowledge"
    return await search(req)


@router.post("/patterns", response_model=SearchResponse)
async def search_patterns(req: SearchRequest):
    """UC3: Pattern similarity search."""
    req.namespace = "risk-patterns"
    return await search(req)


@router.post("/investigate", response_model=SearchResponse)
async def search_investigate(req: SearchRequest):
    """UC4: Investigation Q&A — search across all namespaces, rerank."""
    svc = get_pinecone_service()
    all_results = []
    for ns in ["fraud-cases", "onboarding-knowledge", "risk-patterns", "investigations"]:
        hits = svc.search(namespace=ns, query=req.query, top_k=req.top_k, rerank=True)
        for h in hits:
            h["metadata"]["namespace"] = ns
            all_results.append(h)

    # Sort by score, take top_k
    all_results.sort(key=lambda x: x["score"], reverse=True)
    top = all_results[: req.top_k]

    results = [
        SearchResult(id=h["id"], text=h["text"], score=h["score"], metadata=h["metadata"])
        for h in top
    ]
    return SearchResponse(success=True, results=results, namespace="all", query=req.query)


from services.query_decomposer import decompose_query


@router.post("/advanced", response_model=SearchResponse)
async def search_advanced(req: SearchRequest):
    """Advanced RAG: decompose query, search multiple namespaces, rerank."""
    svc = get_pinecone_service()

    # Decompose the query into sub-queries
    sub_queries = decompose_query(req.query, max_sub_queries=3)

    # Search across all namespaces for each sub-query
    all_results = []
    seen_ids = set()
    namespaces = ["fraud-cases", "onboarding-knowledge", "risk-patterns", "investigations"]

    for sq in sub_queries:
        for ns in namespaces:
            try:
                hits = svc.search(namespace=ns, query=sq, top_k=3, rerank=True)
                for h in hits:
                    if h["id"] not in seen_ids:
                        seen_ids.add(h["id"])
                        h["metadata"]["namespace"] = ns
                        h["metadata"]["sub_query"] = sq
                        all_results.append(h)
            except Exception:
                continue

    # Sort by score, take top_k
    all_results.sort(key=lambda x: x["score"], reverse=True)
    top = all_results[: req.top_k]

    results = [
        SearchResult(id=h["id"], text=h["text"], score=h["score"], metadata=h["metadata"])
        for h in top
    ]
    return SearchResponse(
        success=True, results=results, namespace="advanced", query=req.query
    )
