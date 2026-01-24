# How the Onboarding Service Uses the Agent

## Overview

The **Seller Onboarding Service** (`/api/onboarding`) integrates with the **Seller Onboarding Agent** to make intelligent approve/reject/review decisions during seller registration.

## Integration Architecture

### Code Flow

```javascript
// File: backend/services/business/seller-onboarding/index.js

// 1. Import the agent
import { sellerOnboarding } from '../../../agents/index.js';

// 2. In the POST /sellers endpoint
router.post('/sellers', async (req, res) => {
  const sellerData = req.body;
  
  // 3. Service calls the agent
  const agentResult = await sellerOnboarding.evaluateSeller(
    sellerId, 
    sellerData
  );
  
  // 4. Extract decision from agent result
  const decision = agentResult.result?.decision;
  
  // 5. Service processes agent decision
  if (decision.action === 'REJECT') {
    sellerData.status = 'BLOCKED';
  } else if (decision.action === 'REVIEW') {
    sellerData.status = 'UNDER_REVIEW';
  } else {
    sellerData.status = 'PENDING';
  }
  
  // 6. Store seller with agent evaluation
  db_ops.insert('sellers', 'seller_id', sellerId, sellerData);
  
  // 7. Return response with agent evaluation
  res.json({
    success: true,
    data: sellerData,
    agentEvaluation: {
      decision: decision.action,
      confidence: decision.confidence,
      reasoning: decision.reason
    }
  });
});
```

## Step-by-Step Process

### Step 1: Client Request
```
POST /api/onboarding/sellers
{
  "businessName": "Example Business",
  "email": "seller@example.com",
  "country": "US",
  "businessCategory": "Electronics",
  ...
}
```

### Step 2: Service Receives Data
- Service receives seller application data
- Validates required fields
- Prepares data for agent evaluation

### Step 3: Service Calls Agent
```javascript
const agentResult = await sellerOnboarding.evaluateSeller(sellerId, sellerData)
```

**What happens:**
- Service imports agent from `agents/index.js`
- Calls `evaluateSeller()` method
- Passes seller data to agent
- Waits for agent to complete evaluation

### Step 4: Agent Evaluation (Internal)

The agent runs through its reasoning loop:

#### A. THINK Phase
- Analyzes seller data
- Identifies initial risk indicators
- Determines investigation strategy:
  - **BASIC**: Low risk (0 indicators)
  - **STANDARD**: Medium risk (1-2 indicators)
  - **COMPREHENSIVE**: High risk (3+ indicators)

#### B. PLAN Phase
- Creates verification plan based on strategy
- Selects appropriate tools (15+ available)
- Plans execution sequence

#### C. ACT Phase
Executes verification tools:
1. `verify_identity` - ID document verification
2. `verify_email` - Email validation
3. `check_duplicates` - Duplicate account detection
4. `screen_watchlist` - Sanctions/PEP screening
5. `verify_business` - Business registration check
6. `verify_bank_account` - Bank account verification
7. `verify_address` - Address verification
8. `check_fraud_databases` - Fraud database lookups
9. `analyze_business_category` - Category risk assessment
10. `check_financial_history` - Credit history (if comprehensive)
11. `analyze_historical_patterns` - Similar seller analysis
12. `check_ip_reputation` - IP reputation (if comprehensive)
13. `request_fraud_investigation` - Collaborate with Fraud Agent (if high risk)

#### D. OBSERVE Phase
- Analyzes all evidence gathered
- Calculates risk factors with severity scores
- Generates overall risk score (0-100)
- Makes decision based on thresholds:
  - **APPROVE**: Risk ≤ 30
  - **REVIEW**: Risk 31-60
  - **REJECT**: Risk ≥ 61 or critical factors

#### E. LEARN Phase
- Updates pattern memory
- Learns from decision outcome
- Improves future evaluations

### Step 5: Agent Returns Result

```javascript
{
  result: {
    decision: {
      action: 'APPROVE' | 'REJECT' | 'REVIEW',
      confidence: 0.85,
      reason: 'Low risk seller meets criteria'
    },
    overallRisk: {
      score: 25,
      level: 'LOW',
      factorCount: 2
    },
    riskFactors: [
      { factor: 'KYC_NOT_VERIFIED', severity: 'CRITICAL', score: 40 },
      ...
    ],
    evidence: [...], // All verification results
    reasoning: '...' // Human-readable explanation
  },
  chainOfThought: {...} // Full reasoning trace
}
```

### Step 6: Service Processes Decision

```javascript
// Service sets seller status based on agent decision
if (decision.action === 'REJECT') {
  sellerData.status = 'BLOCKED';
} else if (decision.action === 'REVIEW') {
  sellerData.status = 'UNDER_REVIEW';
} else {
  sellerData.status = 'PENDING';
}

// Store agent evaluation with seller
sellerData.onboardingRiskAssessment = {
  riskScore: agentResult.result.overallRisk.score,
  decision: decision.action,
  confidence: decision.confidence,
  reasoning: agentResult.result.reasoning,
  agentEvaluation: {
    agentId: sellerOnboarding.agentId,
    agentName: sellerOnboarding.name,
    evidenceGathered: agentResult.result.evidence.length,
    riskFactors: agentResult.result.riskFactors.length
  }
};
```

### Step 7: Service Returns Response

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

## Key Integration Points

### 1. Agent Import
```javascript
// Service imports agent from agents module
import { sellerOnboarding } from '../../../agents/index.js';
```

### 2. Agent Method Call
```javascript
// Service calls agent's public method
const agentResult = await sellerOnboarding.evaluateSeller(sellerId, sellerData);
```

### 3. Decision Processing
```javascript
// Service processes agent decision
const decision = agentResult.result?.decision;
// Sets status, stores evaluation, returns response
```

### 4. Data Storage
```javascript
// Service stores agent evaluation with seller record
sellerData.onboardingRiskAssessment = {
  ...agentResult.result,
  agentEvaluation: { ... }
};
```

## Benefits of This Integration

### 1. **Separation of Concerns**
- Service handles HTTP, data storage, business logic
- Agent handles intelligent decision-making, reasoning, learning

### 2. **Reusability**
- Agent can be called from multiple places
- Service can be used with or without agent (fallback)

### 3. **Testability**
- Service and agent can be tested independently
- Agent can be mocked for service tests

### 4. **Explainability**
- Agent provides full reasoning chain
- Service stores and exposes agent reasoning
- Full audit trail for compliance

### 5. **Flexibility**
- Service can add additional checks before/after agent
- Agent can be upgraded without changing service
- Easy to A/B test agent vs. rules

## API Endpoints

### Create Seller (with Agent)
```http
POST /api/onboarding/sellers
Content-Type: application/json

{
  "businessName": "Example Business",
  "email": "seller@example.com",
  "country": "US",
  ...
}
```

### Get Agent Evaluation
```http
GET /api/onboarding/sellers/:sellerId/agent-evaluation
```

### Direct Agent Call
```http
POST /api/agents/onboarding/evaluate
Content-Type: application/json

{
  "sellerId": "SLR-ABC123",
  "sellerData": { ... }
}
```

## Demo in UI

The onboarding page (`/onboarding`) provides:
1. **Visual Flow**: Step-by-step visualization of agent evaluation
2. **Live Demo**: Run onboarding with mock data
3. **Recent Sellers**: View all onboarded sellers with agent decisions
4. **Details View**: See full agent evaluation for each seller

## Testing

To test the integration:

1. **Start the servers** (already running)
2. **Navigate to** `http://localhost:5173/onboarding`
3. **Click "Run Onboarding Demo"**
4. **Watch the flow** as agent evaluates seller
5. **See the result** with agent decision and reasoning

The demo will:
- Generate mock seller data
- Show each step of agent evaluation
- Call the actual API
- Display the agent's decision
- Show all verification checks performed

