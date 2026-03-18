/**
 * Streaming factory — routes to Kafka or the in-process StreamEngine
 * based on the STREAMING_BACKEND env var ('kafka' | 'memory').
 *
 * Usage:
 *   import { getStreamingBackend, getStreamingBackendType } from './streaming-factory.js';
 *   const engine = await getStreamingBackend();
 *   engine.produce('transactions.received', txId, payload);
 *
 * Factory contract mirrors cache-factory.js: resolved instance is cached
 * after the first call and reused for all subsequent calls.
 */

let resolvedEngine = null;
let resolvedBackendType = 'memory';

/**
 * Get the resolved streaming backend type.
 * @returns {'kafka' | 'memory'}
 */
export function getStreamingBackendType() {
  return resolvedBackendType;
}

/**
 * Get (or initialise) the streaming engine.
 * Tries Kafka first when STREAMING_BACKEND=kafka; falls back to the
 * in-process StreamEngine on any connection failure.
 *
 * @returns {Promise<import('./kafka-stream-engine.js').KafkaStreamEngine | object>}
 */
export async function getStreamingBackend() {
  if (resolvedEngine) return resolvedEngine;

  const backend = (process.env.STREAMING_BACKEND || 'memory').toLowerCase();

  if (backend === 'kafka') {
    try {
      const { KafkaStreamEngine } = await import('./kafka-stream-engine.js');
      const engine = new KafkaStreamEngine();
      await engine.connect();
      resolvedEngine = engine;
      resolvedBackendType = 'kafka';
      console.log('[streaming-factory] Kafka streaming engine connected');
      return resolvedEngine;
    } catch (err) {
      console.warn(`[streaming-factory] Kafka failed: ${err.message}, falling back to in-process engine`);
    }
  }

  const { getStreamEngine } = await import('./stream-engine.js');
  resolvedEngine = getStreamEngine();
  resolvedBackendType = 'memory';
  console.log('[streaming-factory] In-process streaming engine active');
  return resolvedEngine;
}
