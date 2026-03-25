/**
 * Langfuse Prompt Manager — syncs prompts to Langfuse, fetches versioned prompts at runtime.
 *
 * - On startup: pushes all local .md prompts to Langfuse as named prompts
 * - At runtime: fetches prompt from Langfuse (with version/label), falls back to local file
 * - Supports: versioning, production/staging labels, variable interpolation
 */

import { getLangfuseClient } from '../../shared/common/langfuse-client.js';
import { getPromptRegistry } from './prompt-registry.js';

class LangfusePromptManager {
  constructor() {
    this.synced = false;
    this.lastSyncAt = null;
    this.stats = { fetched: 0, fallbacks: 0, synced: 0, syncErrors: 0 };
  }

  /**
   * Sync all local prompts to Langfuse as named prompts.
   * Each prompt is pushed with its content and metadata as config.
   * Existing prompts in Langfuse are updated (new version created).
   */
  async syncToLangfuse() {
    const langfuse = getLangfuseClient();
    if (!langfuse) {
      console.warn('[langfuse-prompts] Langfuse not available — skipping sync');
      return { synced: 0, errors: 0 };
    }

    const registry = getPromptRegistry();
    if (!registry.loaded) registry.loadPrompts();

    let synced = 0;
    let errors = 0;

    for (const [id, prompt] of registry.prompts) {
      try {
        await langfuse.createPrompt({
          name: id,
          prompt: prompt.content,
          labels: ['production'],
          config: {
            agent: prompt.agent || 'shared',
            phases: Array.isArray(prompt.phases) ? prompt.phases.join(',') : 'general',
            priority: prompt.priority || 'medium',
            version: prompt.version || '1'
          }
        });
        synced++;
      } catch (err) {
        // Prompt may already exist — that's fine
        if (!err.message?.includes('already exists')) {
          console.warn(`[langfuse-prompts] Failed to sync ${id}: ${err.message}`);
          errors++;
        }
      }
    }

    this.stats.synced = synced;
    this.stats.syncErrors = errors;
    this.synced = true;
    this.lastSyncAt = new Date().toISOString();
    console.log(`[langfuse-prompts] Synced ${synced} prompts to Langfuse (${errors} errors)`);
    return { synced, errors };
  }

  /**
   * Fetch prompt from Langfuse with fallback to local registry.
   * @param {string} name - Prompt name/ID
   * @param {Object} options - { version, label, variables }
   * @returns {Object|null} { content, source, version, name }
   */
  async getPrompt(name, options = {}) {
    const { version, label = 'production', variables = {} } = options;

    const langfuse = getLangfuseClient();
    if (langfuse) {
      try {
        const prompt = await langfuse.getPrompt(name, version, { label });
        if (prompt) {
          this.stats.fetched++;
          let content = prompt.prompt || prompt.compiledPrompt;
          // Variable interpolation: {{variableName}} → value
          for (const [key, value] of Object.entries(variables)) {
            content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
          }
          return { content, source: 'langfuse', version: prompt.version, name };
        }
      } catch (err) {
        // Langfuse unavailable — fall through to local
      }
    }

    // Fallback to local prompt registry
    const registry = getPromptRegistry();
    if (!registry.loaded) registry.loadPrompts();
    const local = registry.prompts.get(name);
    if (local) {
      this.stats.fallbacks++;
      let content = local.content;
      for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
      return { content, source: 'local', version: local.version || 'file', name };
    }

    return null;
  }

  /**
   * Fetch version history for a prompt from Langfuse.
   * @param {string} name - Prompt name/ID
   * @returns {Array} Version history entries
   */
  async getVersionHistory(name) {
    const langfuse = getLangfuseClient();
    if (!langfuse) return [];

    try {
      // Langfuse SDK may support listing prompt versions
      const versions = [];
      // Try fetching recent versions (Langfuse stores versions sequentially)
      for (let v = 1; v <= 20; v++) {
        try {
          const prompt = await langfuse.getPrompt(name, v);
          if (prompt) {
            versions.push({
              version: v,
              createdAt: prompt.createdAt || null,
              labels: prompt.labels || [],
              contentPreview: (prompt.prompt || '').slice(0, 100)
            });
          }
        } catch {
          // Version doesn't exist — stop searching
          break;
        }
      }
      return versions;
    } catch (err) {
      console.warn(`[langfuse-prompts] Failed to fetch history for ${name}: ${err.message}`);
      return [];
    }
  }

  /**
   * Test a prompt with variable interpolation (no LLM call).
   * @param {string} name - Prompt name/ID
   * @param {Object} variables - Variables to interpolate
   * @returns {Object|null} { content, variables, source }
   */
  async testPrompt(name, variables = {}) {
    const result = await this.getPrompt(name, { variables });
    if (!result) return null;
    return {
      name,
      content: result.content,
      source: result.source,
      version: result.version,
      variablesApplied: Object.keys(variables)
    };
  }

  /**
   * Get manager stats.
   */
  getStats() {
    return {
      synced: this.synced,
      lastSyncAt: this.lastSyncAt,
      ...this.stats
    };
  }
}

// Singleton
let instance = null;

export function getLangfusePromptManager() {
  if (!instance) instance = new LangfusePromptManager();
  return instance;
}

export default { getLangfusePromptManager };
