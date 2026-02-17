# Agentic Brain Upgrade — Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the fraud detection platform from a rule-engine-with-optional-LLM into a genuinely agentic system where agents reason autonomously, learn from experience, and operate within safety guardrails.

**Architecture:** 5-layer bottom-up upgrade. Each layer is independently testable. LLM-first with rule fallback. Memory is advisory context. Simulated outcomes for feedback loops. Guardrails included from the start.

**Tech Stack:** Node.js (agents), Python/FastAPI (eval service), Anthropic Claude (LLM), Pinecone (vector search), SQLite (persistence), EventEmitter (event bus)

**Design Doc:** `docs/plans/2026-02-16-agentic-brain-upgrade-design.md`

---

## Layer 1: Enhanced LLM Reasoning Core

### Task 1: Create Prompt Templates Module

**Files:**
- Create: `backend/agents/core/prompt-templates.js`

**Context:** This new module centralizes all structured prompts for the think/plan/observe reasoning phases. It converts registered tools into LLM-readable descriptions and defines output schemas so LLM responses are parseable. Every other layer depends on this.

**Step 1: Create `prompt-templates.js`**

```javascript
// backend/agents/core/prompt-templates.js
/**
 * Prompt Templates — Centralized structured prompts for agent reasoning phases.
 *
 * Converts registered tools into LLM-readable descriptions.
 * Defines output schemas so LLM responses are JSON-parseable.
 */

/**
 * Format a tool Map into an LLM-readable catalog string.
 * @param {Map} tools - Map of tool name → { name, description, handler }
 * @returns {string} Formatted tool catalog
 */
export function formatToolCatalog(tools) {
  if (!tools || tools.size === 0) return 'No tools available.';

  const entries = [];
  for (const [name, tool] of tools) {
    entries.push(`- ${name}: ${tool.description}`);
  }
  return entries.join('\n');
}

/**
 * Format memory entries for injection into prompts.
 * @param {Array} entries - Memory entries (short-term or long-term)
 * @param {number} max - Maximum entries to include
 * @returns {string} Formatted memory section
 */
export function formatMemoryForPrompt(entries, max = 5) {
  if (!entries || entries.length === 0) return 'No relevant memories.';

  return entries.slice(0, max).map((entry, i) => {
    const summary = entry.summary || entry.value || JSON.stringify(entry).slice(0, 150);
    const type = entry._type || entry.type || 'memory';
    return `${i + 1}. [${type}] ${summary}`;
  }).join('\n');
}

/**
 * Format pattern matches for injection into prompts.
 * @param {Object} patternResult - Result from patternMemory.matchPatterns()
 * @returns {string} Formatted pattern section
 */
export function formatPatternsForPrompt(patternResult) {
  if (!patternResult?.matches?.length) return 'No matching patterns found.';

  return patternResult.matches.slice(0, 5).map((match, i) => {
    const p = match.pattern;
    const confidence = (match.score * p.confidence * p.successRate).toFixed(2);
    return `${i + 1}. [${p.type}] Outcome: ${p.outcome}, Confidence: ${confidence}, Occurrences: ${p.occurrences}`;
  }).join('\n');
}

/**
 * Format knowledge base results for injection into prompts.
 * @param {Array} results - Knowledge search results
 * @returns {string} Formatted knowledge section
 */
export function formatKnowledgeForPrompt(results) {
  if (!results || results.length === 0) return 'No relevant knowledge found.';

  return results.slice(0, 5).map((r, i) => {
    const text = (r.text || '').slice(0, 200);
    const source = r._source || r.source || 'knowledge-base';
    const score = r._score || r.relevanceScore || 'N/A';
    return `${i + 1}. [${source}] ${text} (relevance: ${score})`;
  }).join('\n');
}

/**
 * Build the THINK phase prompt.
 * LLM returns: { understanding, key_risks, confidence, suggested_approach }
 */
export function buildThinkPrompt({ agentName, agentRole, input, recentMemory, knowledgeResults, patternMatches, tools }) {
  const system = `You are ${agentName}, a ${agentRole} agent in a fraud detection platform.

Your job is to analyze the input and provide a structured understanding of the situation.

You MUST return valid JSON with this exact schema:
{
  "understanding": "string — your analysis of the situation",
  "key_risks": ["string array — identified risk factors"],
  "confidence": 0.0-1.0,
  "suggested_approach": "string — how you would investigate this"
}

Return ONLY the JSON object. No markdown, no explanation.`;

  const user = `## Task Input
${JSON.stringify(input, null, 2).slice(0, 1500)}

## Recent Activity in This Session
${formatMemoryForPrompt(recentMemory)}

## Similar Patterns from History
${formatPatternsForPrompt(patternMatches)}

## Relevant Institutional Knowledge
${formatKnowledgeForPrompt(knowledgeResults)}

## Available Tools
${formatToolCatalog(tools)}

Analyze this input and return your structured understanding as JSON.`;

  return { system, user };
}

/**
 * Build the PLAN phase prompt.
 * LLM returns: { goal, reasoning, actions: [{ tool, params, rationale }] }
 */
export function buildPlanPrompt({ agentName, agentRole, thinkResult, longTermMemory, tools, input }) {
  const system = `You are ${agentName}, a ${agentRole} agent. Based on your analysis, decide which tools to use and in what order.

You MUST return valid JSON with this exact schema:
{
  "goal": "string — what you are trying to accomplish",
  "reasoning": "string — why you chose these tools",
  "actions": [
    {
      "tool": "exact_tool_name",
      "params": { "key": "value" },
      "rationale": "string — why this tool"
    }
  ]
}

RULES:
- Only use tools from the Available Tools list below.
- Maximum 10 actions.
- Include relevant parameters from the input data.
- Return ONLY the JSON object. No markdown.`;

  const user = `## Your Analysis
${JSON.stringify(thinkResult, null, 2).slice(0, 1000)}

## Lessons from Past Experience
${formatMemoryForPrompt(longTermMemory)}

## Original Input
${JSON.stringify(input, null, 2).slice(0, 800)}

## Available Tools
${formatToolCatalog(tools)}

Create your action plan as JSON.`;

  return { system, user };
}

/**
 * Build the OBSERVE phase prompt.
 * LLM returns: { summary, risk_score, recommendation, confidence, reasoning }
 */
export function buildObservePrompt({ agentName, agentRole, actions, input }) {
  const system = `You are ${agentName}, a ${agentRole} agent. You have completed your investigation. Synthesize all evidence into a final assessment.

You MUST return valid JSON with this exact schema:
{
  "summary": "string — concise summary of findings",
  "risk_score": 0-100,
  "recommendation": "APPROVE" | "REVIEW" | "REJECT" | "BLOCK" | "MONITOR",
  "confidence": 0.0-1.0,
  "reasoning": "string — detailed explanation of your decision",
  "key_findings": ["string array — most important findings"]
}

Return ONLY the JSON object. No markdown.`;

  const evidenceSummary = actions.map(a => {
    const toolName = a.action?.type || 'unknown';
    const success = a.result?.success !== false;
    const data = a.result?.data ? JSON.stringify(a.result.data).slice(0, 300) : 'no data';
    return `- ${toolName}: ${success ? 'SUCCESS' : 'FAILED'} — ${data}`;
  }).join('\n');

  const user = `## Original Task
${JSON.stringify(input, null, 2).slice(0, 500)}

## Evidence Gathered
${evidenceSummary}

Synthesize all evidence and return your final assessment as JSON.`;

  return { system, user };
}

/**
 * Safely parse LLM JSON output with fallback.
 * @param {string} text - Raw LLM output
 * @param {Object} fallback - Fallback value if parsing fails
 * @returns {Object} Parsed JSON or fallback
 */
export function parseLLMJson(text, fallback = null) {
  if (!text) return fallback;
  try {
    // Try to extract JSON from the response (handles markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // Parse failed
  }
  return fallback;
}
```

**Step 2: Verify module loads**

Run: `node -e "import('./backend/agents/core/prompt-templates.js').then(m => console.log('OK: exports =', Object.keys(m))).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK: exports = [formatToolCatalog, formatMemoryForPrompt, ...]`

**Step 3: Commit**

```bash
git add backend/agents/core/prompt-templates.js
git commit -m "feat: add centralized prompt templates for agent reasoning phases"
```

---

### Task 2: Rewrite Base Agent think/plan/observe with Structured LLM Prompts

**Files:**
- Modify: `backend/agents/core/base-agent.js` (lines 14-23 imports, lines 226-308 think/plan/observe)

**Context:** Replace the shallow LLM prompts in `think()`, `plan()`, and `observe()` with the structured prompts from `prompt-templates.js`. Each method sends a rich prompt with memory + knowledge + tools and parses structured JSON output. Fallback to existing behavior if LLM fails. This is the single most important change in the entire upgrade.

**Step 1: Add prompt-templates import to `base-agent.js`**

After line 23 (`import { getLLMClient } from './llm-client.js';`), add:

```javascript
import {
  buildThinkPrompt,
  buildPlanPrompt,
  buildObservePrompt,
  parseLLMJson,
  formatToolCatalog
} from './prompt-templates.js';
```

**Step 2: Rewrite `think()` method (replace lines 226-252)**

Replace the entire `think()` method:

```javascript
  // Analyze input and context — LLM-enhanced with structured prompts
  async think(input, context) {
    // Gather advisory context for the LLM
    const recentMemory = this.memoryStore.getShortTerm(this.agentId, this.sessionId).slice(0, 5);
    const patternMatches = this.checkPatterns(input);
    let knowledgeResults = [];

    // Try dual retrieval (vector + TF-IDF) — Layer 3 will enhance this further
    try {
      const queryText = typeof input === 'string' ? input : JSON.stringify(input).slice(0, 200);
      const longTermResults = this.memoryStore.queryLongTerm(this.agentId, queryText, 3);
      knowledgeResults = longTermResults;
    } catch (e) {
      // Knowledge retrieval failed, proceed without it
    }

    // Try LLM-enhanced thinking
    if (this.llmClient?.enabled) {
      try {
        const { system, user } = buildThinkPrompt({
          agentName: this.name,
          agentRole: this.role,
          input,
          recentMemory,
          knowledgeResults,
          patternMatches,
          tools: this.tools
        });

        const llmResult = await this.llmClient.complete(system, user);
        const parsed = parseLLMJson(llmResult?.content, null);

        if (parsed?.understanding) {
          return {
            ...parsed,
            relevantMemory: this.retrieveRelevantMemory(input),
            availableTools: Array.from(this.tools.keys()),
            patternMatches,
            llmEnhanced: true
          };
        }
      } catch (e) {
        // Fall through to hardcoded logic
      }
    }

    // Fallback: hardcoded analysis
    return {
      understanding: `Analyzing: ${JSON.stringify(input).slice(0, 200)}`,
      key_risks: [],
      confidence: 0.5,
      suggested_approach: 'default',
      relevantMemory: this.retrieveRelevantMemory(input),
      availableTools: Array.from(this.tools.keys()),
      patternMatches
    };
  }
```

**Step 3: Rewrite `plan()` method (replace lines 255-290)**

Replace the entire `plan()` method:

```javascript
  // Create action plan — LLM selects tools with reasoning
  async plan(analysis, context) {
    // Gather long-term memory for lessons learned
    const queryText = analysis.understanding || JSON.stringify(context).slice(0, 200);
    const longTermMemory = this.memoryStore.queryLongTerm(this.agentId, queryText, 3);

    // Try LLM-enhanced planning
    if (this.llmClient?.enabled) {
      try {
        const { system, user } = buildPlanPrompt({
          agentName: this.name,
          agentRole: this.role,
          thinkResult: analysis,
          longTermMemory,
          tools: this.tools,
          input: context?.input || context
        });

        const llmResult = await this.llmClient.complete(system, user);
        const parsed = parseLLMJson(llmResult?.content, null);

        if (parsed?.actions?.length > 0) {
          // Validate tool names — only allow tools the agent actually has
          const validActions = parsed.actions
            .filter(a => this.tools.has(a.tool))
            .map(a => ({ type: a.tool, params: a.params || {}, rationale: a.rationale }));

          if (validActions.length > 0) {
            return {
              goal: parsed.goal || 'LLM-planned investigation',
              reasoning: parsed.reasoning || '',
              actions: validActions.slice(0, 10), // Guardrail: max 10 actions
              fallback: null,
              llmEnhanced: true
            };
          }
        }
      } catch (e) {
        // Fall through to hardcoded logic
      }
    }

    // Fallback: generic analyze action
    return {
      goal: 'Process input and generate response',
      actions: [{ type: 'analyze', params: {} }],
      fallback: null
    };
  }
```

**Step 4: Rewrite `observe()` method (replace lines 302-308)**

Replace the entire `observe()` method:

```javascript
  // Evaluate results — LLM synthesizes findings into risk assessment
  async observe(actions, context) {
    // Try LLM-enhanced observation
    if (this.llmClient?.enabled) {
      try {
        const { system, user } = buildObservePrompt({
          agentName: this.name,
          agentRole: this.role,
          actions,
          input: context?.input || context
        });

        const llmResult = await this.llmClient.complete(system, user);
        const parsed = parseLLMJson(llmResult?.content, null);

        if (parsed?.summary) {
          return {
            success: true,
            summary: parsed.summary,
            riskScore: parsed.risk_score,
            recommendation: { action: parsed.recommendation, confidence: parsed.confidence, reason: parsed.reasoning },
            decision: parsed.recommendation,
            confidence: parsed.confidence,
            key_findings: parsed.key_findings || [],
            actions,
            llmEnhanced: true
          };
        }
      } catch (e) {
        // Fall through to hardcoded logic
      }
    }

    // Fallback: rule-based observation
    return {
      success: actions.every(a => a.result?.success !== false),
      summary: `Completed ${actions.length} actions`,
      actions
    };
  }
```

**Step 5: Verify server starts**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/base-agent.js').then(() => console.log('OK')).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK`

**Step 6: Commit**

```bash
git add backend/agents/core/base-agent.js
git commit -m "feat: rewrite base agent think/plan/observe with structured LLM prompts"
```

---

### Task 3: Update Specialized Agents — LLM-First with Rule Fallback

**Files:**
- Modify: `backend/agents/specialized/fraud-investigation-agent.js` (lines 371-438 think/plan)
- Modify: `backend/agents/specialized/seller-onboarding-agent.js` (lines 450-541 think/plan)

**Context:** Specialized agents currently override `think()` and `plan()` with hardcoded template selection. Change them to call `super.think()` / `super.plan()` (which now use LLM) and only fall back to their hardcoded templates if LLM fails. Keep `analyzeEvidence()` / `analyzeOnboardingEvidence()` as validation layers — LLM proposes, rules validate.

**Step 1: Rewrite `FraudInvestigationAgent.think()` (replace lines 372-395)**

```javascript
  // Override think — LLM-first, template fallback
  async think(input, context) {
    const { transactionId, alertType, riskScore } = input;

    this.addObservation(`Starting investigation for ${alertType || 'suspicious'} transaction ${transactionId}`);
    this.addHypothesis(
      `Transaction may be ${alertType === 'HIGH_VALUE' ? 'fraudulent due to unusual amount' : 'suspicious based on alert type'}`,
      CONFIDENCE.POSSIBLE
    );

    // Try LLM-enhanced thinking (calls base agent with structured prompts)
    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) {
      return {
        ...llmThink,
        alertType,
        riskLevel: riskScore > 70 ? 'HIGH' : riskScore > 40 ? 'MEDIUM' : 'LOW'
      };
    }

    // Fallback: template-based strategy
    const strategy = this.investigationTemplates[alertType] ||
      this.investigationTemplates.HIGH_VALUE;

    return {
      understanding: `Investigating ${alertType || 'suspicious'} transaction ${transactionId}`,
      strategy,
      riskLevel: riskScore > 70 ? 'HIGH' : riskScore > 40 ? 'MEDIUM' : 'LOW',
      relevantMemory: this.retrieveRelevantMemory(input),
      availableTools: Array.from(this.tools.keys())
    };
  }
```

**Step 2: Rewrite `FraudInvestigationAgent.plan()` (replace lines 398-438)**

```javascript
  // Override plan — LLM-first, template fallback
  async plan(analysis, context) {
    // Try LLM-enhanced planning (calls base agent)
    const llmPlan = await super.plan(analysis, context);
    if (llmPlan.llmEnhanced && llmPlan.actions.length > 0) {
      return llmPlan;
    }

    // Fallback: template-based planning
    const strategy = analysis.strategy || this.investigationTemplates.HIGH_VALUE;
    const actions = strategy.map(toolName => ({
      type: toolName,
      params: {
        transactionId: context.input?.transactionId,
        userId: context.input?.userId || context.input?.buyerId,
        deviceId: context.input?.deviceId,
        email: context.input?.email,
        ipAddress: context.input?.ipAddress
      }
    }));

    actions.push({ type: 'query_ml_model', params: { features: context.input } });
    actions.push({ type: 'search_similar_cases', params: { pattern: strategy[0] } });

    if (analysis.riskLevel === 'HIGH') {
      actions.push({
        type: 'request_rule_analysis',
        params: { transactionId: context.input?.transactionId, riskFactors: [] }
      });
    }

    return {
      goal: 'Complete investigation for transaction',
      actions,
      fallback: { type: 'escalate_to_human', reason: 'investigation_incomplete' }
    };
  }
```

**Step 3: Rewrite `SellerOnboardingAgent.think()` (replace lines 451-471)**

```javascript
  // Override think — LLM-first, strategy fallback
  async think(input, context) {
    const { sellerId, sellerData } = input;

    this.addObservation(`Starting onboarding evaluation for seller: ${sellerId || 'NEW'}`);

    // Try LLM-enhanced thinking
    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) {
      return {
        ...llmThink,
        riskIndicators: this.identifyInitialRiskIndicators(sellerData),
        strategy: this.determineInvestigationStrategy(sellerData)
      };
    }

    // Fallback: rule-based strategy
    const strategy = this.determineInvestigationStrategy(sellerData);
    this.addHypothesis(
      `Seller may require ${strategy.intensity} level verification based on initial data`,
      CONFIDENCE.POSSIBLE
    );

    return {
      understanding: 'Evaluating seller application for onboarding',
      strategy,
      riskIndicators: this.identifyInitialRiskIndicators(sellerData),
      relevantMemory: this.retrieveRelevantMemory(input),
      availableTools: Array.from(this.tools.keys())
    };
  }
```

**Step 4: Rewrite `SellerOnboardingAgent.plan()` (replace lines 474-541)**

```javascript
  // Override plan — LLM-first, rule fallback
  async plan(analysis, context) {
    // Try LLM-enhanced planning
    const llmPlan = await super.plan(analysis, context);
    if (llmPlan.llmEnhanced && llmPlan.actions.length > 0) {
      return llmPlan;
    }

    // Fallback: rule-based planning
    const actions = [];

    // Always perform basic checks
    actions.push({ type: 'verify_identity', params: context.input?.sellerData });
    actions.push({ type: 'verify_email', params: { email: context.input?.sellerData?.email } });
    actions.push({ type: 'check_duplicates', params: context.input?.sellerData });
    actions.push({ type: 'screen_watchlist', params: context.input?.sellerData });

    if (analysis.strategy.intensity === 'COMPREHENSIVE' || analysis.strategy.intensity === 'STANDARD') {
      actions.push({ type: 'verify_business', params: context.input?.sellerData });
      actions.push({ type: 'verify_bank_account', params: context.input?.sellerData });
      actions.push({ type: 'verify_address', params: context.input?.sellerData });
      actions.push({ type: 'check_fraud_databases', params: context.input?.sellerData });
      actions.push({ type: 'analyze_business_category', params: context.input?.sellerData });
    }

    if (analysis.strategy.intensity === 'COMPREHENSIVE') {
      actions.push({ type: 'check_financial_history', params: context.input?.sellerData });
      actions.push({ type: 'analyze_historical_patterns', params: context.input?.sellerData });
      if (context.input?.sellerData?.ipAddress) {
        actions.push({ type: 'check_ip_reputation', params: { ipAddress: context.input.sellerData.ipAddress } });
      }
    }

    actions.push({
      type: 'search_knowledge_base',
      params: {
        query: `onboarding ${context.input?.sellerData?.businessCategory || ''} ${context.input?.sellerData?.country || ''}`,
        namespace: 'onboarding',
        sellerId: context.input?.sellerId
      }
    });
    actions.push({
      type: 'retrieve_memory',
      params: { context: `onboarding evaluation ${context.input?.sellerData?.businessCategory || ''}` }
    });

    if (context.input?.sellerId) {
      actions.push({ type: 'query_risk_profile', params: { sellerId: context.input.sellerId } });
    }

    if (analysis.riskIndicators?.length > 2) {
      actions.push({
        type: 'request_fraud_investigation',
        params: { sellerId: context.input?.sellerId, riskFactors: analysis.riskIndicators }
      });
    }

    return {
      goal: 'Complete comprehensive seller onboarding evaluation',
      actions,
      fallback: { type: 'escalate_to_human', reason: 'incomplete_verification' }
    };
  }
```

**Step 5: Verify both agents load**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "Promise.all([import('./agents/specialized/fraud-investigation-agent.js'), import('./agents/specialized/seller-onboarding-agent.js')]).then(() => console.log('OK')).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK`

**Step 6: Commit**

```bash
git add backend/agents/specialized/fraud-investigation-agent.js backend/agents/specialized/seller-onboarding-agent.js
git commit -m "feat: update specialized agents to LLM-first with rule fallback"
```

---

## Layer 2: Active Memory Integration

### Task 4: Wire Short-Term Memory into think() and Pattern Memory into Prompts

**Files:**
- Modify: `backend/agents/core/base-agent.js` (lines ~120-133 in `reason()`)

**Context:** Short-term memory is already being read in the new `think()` from Task 2 (`this.memoryStore.getShortTerm()`). Pattern matches are also already gathered. This task ensures the `reason()` method passes pattern matches to `think()` context (so the LLM sees them), and that pattern match results flow through properly. Currently `checkPatterns()` runs at line ~123 in `reason()` AFTER `think()` — we need to move it before `think()`.

**Step 1: Move pattern checking before think() in `reason()`**

In `base-agent.js`, in the `reason()` method, move the pattern check block (currently after think, around lines 123-132) to BEFORE the think call (before line 120). The new order should be:

```javascript
      // Step 1: Check pattern memory for similar cases (MOVED BEFORE THINK)
      const patternMatches = this.checkPatterns(input);
      if (patternMatches.matches.length > 0) {
        this.currentChain.recordEvidence(
          `Found ${patternMatches.matches.length} similar patterns in memory`,
          [], [], 0.8
        );
        thought.patternMatches = patternMatches;
      }

      // Step 2: THINK - Analyze the situation (now has pattern matches available)
      this.currentChain.observe('Received input for analysis', input);
      context._patternMatches = patternMatches;
      thought.reasoning.push(await this.think(input, context));

      // Step 3: PLAN - Determine actions needed
      const plan = await this.plan(thought.reasoning[0], context);
```

Note: Remove the old pattern check block that was between think and plan.

**Step 2: Verify server starts**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/base-agent.js').then(() => console.log('OK')).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/agents/core/base-agent.js
git commit -m "feat: move pattern checking before think() so LLM sees pattern matches"
```

---

### Task 5: Upgrade Memory Consolidation — Pattern Memory to Long-Term

**Files:**
- Modify: `backend/agents/core/memory-store.js` (add new method after `consolidate()`)

**Context:** Current consolidation only promotes repeated short-term patterns to long-term. Add a new method `consolidatePatterns()` that takes pattern memory data and promotes high-confidence patterns (>10 occurrences, >70% success rate) to long-term memory as "validated institutional knowledge."

**Step 1: Add `consolidatePatterns()` to `MemoryStore`**

Add after the existing `consolidate()` method (after line 283):

```javascript
  /**
   * Consolidate high-confidence patterns from pattern memory into long-term memory.
   * Patterns with > 10 occurrences and > 70% success rate become "validated knowledge."
   * @param {string} agentId - The agent ID
   * @param {Array} patterns - Array of pattern objects from patternMemory.getTopPatterns()
   * @returns {number} Number of patterns consolidated
   */
  consolidatePatterns(agentId, patterns) {
    if (!patterns || patterns.length === 0) return 0;

    let consolidated = 0;

    for (const pattern of patterns) {
      if (pattern.occurrences >= 10 && pattern.successRate >= 0.7) {
        // Check if we already consolidated this pattern
        const existing = this.queryLongTerm(agentId, pattern.patternId, 1);
        if (existing.length > 0 && JSON.stringify(existing[0]).includes(pattern.patternId)) {
          continue; // Already consolidated
        }

        this.saveLongTerm(agentId, 'validated_knowledge', {
          patternId: pattern.patternId,
          type: pattern.type,
          outcome: pattern.outcome,
          occurrences: pattern.occurrences,
          successRate: pattern.successRate,
          confidence: pattern.confidence,
          features: pattern.features,
          consolidatedAt: new Date().toISOString(),
          description: `Validated pattern: ${pattern.type} → ${pattern.outcome} (${(pattern.successRate * 100).toFixed(0)}% success over ${pattern.occurrences} cases)`
        }, Math.min(0.5 + (pattern.successRate * 0.3), 0.95));

        consolidated++;
        this.stats.consolidations++;
      }
    }

    return consolidated;
  }
```

**Step 2: Verify module loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/memory-store.js').then(m => { const ms = m.getMemoryStore(); console.log('OK, has consolidatePatterns:', typeof ms.consolidatePatterns); }).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK, has consolidatePatterns: function`

**Step 3: Commit**

```bash
git add backend/agents/core/memory-store.js
git commit -m "feat: add pattern-to-long-term memory consolidation"
```

---

### Task 6: Save Structured Insights to Long-Term Memory After Decisions

**Files:**
- Modify: `backend/agents/core/base-agent.js` (the `updateMemory()` method and `learnFromResult()`)

**Context:** Currently `updateMemory()` only saves to short-term memory. Enhance it to also save a structured insight to long-term memory after every decision. Importance score based on how unusual the case was. Also run pattern consolidation periodically.

**Step 1: Enhance `updateMemory()` in `base-agent.js`**

Replace the `updateMemory()` method (lines ~311-334):

```javascript
  // Memory management — enhanced with long-term insights
  updateMemory(thought) {
    // Add to short-term memory
    this.memory.shortTerm.push({
      timestamp: thought.timestamp,
      summary: thought.result?.summary || 'Action completed',
      key_facts: this.extractKeyFacts(thought)
    });

    // Trim short-term memory if needed
    if (this.memory.shortTerm.length > this.maxMemorySize) {
      const removed = this.memory.shortTerm.shift();
      this.consolidateToLongTerm(removed);
    }

    // Persist to short-term memory store
    this.memoryStore.saveShortTerm(this.agentId, this.sessionId, {
      timestamp: thought.timestamp,
      type: thought.actions?.[0]?.action?.type || 'reasoning',
      summary: thought.result?.summary || 'Action completed',
      key_facts: this.extractKeyFacts(thought),
      success: thought.result?.success
    });

    // Save structured insight to long-term memory
    const decision = thought.result?.recommendation?.action || thought.result?.decision;
    if (decision) {
      const riskScore = thought.result?.overallRisk?.score || thought.result?.riskScore || 0;
      const isUnusual = (decision === 'APPROVE' && riskScore > 50) || (decision === 'REJECT' && riskScore < 30);
      const importance = isUnusual ? 0.8 : (riskScore > 70 ? 0.6 : 0.4);

      this.memoryStore.saveLongTerm(this.agentId, 'insight', {
        decision,
        riskScore,
        summary: thought.result?.summary || '',
        actionCount: thought.actions?.length || 0,
        wasUnusual: isUnusual,
        timestamp: thought.timestamp
      }, importance);
    }

    // Periodically consolidate pattern memory (every 20 decisions)
    if (this.thoughtLog.length % 20 === 0 && this.thoughtLog.length > 0) {
      const topPatterns = this.patternMemory.getTopPatterns(50);
      this.memoryStore.consolidatePatterns(this.agentId, topPatterns);
    }
  }
```

**Step 2: Verify server starts**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/base-agent.js').then(() => console.log('OK')).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/agents/core/base-agent.js
git commit -m "feat: save structured insights to long-term memory after decisions"
```

---

## Layer 3: Knowledge Base + Vector Search in Reasoning

### Task 7: Dual Retrieval in Agent-Level think()

**Files:**
- Modify: `backend/agents/core/base-agent.js` (the `think()` method)

**Context:** The context engine already does dual retrieval (Pinecone + TF-IDF) at the prompt assembly level. Now add agent-level targeted retrieval during `think()`. This is more focused — the agent queries specifically for the decision it's making, not broadly for the prompt budget.

**Step 1: Add `getKnowledgeBase` import to base-agent.js**

At the top of `base-agent.js`, add after the existing imports:

```javascript
import { getKnowledgeBase } from './knowledge-base.js';
```

**Step 2: Add a `dualRetrieve()` helper method to BaseAgent**

Add this new method after `retrieveRelevantMemory()`:

```javascript
  /**
   * Dual retrieval: Pinecone vector search + TF-IDF knowledge base.
   * Returns merged, deduplicated results with source tags.
   */
  async dualRetrieve(query, domain) {
    const results = [];

    // Map domain to namespace
    const domainToNamespace = {
      'onboarding': 'onboarding-knowledge',
      'transaction': 'fraud-cases',
      'transactions': 'fraud-cases',
      'fraud': 'fraud-cases',
      'risk': 'risk-patterns'
    };
    const vectorNamespace = domainToNamespace[domain] || 'fraud-cases';
    const tfidfNamespace = {
      'onboarding': 'onboarding',
      'transaction': 'transactions',
      'transactions': 'transactions',
      'fraud': 'transactions',
      'risk': 'risk-events'
    }[domain] || 'transactions';

    // 1. Try Pinecone vector search
    const evalServiceUrl = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
    try {
      const response = await fetch(`${evalServiceUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, namespace: vectorNamespace, top_k: 5 }),
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        const data = await response.json();
        for (const r of (data.results || [])) {
          results.push({
            text: r.text,
            _score: r.score,
            _source: 'vector',
            ...r.metadata
          });
        }
      }
    } catch (e) {
      // Vector search unavailable
    }

    // 2. TF-IDF knowledge base search
    try {
      const knowledgeBase = getKnowledgeBase();
      const tfidfResults = knowledgeBase.searchKnowledge(tfidfNamespace, query, {}, 5);
      for (const r of tfidfResults) {
        // Deduplicate: skip if similar text already in results
        const isDuplicate = results.some(existing =>
          existing.text && r.text && existing.text.slice(0, 80) === r.text.slice(0, 80)
        );
        if (!isDuplicate) {
          results.push({ ...r, _source: 'tfidf' });
        }
      }
    } catch (e) {
      // TF-IDF search failed
    }

    // Sort by score descending, take top 5
    return results
      .sort((a, b) => (b._score || 0) - (a._score || 0))
      .slice(0, 5);
  }
```

**Step 3: Update `think()` to use `dualRetrieve()`**

In the `think()` method, replace the knowledge retrieval section (the try/catch block that queries long-term memory) with:

```javascript
    // Try dual retrieval (vector + TF-IDF)
    const queryText = typeof input === 'string' ? input : JSON.stringify(input).slice(0, 200);
    const domain = input?.domain || context?.domain || 'fraud';
    let knowledgeResults = [];
    try {
      knowledgeResults = await this.dualRetrieve(queryText, domain);
    } catch (e) {
      // Knowledge retrieval failed, proceed without it
    }
```

**Step 4: Verify module loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/base-agent.js').then(() => console.log('OK')).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK`

**Step 5: Commit**

```bash
git add backend/agents/core/base-agent.js
git commit -m "feat: add dual retrieval (vector + TF-IDF) in agent-level think()"
```

---

### Task 8: Knowledge Write-Back After Decisions

**Files:**
- Modify: `backend/agents/core/base-agent.js` (the `updateMemory()` method or a new method called from `reason()`)

**Context:** After `observe()` completes, the agent should write the decision back to both the local knowledge base AND Pinecone (via eval service `/ingest`). This ensures future agents can find this case via search.

**Step 1: Add `writeBackKnowledge()` method to BaseAgent**

Add this method after `dualRetrieve()`:

```javascript
  /**
   * Write decision back to knowledge base and Pinecone.
   * Called after observe() in the reason() loop.
   */
  async writeBackKnowledge(input, result) {
    const decision = result?.recommendation?.action || result?.decision;
    if (!decision) return;

    const domain = input?.domain || 'transactions';
    const namespace = {
      'onboarding': 'onboarding',
      'transaction': 'transactions',
      'transactions': 'transactions',
      'fraud': 'transactions',
      'risk': 'risk-events'
    }[domain] || 'decisions';

    const text = `Decision: ${decision}. ${result?.summary || ''}. Risk: ${result?.riskScore || result?.overallRisk?.score || 'unknown'}.`;
    const knowledgeEntry = {
      text,
      category: domain,
      sellerId: input?.sellerId || null,
      domain,
      outcome: decision === 'APPROVE' ? 'legitimate' : decision === 'REJECT' || decision === 'BLOCK' ? 'fraud' : 'pending',
      riskScore: result?.riskScore || result?.overallRisk?.score || null,
      source: this.agentId,
      timestamp: new Date().toISOString()
    };

    // Write to local knowledge base
    try {
      const knowledgeBase = getKnowledgeBase();
      knowledgeBase.addKnowledge(namespace, [knowledgeEntry]);
    } catch (e) {
      // Local KB write failed — not critical
    }

    // Write to Pinecone via eval service
    const evalServiceUrl = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
    try {
      const vectorNamespace = {
        'onboarding': 'onboarding-knowledge',
        'transactions': 'fraud-cases',
        'risk-events': 'risk-patterns'
      }[namespace] || 'fraud-cases';

      await fetch(`${evalServiceUrl}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namespace: vectorNamespace,
          records: [{ id: `decision-${Date.now()}`, text, ...knowledgeEntry }]
        }),
        signal: AbortSignal.timeout(5000)
      });
    } catch (e) {
      // Pinecone ingest failed — not critical
    }
  }
```

**Step 2: Call `writeBackKnowledge()` from `reason()` after observe**

In the `reason()` method, after the `observe()` call and before `updateMemory()`, add:

```javascript
      // Step 5.5: Write decision back to knowledge base
      await this.writeBackKnowledge(input, thought.result);
```

**Step 3: Verify module loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/base-agent.js').then(() => console.log('OK')).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK`

**Step 4: Commit**

```bash
git add backend/agents/core/base-agent.js
git commit -m "feat: write decisions back to knowledge base and Pinecone"
```

---

### Task 9: Query Decomposer + Advanced RAG Endpoint

**Files:**
- Create: `backend/evaluation/services/query_decomposer.py`
- Modify: `backend/evaluation/routers/search.py` (add `/search/advanced` endpoint)

**Context:** For complex investigation queries, break them into sub-queries, search multiple namespaces, and rerank. This uses Claude to decompose queries.

**Step 1: Create `query_decomposer.py`**

```python
"""Query Decomposer — breaks complex queries into sub-queries using Claude."""

import os
from anthropic import Anthropic

_client = None


def _get_client():
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return None
        _client = Anthropic(api_key=api_key)
    return _client


def decompose_query(query: str, max_sub_queries: int = 3) -> list[str]:
    """Decompose a complex query into simpler sub-queries using Claude.

    Falls back to returning the original query if Claude is unavailable.
    """
    client = _get_client()
    if client is None:
        return [query]

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=512,
            temperature=0.2,
            system=(
                "You decompose complex fraud investigation queries into simpler sub-queries. "
                "Return a JSON array of strings, each a focused sub-query. "
                f"Maximum {max_sub_queries} sub-queries. "
                "Return ONLY the JSON array, no explanation."
            ),
            messages=[{"role": "user", "content": f"Decompose this query: {query}"}],
        )
        import json

        text = response.content[0].text.strip()
        parsed = json.loads(text)
        if isinstance(parsed, list) and len(parsed) > 0:
            return parsed[:max_sub_queries]
    except Exception:
        pass

    return [query]
```

**Step 2: Add `/search/advanced` endpoint to `search.py`**

Add at the end of `backend/evaluation/routers/search.py`:

```python
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
```

**Step 3: Verify imports**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/evaluation && python -c "from services.query_decomposer import decompose_query; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add backend/evaluation/services/query_decomposer.py backend/evaluation/routers/search.py
git commit -m "feat: add query decomposer and advanced RAG search endpoint"
```

---

## Layer 4: Feedback & Adaptive Learning

### Task 10: Create Outcome Simulator

**Files:**
- Create: `backend/agents/core/outcome-simulator.js`

**Context:** After every agent decision, the outcome simulator generates a probabilistic simulated outcome (delayed by 0-5 seconds). Outcomes are weighted by decision quality. Emits `agent:outcome:received` event.

**Step 1: Create `outcome-simulator.js`**

```javascript
/**
 * Outcome Simulator — Generates simulated outcomes for agent decisions.
 *
 * After every agent decision, schedules a simulated outcome with probabilistic
 * weighting based on decision quality. Emits 'agent:outcome:received' events
 * for the feedback pipeline to process.
 */

let eventBus = null;
try {
  const module = await import('../../gateway/websocket/event-bus.js');
  eventBus = module.getEventBus();
} catch (e) {
  // Event bus not available
}

const OUTCOME_TYPES = {
  CONFIRMED_FRAUD: 'confirmed_fraud',
  LEGITIMATE: 'legitimate',
  FALSE_POSITIVE: 'false_positive',
  FALSE_NEGATIVE: 'false_negative',
  INCONCLUSIVE: 'inconclusive'
};

class OutcomeSimulator {
  constructor() {
    this.pendingOutcomes = new Map();
    this.stats = {
      totalSimulated: 0,
      outcomes: {
        confirmed_fraud: 0,
        legitimate: 0,
        false_positive: 0,
        false_negative: 0,
        inconclusive: 0
      }
    };
    console.log('[OutcomeSimulator] Initialized');
  }

  /**
   * Schedule a simulated outcome for a decision.
   * @param {Object} decision - { agentId, decisionId, action, riskScore, confidence, evidence }
   */
  scheduleOutcome(decision) {
    const { agentId, decisionId, action, riskScore = 50, confidence = 0.5 } = decision;

    const delayMs = Math.floor(Math.random() * 5000); // 0-5 seconds
    const outcome = this._generateOutcome(action, riskScore, confidence);

    const timeoutId = setTimeout(() => {
      this._emitOutcome(agentId, decisionId, decision, outcome);
      this.pendingOutcomes.delete(decisionId);
    }, delayMs);

    this.pendingOutcomes.set(decisionId, { timeoutId, decision, outcome });
    return { decisionId, scheduledOutcome: outcome, delayMs };
  }

  /**
   * Generate a probabilistic outcome based on decision quality.
   */
  _generateOutcome(action, riskScore, confidence) {
    const roll = Math.random();

    if (action === 'REJECT' || action === 'BLOCK') {
      if (riskScore > 80) {
        // High risk + reject: likely correct
        return roll < 0.85 ? OUTCOME_TYPES.CONFIRMED_FRAUD : OUTCOME_TYPES.FALSE_POSITIVE;
      } else if (riskScore > 50) {
        return roll < 0.65 ? OUTCOME_TYPES.CONFIRMED_FRAUD : (roll < 0.85 ? OUTCOME_TYPES.FALSE_POSITIVE : OUTCOME_TYPES.INCONCLUSIVE);
      } else {
        // Low risk + reject: likely false positive
        return roll < 0.30 ? OUTCOME_TYPES.CONFIRMED_FRAUD : OUTCOME_TYPES.FALSE_POSITIVE;
      }
    }

    if (action === 'APPROVE') {
      if (riskScore < 30) {
        // Low risk + approve: likely correct
        return roll < 0.90 ? OUTCOME_TYPES.LEGITIMATE : OUTCOME_TYPES.FALSE_NEGATIVE;
      } else if (riskScore < 60) {
        return roll < 0.70 ? OUTCOME_TYPES.LEGITIMATE : (roll < 0.85 ? OUTCOME_TYPES.FALSE_NEGATIVE : OUTCOME_TYPES.INCONCLUSIVE);
      } else {
        // High risk + approve: dangerous — higher false negative rate
        return roll < 0.40 ? OUTCOME_TYPES.LEGITIMATE : OUTCOME_TYPES.FALSE_NEGATIVE;
      }
    }

    if (action === 'REVIEW' || action === 'MONITOR') {
      // Genuine uncertainty
      if (roll < 0.40) return OUTCOME_TYPES.LEGITIMATE;
      if (roll < 0.75) return OUTCOME_TYPES.CONFIRMED_FRAUD;
      return OUTCOME_TYPES.INCONCLUSIVE;
    }

    return OUTCOME_TYPES.INCONCLUSIVE;
  }

  /**
   * Emit the outcome event.
   */
  _emitOutcome(agentId, decisionId, originalDecision, outcome) {
    this.stats.totalSimulated++;
    this.stats.outcomes[outcome] = (this.stats.outcomes[outcome] || 0) + 1;

    const wasCorrect = this._evaluateCorrectness(originalDecision.action, outcome);

    const payload = {
      agentId,
      decisionId,
      originalDecision: {
        action: originalDecision.action,
        riskScore: originalDecision.riskScore,
        confidence: originalDecision.confidence
      },
      outcome,
      wasCorrect,
      timestamp: new Date().toISOString()
    };

    if (eventBus) {
      eventBus.publish('agent:outcome:received', payload);
    }

    return payload;
  }

  /**
   * Determine if the decision was correct given the outcome.
   */
  _evaluateCorrectness(action, outcome) {
    if ((action === 'REJECT' || action === 'BLOCK') && outcome === OUTCOME_TYPES.CONFIRMED_FRAUD) return true;
    if (action === 'APPROVE' && outcome === OUTCOME_TYPES.LEGITIMATE) return true;
    if ((action === 'REJECT' || action === 'BLOCK') && outcome === OUTCOME_TYPES.FALSE_POSITIVE) return false;
    if (action === 'APPROVE' && outcome === OUTCOME_TYPES.FALSE_NEGATIVE) return false;
    return null; // Inconclusive or REVIEW
  }

  getStats() {
    return {
      ...this.stats,
      pendingOutcomes: this.pendingOutcomes.size
    };
  }

  /**
   * Cancel all pending outcomes (for cleanup/testing).
   */
  cancelAll() {
    for (const [, entry] of this.pendingOutcomes) {
      clearTimeout(entry.timeoutId);
    }
    this.pendingOutcomes.clear();
  }
}

// Singleton
let instance = null;

export function getOutcomeSimulator() {
  if (!instance) {
    instance = new OutcomeSimulator();
  }
  return instance;
}

export { OUTCOME_TYPES };
export default { getOutcomeSimulator, OUTCOME_TYPES };
```

**Step 2: Verify module loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/outcome-simulator.js').then(m => { const os = m.getOutcomeSimulator(); console.log('OK, stats:', JSON.stringify(os.getStats())); }).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK, stats: {"totalSimulated":0,...}`

**Step 3: Commit**

```bash
git add backend/agents/core/outcome-simulator.js
git commit -m "feat: add outcome simulator for decision feedback loop"
```

---

### Task 11: Create Threshold Manager

**Files:**
- Create: `backend/agents/core/threshold-manager.js`

**Context:** Tracks rolling window of false positive/negative rates per agent. Dynamically adjusts risk thresholds. Persists to SQLite.

**Step 1: Create `threshold-manager.js`**

```javascript
/**
 * Threshold Manager — Adaptive risk thresholds based on agent accuracy.
 *
 * Tracks rolling window (last 100 decisions) of false positive rate and
 * false negative rate per agent. Adjusts risk thresholds dynamically.
 * Persists to SQLite.
 */

import { db_ops } from '../../shared/common/database.js';

const WINDOW_SIZE = 100;
const MAX_ADJUSTMENT = 15; // Max +/- from baseline

const BASELINE_THRESHOLDS = {
  AUTO_APPROVE_MAX_RISK: 30,
  AUTO_REJECT_MIN_RISK: 80,
  ESCALATE_MIN_RISK: 60
};

class ThresholdManager {
  constructor() {
    this.agentWindows = new Map(); // agentId → circular buffer of outcomes
    this.thresholds = new Map();   // agentId → current thresholds
    this.adjustmentLog = [];

    // Load persisted thresholds
    this._loadFromDB();

    console.log('[ThresholdManager] Initialized');
  }

  /**
   * Record a decision outcome for threshold adjustment.
   * @param {string} agentId
   * @param {string} action - The agent's decision (APPROVE, REJECT, REVIEW)
   * @param {string} outcome - The actual outcome (confirmed_fraud, legitimate, etc.)
   * @param {number} riskScore - The risk score at decision time
   */
  recordOutcome(agentId, action, outcome, riskScore) {
    if (!this.agentWindows.has(agentId)) {
      this.agentWindows.set(agentId, []);
    }

    const window = this.agentWindows.get(agentId);
    window.push({ action, outcome, riskScore, timestamp: Date.now() });

    // Keep window at WINDOW_SIZE
    while (window.length > WINDOW_SIZE) {
      window.shift();
    }

    // Recalculate thresholds
    this._adjustThresholds(agentId);
  }

  /**
   * Get current thresholds for an agent.
   * @param {string} agentId
   * @returns {Object} { AUTO_APPROVE_MAX_RISK, AUTO_REJECT_MIN_RISK, ESCALATE_MIN_RISK }
   */
  getThresholds(agentId) {
    if (this.thresholds.has(agentId)) {
      return { ...this.thresholds.get(agentId) };
    }
    return { ...BASELINE_THRESHOLDS };
  }

  /**
   * Adjust thresholds based on rolling accuracy.
   */
  _adjustThresholds(agentId) {
    const window = this.agentWindows.get(agentId);
    if (!window || window.length < 10) return; // Need at least 10 decisions

    // Calculate false positive rate (rejected legitimate)
    const rejects = window.filter(w => w.action === 'REJECT' || w.action === 'BLOCK');
    const falsePositives = rejects.filter(w => w.outcome === 'false_positive' || w.outcome === 'legitimate');
    const fpRate = rejects.length > 0 ? falsePositives.length / rejects.length : 0;

    // Calculate false negative rate (approved fraud)
    const approvals = window.filter(w => w.action === 'APPROVE');
    const falseNegatives = approvals.filter(w => w.outcome === 'false_negative' || w.outcome === 'confirmed_fraud');
    const fnRate = approvals.length > 0 ? falseNegatives.length / approvals.length : 0;

    const current = this.getThresholds(agentId);
    let adjusted = false;

    // If false negative rate > 15% → lower auto-approve threshold (more cautious)
    if (fnRate > 0.15) {
      const reduction = Math.min(Math.round(fnRate * 20), MAX_ADJUSTMENT);
      current.AUTO_APPROVE_MAX_RISK = Math.max(
        BASELINE_THRESHOLDS.AUTO_APPROVE_MAX_RISK - MAX_ADJUSTMENT,
        BASELINE_THRESHOLDS.AUTO_APPROVE_MAX_RISK - reduction
      );
      adjusted = true;
    }

    // If false positive rate > 25% → raise auto-reject threshold (less aggressive)
    if (fpRate > 0.25) {
      const increase = Math.min(Math.round(fpRate * 20), MAX_ADJUSTMENT);
      current.AUTO_REJECT_MIN_RISK = Math.min(
        BASELINE_THRESHOLDS.AUTO_REJECT_MIN_RISK + MAX_ADJUSTMENT,
        BASELINE_THRESHOLDS.AUTO_REJECT_MIN_RISK + increase
      );
      adjusted = true;
    }

    // Adjust escalation threshold to stay between approve and reject
    current.ESCALATE_MIN_RISK = Math.round(
      (current.AUTO_APPROVE_MAX_RISK + current.AUTO_REJECT_MIN_RISK) / 2
    );

    if (adjusted) {
      this.thresholds.set(agentId, current);
      this._persistToDB(agentId, current);

      this.adjustmentLog.push({
        agentId,
        fpRate: fpRate.toFixed(3),
        fnRate: fnRate.toFixed(3),
        newThresholds: { ...current },
        windowSize: window.length,
        timestamp: new Date().toISOString()
      });

      // Keep log manageable
      if (this.adjustmentLog.length > 200) {
        this.adjustmentLog = this.adjustmentLog.slice(-100);
      }
    }
  }

  _persistToDB(agentId, thresholds) {
    try {
      db_ops.upsert('agent_thresholds', 'agent_id', agentId, {
        agentId,
        thresholds,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      // DB persistence failed — thresholds still in memory
    }
  }

  _loadFromDB() {
    try {
      const records = db_ops.getAll('agent_thresholds', 100, 0);
      for (const record of records) {
        const data = record.data;
        if (data?.agentId && data?.thresholds) {
          this.thresholds.set(data.agentId, data.thresholds);
        }
      }
    } catch (e) {
      // DB load failed — use defaults
    }
  }

  getStats() {
    const agentStats = {};
    for (const [agentId, window] of this.agentWindows) {
      agentStats[agentId] = {
        windowSize: window.length,
        thresholds: this.getThresholds(agentId)
      };
    }
    return {
      agents: agentStats,
      recentAdjustments: this.adjustmentLog.slice(-5),
      baselineThresholds: BASELINE_THRESHOLDS
    };
  }
}

// Singleton
let instance = null;

export function getThresholdManager() {
  if (!instance) {
    instance = new ThresholdManager();
  }
  return instance;
}

export { BASELINE_THRESHOLDS };
export default { getThresholdManager, BASELINE_THRESHOLDS };
```

**Step 2: Verify module loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/threshold-manager.js').then(m => { const tm = m.getThresholdManager(); console.log('OK, stats:', JSON.stringify(tm.getStats())); }).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK, stats: {"agents":{},...}`

**Step 3: Commit**

```bash
git add backend/agents/core/threshold-manager.js
git commit -m "feat: add adaptive threshold manager for dynamic risk adjustments"
```

---

### Task 12: Wire Feedback Pipeline in Base Agent

**Files:**
- Modify: `backend/agents/core/base-agent.js` (imports, constructor, new feedback handler, reason() method)

**Context:** Connect the outcome simulator and threshold manager into the base agent. After every decision: schedule a simulated outcome. When outcome arrives: update pattern memory feedback, save to long-term memory, write back to knowledge base.

**Step 1: Add imports for outcome simulator and threshold manager**

At the top of `base-agent.js`, add after the prompt-templates import:

```javascript
import { getOutcomeSimulator } from './outcome-simulator.js';
import { getThresholdManager } from './threshold-manager.js';
```

**Step 2: Add to constructor**

In the `BaseAgent` constructor, after `this.llmClient = getLLMClient();` (line ~60), add:

```javascript
    this.outcomeSimulator = getOutcomeSimulator();
    this.thresholdManager = getThresholdManager();
```

**Step 3: Add feedback handler method**

Add this new method after `writeBackKnowledge()`:

```javascript
  /**
   * Handle outcome feedback — update patterns, memory, and knowledge base.
   * Called when agent:outcome:received event fires for this agent's decision.
   */
  handleOutcomeFeedback(payload) {
    const { decisionId, originalDecision, outcome, wasCorrect } = payload;

    // 1. Update pattern memory feedback (provideFeedback finally gets called!)
    if (this.memory.working._lastPatternIds) {
      for (const patternId of this.memory.working._lastPatternIds) {
        this.patternMemory.provideFeedback(patternId, outcome, wasCorrect === true);
      }
    }

    // 2. Record outcome in threshold manager
    this.thresholdManager.recordOutcome(
      this.agentId,
      originalDecision.action,
      outcome,
      originalDecision.riskScore
    );

    // 3. Save outcome to long-term memory
    const importance = wasCorrect === false ? 0.8 : 0.5;
    const type = wasCorrect === false ? 'correction' : 'insight';
    this.memoryStore.saveLongTerm(this.agentId, type, {
      decisionId,
      originalAction: originalDecision.action,
      originalRiskScore: originalDecision.riskScore,
      outcome,
      wasCorrect,
      lesson: wasCorrect === false
        ? `Decision ${originalDecision.action} at risk ${originalDecision.riskScore} was WRONG (outcome: ${outcome})`
        : `Decision ${originalDecision.action} at risk ${originalDecision.riskScore} was correct (outcome: ${outcome})`,
      timestamp: new Date().toISOString()
    }, importance);

    // 4. Emit feedback event
    this.emitEvent('agent:feedback:processed', {
      agentId: this.agentId,
      decisionId,
      outcome,
      wasCorrect
    });
  }
```

**Step 4: Schedule outcome after decision in reason()**

In the `reason()` method, after `this.learnFromResult(input, thought.result);` and before the emit thought event, add:

```javascript
      // Step 7.5: Schedule simulated outcome for feedback loop
      const decision = thought.result?.recommendation?.action || thought.result?.decision;
      if (decision) {
        const decisionId = `DEC-${this.agentId}-${Date.now().toString(36)}`;
        this.outcomeSimulator.scheduleOutcome({
          agentId: this.agentId,
          decisionId,
          action: decision,
          riskScore: thought.result?.riskScore || thought.result?.overallRisk?.score || 50,
          confidence: thought.result?.confidence || 0.5
        });

        // Save pattern IDs for feedback later
        if (thought.patternMatches?.matches?.length > 0) {
          this.memory.working._lastPatternIds = thought.patternMatches.matches.map(m => m.patternId);
        }
      }
```

**Step 5: Register event listener in constructor**

In the constructor, after `this.thresholdManager = getThresholdManager();`, add:

```javascript
    // Listen for outcome feedback events
    if (eventBus) {
      eventBus.subscribe('agent:outcome:received', (payload) => {
        if (payload.agentId === this.agentId) {
          this.handleOutcomeFeedback(payload);
        }
      });
    }
```

**Step 6: Verify module loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/base-agent.js').then(() => console.log('OK')).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK`

**Step 7: Commit**

```bash
git add backend/agents/core/base-agent.js
git commit -m "feat: wire feedback pipeline — outcome simulator, threshold manager, pattern feedback"
```

---

### Task 13: Connect Specialized Agents to Threshold Manager

**Files:**
- Modify: `backend/agents/specialized/seller-onboarding-agent.js` (replace hardcoded thresholds)

**Context:** The seller onboarding agent has hardcoded `autonomyThresholds`. Replace with dynamic thresholds from the threshold manager.

**Step 1: Add threshold manager import**

At the top of `seller-onboarding-agent.js`, add:

```javascript
import { getThresholdManager } from '../core/threshold-manager.js';
```

**Step 2: Replace hardcoded thresholds in constructor**

In the constructor (around line 66-71), replace:

```javascript
    // Autonomy thresholds
    this.autonomyThresholds = {
      AUTO_APPROVE_MAX_RISK: 30,
      AUTO_REJECT_MIN_RISK: 80,
      ESCALATE_MIN_RISK: 60
    };
```

With:

```javascript
    // Dynamic autonomy thresholds from threshold manager
    this._thresholdManager = getThresholdManager();
```

**Step 3: Add getter for dynamic thresholds**

Add a getter property after the constructor:

```javascript
  get autonomyThresholds() {
    return this._thresholdManager.getThresholds(this.agentId);
  }
```

**Step 4: Update `generateOnboardingDecision()` to use dynamic thresholds**

In `generateOnboardingDecision()` (around line 825), replace:

```javascript
    if (risk.score >= this.riskThresholds.REJECT.min || risk.criticalFactors > 0) {
```

With:

```javascript
    const thresholds = this.autonomyThresholds;
    if (risk.score >= thresholds.AUTO_REJECT_MIN_RISK || risk.criticalFactors > 0) {
```

And replace the `REVIEW` threshold check:

```javascript
    } else if (risk.score >= this.riskThresholds.REVIEW.min) {
```

With:

```javascript
    } else if (risk.score >= thresholds.AUTO_APPROVE_MAX_RISK) {
```

**Step 5: Verify agent loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/specialized/seller-onboarding-agent.js').then(() => console.log('OK')).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK`

**Step 6: Commit**

```bash
git add backend/agents/specialized/seller-onboarding-agent.js
git commit -m "feat: connect seller onboarding agent to adaptive threshold manager"
```

---

## Layer 5: Policy Engine & Guardrails

### Task 14: Create Policy Engine

**Files:**
- Create: `backend/agents/core/policy-engine.js`

**Context:** Policy engine wraps every agent decision. Hard policies block, soft policies flag. Includes LLM behavior guardrails.

**Step 1: Create `policy-engine.js`**

```javascript
/**
 * Policy Engine — Enforces hard and soft policies on agent decisions.
 *
 * Hard policies: block the decision and escalate to human.
 * Soft policies: flag the decision but allow it to proceed.
 * Guardrails: safety limits on LLM behavior.
 */

let eventBus = null;
try {
  const module = await import('../../gateway/websocket/event-bus.js');
  eventBus = module.getEventBus();
} catch (e) {
  // Event bus not available
}

const POLICY_TYPES = { HARD: 'hard', SOFT: 'soft' };
const ACTIONS = { BLOCK: 'block', ESCALATE: 'escalate', FLAG: 'flag', LOG: 'log' };

// Default policy set
const DEFAULT_POLICIES = [
  // ========== HARD POLICIES ==========
  {
    policyId: 'POL-001',
    name: 'sanctions-hard-block',
    type: POLICY_TYPES.HARD,
    action: ACTIONS.BLOCK,
    message: 'Cannot approve: sanctions/watchlist match detected',
    condition: (decision, evidence) => {
      if (decision.action !== 'APPROVE') return false;
      return evidence.some(e =>
        e.source === 'screen_watchlist' && e.data &&
        (e.data.sanctionsMatch || e.data.pepMatch || e.data.watchlistMatch)
      );
    }
  },
  {
    policyId: 'POL-002',
    name: 'kyc-failure-block',
    type: POLICY_TYPES.HARD,
    action: ACTIONS.BLOCK,
    message: 'Cannot approve: KYC verification failed',
    condition: (decision, evidence) => {
      if (decision.action !== 'APPROVE') return false;
      return evidence.some(e =>
        e.source === 'verify_identity' && e.data && !e.data.verified
      );
    }
  },
  {
    policyId: 'POL-003',
    name: 'duplicate-fraud-block',
    type: POLICY_TYPES.HARD,
    action: ACTIONS.BLOCK,
    message: 'Cannot approve: duplicate account with prior fraud detected',
    condition: (decision, evidence) => {
      if (decision.action !== 'APPROVE') return false;
      return evidence.some(e =>
        e.source === 'check_duplicates' && e.data?.isDuplicate &&
        e.data.duplicates?.some(d => d.riskTier === 'CRITICAL' || d.status === 'BLOCKED')
      );
    }
  },
  {
    policyId: 'POL-004',
    name: 'low-confidence-escalate',
    type: POLICY_TYPES.HARD,
    action: ACTIONS.ESCALATE,
    message: 'LLM confidence too low — escalating to human',
    condition: (decision) => {
      return decision.confidence !== undefined && decision.confidence < 0.3;
    }
  },
  {
    policyId: 'POL-005',
    name: 'high-risk-approve-block',
    type: POLICY_TYPES.HARD,
    action: ACTIONS.BLOCK,
    message: 'Cannot auto-approve: risk score exceeds threshold',
    condition: (decision, evidence, context) => {
      if (decision.action !== 'APPROVE') return false;
      const riskScore = context.riskScore || 0;
      const threshold = context.thresholds?.AUTO_REJECT_MIN_RISK || 80;
      return riskScore > threshold;
    }
  },

  // ========== SOFT POLICIES ==========
  {
    policyId: 'POL-101',
    name: 'pattern-override-flag',
    type: POLICY_TYPES.SOFT,
    action: ACTIONS.FLAG,
    message: 'Agent overrides pattern memory recommendation',
    condition: (decision, evidence, context) => {
      const patternRec = context.patternRecommendation;
      if (!patternRec || patternRec === 'UNKNOWN') return false;
      return decision.action !== patternRec;
    }
  },
  {
    policyId: 'POL-102',
    name: 'many-critical-factors-flag',
    type: POLICY_TYPES.SOFT,
    action: ACTIONS.FLAG,
    message: 'Case has >3 critical risk factors but decision is not REJECT',
    condition: (decision, evidence, context) => {
      if (decision.action === 'REJECT' || decision.action === 'BLOCK') return false;
      const criticalCount = context.criticalFactors || 0;
      return criticalCount > 3;
    }
  },
  {
    policyId: 'POL-103',
    name: 'uncertainty-language-flag',
    type: POLICY_TYPES.SOFT,
    action: ACTIONS.LOG,
    message: 'LLM reasoning contains uncertainty language',
    condition: (decision) => {
      const reasoning = decision.reasoning || decision.reason || '';
      const uncertainPhrases = ["I'm not sure", "possibly", "might be", "uncertain", "unclear"];
      return uncertainPhrases.some(phrase => reasoning.toLowerCase().includes(phrase));
    }
  }
];

// LLM behavior guardrails
const GUARDRAILS = {
  MAX_TOOL_CALLS_PER_CYCLE: 10,
  MAX_LLM_CALLS_PER_DECISION: 5,
  MAX_TOKENS_PER_DECISION: 8000
};

class PolicyEngine {
  constructor(policies = DEFAULT_POLICIES) {
    this.policies = [...policies];
    this.stats = {
      evaluations: 0,
      hardViolations: 0,
      softViolations: 0,
      cleanPasses: 0
    };
    this.violationLog = [];
    console.log(`[PolicyEngine] Initialized with ${this.policies.length} policies`);
  }

  /**
   * Enforce policies on a proposed decision.
   * @param {Object} decision - { action, confidence, reason/reasoning }
   * @param {Array} evidence - Array of { source, data, success }
   * @param {Object} context - { riskScore, thresholds, patternRecommendation, criticalFactors }
   * @returns {Object} { allowed, violations, flags, originalDecision, enforcedDecision }
   */
  enforce(decision, evidence = [], context = {}) {
    this.stats.evaluations++;

    const hardViolations = [];
    const softViolations = [];

    for (const policy of this.policies) {
      try {
        if (policy.condition(decision, evidence, context)) {
          const violation = {
            policyId: policy.policyId,
            name: policy.name,
            type: policy.type,
            action: policy.action,
            message: policy.message,
            timestamp: new Date().toISOString()
          };

          if (policy.type === POLICY_TYPES.HARD) {
            hardViolations.push(violation);
          } else {
            softViolations.push(violation);
          }
        }
      } catch (e) {
        // Policy evaluation error — skip this policy
      }
    }

    // Log violations
    const allViolations = [...hardViolations, ...softViolations];
    if (allViolations.length > 0) {
      this.violationLog.push({
        decision: decision.action,
        violations: allViolations,
        timestamp: new Date().toISOString()
      });
      if (this.violationLog.length > 500) {
        this.violationLog = this.violationLog.slice(-250);
      }
    }

    // Emit policy events
    for (const v of allViolations) {
      if (eventBus) {
        eventBus.publish('policy:violation', {
          ...v,
          agentDecision: decision.action,
          riskScore: context.riskScore
        });
      }
    }

    if (hardViolations.length > 0) {
      this.stats.hardViolations++;

      // Hard violation: override decision
      const enforcedDecision = {
        ...decision,
        action: 'REVIEW',
        originalAction: decision.action,
        overriddenBy: hardViolations.map(v => v.policyId),
        policyViolations: hardViolations,
        escalated: true,
        escalationReason: hardViolations.map(v => v.message).join('; ')
      };

      return {
        allowed: false,
        violations: hardViolations,
        flags: softViolations,
        originalDecision: decision,
        enforcedDecision
      };
    }

    if (softViolations.length > 0) {
      this.stats.softViolations++;
    } else {
      this.stats.cleanPasses++;
    }

    return {
      allowed: true,
      violations: [],
      flags: softViolations,
      originalDecision: decision,
      enforcedDecision: {
        ...decision,
        policyFlags: softViolations.length > 0 ? softViolations : undefined
      }
    };
  }

  /**
   * Check guardrails (called during reasoning).
   */
  checkGuardrails(metrics) {
    const violations = [];

    if (metrics.toolCalls > GUARDRAILS.MAX_TOOL_CALLS_PER_CYCLE) {
      violations.push(`Tool call limit exceeded: ${metrics.toolCalls}/${GUARDRAILS.MAX_TOOL_CALLS_PER_CYCLE}`);
    }
    if (metrics.llmCalls > GUARDRAILS.MAX_LLM_CALLS_PER_DECISION) {
      violations.push(`LLM call limit exceeded: ${metrics.llmCalls}/${GUARDRAILS.MAX_LLM_CALLS_PER_DECISION}`);
    }
    if (metrics.totalTokens > GUARDRAILS.MAX_TOKENS_PER_DECISION) {
      violations.push(`Token budget exceeded: ${metrics.totalTokens}/${GUARDRAILS.MAX_TOKENS_PER_DECISION}`);
    }

    return { safe: violations.length === 0, violations };
  }

  /**
   * Add a custom policy.
   */
  addPolicy(policy) {
    if (!policy.policyId || !policy.condition) {
      throw new Error('Policy must have policyId and condition');
    }
    this.policies.push(policy);
  }

  getStats() {
    return {
      ...this.stats,
      policyCount: this.policies.length,
      hardPolicies: this.policies.filter(p => p.type === POLICY_TYPES.HARD).length,
      softPolicies: this.policies.filter(p => p.type === POLICY_TYPES.SOFT).length,
      recentViolations: this.violationLog.slice(-5),
      guardrails: GUARDRAILS
    };
  }
}

// Singleton
let instance = null;

export function getPolicyEngine() {
  if (!instance) {
    instance = new PolicyEngine();
  }
  return instance;
}

export { POLICY_TYPES, ACTIONS, GUARDRAILS };
export default { getPolicyEngine, POLICY_TYPES, ACTIONS, GUARDRAILS };
```

**Step 2: Verify module loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/policy-engine.js').then(m => { const pe = m.getPolicyEngine(); console.log('OK, stats:', JSON.stringify(pe.getStats())); }).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK, stats: {"evaluations":0,...,"policyCount":8,...}`

**Step 3: Commit**

```bash
git add backend/agents/core/policy-engine.js
git commit -m "feat: add policy engine with hard/soft policies and LLM guardrails"
```

---

### Task 15: Integrate Policy Engine into Base Agent reason()

**Files:**
- Modify: `backend/agents/core/base-agent.js` (imports, constructor, reason() method)

**Context:** Insert policy enforcement between `observe()` and the final decision. If hard policy triggers, override the decision to REVIEW with escalation. If soft policy triggers, flag in metadata.

**Step 1: Add policy engine import**

At the top of `base-agent.js`, add:

```javascript
import { getPolicyEngine } from './policy-engine.js';
```

**Step 2: Add to constructor**

After `this.thresholdManager = getThresholdManager();`, add:

```javascript
    this.policyEngine = getPolicyEngine();
```

**Step 3: Insert policy check in reason() after observe()**

In the `reason()` method, after `thought.result = await this.observe(thought.actions, context);` and before the knowledge write-back, add:

```javascript
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

**Step 4: Verify module loads**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/base-agent.js').then(() => console.log('OK')).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK`

**Step 5: Commit**

```bash
git add backend/agents/core/base-agent.js
git commit -m "feat: integrate policy engine into agent reasoning loop"
```

---

### Task 16: Integration Verification

**Files:** None (read-only verification)

**Context:** Verify all layers work together. Check imports resolve, modules load, and the full agent reasoning path is intact.

**Step 1: Verify all new modules load independently**

Run each:
```bash
cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend
node -e "import('./agents/core/prompt-templates.js').then(() => console.log('1. prompt-templates OK')).catch(e => console.error('FAIL:', e.message))"
node -e "import('./agents/core/outcome-simulator.js').then(() => console.log('2. outcome-simulator OK')).catch(e => console.error('FAIL:', e.message))"
node -e "import('./agents/core/threshold-manager.js').then(() => console.log('3. threshold-manager OK')).catch(e => console.error('FAIL:', e.message))"
node -e "import('./agents/core/policy-engine.js').then(() => console.log('4. policy-engine OK')).catch(e => console.error('FAIL:', e.message))"
```
Expected: All 4 print OK.

**Step 2: Verify base agent loads with all new dependencies**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "import('./agents/core/base-agent.js').then(m => { console.log('5. base-agent OK'); }).catch(e => console.error('FAIL:', e.message))"`
Expected: `5. base-agent OK`

**Step 3: Verify specialized agents load**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node -e "Promise.all([import('./agents/specialized/fraud-investigation-agent.js'), import('./agents/specialized/seller-onboarding-agent.js')]).then(() => console.log('6. specialized agents OK')).catch(e => console.error('FAIL:', e.message))"`
Expected: `6. specialized agents OK`

**Step 4: Verify Python eval service has new endpoint**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/evaluation && python -c "from routers.search import router; print('7. search router OK, routes:', [r.path for r in router.routes])"`
Expected: Contains `/advanced` in routes.

**Step 5: Verify query decomposer**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend/evaluation && python -c "from services.query_decomposer import decompose_query; result = decompose_query('test query'); print('8. decomposer OK, result:', result)"`
Expected: `8. decomposer OK, result: ['test query']` (fallback since no API key in test env)

**Step 6: Verify frontend still builds**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds (no frontend changes in this plan).

**Step 7: Final commit with all pending changes**

```bash
git add -A
git status
git commit -m "feat: agentic brain upgrade phase 1 — integration verification complete"
```

---

## Summary

| Task | Layer | What | New Files | Modified Files |
|------|-------|------|-----------|----------------|
| 1 | L1 | Prompt templates module | `prompt-templates.js` | — |
| 2 | L1 | Rewrite base agent think/plan/observe | — | `base-agent.js` |
| 3 | L1 | Specialized agents LLM-first | — | `fraud-investigation-agent.js`, `seller-onboarding-agent.js` |
| 4 | L2 | Wire pattern memory before think | — | `base-agent.js` |
| 5 | L2 | Pattern-to-long-term consolidation | — | `memory-store.js` |
| 6 | L2 | Save insights to long-term memory | — | `base-agent.js` |
| 7 | L3 | Dual retrieval in think | — | `base-agent.js` |
| 8 | L3 | Knowledge write-back after decisions | — | `base-agent.js` |
| 9 | L3 | Query decomposer + advanced RAG | `query_decomposer.py` | `search.py` |
| 10 | L4 | Outcome simulator | `outcome-simulator.js` | — |
| 11 | L4 | Threshold manager | `threshold-manager.js` | — |
| 12 | L4 | Wire feedback pipeline | — | `base-agent.js` |
| 13 | L4 | Connect agents to threshold manager | — | `seller-onboarding-agent.js` |
| 14 | L5 | Policy engine | `policy-engine.js` | — |
| 15 | L5 | Integrate policy engine | — | `base-agent.js` |
| 16 | — | Integration verification | — | — |

**New files (5):** `prompt-templates.js`, `outcome-simulator.js`, `threshold-manager.js`, `policy-engine.js`, `query_decomposer.py`

**Modified files (5):** `base-agent.js` (heavily), `memory-store.js`, `fraud-investigation-agent.js`, `seller-onboarding-agent.js`, `search.py`
