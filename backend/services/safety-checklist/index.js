/**
 * Safety Checklist service.
 *
 * GET    /api/safety-checklist        → grouped checklist (seeds on first call if empty)
 * GET    /api/safety-checklist/raw    → flat array of rows
 * PATCH  /api/safety-checklist/:itemId  → update status/label/note for a single item
 */

import express from 'express';
import { db_ops } from '../../shared/common/database.js';
import { SAFETY_CHECKLIST_SEED } from './seed-data.js';

const router = express.Router();
const VALID_STATUSES = new Set(['done', 'partial', 'not-started']);

let seedAttempted = false;

async function ensureSeeded() {
  if (seedAttempted) return;
  seedAttempted = true;
  try {
    const existing = await db_ops.getAll('safety_checklist', 1, 0);
    if (existing && existing.length > 0) return;
    for (const item of SAFETY_CHECKLIST_SEED) {
      const { itemId, ...rest } = item;
      await db_ops.insert('safety_checklist', 'item_id', itemId, rest);
    }
    console.log(`[safety-checklist] Seeded ${SAFETY_CHECKLIST_SEED.length} items`);
  } catch (err) {
    seedAttempted = false;
    throw err;
  }
}

function groupRows(rows) {
  const byGroup = new Map();
  for (const row of rows) {
    const data = row.data || {};
    const key = data.groupTitle || 'Uncategorized';
    if (!byGroup.has(key)) {
      byGroup.set(key, { title: key, order: data.groupOrder ?? 999, items: [] });
    }
    byGroup.get(key).items.push({
      itemId: row.item_id,
      status: data.status,
      label: data.label,
      note: data.note || null,
      order: data.itemOrder ?? 999
    });
  }
  const groups = [...byGroup.values()].sort((a, b) => a.order - b.order);
  for (const g of groups) g.items.sort((a, b) => a.order - b.order);
  return groups;
}

router.get('/', async (req, res) => {
  try {
    await ensureSeeded();
    const rows = await db_ops.getAll('safety_checklist', 500, 0);
    res.json({ groups: groupRows(rows), totalItems: rows.length });
  } catch (err) {
    console.error('[safety-checklist] GET / failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/raw', async (req, res) => {
  try {
    await ensureSeeded();
    const rows = await db_ops.getAll('safety_checklist', 500, 0);
    res.json({ items: rows });
  } catch (err) {
    console.error('[safety-checklist] GET /raw failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const existing = await db_ops.getById('safety_checklist', 'item_id', itemId);
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const { status, label, note } = req.body || {};
    if (status !== undefined && !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` });
    }

    const updated = {
      ...existing.data,
      ...(status !== undefined ? { status } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(note !== undefined ? { note } : {})
    };
    await db_ops.insert('safety_checklist', 'item_id', itemId, updated);
    res.json({ itemId, data: updated });
  } catch (err) {
    console.error('[safety-checklist] PATCH failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
