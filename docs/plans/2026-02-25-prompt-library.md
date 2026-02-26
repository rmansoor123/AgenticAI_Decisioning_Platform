# Prompt Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full CRUD Prompt Library page that lets users browse, create, edit, and delete the domain knowledge prompts powering the fraud detection agents.

**Architecture:** Backend Express router exposes 6 REST endpoints wrapping the existing PromptRegistry singleton + filesystem operations. Frontend is a single React page (`PromptLibrary.jsx`) with sidebar list, content viewer, markdown editor with live preview, and confirmation modals. Navigation entry added under Risk Operations.

**Tech Stack:** Express router (ES modules), Node fs for file I/O, existing PromptRegistry, React 19, Tailwind CSS 4, Lucide icons.

**Design doc:** `docs/plans/2026-02-25-prompt-library-design.md`

---

### Task 1: Backend — Prompts API Router

**Files:**
- Create: `backend/services/prompts/index.js`

**Step 1: Create the prompts router with all 6 endpoints**

```js
/**
 * Prompts API — CRUD endpoints for domain knowledge prompts.
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

const VALID_AGENTS = ['shared', 'seller-onboarding', 'fraud-investigation', 'alert-triage', 'rule-optimization'];
const VALID_PHASES = ['think', 'plan', 'observe', 'reflect'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];

function buildFrontmatter(metadata) {
  const phases = Array.isArray(metadata.phases) ? `[${metadata.phases.join(', ')}]` : metadata.phases;
  return `---\nid: ${metadata.id}\nagent: ${metadata.agent}\nphases: ${phases}\npriority: ${metadata.priority}\nversion: ${metadata.version || '1'}\n---\n\n`;
}

// GET /api/prompts/stats — Registry statistics (must be before /:id)
router.get('/stats', (req, res) => {
  try {
    const registry = getPromptRegistry();
    res.json({ success: true, data: registry.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/prompts — List all prompts (metadata only)
router.get('/', (req, res) => {
  try {
    const registry = getPromptRegistry();
    const stats = registry.getStats();
    res.json({ success: true, data: stats.prompts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/prompts/:id — Get single prompt with full content
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

// POST /api/prompts — Create a new prompt
router.post('/', (req, res) => {
  try {
    const { id, agent, phases, priority, content } = req.body;

    if (!id || !agent || !phases || !content) {
      return res.status(400).json({ success: false, error: 'Missing required fields: id, agent, phases, content' });
    }
    if (!VALID_AGENTS.includes(agent)) {
      return res.status(400).json({ success: false, error: `Invalid agent. Must be one of: ${VALID_AGENTS.join(', ')}` });
    }
    if (!Array.isArray(phases) || !phases.every(p => VALID_PHASES.includes(p))) {
      return res.status(400).json({ success: false, error: `Invalid phases. Must be array of: ${VALID_PHASES.join(', ')}` });
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ success: false, error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
    }

    const registry = getPromptRegistry();
    if (registry.getPromptById(id)) {
      return res.status(409).json({ success: false, error: `Prompt with id "${id}" already exists` });
    }

    const agentDir = path.join(PROMPTS_DIR, agent);
    if (!existsSync(agentDir)) {
      mkdirSync(agentDir, { recursive: true });
    }

    const filePath = path.join(agentDir, `${id}.md`);
    const fileContent = buildFrontmatter({ id, agent, phases, priority: priority || 'medium' }) + content;
    writeFileSync(filePath, fileContent, 'utf-8');

    registry.reload();
    const created = registry.getPromptById(id);
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/prompts/:id — Update an existing prompt
router.put('/:id', (req, res) => {
  try {
    const registry = getPromptRegistry();
    const existing = registry.getPromptById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    const agent = req.body.agent || existing.agent;
    const phases = req.body.phases || existing.phases;
    const priority = req.body.priority || existing.priority;
    const content = req.body.content !== undefined ? req.body.content : existing.content;
    const version = String(Number(existing.version || '1') + 1);

    if (req.body.agent && !VALID_AGENTS.includes(req.body.agent)) {
      return res.status(400).json({ success: false, error: `Invalid agent. Must be one of: ${VALID_AGENTS.join(', ')}` });
    }
    if (req.body.phases && (!Array.isArray(req.body.phases) || !req.body.phases.every(p => VALID_PHASES.includes(p)))) {
      return res.status(400).json({ success: false, error: `Invalid phases. Must be array of: ${VALID_PHASES.join(', ')}` });
    }
    if (req.body.priority && !VALID_PRIORITIES.includes(req.body.priority)) {
      return res.status(400).json({ success: false, error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
    }

    // If agent changed, move the file
    const newAgentDir = path.join(PROMPTS_DIR, agent);
    if (!existsSync(newAgentDir)) {
      mkdirSync(newAgentDir, { recursive: true });
    }

    // Delete old file if agent changed
    if (req.body.agent && req.body.agent !== existing.agent && existsSync(existing.filePath)) {
      unlinkSync(existing.filePath);
    }

    const filePath = path.join(newAgentDir, `${req.params.id}.md`);
    const fileContent = buildFrontmatter({ id: req.params.id, agent, phases, priority, version }) + content;
    writeFileSync(filePath, fileContent, 'utf-8');

    registry.reload();
    const updated = registry.getPromptById(req.params.id);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/prompts/:id — Delete a prompt
router.delete('/:id', (req, res) => {
  try {
    const registry = getPromptRegistry();
    const existing = registry.getPromptById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    if (existsSync(existing.filePath)) {
      unlinkSync(existing.filePath);
    }

    registry.reload();
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

**Step 2: Mount the router in gateway/server.js**

In `backend/gateway/server.js`, add the import alongside the other router imports (around line 350):
```js
import promptsRouter from '../services/prompts/index.js';
```

Add the app.use line alongside the other mounts (around line 570, after the agents mount):
```js
// Prompts Library
app.use('/api/prompts', promptsRouter);
```

**Step 3: Run the existing prompt-registry test to verify nothing is broken**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && node backend/agents/core/__tests__/prompt-registry.test.js`
Expected: All 8 tests PASS

**Step 4: Commit**

```bash
git add backend/services/prompts/index.js backend/gateway/server.js
git commit -m "feat: add CRUD API endpoints for prompt library"
```

---

### Task 2: Backend — API Integration Test

**Files:**
- Create: `backend/services/prompts/__tests__/prompts-api.test.js`

**Step 1: Write the integration test**

```js
/**
 * Integration test: Prompts API endpoints.
 * Run with: node backend/services/prompts/__tests__/prompts-api.test.js
 */

import { getPromptRegistry } from '../../../agents/core/prompt-registry.js';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.join(__dirname, '../../../agents/prompts');

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  const registry = getPromptRegistry();

  // ── Test 1: Registry has prompts loaded ──
  console.log('\nTest 1: Registry baseline');
  const stats = registry.getStats();
  assert(stats.totalPrompts >= 10, `Baseline: ${stats.totalPrompts} prompts loaded`);

  // ── Test 2: getPromptById returns full data ──
  console.log('\nTest 2: getPromptById returns expected fields');
  const fp = registry.getPromptById('fraud-patterns');
  assert(fp !== null, 'fraud-patterns exists');
  assert(fp.id === 'fraud-patterns', 'id matches');
  assert(fp.agent === 'shared', 'agent is shared');
  assert(Array.isArray(fp.phases), 'phases is array');
  assert(fp.content.length > 100, 'content has substance');
  assert(fp.filePath.endsWith('.md'), 'filePath ends with .md');

  // ── Test 3: getStats returns by-agent and by-phase breakdowns ──
  console.log('\nTest 3: Stats structure');
  assert(typeof stats.byAgent === 'object', 'byAgent is object');
  assert(typeof stats.byPhase === 'object', 'byPhase is object');
  assert(Array.isArray(stats.prompts), 'prompts is array');
  assert(stats.prompts[0].id !== undefined, 'prompt entries have id');
  assert(stats.prompts[0].agent !== undefined, 'prompt entries have agent');
  assert(stats.prompts[0].phases !== undefined, 'prompt entries have phases');
  assert(stats.prompts[0].priority !== undefined, 'prompt entries have priority');

  // ── Test 4: All prompts have required fields ──
  console.log('\nTest 4: All prompts have required fields');
  let allValid = true;
  for (const p of stats.prompts) {
    const full = registry.getPromptById(p.id);
    if (!full.id || !full.agent || !full.phases || !full.content) {
      console.error(`    Missing fields in prompt: ${p.id}`);
      allValid = false;
    }
  }
  assert(allValid, 'All prompts have id, agent, phases, content');

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
```

**Step 2: Run the test**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && node backend/services/prompts/__tests__/prompts-api.test.js`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add backend/services/prompts/__tests__/prompts-api.test.js
git commit -m "test: add integration test for prompts API"
```

---

### Task 3: Frontend — PromptLibrary Page Component

**Files:**
- Create: `src/pages/PromptLibrary.jsx`

**Step 1: Create the full PromptLibrary page component**

This is the main deliverable — a single-file React component following the project's patterns (like `RiskRules.jsx`). It includes:

- Sidebar with collapsible agent groups
- Content viewer with rendered markdown
- Side-by-side markdown editor + live preview (edit mode)
- New prompt form
- Save/delete confirmation modals
- Filters (agent, phase, priority) and search
- Simple regex-based markdown renderer (no external dependency)

The component should:
- Fetch from `GET /api/prompts` on mount to populate the sidebar list
- Fetch from `GET /api/prompts/:id` when a prompt is selected
- POST/PUT/DELETE with confirmation modals
- Use the project's dark theme (`bg-[#12121a]`, `border-gray-800`, etc.)
- Use Lucide icons (`BookOpen`, `Search`, `Plus`, `Edit3`, `Trash2`, `ChevronDown`, `ChevronRight`, `Save`, `X`, `Eye`, `FileText`)
- Group prompts by agent in the sidebar with collapsible sections
- Show metadata badges for priority and phases
- Filter prompts by agent dropdown, phase dropdown, priority dropdown, and text search

**Key UI constants:**
```js
const API_BASE = '/api';

const AGENT_LABELS = {
  'shared': 'Shared',
  'seller-onboarding': 'Seller Onboarding',
  'fraud-investigation': 'Fraud Investigation',
  'alert-triage': 'Alert Triage',
  'rule-optimization': 'Rule Optimization',
};

const AGENT_COLORS = {
  'shared': 'text-blue-400',
  'seller-onboarding': 'text-emerald-400',
  'fraud-investigation': 'text-red-400',
  'alert-triage': 'text-amber-400',
  'rule-optimization': 'text-purple-400',
};

const PRIORITY_COLORS = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const PHASE_COLORS = {
  think: 'bg-blue-500/20 text-blue-400',
  plan: 'bg-purple-500/20 text-purple-400',
  observe: 'bg-emerald-500/20 text-emerald-400',
  reflect: 'bg-amber-500/20 text-amber-400',
};
```

**Markdown renderer function:**
```js
function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-white mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-white mt-6 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-white mt-6 mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-800 px-1.5 py-0.5 rounded text-emerald-400 text-sm">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="text-gray-300 ml-4 list-disc">$1</li>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-gray-600 pl-4 text-gray-400 italic my-2">$1</blockquote>')
    .replace(/\n\n/g, '<br/><br/>');
}
```

**Step 2: Verify it renders without errors**

Start the dev server and navigate to `/prompt-library` in the browser. Verify:
- Sidebar shows 5 agent groups with 10 total prompts
- Clicking a prompt shows its content rendered as markdown
- Edit mode shows side-by-side editor + preview
- New Prompt form has all metadata fields
- Save and Delete show confirmation modals
- Filters narrow the sidebar list

**Step 3: Commit**

```bash
git add src/pages/PromptLibrary.jsx
git commit -m "feat: add PromptLibrary page component with CRUD UI"
```

---

### Task 4: Frontend — Route and Navigation Integration

**Files:**
- Modify: `src/App.jsx` (add import + route)
- Modify: `src/components/Layout.jsx` (add nav entry)

**Step 1: Add route in App.jsx**

Add the import at the top with other page imports:
```js
import PromptLibrary from './pages/PromptLibrary'
```

Add the route inside `<Routes>`, after the `/risk-rules` route:
```jsx
<Route path="/prompt-library" element={<PromptLibrary />} />
```

**Step 2: Add navigation entry in Layout.jsx**

In the `navigation` array, find the `Risk Operations` section (the object with `name: 'Risk Operations'`). Add a new child at the end of its `children` array:
```js
{ name: 'Prompt Library', href: '/prompt-library' }
```

Also add `BookOpen` to the Lucide import at the top of Layout.jsx.

**Step 3: Verify navigation works**

Start the dev server. Verify:
- "Prompt Library" appears under Risk Operations in the sidebar
- Clicking it navigates to `/prompt-library`
- The page loads and shows the prompt list

**Step 4: Commit**

```bash
git add src/App.jsx src/components/Layout.jsx
git commit -m "feat: add Prompt Library to navigation and routes"
```

---

### Task 5: End-to-End Verification

**Step 1: Start the backend**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard/backend && node gateway/server.js`
Verify: Server starts without errors, logs `[PromptRegistry] Loaded 10 domain knowledge prompts`

**Step 2: Test API endpoints manually**

```bash
# List all prompts
curl http://localhost:3001/api/prompts | jq .

# Get single prompt
curl http://localhost:3001/api/prompts/fraud-patterns | jq .

# Get stats
curl http://localhost:3001/api/prompts/stats | jq .
```

Expected: All return `{ success: true, data: ... }` with correct data.

**Step 3: Start the frontend**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && npm run dev`

**Step 4: Verify full CRUD in browser**

1. Navigate to `/prompt-library`
2. Click through each agent group — all 10 prompts should display
3. Select a prompt, click Edit, modify content, click Save — confirm modal appears, save succeeds
4. Click "+ New Prompt", fill form, save — new prompt appears in sidebar
5. Select the new prompt, click Delete — confirm modal appears, prompt is removed
6. Refresh the page — changes persist (they're saved to disk)

**Step 5: Run all tests**

```bash
cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard
node backend/agents/core/__tests__/prompt-registry.test.js
node backend/services/prompts/__tests__/prompts-api.test.js
```

Expected: All tests pass.

**Step 6: Final commit**

If any fixes were needed during verification, commit them:
```bash
git add -A
git commit -m "fix: prompt library end-to-end fixes"
```
