/**
 * TensorFlow.js Model Server — wraps existing TF.js models
 * into the same interface as Triton and ONNX Runtime.
 */

import { getModelLoader } from './model-loader.js';

export class TfjsModelServer {
  constructor() {
    this.stats = { predictions: 0, totalLatency: 0 };
  }

  async predict(modelName, featureVector) {
    const loader = getModelLoader();
    const model = await loader.ensureLoaded(modelName);

    const startTime = performance.now();
    const result = await model.predict(featureVector);
    const latencyMs = performance.now() - startTime;

    this.stats.predictions++;
    this.stats.totalLatency += latencyMs;

    return {
      score: result.score,
      latencyMs: parseFloat(latencyMs.toFixed(2)),
      backend: 'tfjs',
      modelVersion: result.modelVersion || '1.0.0',
      modelName
    };
  }

  async predictBatch(modelName, featureVectors) {
    const loader = getModelLoader();
    const model = await loader.ensureLoaded(modelName);

    const startTime = performance.now();
    const result = await model.predictBatch(featureVectors);
    const latencyMs = performance.now() - startTime;

    this.stats.predictions += featureVectors.length;
    this.stats.totalLatency += latencyMs;

    return {
      scores: result.scores,
      totalLatencyMs: parseFloat(latencyMs.toFixed(2)),
      avgLatencyMs: parseFloat((latencyMs / featureVectors.length).toFixed(2)),
      backend: 'tfjs',
      modelVersion: result.modelVersion || '1.0.0'
    };
  }

  getStats() {
    return {
      backend: 'tfjs',
      predictions: this.stats.predictions,
      avgLatencyMs: this.stats.predictions > 0 ? (this.stats.totalLatency / this.stats.predictions).toFixed(2) : 0
    };
  }
}

export default { TfjsModelServer };
