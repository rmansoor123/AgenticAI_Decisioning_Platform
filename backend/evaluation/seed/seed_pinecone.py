"""Seed Pinecone with synthetic fraud cases, patterns, and investigation data."""

import uuid
import random
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.pinecone_service import get_pinecone_service

CATEGORIES = ["ELECTRONICS", "CLOTHING", "JEWELRY", "GAMBLING", "CRYPTO", "PHARMACEUTICALS", "DIGITAL_GOODS", "FOOD"]
COUNTRIES = ["US", "GB", "DE", "NG", "IN", "CN", "BR", "RU", "PH", "VN"]
OUTCOMES = ["APPROVE", "REVIEW", "REJECT"]
RISK_FACTORS = [
    "disposable email domain",
    "high-risk geography",
    "business registration mismatch",
    "IP on proxy/VPN",
    "duplicate account indicators",
    "watchlist partial match",
    "new business less than 30 days",
    "bank account name mismatch",
    "excessive velocity in applications",
    "fraudulent document detected",
    "sanctions list match",
    "known fraud ring pattern",
    "synthetic identity indicators",
    "address does not match business type",
    "financial history shows liens",
]


def generate_fraud_cases(n: int = 50) -> list[dict]:
    records = []
    for _ in range(n):
        category = random.choice(CATEGORIES)
        country = random.choice(COUNTRIES)
        outcome = random.choice(OUTCOMES)
        risk_score = random.randint(10, 95)
        factors = random.sample(RISK_FACTORS, k=random.randint(1, 5))
        text = (
            f"Fraud case: {category} seller from {country}. "
            f"Risk score: {risk_score}. Decision: {outcome}. "
            f"Risk factors: {', '.join(factors)}. "
            f"{'Confirmed fraud after investigation.' if outcome == 'REJECT' else 'Cleared after manual review.' if outcome == 'REVIEW' else 'No issues found.'}"
        )
        records.append({
            "_id": f"FC-{uuid.uuid4().hex[:8]}",
            "text": text,
            "category": category,
            "domain": "fraud-cases",
            "outcome": outcome,
            "riskScore": risk_score,
            "country": country,
            "source": "seed",
        })
    return records


def generate_risk_patterns(n: int = 30) -> list[dict]:
    records = []
    pattern_templates = [
        "Pattern: {cat} sellers from {country} with {factor} have {rate}% fraud rate",
        "Pattern: Sellers using {factor} and {factor2} are {rate}% likely to be fraudulent",
        "Pattern: {cat} category in {country} shows elevated risk when {factor}",
        "Pattern: Combination of {factor} + {factor2} + {country} origin indicates organized fraud ring",
    ]
    for _ in range(n):
        cat = random.choice(CATEGORIES)
        country = random.choice(COUNTRIES)
        factors = random.sample(RISK_FACTORS, k=2)
        rate = random.randint(30, 95)
        template = random.choice(pattern_templates)
        text = template.format(cat=cat, country=country, factor=factors[0], factor2=factors[1], rate=rate)
        records.append({
            "_id": f"RP-{uuid.uuid4().hex[:8]}",
            "text": text,
            "category": cat,
            "domain": "risk-patterns",
            "riskScore": rate,
            "country": country,
            "source": "seed",
        })
    return records


def generate_investigations(n: int = 20) -> list[dict]:
    records = []
    for _ in range(n):
        cat = random.choice(CATEGORIES)
        country = random.choice(COUNTRIES)
        factors = random.sample(RISK_FACTORS, k=random.randint(2, 4))
        outcome = random.choice(["confirmed_fraud", "false_positive", "inconclusive"])
        text = (
            f"Investigation report: {cat} seller from {country}. "
            f"Investigated risk factors: {', '.join(factors)}. "
            f"Outcome: {outcome}. "
            f"{'Seller account terminated and funds held.' if outcome == 'confirmed_fraud' else 'Seller cleared for operation.' if outcome == 'false_positive' else 'Additional monitoring recommended.'}"
        )
        records.append({
            "_id": f"INV-{uuid.uuid4().hex[:8]}",
            "text": text,
            "category": cat,
            "domain": "investigations",
            "outcome": outcome,
            "country": country,
            "source": "seed",
        })
    return records


def main():
    print("[Seed] Starting Pinecone seeding...")
    svc = get_pinecone_service()

    fraud_cases = generate_fraud_cases(50)
    svc.upsert("fraud-cases", fraud_cases)
    print(f"[Seed] Upserted {len(fraud_cases)} fraud cases")

    patterns = generate_risk_patterns(30)
    svc.upsert("risk-patterns", patterns)
    print(f"[Seed] Upserted {len(patterns)} risk patterns")

    investigations = generate_investigations(20)
    svc.upsert("investigations", investigations)
    print(f"[Seed] Upserted {len(investigations)} investigations")

    print("[Seed] Done! Run /ingest/bulk to also import sellers from Node backend.")
    print(f"[Seed] Index stats: {svc.get_stats()}")


if __name__ == "__main__":
    main()
