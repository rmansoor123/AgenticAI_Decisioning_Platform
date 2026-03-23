/**
 * Nvidia Triton Inference Server Client
 * Uses Triton's HTTP/REST API (v2) for inference.
 *
 * Triton must be running at TRITON_URL (default: http://localhost:8000)
 */

const TRITON_URL = process.env.TRITON_URL || 'http://localhost:8000';

export class TritonClient {
  constructor() {
    this.baseUrl = TRITON_URL;
    this.stats = { predictions: 0, totalLatency: 0, errors: 0 };
  }

  async healthCheck() {
    try {
      const res = await fetch(`${this.baseUrl}/v2/health/ready`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async predict(modelName, featureVector) {
    const startTime = performance.now();

    try {
      const res = await fetch(`${this.baseUrl}/v2/models/${modelName}/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: [{
            name: 'features',
            shape: [1, featureVector.length],
            datatype: 'FP32',
            data: featureVector
          }]
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (!res.ok) {
        throw new Error(`Triton inference failed: ${res.status}`);
      }

      const result = await res.json();
      const score = result.outputs?.[0]?.data?.[0] || 0;
      const latencyMs = performance.now() - startTime;

      this.stats.predictions++;
      this.stats.totalLatency += latencyMs;

      return {
        score: parseFloat(score.toFixed(6)),
        latencyMs: parseFloat(latencyMs.toFixed(2)),
        backend: 'triton',
        modelVersion: '2.0.0',
        modelName
      };
    } catch (err) {
      this.stats.errors++;
      throw err;
    }
  }

  async predictBatch(modelName, featureVectors) {
    const startTime = performance.now();
    const batchSize = featureVectors.length;
    const flatData = featureVectors.flat();

    const res = await fetch(`${this.baseUrl}/v2/models/${modelName}/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: [{
          name: 'features',
          shape: [batchSize, featureVectors[0].length],
          datatype: 'FP32',
          data: flatData
        }]
      }),
      signal: AbortSignal.timeout(10000)
    });

    const result = await res.json();
    const scores = result.outputs?.[0]?.data || [];
    const latencyMs = performance.now() - startTime;

    this.stats.predictions += batchSize;
    this.stats.totalLatency += latencyMs;

    return {
      scores: scores.map(s => parseFloat(s.toFixed(6))),
      totalLatencyMs: parseFloat(latencyMs.toFixed(2)),
      avgLatencyMs: parseFloat((latencyMs / batchSize).toFixed(2)),
      backend: 'triton',
      modelVersion: '2.0.0'
    };
  }

  getStats() {
    return {
      backend: 'triton',
      url: this.baseUrl,
      predictions: this.stats.predictions,
      avgLatencyMs: this.stats.predictions > 0 ? (this.stats.totalLatency / this.stats.predictions).toFixed(2) : 0,
      errors: this.stats.errors
    };
  }
}

export default { TritonClient };
