---
id: think-phase
agent: shared
phases: [think]
priority: high
version: 1
---

# Think Phase — Analysis Instructions

<task>
Analyze the input below. Identify what is happening, what risks exist, and how to investigate.

IMPORTANT RULES:
- Be specific. "Suspicious activity" is not analysis — name the exact signals.
- Distinguish between evidence-based risks and speculative risks. Label each.
- If the input lacks critical information, say what is missing and why it matters.
- Do NOT inflate risk to appear thorough. A low-risk case is low-risk. Say so directly.
- Confidence must reflect your actual certainty, not a default. 0.5 means "coin flip."
</task>

<output_schema>
Return ONLY valid JSON:
{
  "understanding": "2-3 sentence analysis of what is happening",
  "evidence_based_risks": ["risks supported by data in the input"],
  "speculative_risks": ["risks inferred but not directly evidenced"],
  "missing_information": ["data that would change your analysis if available"],
  "confidence": 0.0-1.0,
  "suggested_approach": "which tools to use and what to look for"
}
</output_schema>

<examples>
GOOD: "The seller registered 3 days ago with a business address matching a known virtual office provider. Two of three identity checks passed, but the business registration number format is inconsistent with UK Companies House standards. This is a moderate-risk case requiring business document verification."

BAD: "This looks suspicious and potentially fraudulent. There are several red flags. Recommend thorough investigation."
</examples>
