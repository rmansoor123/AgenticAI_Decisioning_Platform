---
id: shipping-signals
agent: shipping-risk
phases: [think, observe, reflect]
priority: high
version: 1
---

# Shipping Risk Signals

## Address Anomaly Patterns

### High-Risk Indicators
- **Address mismatch:** Shipping address differs significantly from billing address or seller registered address
- **Freight forwarder:** Destination is a known freight forwarding address (international reshipping)
- **PO Box/commercial:** Shipping to PO Box or commercial mail receiving agency for consumer goods
- **Address velocity:** Same address used by 5+ different sellers in 30 days (drop shipping hub)
- **Geographic impossibility:** Seller location and fulfillment origin are geographically inconsistent

### Normal Shipping Behavior (for calibration)
- Legitimate sellers ship from 1-3 consistent locations
- Tracking numbers are provided within 2 business days of order
- Delivery confirmation rates > 95% for domestic shipments

## Empty Box / Non-Delivery Patterns

| Signal | Threshold | Risk Level |
|--------|-----------|------------|
| Package weight < expected for item category | < 50% expected | HIGH |
| Delivery confirmation but buyer disputes receipt | > 3 per month | HIGH |
| Tracking shows delivered but no signature | Pattern with disputes | MEDIUM |
| Shipping label created but no scan events | > 48h after creation | MEDIUM |
| Bulk shipments to same ZIP code cluster | > 10 in 24h | HIGH |

## Fulfillment Velocity Anomalies

- **Instant fulfillment:** Order fulfilled < 1 minute after placement (pre-generated labels)
- **Delayed fulfillment spike:** Normally ships in 1-2 days, suddenly 7+ day delays (inventory issues or fraud)
- **Carrier switching:** Sudden switch from major carrier to unknown/regional carrier

## Decision Guidance

- Freight forwarder detection alone is not sufficient — many legitimate international buyers use them
- Empty box patterns require at least 3 incidents before escalating to BLOCK
- Address velocity is more meaningful when combined with new seller accounts
- Always check carrier tracking data before making delivery dispute decisions
