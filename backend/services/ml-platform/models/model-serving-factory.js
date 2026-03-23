/**
 * Model Serving Factory — selects inference backend.
 *
 * MODEL_SERVING_BACKEND env var:
 *   triton → Nvidia Triton Inference Server (gRPC)
 *   onnx   → ONNX Runtime (with CoreML on Apple Silicon)
 *   tfjs   → TensorFlow.js in-process (default fallback)
 */

let resolvedBackend = null;
let resolvedType = 'tfjs';

export function getModelServingType() {
  return resolvedType;
}

export async function getModelServingBackend() {
  if (resolvedBackend) return resolvedBackend;

  const backend = (process.env.MODEL_SERVING_BACKEND || 'tfjs').toLowerCase();

  if (backend === 'triton') {
    try {
      const { TritonClient } = await import('./triton-client.js');
      const client = new TritonClient();
      const healthy = await client.healthCheck();
      if (healthy) {
        resolvedBackend = client;
        resolvedType = 'triton';
        console.log('[model-serving-factory] Triton Inference Server connected');
        return resolvedBackend;
      }
      console.warn('[model-serving-factory] Triton not healthy, trying ONNX...');
    } catch (err) {
      console.warn(`[model-serving-factory] Triton failed: ${err.message}`);
    }
  }

  if (backend === 'onnx' || backend === 'triton') {
    try {
      const { OnnxRuntimeServer } = await import('./onnx-runtime-server.js');
      const server = new OnnxRuntimeServer();
      const loaded = await server.loadModel('onboarding-risk-v1');
      if (loaded) {
        resolvedBackend = server;
        resolvedType = 'onnx';
        console.log('[model-serving-factory] ONNX Runtime active');
        return resolvedBackend;
      }
      console.warn('[model-serving-factory] ONNX model not found, falling back to TF.js');
    } catch (err) {
      console.warn(`[model-serving-factory] ONNX failed: ${err.message}`);
    }
  }

  // Fallback: TF.js (always works)
  const { TfjsModelServer } = await import('./tfjs-model-server.js');
  resolvedBackend = new TfjsModelServer();
  resolvedType = 'tfjs';
  console.log('[model-serving-factory] TensorFlow.js in-process serving active');
  return resolvedBackend;
}

export default { getModelServingBackend, getModelServingType };
