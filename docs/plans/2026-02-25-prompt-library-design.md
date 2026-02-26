# Prompt Library — Design Document

**Date:** 2026-02-25
**Status:** Approved

## Overview

A full CRUD Prompt Library page for the fraud detection dashboard, allowing team members to browse, create, edit, and delete domain knowledge prompts that power the agentic AI system.

## Approach

Dedicated page with sidebar list (Approach A). Three-panel layout: header with filters, sidebar with prompt list grouped by agent, main content area with viewer/editor.

## Page Layout

**Route:** `/prompt-library` under Risk Operations in sidebar navigation.

### View Mode

```
┌─────────────────────────────────────────────────────────────┐
│  Prompt Library                          [+ New Prompt]     │
│  [Agent ▾] [Phase ▾] [Priority ▾]  [🔍 Search...]         │
├──────────────┬──────────────────────────────────────────────┤
│  SIDEBAR     │  MAIN CONTENT                               │
│  (grouped by │  ┌─ Prompt Header ─────────────────────┐    │
│   agent,     │  │ Name, Agent, Priority, Phases, Ver.  │    │
│   collapsible│  │ [Edit] [Delete]                      │    │
│   sections)  │  └──────────────────────────────────────┘    │
│              │  ┌─ Content ────────────────────────────┐    │
│              │  │ Rendered markdown preview             │    │
│              │  └──────────────────────────────────────┘    │
├──────────────┴──────────────────────────────────────────────┤
│  Prompt count │ Registry status                             │
└─────────────────────────────────────────────────────────────┘
```

### Edit Mode

Content area switches to side-by-side editor + preview:

```
┌─ Editor ──────────────┬─ Preview ─────────────────┐
│ Raw markdown input    │ Rendered markdown output   │
└───────────────────────┴───────────────────────────┘
        [Cancel]                    [Save]
```

### Metadata Editing

Edit mode also shows metadata fields above the editor:
- Agent category (dropdown)
- Phases (multi-select checkboxes)
- Priority (dropdown)

### New Prompt

"+ New Prompt" replaces content area with:
- Prompt ID (text input)
- Agent category (dropdown)
- Phases (multi-select checkboxes)
- Priority (dropdown)
- Content (markdown editor + preview)

### Confirmation Modals

- **Save:** "Save changes to `{id}`? This will immediately update the prompt used by agents."
- **Delete:** "Are you sure you want to delete `{id}`? This cannot be undone."

## Backend API

New REST endpoints under `/api/prompts`:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/prompts` | List all prompts (metadata only) |
| `GET` | `/api/prompts/:id` | Get single prompt with full content |
| `POST` | `/api/prompts` | Create new prompt |
| `PUT` | `/api/prompts/:id` | Update existing prompt |
| `DELETE` | `/api/prompts/:id` | Delete prompt |
| `GET` | `/api/prompts/stats` | Registry statistics |

### Request/Response Shapes

```js
// GET /api/prompts → list
[{ id, agent, phases, priority, version, filePath }]

// GET /api/prompts/:id → detail
{ id, agent, phases, priority, version, content, filePath }

// POST /api/prompts → create
{ id, agent, phases, priority, content }
// Writes to: backend/agents/prompts/{agent}/{id}.md

// PUT /api/prompts/:id → update
{ agent, phases, priority, content }  // all optional
// Rebuilds frontmatter + content, rewrites file

// DELETE /api/prompts/:id
// Removes file, reloads registry
```

### Key Behaviors

- Every write operation calls `registry.reload()` for immediate effect
- File naming: `backend/agents/prompts/{agent}/{id}.md`
- Creates agent directory if it doesn't exist on create
- Validates: no duplicate IDs, non-empty content, valid agent/phase/priority values

## Frontend Components

**Single file:** `src/pages/PromptLibrary.jsx`

Follows project convention (like RiskRules.jsx) — self-contained page component.

### Internal Sections

1. Header bar — title, filters, search, new prompt button
2. Sidebar — grouped prompt list, collapsible, click to select
3. Content viewer — metadata header + rendered markdown
4. Editor mode — side-by-side markdown editor + preview
5. New prompt form — metadata fields + editor
6. Confirmation modals — save/delete overlays

### State

- `prompts[]` — list from API
- `selectedId` / `selectedPrompt` — current selection
- `editMode` / `editContent` / `editMetadata` — editing state
- `filters` — { agent, phase, priority, search }
- `modal` — { type: 'save'|'delete'|null }
- `creating` — new prompt mode

### Markdown Rendering

Regex-based renderer (no external dependency). Handles: headings, bold, lists, code, blockquotes.

## Navigation Integration

**Layout.jsx sidebar:** Add under Risk Operations with BookOpen icon.

```
Risk Operations
  ├─ Agentic AI
  ├─ Observability
  ├─ RAG Evaluation
  └─ Prompt Library  (BookOpen icon)
```

**Router:** `<Route path="/prompt-library" element={<PromptLibrary />} />`

## Backend Files

- **New:** `backend/services/prompts/index.js` — Express router
- **Modified:** `backend/gateway/server.js` — Mount `/api/prompts` route
- Uses existing `getPromptRegistry()` singleton from `backend/agents/core/prompt-registry.js`

## Styling

Matches existing dark theme:
- `bg-[#12121a]`, `border-gray-800`
- Emerald/amber/red for status colors
- Lucide React icons
- Consistent with RiskRules.jsx patterns
