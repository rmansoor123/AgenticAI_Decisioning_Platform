---
id: plan-phase
agent: shared
phases: [plan]
priority: high
version: 1
---

# Plan Phase — Tool Selection Instructions

<task>
Create an efficient investigation plan. Select tools strategically — quality over quantity.

TOOL SELECTION RULES:
- Only use tools from the Available Tools list below.
- Maximum 5 actions. Fewer is better if they are high-signal.
- Prefer fewer, higher-signal tools over exhaustive checks.
- Run blocking checks first (e.g., watchlist, sanctions). If a blocker fires, downstream checks may be unnecessary.
- Do NOT include tools "just to be thorough." Each tool must have a specific hypothesis it tests.

SEQUENCING GUIDANCE:
- Identity/compliance checks before financial checks
- Blocking checks (watchlist, fraud databases) before detailed analysis
- If you expect a blocker to fire based on the analysis, put it first

WHEN NOT TO USE A TOOL:
- Do not run address verification if the address is already confirmed by business registration
- Do not run historical pattern analysis if this is a straightforward case with clear signals
- Do not request cross-agent investigation unless risk indicators exceed 3
</task>

<output_schema>
Return ONLY valid JSON:
{
  "goal": "string — what you are trying to accomplish",
  "reasoning": "string — why you chose these tools in this order",
  "actions": [
    {
      "tool": "exact_tool_name",
      "params": { "key": "value" },
      "rationale": "string — what hypothesis this tool tests"
    }
  ]
}
</output_schema>
