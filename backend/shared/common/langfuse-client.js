/**
 * Langfuse client — singleton for observability.
 * Provides trace, generation, and score tracking via the Langfuse SDK.
 *
 * Usage:
 *   import { getLangfuseClient, isLangfuseAvailable } from './langfuse-client.js';
 *   const langfuse = getLangfuseClient();
 *   if (langfuse) { const trace = langfuse.trace({ name: 'agent-run' }); }
 */

import { Langfuse } from 'langfuse';

let instance = null;
let available = false;

/**
 * Get or create the singleton Langfuse client.
 * @returns {Langfuse|null} Langfuse instance, or null if not configured
 */
export function getLangfuseClient() {
  if (instance) return instance;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_HOST || 'http://localhost:3100';

  if (!publicKey || !secretKey) {
    console.warn('[langfuse-client] Missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY — Langfuse disabled');
    return null;
  }

  try {
    instance = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
      flushAt: 10,
      flushInterval: 5000,
    });

    available = true;
    console.log(`[langfuse-client] Connected to ${baseUrl}`);
  } catch (err) {
    console.warn(`[langfuse-client] Init failed: ${err.message}`);
    instance = null;
    available = false;
  }

  return instance;
}

/**
 * Check if Langfuse is available.
 */
export function isLangfuseAvailable() {
  return available && instance !== null;
}

/**
 * Gracefully shutdown Langfuse (flush pending events).
 */
export async function shutdownLangfuse() {
  if (instance) {
    try {
      await instance.shutdownAsync();
    } catch (err) {
      console.warn(`[langfuse-client] Shutdown error: ${err.message}`);
    }
    instance = null;
    available = false;
  }
}
