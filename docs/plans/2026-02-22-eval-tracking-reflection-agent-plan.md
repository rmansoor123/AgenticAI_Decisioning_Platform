# Eval Tracking & Reflection Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent evaluation tracking linked to agent decisions, and a reflection/critique step in the base agent reasoning loop.

**Architecture:** Two features integrated into the existing Node.js agent framework. (1) An `EvalTracker` singleton that fires async evaluations after each decision, persists scores to SQLite via `db_ops`, and detects regressions. (2) A `reflect()` method in `BaseAgent` between OBSERVE and POLICY CHECK that uses LLM-first reasoning with hardcoded fallback to catch errors before decisions finalize.

**Tech Stack:** Node.js (ES modules), SQLite via `db_ops`, Anthropic Claude SDK (existing `llm-client.js`), existing prompt template system.

---

### Task 1: Add Database Tables for Evaluation Tracking

**Files:**
- Modify: `backend/shared/common/database.js:19-45` (add to memoryStore map)
- Modify: `backend/shared/common/database.js:151-178` (add to getIdField map)

**Step 1: Add `agent_evaluations` and `agent_eval_history` to the memoryStore map**

In `backend/shared/common/database.js`, add two new entries to the `memoryStore` object (after line 43 `agent_decisions`):

```javascript
  agent_evaluations: new Map(),
  agent_eval_history: new Map(),
```

**Step 2: Add ID fields for the new tables**

In the `getIdField` function, add two new entries (after `agent_decisions: 'decision_id'`):

```javascript
    agent_evaluations: 'evaluation_id',
    agent_eval_history: 'history_id',
```

**Step 3: Verify the server starts without errors**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./shared/common/database.js').then(m => { console.log('OK'); process.exit(0); })"`
Expected: `OK`

**Step 4: Commit**

```bash
git add backend/shared/common/database.js
git commit -m "feat: add agent_evaluations and agent_eval_history database tables"
```

---

### Task 2: Create the EvalTracker Module

**Files:**
- Create: `backend/agents/core/eval-tracker.js`

**Step 1: Create `eval-tracker.js`**

Create the file at `backend/agents/core/eval-tracker.js` with the following implementation:

```javascript
/**
 * EvalTracker — Persistent evaluation tracking for agent decisions.
 *
 * Fires async evaluations after each decision via the Python eval service,
 * persists scores to SQLite, tracks hourly aggregates, and detects regressions.
 */

import { db_ops } from '../../shared/common/database.js';

const EVAL_SERVICE_URL = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
const EVAL_TIMEOUT_MS = 10000;

// Import event bus (optional)
let eventBus = null;
try {
  const module = await import('../../gateway/websocket/event-bus.js');
  eventBus = module.getEventBus();
} catch (e) {
  // Event bus not available
}

class EvalTracker {
  constructor() {
    this.recentEvals = [];       // Circular buffer for fast queries
    this.maxRecent = 200;
    this.stats = { totalEvals: 0, evalErrors: 0 };
  }

  /**
   * Evaluate a decision asynchronously. Called fire-and-forget from BaseAgent.reason().
   */
  async evaluateDecision(agentId, decisionId, input, evidence, result, chainOfThought) {
    try {
      const payload = this._buildEvalPayload(agentId, decisionId, input, evidence, result, chainOfThought);

      // Call Python eval service
      const scores = await this._callEvalService(payload);

      // Build evaluation record
      const evaluationId = `EVAL-${agentId.slice(0, 12)}-${Date.now().toString(36)}`;
      const evaluation = {
        evaluationId,
        decisionId,
        agentId,
        scores,
        aggregateScore: this._computeAggregate(scores),
        evalSource: 'combined',
        decision: result?.recommendation?.action || result?.decision || null,
        riskScore: result?.riskScore || result?.overallRisk?.score || null,
        confidence: result?.confidence || null,
        createdAt: new Date().toISOString()
      };

      // Persist
      this._persistEvaluation(evaluation);
      this._updateHistory(agentId, evaluation);

      // Check for regression
      this.checkForRegression(agentId);

      return evaluation;
    } catch (err) {
      this.stats.evalErrors++;
      // Non-fatal — log and continue
      console.warn('[EvalTracker] Evaluation failed:', err.message);
      return null;
    }
  }

  /**
   * Build the payload for the Python eval service.
   */
  _buildEvalPayload(agentId, decisionId, input, evidence, result, chainOfThought) {
    const query = typeof input === 'string' ? input : JSON.stringify(input).slice(0, 500);

    // Extract retrieved contexts from evidence (tool results)
    const retrievedContexts = (evidence || [])
      .filter(a => a.result?.data)
      .map(a => {
        const toolName = a.action?.type || 'unknown';
        return `[${toolName}] ${JSON.stringify(a.result.data).slice(0, 300)}`;
      })
      .slice(0, 10);

    // Agent response = decision + reasoning
    const agentResponse = [
      `Decision: ${result?.recommendation?.action || result?.decision || 'UNKNOWN'}`,
      `Risk Score: ${result?.riskScore || result?.overallRisk?.score || 'N/A'}`,
      `Confidence: ${result?.confidence || 'N/A'}`,
      `Summary: ${result?.summary || ''}`,
      `Reasoning: ${result?.recommendation?.reason || ''}`
    ].join('\n');

    return {
      query,
      retrieved_contexts: retrievedContexts,
      agent_response: agentResponse,
      use_case: 'agent_decision',
      agent_id: agentId
    };
  }

  /**
   * Call the Python eval service (TruLens + RAGAS).
   * Returns a scores object. Falls back to empty scores if service unavailable.
   */
  async _callEvalService(payload) {
    try {
      const response = await fetch(`${EVAL_SERVICE_URL}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(EVAL_TIMEOUT_MS)
      });

      if (response.ok) {
        const data = await response.json();
        // Convert scores array to object
        const scores = {};
        for (const s of (data.scores || [])) {
          scores[s.metric] = s.score;
        }
        return scores;
      }
    } catch (e) {
      // Eval service unavailable — return empty scores
    }

    return {};
  }

  /**
   * Compute weighted aggregate score from individual metrics.
   */
  _computeAggregate(scores) {
    const values = Object.values(scores).filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) return null;
    return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
  }

  /**
   * Persist evaluation to database.
   */
  _persistEvaluation(evaluation) {
    db_ops.insert('agent_evaluations', 'evaluation_id', evaluation.evaluationId, evaluation);

    this.recentEvals.push(evaluation);
    if (this.recentEvals.length > this.maxRecent) {
      this.recentEvals.shift();
    }
    this.stats.totalEvals++;
  }

  /**
   * Update hourly time-series aggregation.
   */
  _updateHistory(agentId, evaluation) {
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();
    const historyId = `EVALH-${agentId.slice(0, 12)}-${windowStart.replace(/[^0-9]/g, '').slice(0, 10)}`;

    // Try to load existing window
    const existing = db_ops.getById('agent_eval_history', 'history_id', historyId);
    const existingData = existing?.data ? (typeof existing.data === 'string' ? JSON.parse(existing.data) : existing.data) : null;

    if (existingData) {
      // Update existing window
      const count = existingData.evalCount + 1;
      const newAvg = ((existingData.avgScore || 0) * existingData.evalCount + (evaluation.aggregateScore || 0)) / count;

      existingData.evalCount = count;
      existingData.avgScore = Math.round(newAvg * 100) / 100;
      existingData.minScore = Math.min(existingData.minScore, evaluation.aggregateScore || 1);
      existingData.maxScore = Math.max(existingData.maxScore, evaluation.aggregateScore || 0);

      db_ops.insert('agent_eval_history', 'history_id', historyId, existingData);
    } else {
      // Create new window
      const windowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1).toISOString();
      db_ops.insert('agent_eval_history', 'history_id', historyId, {
        historyId,
        agentId,
        windowStart,
        windowEnd,
        avgScore: evaluation.aggregateScore || 0,
        minScore: evaluation.aggregateScore || 0,
        maxScore: evaluation.aggregateScore || 0,
        evalCount: 1,
        scoreTrend: 'stable'
      });
    }
  }

  /**
   * Check for regression: current hour avg vs trailing 7-day avg.
   * Emits event if score drops > 15%.
   */
  checkForRegression(agentId) {
    const recent = this.recentEvals
      .filter(e => e.agentId === agentId && e.aggregateScore != null);

    if (recent.length < 5) return null; // Not enough data

    // Current window: last 5 evals
    const currentAvg = recent.slice(-5).reduce((s, e) => s + e.aggregateScore, 0) / 5;

    // Trailing: all except last 5
    const trailing = recent.slice(0, -5);
    if (trailing.length < 5) return null;
    const trailingAvg = trailing.reduce((s, e) => s + e.aggregateScore, 0) / trailing.length;

    if (trailingAvg > 0) {
      const dropPct = ((trailingAvg - currentAvg) / trailingAvg) * 100;
      if (dropPct > 15) {
        const alert = {
          agentId,
          type: 'EVAL_REGRESSION',
          currentAvg: Math.round(currentAvg * 100) / 100,
          trailingAvg: Math.round(trailingAvg * 100) / 100,
          dropPct: Math.round(dropPct * 10) / 10,
          timestamp: new Date().toISOString()
        };

        if (eventBus) {
          eventBus.publish('agent:eval:regression', alert);
        }
        console.warn(`[EvalTracker] REGRESSION DETECTED for ${agentId}: ${alert.dropPct}% drop`);
        return alert;
      }
    }
    return null;
  }

  /**
   * Get recent evaluations for an agent.
   */
  getEvalHistory(agentId, limit = 50) {
    return this.recentEvals
      .filter(e => e.agentId === agentId)
      .slice(-limit);
  }

  /**
   * Get aggregate eval stats for an agent.
   */
  getAgentEvalStats(agentId) {
    const evals = this.recentEvals.filter(e => e.agentId === agentId && e.aggregateScore != null);
    if (evals.length === 0) {
      return { agentId, totalEvals: 0, avgScore: null, recentTrend: 'insufficient_data' };
    }

    const avgScore = evals.reduce((s, e) => s + e.aggregateScore, 0) / evals.length;

    // Trend: compare last 10 vs previous 10
    let recentTrend = 'stable';
    if (evals.length >= 20) {
      const last10 = evals.slice(-10).reduce((s, e) => s + e.aggregateScore, 0) / 10;
      const prev10 = evals.slice(-20, -10).reduce((s, e) => s + e.aggregateScore, 0) / 10;
      if (last10 > prev10 * 1.05) recentTrend = 'improving';
      else if (last10 < prev10 * 0.95) recentTrend = 'degrading';
    }

    return {
      agentId,
      totalEvals: evals.length,
      avgScore: Math.round(avgScore * 100) / 100,
      recentTrend,
      regressionAlert: this.checkForRegression(agentId)
    };
  }

  /**
   * Get aggregate stats across all agents.
   */
  getSystemEvalStats() {
    const agentIds = [...new Set(this.recentEvals.map(e => e.agentId))];
    return {
      totalEvals: this.stats.totalEvals,
      evalErrors: this.stats.evalErrors,
      agents: agentIds.map(id => this.getAgentEvalStats(id))
    };
  }
}

// Singleton
let instance = null;
export function getEvalTracker() {
  if (!instance) instance = new EvalTracker();
  return instance;
}
```

**Step 2: Verify the module loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/eval-tracker.js').then(m => { const t = m.getEvalTracker(); console.log('EvalTracker OK, stats:', JSON.stringify(t.stats)); process.exit(0); })"`
Expected: `EvalTracker OK, stats: {"totalEvals":0,"evalErrors":0}`

**Step 3: Commit**

```bash
git add backend/agents/core/eval-tracker.js
git commit -m "feat: add EvalTracker module for persistent evaluation tracking"
```

---

### Task 3: Add the Reflection Prompt Template

**Files:**
- Modify: `backend/agents/core/prompt-templates.js:187-207` (add before `parseLLMJson`)

**Step 1: Add `buildReflectPrompt` function**

Insert the following function before the `parseLLMJson` function (before line 189):

```javascript
/**
 * Build the REFLECT phase prompt.
 * LLM returns: { shouldRevise, revisedAction, revisedConfidence, concerns, contraArgument, reflectionConfidence }
 */
export function buildReflectPrompt({ agentName, agentRole, input, evidence, proposedDecision, riskScore, confidence, chainOfThought }) {
  const system = `You are a critical reviewer auditing a ${agentRole} agent's decision in a fraud detection platform.
Your job is to find flaws, contradictions, and unjustified assumptions. Be adversarial — actively argue against the proposed decision.

You MUST return valid JSON with this exact schema:
{
  "shouldRevise": boolean,
  "revisedAction": "APPROVE" | "REVIEW" | "REJECT" | "BLOCK" | "MONITOR" | null,
  "revisedConfidence": 0.0-1.0 or null,
  "concerns": ["string array of specific concerns"],
  "contraArgument": "string — strongest case against the current decision",
  "reflectionConfidence": 0.0-1.0
}

RULES:
- Only set shouldRevise to true if there is a clear error or contradiction.
- Minor concerns are NOT grounds for revision — list them but keep shouldRevise false.
- Return ONLY the JSON object. No markdown.`;

  const evidenceSummary = (evidence || []).map(a => {
    const toolName = a.action?.type || 'unknown';
    const success = a.result?.success !== false;
    const data = a.result?.data ? JSON.stringify(a.result.data).slice(0, 200) : 'no data';
    return `- ${toolName}: ${success ? 'OK' : 'FAILED'} — ${data}`;
  }).join('\n');

  const user = `## Original Input
${JSON.stringify(input, null, 2).slice(0, 500)}

## Evidence Gathered
${evidenceSummary || 'No evidence collected.'}

## Proposed Decision
- Action: ${proposedDecision?.action || 'UNKNOWN'}
- Risk Score: ${riskScore ?? 'N/A'}
- Confidence: ${confidence ?? 'N/A'}
- Reasoning: ${proposedDecision?.reason || proposedDecision?.reasoning || 'none provided'}

Critically evaluate this decision. What could go wrong? Should it be revised?`;

  return { system, user };
}
```

**Step 2: Add `buildReflectPrompt` to the existing exports**

The function is already exported by virtue of the `export` keyword on the function declaration. No additional export changes needed since the file uses named exports.

**Step 3: Commit**

```bash
git add backend/agents/core/prompt-templates.js
git commit -m "feat: add buildReflectPrompt template for reflection step"
```

---

### Task 4: Add reflect() Method and Integrate into BaseAgent.reason()

**Files:**
- Modify: `backend/agents/core/base-agent.js:24-30` (add imports)
- Modify: `backend/agents/core/base-agent.js:45-90` (add eval tracker to constructor)
- Modify: `backend/agents/core/base-agent.js:196-227` (insert reflect step between OBSERVE and POLICY CHECK)
- Modify: `backend/agents/core/base-agent.js:260-284` (add async eval after metrics)

**Step 1: Add imports for new modules**

In `base-agent.js`, update the import block. After line 28 (`parseLLMJson`), add `buildReflectPrompt` to the import:

```javascript
import {
  buildThinkPrompt,
  buildPlanPrompt,
  buildObservePrompt,
  buildReflectPrompt,
  parseLLMJson,
  formatToolCatalog
} from './prompt-templates.js';
```

Add a new import after line 34 (`getPolicyEngine`):

```javascript
import { getEvalTracker } from './eval-tracker.js';
```

**Step 2: Add eval tracker to constructor**

In the constructor, after line 74 (`this.policyEngine = getPolicyEngine();`), add:

```javascript
    this.evalTracker = getEvalTracker();
```

**Step 3: Add the `reflect()` method**

Insert the following method after the `observe()` method (after line 456):

```javascript
  /**
   * Reflect on proposed decision — LLM-enhanced with rule-based fallback.
   * Catches contradictions, overconfidence, and reasoning errors before policy check.
   */
  async reflect(observation, actions, input, context) {
    // LLM-enhanced reflection
    if (this.llmClient?.enabled) {
      try {
        const proposedDecision = observation?.recommendation || { action: observation?.decision, reason: observation?.summary };
        const { system, user } = buildReflectPrompt({
          agentName: this.name,
          agentRole: this.role,
          input,
          evidence: actions,
          proposedDecision,
          riskScore: observation?.riskScore || observation?.overallRisk?.score,
          confidence: observation?.confidence
        });

        const llmResult = await this.llmClient.complete(system, user);
        const parsed = parseLLMJson(llmResult?.content, null);

        if (parsed) {
          return {
            shouldRevise: parsed.shouldRevise || false,
            revisedAction: parsed.revisedAction || null,
            revisedConfidence: parsed.revisedConfidence || null,
            concerns: parsed.concerns || [],
            contraArgument: parsed.contraArgument || '',
            reflectionConfidence: parsed.reflectionConfidence || 0.5,
            llmEnhanced: true
          };
        }
      } catch (e) {
        // Fall through to rule-based reflection
      }
    }

    // Hardcoded fallback: mechanical contradiction checks
    return this._ruleBasedReflection(observation, actions);
  }

  /**
   * Rule-based reflection fallback — works without LLM.
   * Checks for evidence contradictions, confidence mismatches, and alignment issues.
   */
  _ruleBasedReflection(observation, actions) {
    const concerns = [];
    const decision = observation?.recommendation?.action || observation?.decision;
    const riskScore = observation?.riskScore || observation?.overallRisk?.score || 0;
    const confidence = observation?.confidence || 0;

    // 1. Evidence contradiction: count approve vs reject signals
    const toolResults = actions.map(a => a.result).filter(Boolean);
    let approveSignals = 0;
    let rejectSignals = 0;
    for (const r of toolResults) {
      if (r.success === false) rejectSignals++;
      else approveSignals++;
      // Check risk indicators in data
      if (r.data?.riskLevel === 'HIGH' || r.data?.riskLevel === 'CRITICAL') rejectSignals++;
      if (r.data?.riskLevel === 'LOW') approveSignals++;
      if (r.data?.verified === true) approveSignals++;
      if (r.data?.verified === false) rejectSignals++;
      if (r.data?.matched === true || r.data?.onWatchlist === true) rejectSignals++;
    }
    const totalSignals = approveSignals + rejectSignals;
    if (totalSignals > 0) {
      const disagreement = Math.min(approveSignals, rejectSignals) / totalSignals;
      if (disagreement > 0.3) {
        concerns.push(`Evidence is contradictory: ${approveSignals} approve signals vs ${rejectSignals} reject signals`);
      }
    }

    // 2. Confidence-evidence mismatch
    const toolsRun = actions.length;
    if (confidence > 0.8 && toolsRun < 3) {
      concerns.push(`High confidence (${confidence}) with only ${toolsRun} tools executed — potentially overconfident`);
    }

    // 3. Risk score vs decision alignment
    if (riskScore > 60 && decision === 'APPROVE') {
      concerns.push(`Risk score ${riskScore} is elevated but decision is APPROVE`);
    }
    if (riskScore < 20 && (decision === 'REJECT' || decision === 'BLOCK')) {
      concerns.push(`Risk score ${riskScore} is low but decision is ${decision}`);
    }

    // 4. Tool failures
    const failedTools = actions.filter(a => a.result?.success === false);
    if (failedTools.length > 0) {
      concerns.push(`${failedTools.length} tool(s) failed: ${failedTools.map(a => a.action?.type).join(', ')} — incomplete evidence`);
    }

    // Only recommend revision if 2+ concerns
    const shouldRevise = concerns.length >= 2;
    let revisedAction = null;
    if (shouldRevise && riskScore > 60 && decision === 'APPROVE') {
      revisedAction = 'REVIEW';
    } else if (shouldRevise && riskScore < 20 && decision === 'REJECT') {
      revisedAction = 'REVIEW';
    }

    return {
      shouldRevise,
      revisedAction,
      revisedConfidence: shouldRevise ? Math.min(confidence, 0.6) : null,
      concerns,
      contraArgument: concerns.length > 0 ? concerns[0] : 'No significant concerns found.',
      reflectionConfidence: 0.7,
      llmEnhanced: false
    };
  }
```

**Step 4: Insert reflection step into `reason()` flow**

In `reason()`, after Step 5 (OBSERVE, line 196) and before Step 5.25 (POLICY CHECK, line 198), insert the reflection step. Replace the block from line 196 to line 227 with:

```javascript
      // Step 5: OBSERVE - Evaluate results
      thought.result = await this.observe(thought.actions, context);

      // Step 5.1: REFLECT — critique proposed decision before policy check
      this.traceCollector.startSpan(traceId, 'reflection', {
        proposedDecision: thought.result?.recommendation?.action || thought.result?.decision
      });

      const reflection = await this.reflect(thought.result, thought.actions, input, context);
      thought.reflection = reflection;

      if (reflection.concerns.length > 0) {
        this.currentChain.addStep({
          type: 'validation',
          content: `Reflection raised ${reflection.concerns.length} concern(s): ${reflection.concerns.join('; ')}`,
          confidence: reflection.shouldRevise ? CONFIDENCE.POSSIBLE : CONFIDENCE.LIKELY
        });
      }

      if (reflection.shouldRevise && reflection.revisedAction) {
        const originalAction = thought.result?.recommendation?.action || thought.result?.decision;
        thought.result.recommendation = {
          ...thought.result.recommendation,
          action: reflection.revisedAction,
          originalAction,
          revisedByReflection: true,
          reflectionConcerns: reflection.concerns
        };
        thought.result.decision = reflection.revisedAction;
        thought.result.confidence = reflection.revisedConfidence || (thought.result.confidence || 0.8) * 0.8;
        this.emitEvent('agent:reflection:revision', {
          agentId: this.agentId,
          originalAction,
          revisedAction: reflection.revisedAction,
          concerns: reflection.concerns
        });
      }

      this.traceCollector.endSpan(traceId, 'reflection', {
        shouldRevise: reflection.shouldRevise,
        concerns: reflection.concerns.length
      });

      // Step 5.25: POLICY CHECK — enforce hard/soft policies on the proposed decision
      const proposedDecision = thought.result?.recommendation || { action: thought.result?.decision, confidence: thought.result?.confidence };
      if (proposedDecision?.action) {
        const policyResult = this.policyEngine.enforce(
          proposedDecision,
          thought.actions.map(a => ({ source: a.action?.type, data: a.result?.data, success: a.result?.success !== false })),
          {
            riskScore: thought.result?.riskScore || thought.result?.overallRisk?.score || 0,
            thresholds: this.thresholdManager.getThresholds(this.agentId),
            patternRecommendation: thought.patternMatches?.recommendation?.action,
            criticalFactors: thought.result?.overallRisk?.criticalFactors || 0
          }
        );

        // Apply policy enforcement
        if (!policyResult.allowed) {
          thought.result.recommendation = policyResult.enforcedDecision;
          thought.result.decision = policyResult.enforcedDecision.action;
          thought.result.policyOverride = true;
          thought.result.policyViolations = policyResult.violations;
          this.emitEvent('agent:policy:override', {
            agentId: this.agentId,
            originalAction: policyResult.originalDecision.action,
            enforcedAction: policyResult.enforcedDecision.action,
            violations: policyResult.violations.map(v => v.policyId)
          });
        } else if (policyResult.flags.length > 0) {
          thought.result.policyFlags = policyResult.flags;
        }
      }
```

**Step 5: Add async evaluation after metrics logging**

After the decision logging block (after line 284), add the async evaluation call. Insert before the `} catch (error) {` block:

```javascript
      // Step 9: EVALUATE (async, non-blocking)
      const evalDecisionId = `DEC-${this.agentId}-${Date.now().toString(36)}`;
      this.evalTracker.evaluateDecision(
        this.agentId,
        evalDecisionId,
        input,
        thought.actions,
        thought.result,
        thought.chainOfThought
      ).catch(err => console.warn('[EvalTracker] Async eval failed:', err.message));
```

**Step 6: Verify the module loads without import errors**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/base-agent.js').then(m => { console.log('BaseAgent OK'); process.exit(0); })"`
Expected: `BaseAgent OK`

**Step 7: Commit**

```bash
git add backend/agents/core/base-agent.js
git commit -m "feat: add reflect() step and async eval tracking to base agent reasoning loop"
```

---

### Task 5: Add Eval Tracking API Endpoints

**Files:**
- Modify: `backend/gateway/server.js` (add eval tracking endpoints)

**Step 1: Find the agents API section in server.js**

Search for the existing `/api/agents` routes or the agents service import. Add a new route group for eval tracking near the agents section.

Add the following endpoints by inserting them in the agents API section:

```javascript
// ── Eval Tracking API ──────────────────────────────────────────────────────

import { getEvalTracker } from '../agents/core/eval-tracker.js';

app.get('/api/agents/evals/stats', (req, res) => {
  const evalTracker = getEvalTracker();
  res.json(evalTracker.getSystemEvalStats());
});

app.get('/api/agents/:agentId/evals', (req, res) => {
  const evalTracker = getEvalTracker();
  const limit = parseInt(req.query.limit) || 50;
  res.json(evalTracker.getEvalHistory(req.params.agentId, limit));
});

app.get('/api/agents/:agentId/evals/stats', (req, res) => {
  const evalTracker = getEvalTracker();
  res.json(evalTracker.getAgentEvalStats(req.params.agentId));
});
```

**Step 2: Commit**

```bash
git add backend/gateway/server.js
git commit -m "feat: add eval tracking API endpoints"
```

---

### Task 6: Wire EvalTracker into Agent Module Index

**Files:**
- Modify: `backend/agents/index.js:1-13` (add import)
- Modify: `backend/agents/index.js:110-129` (add to exports)

**Step 1: Add import**

After line 12 (`import SellerOnboardingAgent`), add:

```javascript
import { getEvalTracker } from './core/eval-tracker.js';
```

**Step 2: Initialize eval tracker**

After line 18 (`const sellerOnboarding = new SellerOnboardingAgent();`), add:

```javascript
// Initialize eval tracker singleton
const evalTracker = getEvalTracker();
```

**Step 3: Add to exports**

In the named exports (line 110-117), add `evalTracker`:

```javascript
export {
  orchestrator,
  coordinator,
  evalTracker,
  fraudInvestigator,
  ruleOptimizer,
  alertTriage,
  sellerOnboarding
};
```

In the default export (line 119-128), add `evalTracker`:

```javascript
export default {
  orchestrator,
  coordinator,
  evalTracker,
  agents: {
    fraudInvestigator,
    ruleOptimizer,
    alertTriage,
    sellerOnboarding
  }
};
```

**Step 4: Commit**

```bash
git add backend/agents/index.js
git commit -m "feat: wire eval tracker into agent module exports"
```

---

### Task 7: Integration Test — Full Reasoning Loop with Reflect + Eval

**Files:**
- Create: `backend/agents/core/__tests__/reflect-and-eval.test.js`

**Step 1: Create integration test**

```javascript
/**
 * Integration test: verifies reflect() and eval tracking work within the reasoning loop.
 * Run with: node backend/agents/core/__tests__/reflect-and-eval.test.js
 */

import { BaseAgent } from '../base-agent.js';
import { getEvalTracker } from '../eval-tracker.js';

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  // ── Test 1: reflect() returns valid structure (rule-based fallback) ──
  console.log('\nTest 1: reflect() rule-based fallback');
  const agent = new BaseAgent({
    agentId: 'TEST-REFLECT',
    name: 'Test Agent',
    role: 'test agent',
    capabilities: ['testing']
  });

  // Mock observation with misaligned risk/decision
  const observation = {
    recommendation: { action: 'APPROVE', reason: 'Looks fine' },
    decision: 'APPROVE',
    riskScore: 75,
    confidence: 0.9
  };
  const actions = [
    { action: { type: 'check_a' }, result: { success: true, data: { riskLevel: 'HIGH' } } },
    { action: { type: 'check_b' }, result: { success: false, data: {} } }
  ];

  const reflection = await agent.reflect(observation, actions, { sellerId: 'S1' }, {});

  assert(typeof reflection.shouldRevise === 'boolean', 'shouldRevise is boolean');
  assert(Array.isArray(reflection.concerns), 'concerns is array');
  assert(reflection.concerns.length > 0, 'concerns detected for misaligned decision');
  assert(typeof reflection.contraArgument === 'string', 'contraArgument is string');
  assert(typeof reflection.reflectionConfidence === 'number', 'reflectionConfidence is number');

  // ── Test 2: reflect() detects risk-decision misalignment ──
  console.log('\nTest 2: reflect() catches risk-decision misalignment');
  assert(
    reflection.concerns.some(c => c.includes('Risk score') || c.includes('elevated')),
    'Detected risk score vs APPROVE misalignment'
  );

  // ── Test 3: reflect() returns no revision for clean case ──
  console.log('\nTest 3: reflect() passes clean decisions');
  const cleanObs = {
    recommendation: { action: 'APPROVE', reason: 'All clear' },
    decision: 'APPROVE',
    riskScore: 15,
    confidence: 0.85
  };
  const cleanActions = [
    { action: { type: 'verify_id' }, result: { success: true, data: { verified: true, riskLevel: 'LOW' } } },
    { action: { type: 'verify_email' }, result: { success: true, data: { verified: true, riskLevel: 'LOW' } } },
    { action: { type: 'verify_biz' }, result: { success: true, data: { verified: true, riskLevel: 'LOW' } } }
  ];

  const cleanReflection = await agent.reflect(cleanObs, cleanActions, { sellerId: 'S2' }, {});
  assert(cleanReflection.shouldRevise === false, 'Clean decision not revised');

  // ── Test 4: EvalTracker singleton works ──
  console.log('\nTest 4: EvalTracker basic functionality');
  const tracker = getEvalTracker();
  assert(tracker.stats.totalEvals === 0, 'Starts with zero evals');

  const stats = tracker.getSystemEvalStats();
  assert(stats.totalEvals === 0, 'System stats show zero evals');

  // ── Test 5: _computeAggregate works ──
  console.log('\nTest 5: _computeAggregate');
  const agg = tracker._computeAggregate({ a: 0.8, b: 0.6, c: 0.7 });
  assert(Math.abs(agg - 0.7) < 0.01, `Aggregate is ~0.7, got ${agg}`);

  const emptyAgg = tracker._computeAggregate({});
  assert(emptyAgg === null, 'Empty scores returns null');

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
```

**Step 2: Run the test**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && node backend/agents/core/__tests__/reflect-and-eval.test.js`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add backend/agents/core/__tests__/reflect-and-eval.test.js
git commit -m "test: add integration tests for reflect() and eval tracking"
```

---

### Task 8: Final Verification — Full Server Startup

**Step 1: Start the backend server and verify no import errors**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && timeout 10 node gateway/server.js 2>&1 || true`
Expected: Server starts without import errors. Look for "Server running" or similar startup message without crashes.

**Step 2: Final commit with all changes**

If any files were missed, stage and commit them:

```bash
git add -A && git status
git commit -m "feat: complete eval tracking and reflection agent implementation"
```
