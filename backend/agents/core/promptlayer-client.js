/**
 * PromptLayer Client — tracks every LLM call with prompt metadata.
 *
 * PromptLayer sits between your code and the LLM API:
 * - Logs every prompt + completion
 * - Tracks prompt versions and performance
 * - Enables prompt A/B testing
 * - Provides a dashboard for prompt analytics
 */

let promptLayerModule = null;
let available = false;
let initAttempted = false;

async function getPromptLayer() {
  if (promptLayerModule) return promptLayerModule;
  if (initAttempted) return null;
  initAttempted = true;

  const apiKey = process.env.PROMPTLAYER_API_KEY;
  if (!apiKey) {
    console.warn('[promptlayer] PROMPTLAYER_API_KEY not set — PromptLayer disabled');
    return null;
  }

  try {
    const pl = await import('promptlayer');
    promptLayerModule = pl.default || pl;
    // Initialize with API key
    if (promptLayerModule.api_key !== undefined) {
      promptLayerModule.api_key = apiKey;
    }
    available = true;
    console.log('[promptlayer] Connected');
    return promptLayerModule;
  } catch (err) {
    console.warn(`[promptlayer] Failed to initialize: ${err.message}`);
    return null;
  }
}

/**
 * Track a prompt call in PromptLayer.
 * Fire-and-forget — never blocks agent flow.
 *
 * @param {Object} params
 * @param {string} params.promptName - Prompt name (e.g., 'think-phase')
 * @param {string} params.promptVersion - Version string
 * @param {string|Object} params.input - The prompt sent to the LLM
 * @param {string|Object} params.output - The LLM response
 * @param {string} params.model - Model name (e.g., 'gpt-4o-mini')
 * @param {number} params.latencyMs - Call latency in milliseconds
 * @param {number} params.tokens - Total tokens used
 * @param {string} params.agentId - Agent identifier
 * @param {Object} params.metadata - Additional metadata
 */
export async function trackPromptCall(params) {
  const { promptName, promptVersion, input, output, model, latencyMs, tokens, agentId, metadata } = params;

  const pl = await getPromptLayer();
  if (!pl) return;

  try {
    // PromptLayer track.request API
    if (pl.track?.request) {
      await pl.track.request({
        function_name: model || 'gpt-4o-mini',
        kwargs: {
          messages: [{
            role: 'user',
            content: typeof input === 'string' ? input : JSON.stringify(input)
          }]
        },
        request_response: {
          choices: [{
            message: {
              content: typeof output === 'string' ? output : JSON.stringify(output)
            }
          }]
        },
        tags: [agentId, promptName, `v${promptVersion || '1'}`].filter(Boolean),
        metadata: {
          prompt_name: promptName,
          prompt_version: promptVersion,
          agent_id: agentId,
          latency_ms: latencyMs,
          tokens,
          ...metadata
        }
      });
    } else if (pl.log) {
      // Fallback to simpler log API if track.request not available
      await pl.log({
        function_name: model || 'gpt-4o-mini',
        prompt: typeof input === 'string' ? input : JSON.stringify(input),
        response: typeof output === 'string' ? output : JSON.stringify(output),
        tags: [agentId, promptName, `v${promptVersion || '1'}`].filter(Boolean),
        metadata: {
          prompt_name: promptName,
          prompt_version: promptVersion,
          agent_id: agentId,
          latency_ms: latencyMs,
          tokens,
          ...metadata
        }
      });
    }
  } catch (err) {
    // Non-critical — don't break agent flow
  }
}

/**
 * Check if PromptLayer is available.
 */
export function isPromptLayerAvailable() {
  return available;
}

/**
 * Get PromptLayer connection status.
 */
export function getPromptLayerStatus() {
  return {
    available,
    configured: !!process.env.PROMPTLAYER_API_KEY,
    initAttempted
  };
}

export default { trackPromptCall, isPromptLayerAvailable, getPromptLayerStatus, getPromptLayer };
