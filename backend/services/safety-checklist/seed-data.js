/**
 * Source-of-truth seed for safety_checklist table.
 *
 * Status values: 'done' | 'partial' | 'not-started'
 *
 * Two grade corrections vs the previous hardcoded JSX in AISafetyRisks.jsx:
 *   - SC-DECISION-6 (prompt injection): was 'partial', now 'done' — input-sanitizer.js
 *     ships 16+ regex patterns (jailbreak/role-tag/DAN) + zero-width Unicode + control
 *     chars and is wired into base-agent.js.
 *   - SC-DECISION-7 (adversarial testing): was 'not-started', now 'done' — there's a
 *     working adversarial-tester.js with synthetic-identity/contradictory/boundary/
 *     evasion scenarios and a test file under __tests__/adversarial-tester.test.js.
 *
 * The `note` field documents the evidence path so we don't lose institutional memory.
 */

export const SAFETY_CHECKLIST_SEED = [
  // ── Decision Safety ────────────────────────────────────────────────────────
  { itemId: 'SC-DECISION-1', groupTitle: 'Decision Safety', groupOrder: 1, itemOrder: 1,
    status: 'done', label: 'Policy engine overrides LLM on every decision',
    note: 'backend/agents/core/policy-engine.js' },
  { itemId: 'SC-DECISION-2', groupTitle: 'Decision Safety', groupOrder: 1, itemOrder: 2,
    status: 'done', label: 'Judge review for REJECT/BLOCK decisions',
    note: 'backend/agents/core/agent-judge.js (cross-agent map)' },
  { itemId: 'SC-DECISION-3', groupTitle: 'Decision Safety', groupOrder: 1, itemOrder: 3,
    status: 'done', label: 'Hardcoded fallback when LLM unavailable',
    note: 'Non-negotiable rule #3 — every agent has if(!this.llmClient?.enabled) path' },
  { itemId: 'SC-DECISION-4', groupTitle: 'Decision Safety', groupOrder: 1, itemOrder: 4,
    status: 'done', label: 'Human review queue (case queue) for uncertain decisions',
    note: 'backend/services/case-queue + AlertTriageAgent' },
  { itemId: 'SC-DECISION-5', groupTitle: 'Decision Safety', groupOrder: 1, itemOrder: 5,
    status: 'done', label: 'Score decay prevents permanent stigma',
    note: '30-day half-life + 48h de-escalation cooldown' },
  { itemId: 'SC-DECISION-6', groupTitle: 'Decision Safety', groupOrder: 1, itemOrder: 6,
    status: 'done', label: 'Prompt injection detection (regex + zero-width Unicode + control chars)',
    note: 'input-sanitizer.js — 16+ injection patterns + Unicode steg detection, wired into base-agent.js' },
  { itemId: 'SC-DECISION-7', groupTitle: 'Decision Safety', groupOrder: 1, itemOrder: 7,
    status: 'done', label: 'Adversarial testing of agent reasoning',
    note: 'adversarial-tester.js — synthetic-identity, contradictory-signals, boundary-cases, evasion-patterns + __tests__/adversarial-tester.test.js' },
  { itemId: 'SC-DECISION-8', groupTitle: 'Decision Safety', groupOrder: 1, itemOrder: 8,
    status: 'not-started', label: 'Seller appeal mechanism' },
  { itemId: 'SC-DECISION-9', groupTitle: 'Decision Safety', groupOrder: 1, itemOrder: 9,
    status: 'not-started', label: 'Bias detection and fairness metrics' },

  // ── Transparency ───────────────────────────────────────────────────────────
  { itemId: 'SC-TRANSP-1', groupTitle: 'Transparency', groupOrder: 2, itemOrder: 1,
    status: 'done', label: 'SHAP-like feature contributions for ML' },
  { itemId: 'SC-TRANSP-2', groupTitle: 'Transparency', groupOrder: 2, itemOrder: 2,
    status: 'done', label: 'Full chain of thought logged (Langfuse)' },
  { itemId: 'SC-TRANSP-3', groupTitle: 'Transparency', groupOrder: 2, itemOrder: 3,
    status: 'done', label: 'Decision audit trail (every decision persisted)' },
  { itemId: 'SC-TRANSP-4', groupTitle: 'Transparency', groupOrder: 2, itemOrder: 4,
    status: 'partial', label: 'Explainable decisions (scores visible, but reasoning not always clear)' },
  { itemId: 'SC-TRANSP-5', groupTitle: 'Transparency', groupOrder: 2, itemOrder: 5,
    status: 'not-started', label: 'Seller-facing decision explanations' },
  { itemId: 'SC-TRANSP-6', groupTitle: 'Transparency', groupOrder: 2, itemOrder: 6,
    status: 'not-started', label: 'Transparency reports (decision rates by segment)' },

  // ── Data & Privacy ─────────────────────────────────────────────────────────
  { itemId: 'SC-PRIVACY-1', groupTitle: 'Data & Privacy', groupOrder: 3, itemOrder: 1,
    status: 'done', label: 'PII not in application logs' },
  { itemId: 'SC-PRIVACY-2', groupTitle: 'Data & Privacy', groupOrder: 3, itemOrder: 2,
    status: 'done', label: 'Database access only through factories' },
  { itemId: 'SC-PRIVACY-3', groupTitle: 'Data & Privacy', groupOrder: 3, itemOrder: 3,
    status: 'partial', label: 'Data retention policies (score decay, but no hard deletion)' },
  { itemId: 'SC-PRIVACY-4', groupTitle: 'Data & Privacy', groupOrder: 3, itemOrder: 4,
    status: 'not-started', label: 'Right to deletion (GDPR Article 17)' },
  { itemId: 'SC-PRIVACY-5', groupTitle: 'Data & Privacy', groupOrder: 3, itemOrder: 5,
    status: 'not-started', label: 'Data anonymization for training' },
  { itemId: 'SC-PRIVACY-6', groupTitle: 'Data & Privacy', groupOrder: 3, itemOrder: 6,
    status: 'not-started', label: 'Consent management' },

  // ── Monitoring & Response ──────────────────────────────────────────────────
  { itemId: 'SC-MONITOR-1', groupTitle: 'Monitoring & Response', groupOrder: 4, itemOrder: 1,
    status: 'done', label: 'Langfuse observability (traces, metrics)' },
  { itemId: 'SC-MONITOR-2', groupTitle: 'Monitoring & Response', groupOrder: 4, itemOrder: 2,
    status: 'done', label: 'Prediction drift detection (PSI)' },
  { itemId: 'SC-MONITOR-3', groupTitle: 'Monitoring & Response', groupOrder: 4, itemOrder: 3,
    status: 'done', label: 'Segment trend alerts (tier drops, score decay)' },
  { itemId: 'SC-MONITOR-4', groupTitle: 'Monitoring & Response', groupOrder: 4, itemOrder: 4,
    status: 'partial', label: 'Model performance monitoring (basic, not automated)' },
  { itemId: 'SC-MONITOR-5', groupTitle: 'Monitoring & Response', groupOrder: 4, itemOrder: 5,
    status: 'not-started', label: 'Automated bias monitoring' },
  { itemId: 'SC-MONITOR-6', groupTitle: 'Monitoring & Response', groupOrder: 4, itemOrder: 6,
    status: 'not-started', label: 'Incident response playbook' },
  { itemId: 'SC-MONITOR-7', groupTitle: 'Monitoring & Response', groupOrder: 4, itemOrder: 7,
    status: 'not-started', label: 'Regular fairness audits' }
];
