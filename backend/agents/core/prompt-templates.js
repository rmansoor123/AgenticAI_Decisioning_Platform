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
