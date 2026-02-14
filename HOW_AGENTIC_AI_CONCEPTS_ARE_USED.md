# How Agentic AI Concepts Are Used in Practice

This document provides concrete examples of how each agentic AI concept is implemented and used in the fraud detection system.

---

## 1. Think-Plan-Act-Observe (TPAO) Reasoning Loop

### Example: Seller Onboarding Evaluation

**Location**: `backend/agents/core/base-agent.js` → `reason()` method

**Real Flow**:

```javascript
// When a seller applies for onboarding:
POST /api/onboarding/sellers
{
  "businessName": "TechCorp Inc",
  "email": "seller@techcorp.com",
  "country": "US",
  "businessCategory": "Electronics"
}
```

**Step-by-Step Execution**:

#### THINK Phase
```javascript
// backend/agents/specialized/seller-onboarding-agent.js:344
async think(input, context) {
  const { sellerId, sellerData } = input;
  
  // Analyzes the situation
  this.addObservation(`Starting onboarding evaluation for seller: ${sellerId}`);
  
  // Determines strategy based on risk indicators
  const strategy = this.determineInvestigationStrategy(sellerData);
  // Returns: { intensity: 'STANDARD', checks: 'standard' }
  
  // Identifies initial risk indicators
  const riskIndicators = this.identifyInitialRiskIndicators(sellerData);
  // Returns: ['KYC_NOT_VERIFIED', 'HIGH_RISK_COUNTRY']
  
  return {
    understanding: "Evaluating seller application for onboarding",
    strategy,
    riskIndicators,
    availableTools: Array.from(this.tools.keys())
  };
}
```

**Output**:
```json
{
  "understanding": "Evaluating seller application for onboarding",
  "strategy": { "intensity": "STANDARD", "checks": "standard" },
  "riskIndicators": ["KYC_NOT_VERIFIED", "HIGH_RISK_COUNTRY"],
  "availableTools": ["verify_identity", "verify_email", "check_duplicates", ...]
}
```

#### PLAN Phase
```javascript
// backend/agents/specialized/seller-onboarding-agent.js:367
async plan(analysis, context) {
  const actions = [];
  
  // Always perform basic checks
  actions.push({ type: 'verify_identity', params: context.input?.sellerData });
  actions.push({ type: 'verify_email', params: { email: context.input?.sellerData?.email } });
  actions.push({ type: 'check_duplicates', params: context.input?.sellerData });
  actions.push({ type: 'screen_watchlist', params: context.input?.sellerData });
  
  // Conditional checks based on strategy
  if (analysis.strategy.intensity === 'STANDARD' || analysis.strategy.intensity === 'COMPREHENSIVE') {
    actions.push({ type: 'verify_business', params: context.input?.sellerData });
    actions.push({ type: 'verify_bank_account', params: context.input?.sellerData });
    actions.push({ type: 'check_fraud_databases', params: context.input?.sellerData });
  }
  
  return {
    goal: 'Complete comprehensive seller onboarding evaluation',
    actions: [
      { type: 'verify_identity', params: {...} },
      { type: 'verify_email', params: {...} },
      { type: 'check_duplicates', params: {...} },
      { type: 'screen_watchlist', params: {...} },
      { type: 'verify_business', params: {...} },
      { type: 'verify_bank_account', params: {...} },
      { type: 'check_fraud_databases', params: {...} }
    ]
  };
}
```

#### ACT Phase
```javascript
// backend/agents/core/base-agent.js:111
for (const action of plan.actions) {
  // Emit action start event
  this.emitEvent('agent:action:start', {
    agentId: this.agentId,
    action: action.type,
    params: this.sanitizeInput(action.params)
  });
  
  // Execute the tool
  const actionResult = await this.act(action);
  // Calls: this.tools.get(action.type).handler(action.params)
  
  // Example: verify_email tool execution
  // Returns: { success: true, data: { isDisposable: false, isDeliverable: true, ... } }
  
  thought.actions.push({ action, result: actionResult });
  
  // Emit action complete event
  this.emitEvent('agent:action:complete', {
    agentId: this.agentId,
    action: action.type,
    success: actionResult?.success !== false
  });
}
```

**Actual Tool Execution Example**:
```javascript
// Tool: verify_email
this.registerTool('verify_email', 'Verify email address validity', async (params) => {
  const { email } = params;
  const result = await verifyEmail(email); // External API call
  return {
    success: true,
    data: {
      email: "seller@techcorp.com",
      isDisposable: false,
      isDeliverable: true,
      riskScore: 15,
      domainAge: 1825 // days
    }
  };
});
```

#### OBSERVE Phase
```javascript
// backend/agents/specialized/seller-onboarding-agent.js:413
async observe(actions, context) {
  // Collect all evidence from actions
  const evidence = actions.map(a => ({
    source: a.action.type,
    data: a.result?.data,
    success: a.result?.success !== false
  }));
  
  // Analyze evidence to identify risk factors
  const riskFactors = this.analyzeOnboardingEvidence(evidence, context.input?.sellerData);
  // Returns: [
  //   { factor: 'IDENTITY_NOT_VERIFIED', severity: 'CRITICAL', score: 40 },
  //   { factor: 'HIGH_RISK_COUNTRY', severity: 'HIGH', score: 25 }
  // ]
  
  // Calculate overall risk
  const overallRisk = this.calculateOnboardingRisk(riskFactors);
  // Returns: { score: 65, level: 'HIGH', factorCount: 2, criticalFactors: 1 }
  
  // Generate decision
  const decision = this.generateOnboardingDecision(overallRisk, riskFactors);
  // Returns: { action: 'REJECT', confidence: 0.90, reason: 'High risk seller...' }
  
  return {
    success: true,
    evidence,
    riskFactors,
    overallRisk,
    decision,
    confidence: decision.confidence,
    reasoning: this.generateOnboardingReasoning(riskFactors, decision)
  };
}
```

#### LEARN Phase
```javascript
// backend/agents/core/base-agent.js:151
this.updateMemory(thought);
this.learnFromResult(input, thought.result);

// Pattern learning
learnFromResult(input, result) {
  if (!result?.success) return;
  
  const features = this.extractFeaturesForPatternMatching(input);
  // Returns: { businessCategory: 'Electronics', country: 'US', hasKYC: false }
  
  const outcome = this.determineOutcome(result);
  // Returns: 'FRAUD_CONFIRMED' or 'LEGITIMATE_CONFIRMED'
  
  // Store pattern in memory
  this.patternMemory.learnPattern({
    type: PATTERN_TYPES.FRAUD_INDICATOR,
    features,
    outcome,
    confidence: result.confidence || 0.6,
    source: this.agentId
  });
}
```

**Complete Result**:
```json
{
  "result": {
    "decision": {
      "action": "REJECT",
      "confidence": 0.90,
      "reason": "High risk seller with critical indicators"
    },
    "overallRisk": {
      "score": 65,
      "level": "HIGH",
      "factorCount": 2,
      "criticalFactors": 1
    },
    "riskFactors": [
      { "factor": "IDENTITY_NOT_VERIFIED", "severity": "CRITICAL", "score": 40 },
      { "factor": "HIGH_RISK_COUNTRY", "severity": "HIGH", "score": 25 }
    ],
    "evidence": [
      { "source": "verify_identity", "data": {...}, "success": true },
      { "source": "verify_email", "data": {...}, "success": true },
      ...
    ]
  },
  "chainOfThought": {...}
}
```

---

## 2. Chain of Thought (CoT) Reasoning

### Example: Fraud Investigation with Reasoning Trace

**Location**: `backend/agents/core/chain-of-thought.js`

**How It's Used**:

```javascript
// When agent starts reasoning
this.currentChain = createChainOfThought({
  agentId: this.agentId,
  agentName: this.name,
  input: { transactionId: 'TXN-123', alertType: 'HIGH_VALUE' },
  context: {}
});

// During THINK phase
this.currentChain.observe('Received input for analysis', input);
// Creates step: { type: 'observation', content: 'Received input...', timestamp: '...' }

// Form hypothesis
this.currentChain.hypothesize(
  'Transaction may be fraudulent due to unusual amount',
  CONFIDENCE.POSSIBLE
);
// Creates step: { type: 'hypothesis', content: '...', confidence: { level: 0.5, label: 'possible' } }

// Record evidence
this.currentChain.recordEvidence(
  'IP address is from high-risk country',
  [hypothesisStepId], // supports hypothesis
  [],
  0.8 // weight
);

// Analyze
this.currentChain.analyze('Created plan with 8 actions');

// Infer
this.currentChain.infer(
  'High risk score indicates potential fraud',
  [evidenceStepId1, evidenceStepId2],
  CONFIDENCE.LIKELY
);

// Conclude
this.currentChain.conclude(
  'Transaction should be blocked due to multiple risk factors',
  CONFIDENCE.VERY_LIKELY,
  [inferenceStepId]
);
```

**Generated Trace**:
```json
{
  "chainId": "COT-A1B2C3D4",
  "context": {
    "agentId": "AGENT-FRAUD-001",
    "input": { "transactionId": "TXN-123" }
  },
  "steps": [
    {
      "stepId": "STEP-1",
      "type": "observation",
      "content": "Received input for analysis",
      "timestamp": "2024-01-15T10:00:00Z"
    },
    {
      "stepId": "STEP-2",
      "type": "hypothesis",
      "content": "Transaction may be fraudulent due to unusual amount",
      "confidence": { "level": 0.5, "label": "possible" }
    },
    {
      "stepId": "STEP-3",
      "type": "evidence",
      "content": "IP address is from high-risk country",
      "supports": ["STEP-2"],
      "contradicts": [],
      "metadata": { "weight": 0.8 }
    },
    {
      "stepId": "STEP-4",
      "type": "conclusion",
      "content": "Transaction should be blocked",
      "confidence": { "level": 0.85, "label": "very likely" },
      "supports": ["STEP-3"]
    }
  ],
  "summary": {
    "observations": 1,
    "hypotheses": 1,
    "evidence": 1,
    "conclusions": 1
  }
}
```

**Human-Readable Summary**:
```
**Observations:**
1. Received input for analysis

**Hypotheses:**
1. Transaction may be fraudulent due to unusual amount (possible)

**Key Evidence:**
+ IP address is from high-risk country

**Conclusions:**
=> Transaction should be blocked (very likely)
```

---

## 3. Pattern Memory System

### Example: Learning from Past Decisions

**Location**: `backend/agents/core/pattern-memory.js`

**How Patterns Are Learned**:

```javascript
// After a successful investigation
const agentResult = await fraudInvestigator.investigate('TXN-123', 'HIGH_VALUE');

// Agent learns from result
learnFromResult(input, result) {
  const features = {
    alertType: 'HIGH_VALUE',
    hasHighAmount: true,
    hasNewDevice: true,
    riskLevel: 'HIGH'
  };
  
  const outcome = 'FRAUD_CONFIRMED'; // Because decision was BLOCK
  
  // Store pattern
  this.patternMemory.learnPattern({
    type: PATTERN_TYPES.FRAUD_INDICATOR,
    features,
    outcome: 'FRAUD_CONFIRMED',
    confidence: 0.85,
    source: this.agentId
  });
}
```

**Pattern Storage**:
```json
{
  "patternId": "PAT-A1B2C3D4",
  "type": "fraud_indicator",
  "features": {
    "alertType": "HIGH_VALUE",
    "hasHighAmount": true,
    "hasNewDevice": true,
    "riskLevel": "HIGH"
  },
  "outcome": "FRAUD_CONFIRMED",
  "confidence": 0.85,
  "occurrences": 1,
  "successRate": 1.0,
  "totalValidations": 1
}
```

**How Patterns Are Used**:

```javascript
// When new transaction comes in
const newTransaction = {
  alertType: 'HIGH_VALUE',
  amount: 5000,
  isNewDevice: true,
  riskScore: 75
};

// Check for similar patterns
const patternMatches = this.checkPatterns(newTransaction);

// Pattern memory matches against stored patterns
matchPatterns(caseFeatures) {
  // Finds similar patterns
  // Returns:
  {
    "matches": [
      {
        "patternId": "PAT-A1B2C3D4",
        "pattern": {...},
        "score": 0.92, // 92% similarity
        "matchedFeatures": 4,
        "totalFeatures": 4
      }
    ],
    "recommendation": {
      "action": "BLOCK",
      "confidence": 0.85,
      "reason": "Based on 1 similar patterns (FRAUD_CONFIRMED)"
    }
  }
}
```

**Pattern Reinforcement**:

```javascript
// When pattern is used and outcome is confirmed
provideFeedback(patternId, actualOutcome, wasCorrect) {
  const pattern = this.patterns.get(patternId);
  
  pattern.totalValidations++;
  if (wasCorrect) {
    pattern.successRate = (pattern.successRate * (pattern.totalValidations - 1) + 1) / pattern.totalValidations;
    pattern.confidence = Math.min(0.99, pattern.confidence * 1.05); // Increase confidence
  } else {
    pattern.successRate = (pattern.successRate * (pattern.totalValidations - 1)) / pattern.totalValidations;
    pattern.confidence = Math.max(0.1, pattern.confidence * 0.9); // Decrease confidence
  }
}
```

---

## 4. Inter-Agent Communication

### Example: Seller Onboarding Agent Requests Help from Fraud Investigation Agent

**Location**: `backend/agents/core/agent-messenger.js`

**Scenario**: Seller Onboarding Agent finds high-risk indicators and needs deeper investigation.

**Step 1: Onboarding Agent Requests Help**

```javascript
// backend/agents/specialized/seller-onboarding-agent.js:315
this.registerTool('request_fraud_investigation', 'Request deep investigation', async (params) => {
  const { sellerId, riskFactors } = params;
  
  // Request help from Fraud Investigation Agent
  const result = await this.requestHelp(
    'transaction_analysis', // capability needed
    {
      type: 'seller_onboarding_investigation',
      sellerId,
      riskFactors
    },
    { requestingAgent: this.agentId }
  );
  
  return {
    success: true,
    data: result || { recommendation: 'REVIEW', confidence: 0.75 }
  };
});
```

**Step 2: Messenger Routes Request**

```javascript
// backend/agents/core/agent-messenger.js:110
async requestHelp(params) {
  const message = {
    id: 'HELP-ABC123',
    from: 'AGENT-ONBOARDING-001',
    to: null, // Will be routed by capability
    type: MESSAGE_TYPES.HELP_REQUEST,
    content: {
      capability: 'transaction_analysis',
      task: { type: 'seller_onboarding_investigation', sellerId: 'SLR-123' },
      context: {}
    },
    correlationId: 'CORR-XYZ789',
    priority: PRIORITY.HIGH
  };
  
  // Creates promise for response
  return new Promise((resolve, reject) => {
    this.pendingResponses.set(message.correlationId, { resolve, reject });
    this.messageQueue.push(message);
  });
}
```

**Step 3: Orchestrator Routes to Correct Agent**

```javascript
// backend/agents/core/agent-orchestrator.js:43
async _processHelpRequests() {
  const pendingRequests = this.messenger.getPendingHelpRequests();
  
  for (const request of pendingRequests) {
    const capability = request.content.capability; // 'transaction_analysis'
    const targetAgent = this._findAgentByCapability(capability);
    // Finds: FraudInvestigationAgent (has capability 'transaction_analysis')
    
    // Route the request
    await this.messenger.send({
      from: 'ORCHESTRATOR',
      to: targetAgent.agentId, // 'AGENT-FRAUD-001'
      type: MESSAGE_TYPES.HELP_REQUEST,
      content: request.content,
      correlationId: request.correlationId
    });
  }
}
```

**Step 4: Fraud Investigation Agent Handles Request**

```javascript
// backend/agents/core/base-agent.js:353
async handleMessage(message) {
  if (message.type === MESSAGE_TYPES.HELP_REQUEST) {
    return this.handleHelpRequest(message);
  }
}

async handleHelpRequest(message) {
  const { capability, task, context } = message.content;
  
  // Check if we have the capability
  if (!this.capabilities.includes(capability)) {
    await this.messenger.respondToHelp({
      correlationId: message.correlationId,
      from: this.agentId,
      result: null,
      success: false,
      error: `Agent does not have capability: ${capability}`
    });
    return;
  }
  
  // Execute the task
  const result = await this.reason(task, { ...context, fromAgent: message.from });
  
  // Respond with result
  await this.messenger.respondToHelp({
    correlationId: message.correlationId,
    from: this.agentId,
    result: result.result,
    success: true
  });
}
```

**Step 5: Response Returns to Onboarding Agent**

```javascript
// backend/agents/core/agent-messenger.js:168
async respondToHelp(params) {
  const response = {
    id: 'RESP-DEF456',
    from: 'AGENT-FRAUD-001',
    type: MESSAGE_TYPES.HELP_RESPONSE,
    content: {
      result: {
        recommendation: 'REJECT',
        confidence: 0.88,
        riskFactors: ['NETWORK_CONNECTION', 'VELOCITY_ANOMALY']
      },
      success: true
    },
    correlationId: 'CORR-XYZ789'
  };
  
  // Resolve pending promise
  const pending = this.pendingResponses.get(params.correlationId);
  if (pending) {
    pending.resolve(response);
  }
}
```

**Complete Flow**:
```
Onboarding Agent → Messenger → Orchestrator → Fraud Investigation Agent
                                                      ↓
Onboarding Agent ← Messenger ← Orchestrator ← (Investigation Result)
```

---

## 5. Agent Orchestrator

### Example: Multi-Agent Workflow Execution

**Location**: `backend/agents/core/agent-orchestrator.js`

**Workflow Definition**:

```javascript
// backend/agents/index.js:26
orchestrator.defineWorkflow('fraud_investigation', {
  steps: [
    {
      name: 'triage_alert',
      agent: 'ALERT_TRIAGE',
      outputKey: 'triageResult'
    },
    {
      name: 'investigate_transaction',
      agent: 'FRAUD_INVESTIGATOR',
      inputMapper: (ctx) => ({
        transactionId: ctx.input.transactionId,
        alertType: ctx.triageResult?.prioritizedAlerts?.[0]?.alertType
      }),
      outputKey: 'investigation'
    },
    {
      name: 'check_rules',
      agent: 'RULE_OPTIMIZER',
      inputMapper: (ctx) => ({
        optimizationType: 'coverage',
        transactionContext: ctx.investigation
      }),
      outputKey: 'ruleAnalysis'
    }
  ],
  triggers: ['HIGH_RISK_ALERT', 'MANUAL']
});
```

**Workflow Execution**:

```javascript
// Execute workflow
const execution = await orchestrator.executeWorkflow('fraud_investigation', {
  transactionId: 'TXN-123',
  alertType: 'HIGH_VALUE'
});

// Step 1: Triage Alert
const step1 = await orchestrator.executeStep(workflow.steps[0], context, execution);
// Calls: alertTriage.reason({ transactionId: 'TXN-123' })
// Result: { prioritizedAlerts: [{ alertType: 'HIGH_VALUE', priority: 'HIGH' }] }

// Step 2: Investigate Transaction
context.triageResult = step1.output;
const step2 = await orchestrator.executeStep(workflow.steps[1], context, execution);
// Calls: fraudInvestigator.reason({ transactionId: 'TXN-123', alertType: 'HIGH_VALUE' })
// Result: { recommendation: 'BLOCK', confidence: 0.92, riskFactors: [...] }

// Step 3: Check Rules
context.investigation = step2.output;
const step3 = await orchestrator.executeStep(workflow.steps[2], context, execution);
// Calls: ruleOptimizer.reason({ optimizationType: 'coverage', transactionContext: {...} })
// Result: { rulesTriggered: 3, recommendations: [...] }
```

**Execution Result**:
```json
{
  "executionId": "EXEC-A1B2C3D4",
  "workflowId": "WF-FRAUD-001",
  "status": "COMPLETED",
  "steps": [
    {
      "stepName": "triage_alert",
      "agentRole": "ALERT_TRIAGE",
      "status": "COMPLETED",
      "output": { "prioritizedAlerts": [...] }
    },
    {
      "stepName": "investigate_transaction",
      "agentRole": "FRAUD_INVESTIGATOR",
      "status": "COMPLETED",
      "output": { "recommendation": "BLOCK", ... }
    },
    {
      "stepName": "check_rules",
      "agentRole": "RULE_OPTIMIZER",
      "status": "COMPLETED",
      "output": { "rulesTriggered": 3, ... }
    }
  ],
  "result": {
    "triageResult": {...},
    "investigation": {...},
    "ruleAnalysis": {...}
  }
}
```

**Multi-Agent Collaboration**:

```javascript
// Parallel collaboration
const results = await orchestrator.collaborate(
  ['AGENT-FRAUD-001', 'AGENT-RULE-001', 'AGENT-ALERT-001'],
  { transactionId: 'TXN-123' },
  'parallel' // or 'sequential', 'consensus'
);

// All agents work in parallel
// Returns:
[
  { agent: 'AGENT-FRAUD-001', result: {...} },
  { agent: 'AGENT-RULE-001', result: {...} },
  { agent: 'AGENT-ALERT-001', result: {...} }
]
```

---

## 6. Memory Management

### Example: Short-Term and Long-Term Memory

**Location**: `backend/agents/core/base-agent.js`

**Short-Term Memory**:

```javascript
// After each reasoning session
updateMemory(thought) {
  // Add to short-term memory
  this.memory.shortTerm.push({
    timestamp: thought.timestamp,
    summary: thought.result?.summary || 'Action completed',
    key_facts: {
      input_type: typeof thought.input,
      actions_taken: thought.actions.length,
      success: thought.result?.success
    }
  });
  
  // Trim if exceeds limit
  if (this.memory.shortTerm.length > this.maxMemorySize) {
    const removed = this.memory.shortTerm.shift();
    this.consolidateToLongTerm(removed);
  }
}
```

**Memory Retrieval**:

```javascript
// When new input comes in
retrieveRelevantMemory(input) {
  const inputStr = JSON.stringify(input).toLowerCase();
  
  // Search short-term memory for relevant context
  return this.memory.shortTerm
    .filter(m => JSON.stringify(m).toLowerCase().includes(inputStr.slice(0, 50)))
    .slice(-5); // Last 5 relevant memories
}

// Example: If seller from same country applies
// Returns memories of previous sellers from that country
```

**Long-Term Memory**:

```javascript
consolidateToLongTerm(memory) {
  // Store important patterns in long-term memory
  const key = `memory_${Date.now()}`;
  this.memory.longTerm.set(key, memory);
}
```

**Working Memory**:

```javascript
// During active task
this.memory.working = {
  currentSeller: { sellerId: 'SLR-123', ... },
  verificationResults: [...],
  riskFactors: [...]
};

// Cleared after task completion
```

---

## 7. Event Emission & Observability

### Example: Real-Time Agent Activity Tracking

**Location**: `backend/agents/core/base-agent.js`

**Event Emission During Execution**:

```javascript
// When agent starts
this.emitEvent('agent:action:start', {
  agentId: this.agentId,
  agentName: this.name,
  input: this.sanitizeInput(input)
});

// When each tool executes
this.emitEvent('agent:action:start', {
  agentId: this.agentId,
  action: 'verify_email',
  params: { email: 'seller@example.com' }
});

// When tool completes
this.emitEvent('agent:action:complete', {
  agentId: this.agentId,
  action: 'verify_email',
  success: true
});

// When reasoning completes
this.emitEvent('agent:thought', {
  agentId: this.agentId,
  agentName: this.name,
  summary: 'Onboarding evaluation complete',
  actionCount: 12
});
```

**WebSocket Integration**:

```javascript
// backend/gateway/websocket/event-bus.js
eventBus.publish('agent:action:start', {
  agentId: 'AGENT-ONBOARDING-001',
  action: 'verify_email',
  timestamp: '2024-01-15T10:00:00Z'
});

// Frontend receives via WebSocket
// Displays: "Agent is verifying email address..."
```

**Event Flow**:
```
Agent → emitEvent() → Event Bus → WebSocket → Frontend UI
```

---

## 8. Tool-Based Architecture

### Example: Tool Registration and Execution

**Location**: `backend/agents/specialized/seller-onboarding-agent.js`

**Tool Registration**:

```javascript
// Register email verification tool
this.registerTool('verify_email', 'Verify email address validity and risk', async (params) => {
  const { email } = params;
  if (!email) {
    return { success: false, error: 'Email is required' };
  }
  return await verifyEmail(email); // Calls external API
});

// Register fraud database check tool
this.registerTool('check_fraud_databases', 'Check seller against fraud databases', async (params) => {
  const { email, businessName, phone, taxId } = params;
  
  const fraudCheck = await checkFraudList({ email, businessName, phone });
  const consortiumCheck = await checkConsortiumData({ email, businessName, phone });
  
  return {
    success: true,
    data: {
      ...fraudCheck?.data || {},
      consortiumData: consortiumCheck?.data || {},
      isBlocked: fraudCheck?.data?.isBlocked || false,
      isHighRisk: fraudCheck?.data?.isHighRisk || false
    }
  };
});
```

**Tool Execution**:

```javascript
// During ACT phase
async act(action) {
  if (this.tools.has(action.type)) {
    const tool = this.tools.get(action.type);
    return await tool.handler(action.params);
  }
  return { executed: false, reason: 'Unknown action type' };
}

// Example execution:
const result = await this.act({ 
  type: 'verify_email', 
  params: { email: 'seller@example.com' } 
});

// Returns:
{
  success: true,
  data: {
    email: 'seller@example.com',
    isDisposable: false,
    isDeliverable: true,
    riskScore: 15,
    domainAge: 1825
  }
}
```

**Available Tools** (Seller Onboarding Agent):
- `verify_identity` - ID document verification
- `verify_business` - Business registration check
- `verify_address` - Address verification
- `screen_watchlist` - Sanctions/PEP screening
- `check_fraud_databases` - Fraud database lookups
- `verify_bank_account` - Bank account verification
- `check_financial_history` - Credit history check
- `verify_email` - Email validation
- `check_ip_reputation` - IP reputation check
- `analyze_business_category` - Category risk assessment
- `check_duplicates` - Duplicate account detection
- `analyze_historical_patterns` - Similar seller analysis
- `request_fraud_investigation` - Inter-agent collaboration

---

## 9. Explainable AI

### Example: Human-Readable Reasoning

**Location**: `backend/agents/specialized/seller-onboarding-agent.js`

**Reasoning Generation**:

```javascript
generateOnboardingReasoning(factors, decision) {
  const factorDescriptions = factors.map(f =>
    `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} severity (score: ${f.score})`
  ).join('\n');

  return `
## Seller Onboarding Evaluation Summary

### Risk Factors Identified:
${factorDescriptions || '- No significant risk factors found'}

### Decision: ${decision.action}
${decision.reason}

### Confidence: ${(decision.confidence * 100).toFixed(0)}%

This decision is based on comprehensive analysis of:
- Identity and document verification
- Business registration and legitimacy checks
- Watchlist and sanctions screening
- Fraud database lookups
- Bank account verification
- Financial history analysis
- Duplicate account detection
- Business category risk assessment
- Historical pattern analysis
- IP reputation checks

Total risk score: ${factors.reduce((sum, f) => sum + f.score, 0)}/100
  `.trim();
}
```

**Output**:
```
## Seller Onboarding Evaluation Summary

### Risk Factors Identified:
- ID VERIFICATION FAILED: CRITICAL severity (score: 50)
- HIGH RISK COUNTRY: HIGH severity (score: 25)

### Decision: REJECT
High risk seller with critical indicators - cannot approve

### Confidence: 90%

This decision is based on comprehensive analysis of:
- Identity and document verification
- Business registration and legitimacy checks
- Watchlist and sanctions screening
- Fraud database lookups
- Bank account verification
- Financial history analysis
- Duplicate account detection
- Business category risk assessment
- Historical pattern analysis
- IP reputation checks

Total risk score: 75/100
```

**Chain of Thought Trace**:

```json
{
  "chainId": "COT-A1B2C3D4",
  "steps": [
    {
      "stepId": "STEP-1",
      "type": "observation",
      "content": "Starting onboarding evaluation for seller: SLR-123"
    },
    {
      "stepId": "STEP-2",
      "type": "hypothesis",
      "content": "Seller may require STANDARD level verification",
      "confidence": { "level": 0.5, "label": "possible" }
    },
    {
      "stepId": "STEP-3",
      "type": "evidence",
      "content": "Risk factor: ID_VERIFICATION_FAILED (CRITICAL)",
      "supports": ["STEP-2"]
    },
    {
      "stepId": "STEP-4",
      "type": "conclusion",
      "content": "Onboarding evaluation complete. 2 risk factors identified.",
      "confidence": { "level": 0.9, "label": "very likely" }
    }
  ]
}
```

---

## 10. Real-World Integration Example

### Complete Flow: Seller Onboarding Request

**1. API Request**:
```http
POST /api/onboarding/sellers
Content-Type: application/json

{
  "businessName": "TechCorp Inc",
  "email": "seller@techcorp.com",
  "country": "US",
  "businessCategory": "Electronics",
  "phone": "+1-555-0123",
  "taxId": "12-3456789"
}
```

**2. Service Calls Agent**:
```javascript
// backend/services/business/seller-onboarding/index.js:82
const agentResult = await sellerOnboarding.evaluateSeller(sellerId, sellerData);
```

**3. Agent Executes TPAO Loop**:
- **THINK**: Analyzes seller data, identifies 2 risk indicators
- **PLAN**: Creates plan with 8 verification tools
- **ACT**: Executes tools sequentially (verify_email, check_duplicates, etc.)
- **OBSERVE**: Analyzes evidence, calculates risk score: 45
- **LEARN**: Stores pattern in memory

**4. Agent Returns Result**:
```json
{
  "result": {
    "decision": {
      "action": "REVIEW",
      "confidence": 0.75,
      "reason": "Moderate risk - manual review recommended"
    },
    "overallRisk": {
      "score": 45,
      "level": "MEDIUM",
      "factorCount": 2
    },
    "riskFactors": [
      { "factor": "KYC_NOT_VERIFIED", "severity": "HIGH", "score": 20 },
      { "factor": "DISPOSABLE_EMAIL", "severity": "MEDIUM", "score": 15 }
    ],
    "evidence": [...],
    "reasoning": "## Seller Onboarding Evaluation Summary..."
  },
  "chainOfThought": {...}
}
```

**5. Service Processes Decision**:
```javascript
if (decision.action === 'REVIEW') {
  sellerData.status = 'UNDER_REVIEW';
}

sellerData.onboardingRiskAssessment = {
  riskScore: 45,
  decision: 'REVIEW',
  confidence: 0.75,
  reasoning: agentResult.result.reasoning,
  agentEvaluation: {
    agentId: sellerOnboarding.agentId,
    evidenceGathered: 8,
    riskFactors: 2
  }
};
```

**6. Response to Client**:
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
      "reasoning": "..."
    }
  },
  "agentEvaluation": {
    "agentId": "AGENT-ONBOARDING-001",
    "decision": "REVIEW",
    "confidence": 0.75
  }
}
```

---

## Summary

Each agentic AI concept is actively used in the system:

1. **TPAO Loop**: Every agent evaluation follows this structured reasoning cycle
2. **Chain of Thought**: Full reasoning traces are generated and stored for every decision
3. **Pattern Memory**: Agents learn from past decisions and use patterns for future evaluations
4. **Inter-Agent Communication**: Agents collaborate through the messenger system
5. **Orchestrator**: Coordinates multi-agent workflows and routes help requests
6. **Memory Management**: Agents maintain short-term, long-term, and working memory
7. **Event Emission**: Real-time events are emitted for observability
8. **Tool Architecture**: Agents use registered tools to perform actions
9. **Explainable AI**: Human-readable reasoning is generated for every decision

All concepts work together to create an autonomous, learning, and explainable AI system for fraud detection and seller onboarding.

