/**
 * Chain of Thought - Structured reasoning for agents
 * Provides explicit reasoning steps that can be audited and explained
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Reasoning step types
 */
export const STEP_TYPES = {
  OBSERVATION: 'observation',
  HYPOTHESIS: 'hypothesis',
  ANALYSIS: 'analysis',
  EVIDENCE: 'evidence',
  INFERENCE: 'inference',
  CONCLUSION: 'conclusion',
  ACTION: 'action',
  VALIDATION: 'validation'
};

/**
 * Confidence qualifiers
 */
export const CONFIDENCE = {
  CERTAIN: { level: 1.0, label: 'certain' },
  VERY_LIKELY: { level: 0.85, label: 'very likely' },
  LIKELY: { level: 0.7, label: 'likely' },
  POSSIBLE: { level: 0.5, label: 'possible' },
  UNLIKELY: { level: 0.3, label: 'unlikely' },
  VERY_UNLIKELY: { level: 0.15, label: 'very unlikely' }
};

/**
 * Chain of Thought Class
 */
export class ChainOfThought {
  constructor(context = {}) {
    this.chainId = `COT-${uuidv4().slice(0, 8).toUpperCase()}`;
    this.context = context;
    this.steps = [];
    this.hypotheses = [];
    this.evidence = [];
    this.conclusions = [];
    this.startedAt = new Date().toISOString();
    this.completedAt = null;
  }

  /**
   * Add a reasoning step
   */
  addStep(params) {
    const {
      type,
      content,
      confidence = CONFIDENCE.LIKELY,
      supports = [],
      contradicts = [],
      metadata = {}
    } = params;

    const step = {
      stepId: `STEP-${this.steps.length + 1}`,
      type,
      content,
      confidence: typeof confidence === 'object' ? confidence : { level: confidence, label: 'custom' },
      supports,
      contradicts,
      metadata,
      timestamp: new Date().toISOString()
    };

    this.steps.push(step);

    // Track special step types
    if (type === STEP_TYPES.HYPOTHESIS) {
      this.hypotheses.push(step);
    } else if (type === STEP_TYPES.EVIDENCE) {
      this.evidence.push(step);
    } else if (type === STEP_TYPES.CONCLUSION) {
      this.conclusions.push(step);
    }

    return step;
  }

  /**
   * Add an observation
   */
  observe(observation, data = {}) {
    return this.addStep({
      type: STEP_TYPES.OBSERVATION,
      content: observation,
      metadata: { data }
    });
  }

  /**
   * Form a hypothesis
   */
  hypothesize(hypothesis, confidence = CONFIDENCE.POSSIBLE, basis = []) {
    return this.addStep({
      type: STEP_TYPES.HYPOTHESIS,
      content: hypothesis,
      confidence,
      supports: basis
    });
  }

  /**
   * Record evidence
   */
  recordEvidence(evidence, supportsHypothesis = [], contradictsHypothesis = [], weight = 1.0) {
    return this.addStep({
      type: STEP_TYPES.EVIDENCE,
      content: evidence,
      supports: supportsHypothesis,
      contradicts: contradictsHypothesis,
      metadata: { weight }
    });
  }

  /**
   * Perform analysis
   */
  analyze(analysis, inputs = [], confidence = CONFIDENCE.LIKELY) {
    return this.addStep({
      type: STEP_TYPES.ANALYSIS,
      content: analysis,
      confidence,
      metadata: { inputs }
    });
  }

  /**
   * Make an inference
   */
  infer(inference, basis = [], confidence = CONFIDENCE.LIKELY) {
    return this.addStep({
      type: STEP_TYPES.INFERENCE,
      content: inference,
      confidence,
      supports: basis
    });
  }

  /**
   * Reach a conclusion
   */
  conclude(conclusion, confidence = CONFIDENCE.LIKELY, supportingSteps = []) {
    this.completedAt = new Date().toISOString();
    return this.addStep({
      type: STEP_TYPES.CONCLUSION,
      content: conclusion,
      confidence,
      supports: supportingSteps
    });
  }

  /**
   * Record an action decision
   */
  decideAction(action, rationale, confidence = CONFIDENCE.LIKELY) {
    return this.addStep({
      type: STEP_TYPES.ACTION,
      content: { action, rationale },
      confidence
    });
  }

  /**
   * Validate a hypothesis against evidence
   */
  validateHypothesis(hypothesisStepId) {
    const hypothesis = this.steps.find(s => s.stepId === hypothesisStepId);
    if (!hypothesis) return null;

    let supportingEvidence = 0;
    let contradictingEvidence = 0;
    let totalWeight = 0;

    for (const e of this.evidence) {
      const weight = e.metadata.weight || 1.0;
      if (e.supports.includes(hypothesisStepId)) {
        supportingEvidence += weight;
        totalWeight += weight;
      }
      if (e.contradicts.includes(hypothesisStepId)) {
        contradictingEvidence += weight;
        totalWeight += weight;
      }
    }

    const validationScore = totalWeight > 0
      ? (supportingEvidence - contradictingEvidence) / totalWeight
      : 0;

    // Update hypothesis confidence based on evidence
    const adjustedConfidence = Math.max(0, Math.min(1,
      hypothesis.confidence.level + (validationScore * 0.3)
    ));

    const validation = this.addStep({
      type: STEP_TYPES.VALIDATION,
      content: {
        hypothesis: hypothesis.content,
        supportingEvidence,
        contradictingEvidence,
        validationScore,
        adjustedConfidence,
        verdict: validationScore > 0.3 ? 'SUPPORTED' :
                 validationScore < -0.3 ? 'CONTRADICTED' : 'INCONCLUSIVE'
      },
      confidence: { level: adjustedConfidence, label: getConfidenceLabel(adjustedConfidence) }
    });

    return validation;
  }

  /**
   * Get the primary conclusion
   */
  getPrimaryConclusion() {
    if (this.conclusions.length === 0) return null;

    // Return the conclusion with highest confidence
    return this.conclusions.reduce((best, current) =>
      current.confidence.level > best.confidence.level ? current : best
    );
  }

  /**
   * Generate human-readable reasoning summary
   */
  generateSummary() {
    const sections = [];

    // Observations
    const observations = this.steps.filter(s => s.type === STEP_TYPES.OBSERVATION);
    if (observations.length > 0) {
      sections.push('**Observations:**');
      observations.forEach((o, i) => sections.push(`${i + 1}. ${o.content}`));
      sections.push('');
    }

    // Hypotheses
    if (this.hypotheses.length > 0) {
      sections.push('**Hypotheses:**');
      this.hypotheses.forEach((h, i) => {
        sections.push(`${i + 1}. ${h.content} (${h.confidence.label})`);
      });
      sections.push('');
    }

    // Key Evidence
    if (this.evidence.length > 0) {
      sections.push('**Key Evidence:**');
      this.evidence.forEach((e, i) => {
        const direction = e.supports.length > 0 ? '+' : e.contradicts.length > 0 ? '-' : '~';
        sections.push(`${direction} ${e.content}`);
      });
      sections.push('');
    }

    // Analysis
    const analyses = this.steps.filter(s => s.type === STEP_TYPES.ANALYSIS);
    if (analyses.length > 0) {
      sections.push('**Analysis:**');
      analyses.forEach((a, i) => sections.push(`- ${a.content}`));
      sections.push('');
    }

    // Conclusions
    if (this.conclusions.length > 0) {
      sections.push('**Conclusions:**');
      this.conclusions.forEach((c, i) => {
        sections.push(`=> ${c.content} (${c.confidence.label})`);
      });
    }

    return sections.join('\n');
  }

  /**
   * Generate structured reasoning trace for audit
   */
  generateTrace() {
    return {
      chainId: this.chainId,
      context: this.context,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      duration: this.completedAt
        ? new Date(this.completedAt) - new Date(this.startedAt)
        : null,
      stepCount: this.steps.length,
      steps: this.steps.map(step => ({
        ...step,
        confidenceLevel: step.confidence.level,
        confidenceLabel: step.confidence.label
      })),
      summary: {
        observations: this.steps.filter(s => s.type === STEP_TYPES.OBSERVATION).length,
        hypotheses: this.hypotheses.length,
        evidence: this.evidence.length,
        analyses: this.steps.filter(s => s.type === STEP_TYPES.ANALYSIS).length,
        inferences: this.steps.filter(s => s.type === STEP_TYPES.INFERENCE).length,
        conclusions: this.conclusions.length
      },
      primaryConclusion: this.getPrimaryConclusion()
    };
  }

  /**
   * Export chain for storage
   */
  export() {
    return {
      chainId: this.chainId,
      context: this.context,
      steps: this.steps,
      hypotheses: this.hypotheses.map(h => h.stepId),
      evidence: this.evidence.map(e => e.stepId),
      conclusions: this.conclusions.map(c => c.stepId),
      startedAt: this.startedAt,
      completedAt: this.completedAt
    };
  }

  /**
   * Import from stored data
   */
  static import(data) {
    const cot = new ChainOfThought(data.context);
    cot.chainId = data.chainId;
    cot.steps = data.steps;
    cot.hypotheses = data.steps.filter(s => data.hypotheses.includes(s.stepId));
    cot.evidence = data.steps.filter(s => data.evidence.includes(s.stepId));
    cot.conclusions = data.steps.filter(s => data.conclusions.includes(s.stepId));
    cot.startedAt = data.startedAt;
    cot.completedAt = data.completedAt;
    return cot;
  }
}

/**
 * Get confidence label from level
 */
function getConfidenceLabel(level) {
  if (level >= 0.95) return 'certain';
  if (level >= 0.8) return 'very likely';
  if (level >= 0.6) return 'likely';
  if (level >= 0.4) return 'possible';
  if (level >= 0.2) return 'unlikely';
  return 'very unlikely';
}

/**
 * Create a new chain of thought
 */
export function createChainOfThought(context = {}) {
  return new ChainOfThought(context);
}

export default { ChainOfThought, createChainOfThought, STEP_TYPES, CONFIDENCE };
