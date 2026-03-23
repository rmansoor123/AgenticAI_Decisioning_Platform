/**
 * ONNX Runtime Model Server
 * Uses onnxruntime-node with optional CoreML execution provider for Apple Silicon.
 * Falls back gracefully if onnxruntime-node is not installed.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class OnnxRuntimeServer {
  constructor() {
    this.sessions = new Map();
    this.stats = { predictions: 0, totalLatency: 0, errors: 0 };
    this.ort = null;
  }

  async loadModel(modelName) {
    // Try to load onnxruntime-node
    try {
      this.ort = await import('onnxruntime-node');
    } catch {
      console.warn('[onnx-runtime] onnxruntime-node not installed — run: npm install onnxruntime-node');
      return false;
    }

    // Look for ONNX model in trained-models directory
    const modelPaths = [
      path.join(__dirname, '..', '..', '..', 'ml-training', 'trained-models', `${modelName.replace('-v1', '-v2')}.onnx`),
      path.join(__dirname, '..', '..', '..', 'ml-training', 'trained-models', `${modelName}.onnx`),
      path.join(__dirname, '..', '..', '..', 'ml-training', 'model-repository', modelName, '1', 'model.onnx')
    ];

    let modelPath = null;
    for (const p of modelPaths) {
      if (fs.existsSync(p)) {
        modelPath = p;
        break;
      }
    }

    if (!modelPath) {
      console.warn(`[onnx-runtime] No ONNX model found for ${modelName}`);
      return false;
    }

    try {
      // Try CoreML execution provider first (Apple Silicon acceleration)
      let session;

      try {
        session = await this.ort.InferenceSession.create(modelPath, {
          executionProviders: ['coreml', 'cpu']
        });
        console.log(`[onnx-runtime] Model ${modelName} loaded with CoreML acceleration`);
      } catch {
        session = await this.ort.InferenceSession.create(modelPath, {
          executionProviders: ['cpu']
        });
        console.log(`[onnx-runtime] Model ${modelName} loaded with CPU`);
      }

      this.sessions.set(modelName, session);
      return true;
    } catch (err) {
      console.warn(`[onnx-runtime] Failed to load ${modelName}: ${err.message}`);
      return false;
    }
  }

  async predict(modelName, featureVector) {
    const session = this.sessions.get(modelName);
    if (!session) throw new Error(`Model ${modelName} not loaded`);

    const startTime = performance.now();

    try {
      const inputTensor = new this.ort.Tensor('float32', Float32Array.from(featureVector), [1, featureVector.length]);
      const results = await session.run({ features: inputTensor });
      const score = results.risk_score.data[0];
      const latencyMs = performance.now() - startTime;

      this.stats.predictions++;
      this.stats.totalLatency += latencyMs;

      return {
        score: parseFloat(score.toFixed(6)),
        latencyMs: parseFloat(latencyMs.toFixed(2)),
        backend: 'onnx',
        modelVersion: '2.0.0',
        modelName
      };
    } catch (err) {
      this.stats.errors++;
      throw err;
    }
  }

  async predictBatch(modelName, featureVectors) {
    const session = this.sessions.get(modelName);
    if (!session) throw new Error(`Model ${modelName} not loaded`);

    const startTime = performance.now();
    const batchSize = featureVectors.length;
    const flatData = Float32Array.from(featureVectors.flat());

    const inputTensor = new this.ort.Tensor('float32', flatData, [batchSize, featureVectors[0].length]);
    const results = await session.run({ features: inputTensor });
    const scores = Array.from(results.risk_score.data);
    const latencyMs = performance.now() - startTime;

    this.stats.predictions += batchSize;
    this.stats.totalLatency += latencyMs;

    return {
      scores: scores.map(s => parseFloat(s.toFixed(6))),
      totalLatencyMs: parseFloat(latencyMs.toFixed(2)),
      avgLatencyMs: parseFloat((latencyMs / batchSize).toFixed(2)),
      backend: 'onnx',
      modelVersion: '2.0.0'
    };
  }

  getStats() {
    return {
      backend: 'onnx',
      modelsLoaded: this.sessions.size,
      predictions: this.stats.predictions,
      avgLatencyMs: this.stats.predictions > 0 ? (this.stats.totalLatency / this.stats.predictions).toFixed(2) : 0,
      errors: this.stats.errors
    };
  }
}

export default { OnnxRuntimeServer };
