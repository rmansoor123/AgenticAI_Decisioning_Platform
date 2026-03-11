---
name: new-agent
description: How to create a new specialized agent extending BaseAgent with TPAOR reasoning loop
triggers:
  - create agent
  - new agent
  - build agent
  - add agent
  - agent template
  - specialized agent
---

# Create a New Specialized Agent

This skill explains how to create a new agent that extends `BaseAgent` and participates in the full TPAOR reasoning loop.

## Reference Implementation

- **Base contract:** `backend/agents/core/base-agent.js`
- **Example agent:** `backend/agents/specialized/seller-onboarding-agent.js`
- **Prompt templates:** `backend/agents/core/prompt-templates.js`
- **Agent index:** `backend/agents/index.js`

## The TPAOR Reasoning Loop

Every agent automatically gets this 9-step pipeline from `BaseAgent.reason()`:

```
Step 0:    RATE LIMIT       → AgentRateLimiter.checkLimit()
Step 0.5:  INPUT SANITIZE   → Prompt injection scan (blocks HIGH risk)
Step 1:    PATTERN MATCH    → Check memory for similar past cases
Step 2:    THINK            → this.think() — LLM or rule-based analysis
Step 3:    PLAN             → this.plan() — LLM selects tools
Step 4:    ACT              → Execute tools via this.act()
Step 4.5:  RE-PLAN          → If >50% tools failed, generate revised plan
Step 5:    OBSERVE          → this.observe() — synthesize findings
Step 5.1:  REFLECT          → this.reflect() — self-critique
Step 5.15: MULTI-TURN       → If uncertain, follow-up tools (max 2 rounds)
Step 5.25: POLICY CHECK     → policyEngine.enforce()
Step 5.4:  AGENT JUDGE      → Cross-agent review for REJECT/BLOCK
Step 5.5:  KB WRITE-BACK    → Persist to knowledge base
Step 6:    CONCLUDE         → Finalize chain-of-thought
Step 7:    LEARN            → Update pattern memory + long-term memory
Step 7.5:  OUTCOME SIM      → Schedule simulated feedback
Step 8:    EMIT + LOG       → Events, metrics, traces, decisions
Step 9:    EVALUATE         → Async eval via TruLens/RAGAS
```

You override steps 2, 3, 5, and optionally 5.1.

## Step-by-Step Guide

### 1. Create the Agent File

Create `backend/agents/specialized/my-agent.js`:

```js
import { BaseAgent } from '../core/base-agent.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { getContextEngine } from '../core/context-engine.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { createToolExecutor } from '../core/tool-executor.js';
import { getThresholdManager } from '../core/threshold-manager.js';

const API_MODE = process.env.API_MODE || 'free';

export class MyNewAgent extends BaseAgent {
  constructor() {
    super({
      name: 'My New Agent',
      role: 'MY_NEW_ROLE',            // used in AGENT_PROMPT_MAP
      capabilities: [
        'capability_one',
        'capability_two',
        'capability_three'
      ]
    });

    this.registerTools();

    // Optional agentic services
    this.knowledgeBase = getKnowledgeBase();
    this.contextEngine = getContextEngine();
    this.selfCorrection = createSelfCorrection(this.agentId);
    this.toolExecutor = createToolExecutor(this.agentId);
    this._thresholdManager = getThresholdManager();
  }

  // ... methods below
}
```

### 2. Register Tools

Tools are what the LLM selects during the PLAN step. Each tool is a named async handler.

```js
registerTools() {
  this.registerTool(
    'tool_name',
    'Human-readable description of what this tool does',
    async (params) => {
      // Three-tier API mode pattern:
      if (API_MODE === 'real') {
        // Call real external API
      }
      if (API_MODE !== 'simulation') {
        // Free/default logic (deterministic, no API cost)
        return {
          success: true,
          data: { /* result */ },
          source: 'free'
        };
      }
      // Simulation mode — return synthetic data
      return {
        success: true,
        data: { /* simulated result */ },
        source: 'simulation'
      };
    }
  );

  // Register more tools...
}
```

**Naming convention:** snake_case, descriptive verbs (e.g., `verify_identity`, `screen_watchlist`, `check_velocity`, `analyze_patterns`).

### 3. Override `think(input, context)`

Analyze the situation. Must return:

```js
async think(input, context) {
  const analysis = {
    understanding: '',
    strategy: { intensity: 'STANDARD' },  // BASIC | STANDARD | COMPREHENSIVE
    riskIndicators: [],
    relevantMemory: [],
    availableTools: [...this.tools.keys()],
    llmEnhanced: false
  };

  // Try LLM-enhanced thinking
  if (this.llmClient?.enabled) {
    try {
      const prompt = `Analyze this ${this.name} case:\n${JSON.stringify(input, null, 2)}`;
      const llmResult = await this.llmClient.complete(prompt, {
        systemPrompt: `You are a ${this.config.role} analyst.`,
        temperature: 0.3
      });
      // Parse LLM response and populate analysis
      analysis.llmEnhanced = true;
      return analysis;
    } catch (e) {
      console.warn(`[${this.config.name}] LLM think failed, using fallback:`, e.message);
    }
  }

  // Fallback: rule-based analysis
  analysis.understanding = `Analyzing ${input.type || 'case'} with rule-based logic`;
  // Populate riskIndicators based on input data...

  return analysis;
}
```

### 4. Override `plan(analysis, context)`

Select which tools to run. Must return:

```js
async plan(analysis, context) {
  const plan = {
    goal: '',
    actions: [],
    fallback: { type: 'escalate_to_human', reason: 'All tools failed' },
    llmEnhanced: false
  };

  // Try LLM-enhanced planning
  if (this.llmClient?.enabled) {
    try {
      const toolDescriptions = [...this.tools.entries()]
        .map(([name, t]) => `- ${name}: ${t.description}`)
        .join('\n');
      const prompt = `Given this analysis, select tools to execute:\n\nAnalysis: ${analysis.understanding}\n\nAvailable tools:\n${toolDescriptions}\n\nReturn JSON: { "goal": "...", "actions": [{ "type": "tool_name", "params": {}, "rationale": "..." }] }`;
      const llmResult = await this.llmClient.complete(prompt, { temperature: 0.3 });
      // Parse and validate tool names exist in this.tools
      plan.llmEnhanced = true;
      return plan;
    } catch (e) {
      console.warn(`[${this.config.name}] LLM plan failed, using fallback:`, e.message);
    }
  }

  // Fallback: always run all tools
  plan.goal = `Execute all verification tools`;
  plan.actions = [...this.tools.keys()].map(name => ({
    type: name,
    params: { entityId: context.entityId },
    rationale: 'Standard verification'
  }));

  return plan;
}
```

### 5. Override `observe(actions, context)`

Synthesize tool results into a decision. Must return:

```js
async observe(actions, context) {
  const toolResults = actions.filter(a => a.result);

  // Build evidence array
  const evidence = toolResults.map(a => ({
    source: a.action,
    data: a.result?.data || a.result,
    success: a.result?.success !== false,
    timestamp: new Date().toISOString()
  }));

  // Calculate risk
  const riskFactors = [];
  // ... analyze each tool result, push { factor, severity, score } items

  const riskScore = /* weighted average of factors */;
  const decision = riskScore > 70 ? 'REJECT' : riskScore > 40 ? 'REVIEW' : 'APPROVE';
  const confidence = /* 0.0-1.0 based on evidence quality */;

  return {
    success: true,
    summary: `Evaluated with ${toolResults.length} tools`,
    evidence,
    riskFactors,
    overallRisk: {
      score: riskScore,
      level: decision,
      criticalFactors: riskFactors.filter(f => f.severity === 'CRITICAL').length,
      highFactors: riskFactors.filter(f => f.severity === 'HIGH').length
    },
    decision: { action: decision, confidence, reason: `Risk score: ${riskScore}` },
    confidence,
    isAutonomous: confidence > 0.8,
    needsHumanReview: confidence < 0.6 || decision === 'REVIEW',
    reasoning: `Based on ${evidence.length} evidence sources, risk score is ${riskScore}`
  };
}
```

### 6. Add Public Entry Point

```js
async evaluateEntity(entityId, entityData, extraContext = {}) {
  const input = {
    type: 'my_evaluation',
    entityId,
    ...entityData,
    submittedAt: new Date().toISOString()
  };

  const context = {
    entityId,
    evaluationType: 'my_type',
    ...extraContext
  };

  return this.reason(input, context);
}
```

### 7. Export Singleton from Agent Index

In `backend/agents/index.js`:

```js
import { MyNewAgent } from './specialized/my-agent.js';
export const myAgent = new MyNewAgent();
```

### 8. Register Role in Prompt Map

In `backend/agents/core/base-agent.js`, add to the `AGENT_PROMPT_MAP` object (~line 62):

```js
const AGENT_PROMPT_MAP = {
  SELLER_ONBOARDING: { ... },
  FRAUD_INVESTIGATION: { ... },
  // Add:
  MY_NEW_ROLE: {
    think: 'my_new_role_think',
    plan: 'my_new_role_plan',
    observe: 'my_new_role_observe',
    reflect: 'my_new_role_reflect'
  }
};
```

Then add matching prompt builders in `backend/agents/core/prompt-templates.js`.

### 9. Add Inter-Agent Communication (Optional)

If your agent needs help from other agents:

```js
// Inside a tool handler or observe():
const result = await this.requestHelp('fraud_investigation', {
  type: 'cross_check_request',
  entityId,
  riskFactors
}, { requestingAgent: this.agentId });
```

## Decision Action Values

| Agent Type | Valid Actions |
|-----------|-------------|
| Onboarding | `APPROVE`, `REVIEW`, `REJECT` |
| Investigation | `BLOCK`, `REVIEW`, `MONITOR`, `APPROVE` |
| Alert Triage | Assignment decisions (routing) |
| Rule Optimization | Optimization recommendations |

Choose actions appropriate for your domain.

## Checklist

- [ ] Agent class extends `BaseAgent` with `name`, `role`, `capabilities`
- [ ] Tools registered in constructor via `this.registerTools()`
- [ ] `think()` returns `{ understanding, strategy, riskIndicators, llmEnhanced }`
- [ ] `plan()` returns `{ goal, actions[], fallback, llmEnhanced }`
- [ ] `observe()` returns `{ evidence, riskFactors, overallRisk, decision, confidence }`
- [ ] Public entry method calls `this.reason(input, context)`
- [ ] Singleton exported from `backend/agents/index.js`
- [ ] Role added to `AGENT_PROMPT_MAP` in `base-agent.js`
- [ ] Prompts added to `prompt-templates.js`
- [ ] All LLM calls have rule-based fallback (`if (!this.llmClient?.enabled)`)
- [ ] Tools use three-tier API mode (`real` / `free` / `simulation`)
