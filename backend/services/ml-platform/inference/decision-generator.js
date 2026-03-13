/**
 * Decision Generator — shared function for generating ML-based decisions
 * Extracted from inference/index.js for reuse by platform-integrator
 */

export function generateDecision(score, modelType) {
  let decision, label;

  if (modelType === 'FRAUD_DETECTION') {
    label = score > 0.7 ? 'FRAUD' : score > 0.4 ? 'SUSPICIOUS' : 'LEGITIMATE';
    decision = score > 0.7 ? 'BLOCK' : score > 0.4 ? 'REVIEW' : 'APPROVE';
  } else if (modelType === 'ATO_PREVENTION') {
    label = score > 0.6 ? 'ATO_RISK' : 'NORMAL';
    decision = score > 0.6 ? 'CHALLENGE' : 'ALLOW';
  } else {
    label = score > 0.5 ? 'HIGH_RISK' : 'LOW_RISK';
    decision = score > 0.5 ? 'FLAG' : 'PASS';
  }

  const boundary = modelType === 'FRAUD_DETECTION' ? 0.5 : 0.5;
  const distanceFromBoundary = Math.abs(score - boundary);
  const confidence = Math.min(0.99, 0.5 + distanceFromBoundary);

  return {
    score: parseFloat(score.toFixed(6)),
    label,
    decision,
    confidence: parseFloat(confidence.toFixed(4)),
    modelType,
    timestamp: new Date().toISOString()
  };
}
