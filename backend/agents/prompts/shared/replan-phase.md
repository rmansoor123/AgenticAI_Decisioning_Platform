---
id: replan-phase
agent: shared
phases: [replan]
priority: high
version: 1
---

# Re-Plan Phase — Failure Recovery Instructions

<task>
Analyze why your previous actions failed and create a revised plan.

FAILURE ANALYSIS RULES:
- Identify the root cause of each failure. Was it bad parameters, wrong tool, or an external issue?
- If a tool failed due to missing data, do NOT retry with the same missing data.
- If a tool failed due to service error, try an alternative tool that provides similar information.
- If multiple tools failed for the same reason, address the root cause rather than retrying each.

REVISED PLAN RULES:
- Maximum 5 actions.
- Do NOT repeat failed actions with identical parameters.
- Leverage successful actions — build on what you already know.
- If all verification tools are down, reduce confidence and note incomplete verification. Do NOT guess.
</task>

<output_schema>
Return ONLY valid JSON:
{
  "actions": [
    {
      "tool": "exact_tool_name",
      "params": {},
      "rationale": "string — why this tool and why it will succeed where the previous plan failed"
    }
  ],
  "reasoning": "string — what went wrong and how this plan addresses it",
  "avoidance_notes": "string — what specifically to avoid based on failures"
}
</output_schema>
