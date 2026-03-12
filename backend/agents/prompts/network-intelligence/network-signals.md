---
id: network-signals
agent: network-intelligence
phases: [think, observe, reflect]
priority: high
version: 1
---

# Network Intelligence Signals

## Fraud Ring Detection

### Graph-Based Indicators
- **Shared attributes:** 3+ accounts sharing device fingerprint, IP address, or bank account
- **Dense subgraph:** Cluster of accounts with high interconnectivity (mutual transactions, shared addresses)
- **Star topology:** One account connected to many otherwise-unconnected accounts (hub/coordinator)
- **Temporal clustering:** Multiple accounts created within same time window with similar patterns
- **Behavioral mirroring:** Accounts exhibiting identical action sequences (scripted behavior)

### Normal Network Patterns (for calibration)
- Family/business accounts may legitimately share addresses or devices
- Multi-seller businesses may operate from same IP range
- Business partners may have legitimate mutual transactions

## Link Analysis Signals

| Link Type | Signal | Risk Level |
|-----------|--------|------------|
| Same device fingerprint | 3+ accounts | HIGH |
| Same IP address | 5+ accounts (non-corporate) | HIGH |
| Same bank account | 2+ accounts | CRITICAL |
| Same email domain pattern | 5+ accounts with sequential patterns | MEDIUM |
| Same phone number prefix | 3+ accounts | MEDIUM |
| Mutual transactions | Closed loop (A→B→C→A) | HIGH |

## Collusion Patterns

- **Buyer-seller collusion:** Same entity on both sides of transaction (self-dealing)
- **Review manipulation ring:** Group of accounts providing mutual positive reviews
- **Return fraud ring:** Coordinated return abuse across multiple buyer accounts
- **Price manipulation ring:** Sellers coordinating to fix prices or manipulate rankings

## Decision Guidance

- Shared IP alone is a weak signal — consider corporate networks, VPNs, shared housing
- Shared device fingerprint is much stronger — legitimate device sharing is rare
- Shared bank account across unrelated sellers is near-certain fraud
- Graph analysis should consider edge weights (transaction frequency/amount) not just connectivity
- Always verify ring membership before bulk-blocking — false positives cascade
