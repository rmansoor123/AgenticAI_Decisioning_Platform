# Seller Onboarding Agent Integration

## Overview

The platform now includes a **Seller Onboarding Agent** that uses Agentic AI to evaluate seller applications and make approve/reject/review decisions during onboarding.

## Architecture

### Components

1. **Seller Onboarding Agent** (`backend/agents/specialized/seller-onboarding-agent.js`)
   - Autonomous AI agent for seller evaluation
   - Uses Think-Plan-Act-Observe loop
   - 15+ verification tools
   - Pattern learning from past decisions

2. **Onboarding Service** (`backend/services/business/seller-onboarding/index.js`)
   - REST API service at `/api/onboarding`
   - Integrates with the agent
   - Handles seller CRUD operations

3. **Agent API** (`backend/services/agents/index.js`)
   - Exposes agent endpoints at `/api/agents/onboarding/*`

## How the Service Interacts with the Agent

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Client Request: POST /api/onboarding/sellers               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Onboarding Service                                         │
│  - Receives seller data                                     │
│  - Prepares seller information                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Seller Onboarding Agent                                    │
│  sellerOnboarding.evaluateSeller(sellerId, sellerData)      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Agent Reasoning Loop                                       │
│  1. THINK - Analyze seller data                             │
│  2. PLAN - Create verification plan                         │
│  3. ACT - Execute verification tools                        │
│  4. OBSERVE - Evaluate evidence                             │
│  5. LEARN - Update pattern memory                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Agent Decision                                             │
│  - APPROVE / REJECT / REVIEW                                │
│  - Confidence score                                         │
│  - Risk factors                                             │
│  - Reasoning chain                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Onboarding Service                                         │
│  - Sets seller status based on decision                     │
│  - Stores evaluation results                                │
│  - Returns response to client                               │
└─────────────────────────────────────────────────────────────┘
```

## Agent Capabilities

### Verification Tools (15+)

1. **Identity Verification**
   - `verify_identity` - Verify ID documents
   - `verify_email` - Email validation and risk
   - `check_ip_reputation` - IP address reputation

2. **Business Verification**
   - `verify_business` - Business registration check
   - `verify_address` - Address verification
   - `analyze_business_category` - Category risk assessment

3. **Compliance & Watchlists**
   - `screen_watchlist` - Sanctions, PEP, watchlist screening
   - `check_fraud_databases` - Fraud database lookups
   - `check_duplicates` - Duplicate account detection

4. **Financial Verification**
   - `verify_bank_account` - Bank account verification
   - `check_financial_history` - Credit and financial history

5. **Pattern Analysis**
   - `analyze_historical_patterns` - Similar seller analysis
   - `request_fraud_investigation` - Collaborate with Fraud Investigation Agent

### Decision Logic

The agent makes decisions based on:

- **Risk Score Calculation**: Aggregates risk from all verification checks
- **Risk Thresholds**:
  - APPROVE: Risk score ≤ 30
  - REVIEW: Risk score 31-60
  - REJECT: Risk score ≥ 61 or critical factors present

- **Critical Factors** (auto-reject):
  - Watchlist matches (sanctions, PEP)
  - Fraud database blocks
  - Business not registered
  - Identity not verified
  - Bank ownership mismatch

## API Endpoints

### Onboarding Service Endpoints

#### Create Seller (with Agent Evaluation)
```http
POST /api/onboarding/sellers
Content-Type: application/json

{
  "businessName": "Example Business",
  "email": "seller@example.com",
  "country": "US",
  "businessCategory": "Electronics",
  ...
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sellerId": "SLR-ABC123",
    "status": "UNDER_REVIEW",
    "onboardingRiskAssessment": {
      "riskScore": 45,
      "decision": "REVIEW",
      "confidence": 0.75,
      "signals": [...],
      "agentEvaluation": {
        "agentId": "AGENT-ONB-001",
        "agentName": "Seller Onboarding Agent",
        "evidenceGathered": 12,
        "riskFactors": 3
      }
    }
  },
  "agentEvaluation": {
    "decision": "REVIEW",
    "confidence": 0.75,
    "reasoning": "..."
  }
}
```

#### Get Agent Evaluation Details
```http
GET /api/onboarding/sellers/:sellerId/agent-evaluation
```

### Agent API Endpoints

#### Evaluate Seller (Direct Agent Call)
```http
POST /api/agents/onboarding/evaluate
Content-Type: application/json

{
  "sellerId": "SLR-ABC123",
  "sellerData": { ... }
}
```

#### Get Evaluation History
```http
GET /api/agents/onboarding/evaluations
```

## Integration Example

### Service Code (Current Implementation)

```javascript
// In seller-onboarding/index.js
import { sellerOnboarding } from '../../../agents/index.js';

router.post('/sellers', async (req, res) => {
  const sellerData = req.body;
  
  // Call the agent
  const agentResult = await sellerOnboarding.evaluateSeller(
    sellerId, 
    sellerData
  );
  
  // Extract decision
  const decision = agentResult.result?.decision;
  
  // Set status based on agent decision
  if (decision.action === 'REJECT') {
    sellerData.status = 'BLOCKED';
  } else if (decision.action === 'REVIEW') {
    sellerData.status = 'UNDER_REVIEW';
  } else {
    sellerData.status = 'PENDING';
  }
  
  // Store and return
  db_ops.insert('sellers', 'seller_id', sellerId, sellerData);
  res.json({ success: true, data: sellerData, decision });
});
```

## Agent Decision Process

### Step-by-Step

1. **THINK Phase**
   - Analyzes seller data
   - Identifies initial risk indicators
   - Determines investigation strategy (BASIC/STANDARD/COMPREHENSIVE)

2. **PLAN Phase**
   - Creates verification plan based on risk level
   - Selects appropriate tools
   - Plans tool execution sequence

3. **ACT Phase**
   - Executes verification tools:
     - Identity verification
     - Business registration check
     - Email verification
     - Watchlist screening
     - Bank account verification
     - Fraud database checks
     - Duplicate detection
     - Historical pattern analysis
   - Gathers evidence from each tool

4. **OBSERVE Phase**
   - Analyzes all evidence
   - Calculates risk factors
   - Generates risk score
   - Makes decision (APPROVE/REJECT/REVIEW)
   - Creates reasoning chain

5. **LEARN Phase**
   - Updates pattern memory
   - Learns from decision outcome
   - Improves future evaluations

## Benefits of Agentic Approach

### vs. Simple Rule-Based System

**Before (Simple Rules):**
- Fixed thresholds
- Limited checks (4-5 signals)
- No learning
- No reasoning explanation

**After (Agentic AI):**
- Dynamic risk assessment
- 15+ verification checks
- Pattern learning from past decisions
- Full reasoning chain with explainability
- Inter-agent collaboration
- Adaptive decision making

### Key Advantages

1. **Comprehensive Evaluation**: 15+ verification tools vs. 4-5 simple checks
2. **Explainability**: Full chain of thought reasoning
3. **Learning**: Improves from past decisions
4. **Collaboration**: Can request help from other agents
5. **Adaptability**: Adjusts strategy based on risk level
6. **Confidence Scoring**: Provides confidence levels for decisions

## Testing the Integration

### Test Onboarding with Agent

```bash
# Create a seller (agent will evaluate)
curl -X POST http://localhost:3001/api/onboarding/sellers \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Business",
    "email": "test@example.com",
    "country": "US",
    "businessCategory": "Electronics",
    "kycVerified": true,
    "bankVerified": true
  }'

# Get agent evaluation details
curl http://localhost:3001/api/onboarding/sellers/SLR-ABC123/agent-evaluation

# Direct agent evaluation
curl -X POST http://localhost:3001/api/agents/onboarding/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "sellerId": "SLR-ABC123",
    "sellerData": { ... }
  }'
```

## Future Enhancements

1. **Real-time Integration**: Integrate agent into real-time onboarding flow
2. **Human Feedback Loop**: Learn from human reviewer decisions
3. **A/B Testing**: Test agent decisions vs. human reviewers
4. **Multi-Agent Collaboration**: Work with Fraud Investigation Agent for high-risk cases
5. **Continuous Learning**: Retrain based on seller outcomes over time

