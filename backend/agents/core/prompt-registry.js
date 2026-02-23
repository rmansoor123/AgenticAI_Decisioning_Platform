/**
 * PromptRegistry — Loads and serves domain knowledge prompts from markdown files.
 *
 * Scans backend/agents/prompts/ for .md files with YAML frontmatter,
 * indexes by agent and phase, serves concatenated knowledge per request.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.join(__dirname, '../prompts');
const DEFAULT_TOKEN_BUDGET = 4000;
const CHARS_PER_TOKEN = 4;

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { metadata, content } where metadata is the parsed frontmatter
 * and content is the markdown body after the frontmatter.
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, content: raw.trim() };

  const yamlBlock = match[1];
  const content = match[2].trim();
  const metadata = {};

  for (const line of yamlBlock.split('\n')) {
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      let value = kvMatch[2].trim();
      // Parse arrays: [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim());
      }
      metadata[key] = value;
    }
  }

  return { metadata, content };
}

class PromptRegistry {
  constructor() {
    this.prompts = new Map();        // id → { metadata, content, filePath }
    this.byAgent = new Map();        // agentKey → [prompt ids]
    this.byPhase = new Map();        // phase → [prompt ids]
    this.loaded = false;
  }

  /**
   * Load all .md files from the prompts directory.
   */
  loadPrompts() {
    this.prompts.clear();
    this.byAgent.clear();
    this.byPhase.clear();

    if (!existsSync(PROMPTS_DIR)) {
      console.warn('[PromptRegistry] Prompts directory not found:', PROMPTS_DIR);
      this.loaded = true;
      return;
    }

    this._scanDirectory(PROMPTS_DIR);
    this.loaded = true;
    console.log(`[PromptRegistry] Loaded ${this.prompts.size} domain knowledge prompts`);
  }

  _scanDirectory(dir) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        this._scanDirectory(fullPath);
      } else if (entry.endsWith('.md')) {
        this._loadFile(fullPath);
      }
    }
  }

  _loadFile(filePath) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const { metadata, content } = parseFrontmatter(raw);

      // Derive ID from filename if not in frontmatter
      const id = metadata.id || path.basename(filePath, '.md');
      // Derive agent from parent directory if not in frontmatter
      const agent = metadata.agent || path.basename(path.dirname(filePath));
      const phases = Array.isArray(metadata.phases) ? metadata.phases : ['think', 'observe'];
      const priority = metadata.priority || 'medium';

      const prompt = { id, agent, phases, priority, content, filePath, version: metadata.version || '1' };
      this.prompts.set(id, prompt);

      // Index by agent (deduplicate in case of ID collision across files)
      if (!this.byAgent.has(agent)) this.byAgent.set(agent, []);
      const agentList = this.byAgent.get(agent);
      if (!agentList.includes(id)) agentList.push(id);

      // Index by phase
      for (const phase of phases) {
        if (!this.byPhase.has(phase)) this.byPhase.set(phase, []);
        const phaseList = this.byPhase.get(phase);
        if (!phaseList.includes(id)) phaseList.push(id);
      }
    } catch (e) {
      console.warn(`[PromptRegistry] Failed to load ${filePath}:`, e.message);
    }
  }

  /**
   * Get concatenated domain knowledge for a specific agent and phase.
   * @param {string} agentKey - Agent prompt directory name (e.g., 'seller-onboarding')
   * @param {string} phase - Reasoning phase ('think', 'plan', 'observe', 'reflect')
   * @param {number} tokenBudget - Maximum tokens for domain knowledge
   * @returns {string} Concatenated markdown or empty string
   */
  getPrompts(agentKey, phase, tokenBudget = DEFAULT_TOKEN_BUDGET) {
    if (!this.loaded) this.loadPrompts();

    // Collect matching prompts: shared + agent-specific, filtered by phase
    const candidateIds = new Set();
    const sharedIds = this.byAgent.get('shared') || [];
    const agentIds = this.byAgent.get(agentKey) || [];

    for (const id of [...sharedIds, ...agentIds]) {
      const prompt = this.prompts.get(id);
      if (prompt && prompt.phases.includes(phase)) {
        candidateIds.add(id);
      }
    }

    if (candidateIds.size === 0) return '';

    // Sort by priority: high > medium > low
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = [...candidateIds]
      .map(id => this.prompts.get(id))
      .sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));

    // Concatenate within token budget
    const maxChars = tokenBudget * CHARS_PER_TOKEN;
    let result = '';
    for (const prompt of sorted) {
      const section = `### ${prompt.id}\n\n${prompt.content}\n\n`;
      if (result.length + section.length > maxChars) {
        // Try to fit a truncated version
        const remaining = maxChars - result.length;
        if (remaining > 200) {
          result += section.slice(0, remaining - 3) + '...';
        }
        break;
      }
      result += section;
    }

    return result.trim();
  }

  /**
   * Get a specific prompt by ID.
   */
  getPromptById(id) {
    if (!this.loaded) this.loadPrompts();
    return this.prompts.get(id) || null;
  }

  /**
   * Reload all prompts from disk.
   */
  reload() {
    this.loaded = false;
    this.loadPrompts();
  }

  /**
   * Get registry statistics.
   */
  getStats() {
    if (!this.loaded) this.loadPrompts();
    return {
      totalPrompts: this.prompts.size,
      byAgent: Object.fromEntries([...this.byAgent].map(([k, v]) => [k, v.length])),
      byPhase: Object.fromEntries([...this.byPhase].map(([k, v]) => [k, v.length])),
      prompts: [...this.prompts.values()].map(p => ({ id: p.id, agent: p.agent, phases: p.phases, priority: p.priority }))
    };
  }
}

// Singleton
let instance = null;
export function getPromptRegistry() {
  if (!instance) {
    instance = new PromptRegistry();
    instance.loadPrompts();
  }
  return instance;
}
