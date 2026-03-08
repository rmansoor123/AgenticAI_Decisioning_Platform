/**
 * Prompt Templates — Centralized structured prompts for agent reasoning phases.
 *
 * Converts registered tools into LLM-readable descriptions.
 * Defines output schemas so LLM responses are JSON-parseable.
 *
 * Phase instructions are loaded from .md files in the prompt registry
 * (shared/think-phase.md, shared/plan-phase.md, etc.) and injected into
 * the structural templates here. This makes all prompt content visible
 * and editable from the Prompt Library UI.
 */

import { getPromptRegistry } from './prompt-registry.js';

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
 * Phase instructions loaded from shared/think-phase.md in the prompt registry.
 * LLM returns: { understanding, evidence_based_risks, speculative_risks, missing_information, confidence, suggested_approach }
 */
export function buildThinkPrompt({ agentName, agentRole, input, recentMemory, knowledgeResults, patternMatches, tools, domainKnowledge }) {
  const domainSection = domainKnowledge
    ? `\n<domain_expertise>\n${domainKnowledge}\n</domain_expertise>\n`
    : '';

  // Load phase instructions from registry (editable via Prompt Library)
  let phaseInstructions;
  try {
    const registry = getPromptRegistry();
    const phasePrompt = registry.getPromptById('think-phase');
    phaseInstructions = phasePrompt?.content || '';
  } catch { phaseInstructions = ''; }

  const system = `<agent_identity>
You are ${agentName}, a ${agentRole} in an autonomous fraud detection platform.
You make high-stakes decisions that protect sellers, buyers, and the marketplace.
</agent_identity>
${domainSection}
${phaseInstructions}`;

  const user = `<task_input>
${JSON.stringify(input, null, 2).slice(0, 1500)}
</task_input>

<recent_activity>
${formatMemoryForPrompt(recentMemory)}
</recent_activity>

<historical_patterns>
${formatPatternsForPrompt(patternMatches)}
</historical_patterns>

<institutional_knowledge>
${formatKnowledgeForPrompt(knowledgeResults)}
</institutional_knowledge>

<available_tools>
${formatToolCatalog(tools)}
</available_tools>

Analyze this input and return your structured understanding as JSON.`;

  return { system, user };
}

/**
 * Build the PLAN phase prompt.
 * Phase instructions loaded from shared/plan-phase.md in the prompt registry.
 * LLM returns: { goal, reasoning, actions: [{ tool, params, rationale }] }
 */
export function buildPlanPrompt({ agentName, agentRole, thinkResult, longTermMemory, tools, input, domainKnowledge }) {
  const domainSection = domainKnowledge
    ? `\n<domain_expertise>\n${domainKnowledge}\n</domain_expertise>\n`
    : '';

  // Load phase instructions from registry (editable via Prompt Library)
  let phaseInstructions;
  try {
    const registry = getPromptRegistry();
    const phasePrompt = registry.getPromptById('plan-phase');
    phaseInstructions = phasePrompt?.content || '';
  } catch { phaseInstructions = ''; }

  const system = `<agent_identity>
You are ${agentName}, a ${agentRole}. Based on your analysis, decide which tools to use and in what order.
</agent_identity>
${domainSection}
${phaseInstructions}`;

  const user = `<analysis>
${JSON.stringify(thinkResult, null, 2).slice(0, 1000)}
</analysis>

<past_experience>
${formatMemoryForPrompt(longTermMemory)}
</past_experience>

<original_input>
${JSON.stringify(input, null, 2).slice(0, 800)}
</original_input>

<available_tools>
${formatToolCatalog(tools)}
</available_tools>

Create your action plan as JSON.`;

  return { system, user };
}

/**
 * Build the OBSERVE phase prompt.
 * Phase instructions loaded from shared/observe-phase.md in the prompt registry.
 * LLM returns: { summary, risk_score, recommendation, confidence, reasoning, key_findings, citations }
 */
export function buildObservePrompt({ agentName, agentRole, actions, input, domainKnowledge }) {
  const domainSection = domainKnowledge
    ? `\n<domain_expertise>\n${domainKnowledge}\n</domain_expertise>\n`
    : '';

  // Load phase instructions from registry (editable via Prompt Library)
  let phaseInstructions;
  try {
    const registry = getPromptRegistry();
    const phasePrompt = registry.getPromptById('observe-phase');
    phaseInstructions = phasePrompt?.content || '';
  } catch { phaseInstructions = ''; }

  const system = `<agent_identity>
You are ${agentName}, a ${agentRole}. You have completed your investigation. Synthesize all evidence into a final assessment.
</agent_identity>
${domainSection}
${phaseInstructions}`;

  const safeActions = Array.isArray(actions) ? actions : [];
  const evidenceSummary = safeActions.map(a => {
    const toolName = a.action?.type || 'unknown';
    const success = a.result?.success !== false;
    const data = a.result?.data ? JSON.stringify(a.result.data).slice(0, 300) : 'no data';
    return `- ${toolName}: ${success ? 'SUCCESS' : 'FAILED'} — ${data}`;
  }).join('\n');

  const user = `<original_task>
${JSON.stringify(input, null, 2).slice(0, 500)}
</original_task>

<evidence_gathered>
${evidenceSummary}
</evidence_gathered>

Synthesize all evidence and return your final assessment as JSON.`;

  return { system, user };
}

/**
 * Build the REFLECT phase prompt.
 * Phase instructions loaded from shared/reflect-phase.md in the prompt registry.
 * LLM returns: { shouldRevise, revisedAction, revisedConfidence, concerns, contraArgument, biasCheck, premortem, reflectionConfidence }
 */
export function buildReflectPrompt({ agentName, agentRole, input, evidence, proposedDecision, riskScore, confidence, chainOfThought, domainKnowledge }) {
  const domainSection = domainKnowledge
    ? `\n<domain_expertise>\n${domainKnowledge}\n</domain_expertise>\n`
    : '';

  // Load phase instructions from registry (editable via Prompt Library)
  let phaseInstructions;
  try {
    const registry = getPromptRegistry();
    const phasePrompt = registry.getPromptById('reflect-phase');
    phaseInstructions = phasePrompt?.content || '';
  } catch { phaseInstructions = ''; }

  const system = `<agent_identity>
You are a critical reviewer auditing a ${agentRole} agent's decision in a fraud detection platform.
You are NOT the agent's ally — you are an independent auditor hired to find mistakes.
</agent_identity>
${domainSection}
${phaseInstructions}`;

  const safeEvidence = Array.isArray(evidence) ? evidence : [];
  const evidenceSummary = safeEvidence.map(a => {
    const toolName = a.action?.type || 'unknown';
    const success = a.result?.success !== false;
    const data = a.result?.data ? JSON.stringify(a.result.data).slice(0, 200) : 'no data';
    return `- ${toolName}: ${success ? 'OK' : 'FAILED'} — ${data}`;
  }).join('\n');

  const user = `<original_input>
${JSON.stringify(input, null, 2).slice(0, 500)}
</original_input>

<evidence_gathered>
${evidenceSummary || 'No evidence collected.'}
</evidence_gathered>

<proposed_decision>
- Action: ${proposedDecision?.action || 'UNKNOWN'}
- Risk Score: ${riskScore ?? 'N/A'}
- Confidence: ${confidence ?? 'N/A'}
- Reasoning: ${proposedDecision?.reason || proposedDecision?.reasoning || 'none provided'}
</proposed_decision>

Critically evaluate this decision using the adversarial review framework above.`;

  return { system, user };
}

/**
 * Build the RE-PLAN phase prompt.
 * Phase instructions loaded from shared/replan-phase.md in the prompt registry.
 * Called when >50% of actions fail. LLM returns: { actions, reasoning, avoidance_notes }
 */
export function buildRePlanPrompt({ agentName, agentRole, originalGoal, successes, failures, tools, domainKnowledge }) {
  const domainSection = domainKnowledge
    ? `\n<domain_expertise>\n${domainKnowledge}\n</domain_expertise>\n`
    : '';

  const toolList = tools || 'No tools available.';

  // Load phase instructions from registry (editable via Prompt Library)
  let phaseInstructions;
  try {
    const registry = getPromptRegistry();
    const phasePrompt = registry.getPromptById('replan-phase');
    phaseInstructions = phasePrompt?.content || '';
  } catch { phaseInstructions = ''; }

  const system = `<agent_identity>
You are ${agentName}, a ${agentRole}. Your previous plan had a high failure rate. You must create a revised plan.
</agent_identity>
${domainSection}
${phaseInstructions}`;

  const successSummary = successes.length > 0
    ? successes.map(s => `  - ${s.action?.type}: ${JSON.stringify(s.result?.data || {}).slice(0, 200)}`).join('\n')
    : '  (none)';

  const failureSummary = failures.length > 0
    ? failures.map(f => `  - ${f.action?.type}: ${f.result?.error || 'failed'}`).join('\n')
    : '  (none)';

  const user = `<original_goal>
${originalGoal}
</original_goal>

<successful_actions>
${successSummary}
</successful_actions>

<failed_actions>
${failureSummary}
</failed_actions>

<available_tools>
${toolList}
</available_tools>

Create a revised plan that avoids the failed approaches. Return at most 5 actions.`;

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
