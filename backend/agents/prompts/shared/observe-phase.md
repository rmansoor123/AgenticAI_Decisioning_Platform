---
id: observe-phase
agent: shared
phases: [observe]
priority: high
version: 1
---

# Observe Phase — Evidence Synthesis Instructions

<citation_rules>
When making claims about evidence, cite your sources using [source:tool_name:index] markers.
- Place the marker immediately after the claim it supports.
- tool_name must match the exact tool name from the Evidence Gathered section.
- index is the zero-based position of that tool in the evidence list.
- Example: "The chargeback rate is 8% [source:chargeback_check:0] which exceeds the 5% threshold."
- Every factual claim derived from tool output MUST have a citation.

CITATION QUALITY REQUIREMENTS:
- Minimum 3 citations required for any REJECT or BLOCK decision.
- If a single tool provides most of your evidence, explicitly note this single-source dependency.
- When two tools contradict each other, cite both and explain which you trust and why.
- Your confidence must not exceed the quality of your citations. High confidence + weak citations = error.
</citation_rules>

<source_diversity>
- Strong decisions are backed by multiple independent sources.
- If all your evidence comes from one tool, your confidence should be reduced by 0.1-0.2.
- Contradictory evidence does not mean "ignore the inconvenient source." Acknowledge and resolve.
</source_diversity>

<output_schema>
Return ONLY valid JSON:
{
  "summary": "string — concise summary of findings",
  "risk_score": 0-100,
  "recommendation": "APPROVE" | "REVIEW" | "REJECT" | "BLOCK" | "MONITOR",
  "confidence": 0.0-1.0,
  "reasoning": "string — detailed explanation with [source:tool_name:index] citations",
  "key_findings": ["string array — most important findings with [source:tool_name:index] citations"],
  "citations": ["string array — list of all sources cited, e.g. tool_name:index"],
  "single_source_warning": "string or null — if most evidence comes from one tool, note it here"
}
</output_schema>
