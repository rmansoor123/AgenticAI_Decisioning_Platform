"""Ingest router — embed and upsert records to Pinecone."""

import uuid
from fastapi import APIRouter, HTTPException
import httpx

from config import NODE_BACKEND_URL
from models.schemas import IngestRequest, IngestResponse, IngestRecord
from services.pinecone_service import get_pinecone_service

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("", response_model=IngestResponse)
async def ingest_records(req: IngestRequest):
    """Upsert records into a Pinecone namespace."""
    svc = get_pinecone_service()
    records = []
    for r in req.records:
        record = {"_id": r.id or f"KB-{uuid.uuid4()}", "text": r.text}
        if r.category:
            record["category"] = r.category
        if r.domain:
            record["domain"] = r.domain
        if r.outcome:
            record["outcome"] = r.outcome
        if r.risk_score is not None:
            record["riskScore"] = r.risk_score
        if r.seller_id:
            record["sellerId"] = r.seller_id
        if r.country:
            record["country"] = r.country
        if r.timestamp:
            record["timestamp"] = r.timestamp
        if r.source:
            record["source"] = r.source
        records.append(record)

    count = svc.upsert(req.namespace, records)
    return IngestResponse(success=True, upserted_count=count, namespace=req.namespace)


@router.post("/bulk", response_model=IngestResponse)
async def bulk_ingest_from_node():
    """Pull knowledge base data from Node backend and upsert to Pinecone."""
    svc = get_pinecone_service()
    total = 0

    # Fetch existing knowledge from Node observability endpoint
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{NODE_BACKEND_URL}/api/observability/health")
            if resp.status_code == 200:
                data = resp.json()
                kb_stats = data.get("data", {}).get("knowledgeBase", {})
                print(f"[BulkIngest] Node KB stats: {kb_stats}")
    except Exception as e:
        print(f"[BulkIngest] Could not reach Node backend: {e}")

    # Fetch sellers for seeding onboarding-knowledge namespace
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{NODE_BACKEND_URL}/api/onboarding/sellers")
            if resp.status_code == 200:
                sellers_data = resp.json()
                sellers = sellers_data.get("data", {}).get("sellers", [])
                records = []
                for s in sellers[:100]:  # Limit to 100 for initial seed
                    text_parts = [
                        f"Seller: {s.get('businessName', 'Unknown')}",
                        f"Category: {s.get('businessCategory', 'Unknown')}",
                        f"Country: {s.get('country', 'Unknown')}",
                        f"Status: {s.get('status', 'Unknown')}",
                        f"Email: {s.get('email', 'Unknown')}",
                    ]
                    risk = s.get("onboardingRiskAssessment", {})
                    if risk:
                        text_parts.append(f"Risk Score: {risk.get('riskScore', 'N/A')}")
                        text_parts.append(f"Decision: {risk.get('decision', 'N/A')}")
                        factors = risk.get("riskFactors", [])
                        if factors:
                            text_parts.append(f"Risk Factors: {', '.join(str(f) for f in factors[:5])}")

                    records.append({
                        "_id": s.get("sellerId", f"SELLER-{uuid.uuid4().hex[:8]}"),
                        "text": ". ".join(text_parts),
                        "category": s.get("businessCategory", ""),
                        "domain": "onboarding",
                        "outcome": risk.get("decision", ""),
                        "riskScore": risk.get("riskScore", 0),
                        "sellerId": s.get("sellerId", ""),
                        "country": s.get("country", ""),
                        "source": "bulk-ingest",
                    })
                if records:
                    count = svc.upsert("onboarding-knowledge", records)
                    total += count
                    print(f"[BulkIngest] Upserted {count} sellers to onboarding-knowledge")
    except Exception as e:
        print(f"[BulkIngest] Seller fetch error: {e}")

    return IngestResponse(success=True, upserted_count=total, namespace="all")
