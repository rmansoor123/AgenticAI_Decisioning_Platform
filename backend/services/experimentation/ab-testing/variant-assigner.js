/**
 * Variant Assigner — shared functions for experiment variant assignment
 * Extracted from ab-testing/index.js for reuse by platform-integrator
 */

export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function assignVariant(experiment, entityId) {
  const hash = simpleHash(`${experiment.experimentId || experiment.experiment_id}${entityId}`);
  const bucket = hash % 100;

  if (bucket >= (experiment.trafficAllocation || 100)) {
    return { variant: 'control', inExperiment: false };
  }

  let cumulative = 0;
  for (const variant of (experiment.variants || [])) {
    cumulative += variant.allocation;
    if (bucket < cumulative) {
      return { variant: variant.id, variantName: variant.name, config: variant.config, inExperiment: true };
    }
  }

  return { variant: 'control', inExperiment: false };
}
