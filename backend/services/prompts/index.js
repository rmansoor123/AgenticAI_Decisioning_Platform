/**
 * Prompts API Router — CRUD endpoints for domain knowledge prompts.
 *
 * Wraps the PromptRegistry singleton + filesystem operations for
 * creating, reading, updating, and deleting prompt markdown files.
 */

import express from 'express';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPromptRegistry } from '../../agents/core/prompt-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.join(__dirname, '../../agents/prompts');

const router = express.Router();

// ============================================================================
// VALIDATION CONSTANTS
// ============================================================================

const VALID_AGENTS = ['shared', 'seller-onboarding', 'fraud-investigation', 'alert-triage', 'rule-optimization'];
const VALID_PHASES = ['think', 'plan', 'observe', 'reflect'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build YAML frontmatter string from metadata object.
 */
function buildFrontmatter(metadata) {
  const phases = Array.isArray(metadata.phases) ? metadata.phases.join(', ') : metadata.phases;
  return [
    '---',
    `id: ${metadata.id}`,
    `agent: ${metadata.agent}`,
    `phases: [${phases}]`,
    `priority: ${metadata.priority}`,
    `version: ${metadata.version}`,
    '---'
  ].join('\n');
}

// ============================================================================
// ROUTES
// ============================================================================

// GET /stats — Registry statistics (MUST be before /:id route)
router.get('/stats', (req, res) => {
  try {
    const registry = getPromptRegistry();
    const stats = registry.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET / — List all prompts (metadata only, no content body)
router.get('/', (req, res) => {
  try {
    const registry = getPromptRegistry();
    const stats = registry.getStats();
    res.json({ success: true, data: stats.prompts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id — Get single prompt with full content
router.get('/:id', (req, res) => {
  try {
    const registry = getPromptRegistry();
    const prompt = registry.getPromptById(req.params.id);
    if (!prompt) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }
    res.json({ success: true, data: prompt });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / — Create new prompt (write .md file, reload registry)
router.post('/', (req, res) => {
  try {
    const { id, agent, phases, priority = 'medium', content } = req.body;

    // Validate required fields
    if (!id) {
      return res.status(400).json({ success: false, error: 'id is required' });
    }
    if (!agent) {
      return res.status(400).json({ success: false, error: 'agent is required' });
    }
    if (!phases) {
      return res.status(400).json({ success: false, error: 'phases is required' });
    }
    if (!content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    // Validate agent
    if (!VALID_AGENTS.includes(agent)) {
      return res.status(400).json({ success: false, error: `Invalid agent. Must be one of: ${VALID_AGENTS.join(', ')}` });
    }

    // Validate phases
    if (!Array.isArray(phases) || phases.length === 0) {
      return res.status(400).json({ success: false, error: 'phases must be a non-empty array' });
    }
    for (const phase of phases) {
      if (!VALID_PHASES.includes(phase)) {
        return res.status(400).json({ success: false, error: `Invalid phase "${phase}". Must be one of: ${VALID_PHASES.join(', ')}` });
      }
    }

    // Validate priority
    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ success: false, error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
    }

    // Check for duplicate ID
    const registry = getPromptRegistry();
    if (registry.getPromptById(id)) {
      return res.status(409).json({ success: false, error: `Prompt with id "${id}" already exists` });
    }

    // Build file content
    const metadata = { id, agent, phases, priority, version: 1 };
    const fileContent = buildFrontmatter(metadata) + '\n\n' + content.trim() + '\n';

    // Ensure agent directory exists
    const agentDir = path.join(PROMPTS_DIR, agent);
    if (!existsSync(agentDir)) {
      mkdirSync(agentDir, { recursive: true });
    }

    // Write file
    const filePath = path.join(agentDir, `${id}.md`);
    writeFileSync(filePath, fileContent, 'utf-8');

    // Reload registry
    registry.reload();

    // Return the created prompt
    const created = registry.getPromptById(id);
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id — Update existing prompt (rewrite .md file, reload registry)
router.put('/:id', (req, res) => {
  try {
    const registry = getPromptRegistry();
    const existing = registry.getPromptById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    // Merge with existing values for optional fields
    const agent = req.body.agent || existing.agent;
    const phases = req.body.phases || existing.phases;
    const priority = req.body.priority || existing.priority;
    const content = req.body.content !== undefined ? req.body.content : existing.content;
    const version = (parseInt(existing.version) || 0) + 1;

    // Validate agent if provided
    if (req.body.agent && !VALID_AGENTS.includes(req.body.agent)) {
      return res.status(400).json({ success: false, error: `Invalid agent. Must be one of: ${VALID_AGENTS.join(', ')}` });
    }

    // Validate phases if provided
    if (req.body.phases) {
      if (!Array.isArray(req.body.phases) || req.body.phases.length === 0) {
        return res.status(400).json({ success: false, error: 'phases must be a non-empty array' });
      }
      for (const phase of req.body.phases) {
        if (!VALID_PHASES.includes(phase)) {
          return res.status(400).json({ success: false, error: `Invalid phase "${phase}". Must be one of: ${VALID_PHASES.join(', ')}` });
        }
      }
    }

    // Validate priority if provided
    if (req.body.priority && !VALID_PRIORITIES.includes(req.body.priority)) {
      return res.status(400).json({ success: false, error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
    }

    // Build file content
    const metadata = { id: req.params.id, agent, phases, priority, version };
    const fileContent = buildFrontmatter(metadata) + '\n\n' + content.trim() + '\n';

    // Handle agent change: delete old file, write to new directory
    if (req.body.agent && req.body.agent !== existing.agent) {
      // Delete old file
      if (existing.filePath && existsSync(existing.filePath)) {
        unlinkSync(existing.filePath);
      }

      // Ensure new agent directory exists
      const newAgentDir = path.join(PROMPTS_DIR, agent);
      if (!existsSync(newAgentDir)) {
        mkdirSync(newAgentDir, { recursive: true });
      }

      // Write to new location
      const newFilePath = path.join(newAgentDir, `${req.params.id}.md`);
      writeFileSync(newFilePath, fileContent, 'utf-8');
    } else {
      // Write in place
      const filePath = existing.filePath || path.join(PROMPTS_DIR, agent, `${req.params.id}.md`);
      writeFileSync(filePath, fileContent, 'utf-8');
    }

    // Reload registry
    registry.reload();

    // Return the updated prompt
    const updated = registry.getPromptById(req.params.id);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id — Delete prompt (remove .md file, reload registry)
router.delete('/:id', (req, res) => {
  try {
    const registry = getPromptRegistry();
    const existing = registry.getPromptById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    // Remove file from disk
    if (existing.filePath && existsSync(existing.filePath)) {
      unlinkSync(existing.filePath);
    }

    // Reload registry
    registry.reload();

    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
