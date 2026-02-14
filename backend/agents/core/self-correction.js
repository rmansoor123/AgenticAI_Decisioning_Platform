/**
 * Self-Correction - Outcome tracking and reasoning adjustment
 *
 * After decisions, tracks predictions vs actual outcomes.
 * When accuracy drops, analyzes errors and updates reasoning.
 */

import { getMemoryStore } from './memory-store.js';

class SelfCorrection {
  constructor(agentId) {
    this.agentId = agentId;
    this.memoryStore = getMemoryStore();
    this.predictions = [];
    this.accuracyThreshold = 0.7;
  }

  logPrediction(decisionId, sellerId, prediction, confidence, reasoning) {
    const entry = {
      decisionId,
      agentId: this.agentId,
      sellerId,
      prediction,
      confidence,
      reasoning,
      actualOutcome: null,
      verified: false,
      createdAt: new Date().toISOString()
    };

    this.predictions.push(entry);

    this.memoryStore.saveLongTerm(this.agentId, 'pattern', {
      type: 'prediction',
      ...entry
    }, confidence);

    return entry;
  }

  recordOutcome(sellerId, actualOutcome) {
    const matching = this.predictions.filter(p => p.sellerId === sellerId && !p.verified);

    for (const pred of matching) {
      pred.actualOutcome = actualOutcome;
      pred.verified = true;
      pred.wasCorrect = this._checkCorrectness(pred.prediction, actualOutcome);
      pred.verifiedAt = new Date().toISOString();
    }

    const recentPredictions = this.predictions.filter(p => p.verified).slice(-50);
    if (recentPredictions.length >= 10) {
      const accuracy = recentPredictions.filter(p => p.wasCorrect).length / recentPredictions.length;
      if (accuracy < this.accuracyThreshold) {
        this._runCorrectionCycle(recentPredictions);
      }
    }
  }

  getAccuracy() {
    const verified = this.predictions.filter(p => p.verified);
    if (verified.length === 0) return { accuracy: 1, total: 0, correct: 0 };

    const correct = verified.filter(p => p.wasCorrect).length;
    return {
      accuracy: correct / verified.length,
      total: verified.length,
      correct,
      incorrect: verified.length - correct,
      recentAccuracy: this._getRecentAccuracy(20),
      totalPredictions: this.predictions.length
    };
  }

  _checkCorrectness(prediction, actualOutcome) {
    const correctMapping = {
      'fraud': 'REJECT',
      'chargeback': 'REJECT',
      'legitimate': 'APPROVE',
      'successful': 'APPROVE',
      'suspicious': 'ESCALATE'
    };

    const expectedDecision = correctMapping[actualOutcome] || null;
    if (!expectedDecision) return prediction !== 'APPROVE';
    return prediction === expectedDecision;
  }

  _getRecentAccuracy(n) {
    const recent = this.predictions.filter(p => p.verified).slice(-n);
    if (recent.length === 0) return 1;
    return recent.filter(p => p.wasCorrect).length / recent.length;
  }

  _runCorrectionCycle(recentPredictions) {
    const incorrect = recentPredictions.filter(p => !p.wasCorrect);

    const errorPatterns = {};
    for (const pred of incorrect) {
      const key = `${pred.prediction}->${pred.actualOutcome}`;
      errorPatterns[key] = (errorPatterns[key] || 0) + 1;
    }

    this.memoryStore.saveLongTerm(this.agentId, 'correction', {
      type: 'accuracy_correction',
      errorPatterns,
      incorrectCount: incorrect.length,
      totalReviewed: recentPredictions.length,
      accuracy: recentPredictions.filter(p => p.wasCorrect).length / recentPredictions.length,
      correctedAt: new Date().toISOString(),
      lesson: `Common errors: ${Object.entries(errorPatterns).map(([k, v]) => `${k} (${v}x)`).join(', ')}`
    }, 0.9);
  }
}

export function createSelfCorrection(agentId) {
  return new SelfCorrection(agentId);
}

export default { SelfCorrection, createSelfCorrection };
