/**
 * One-shot seed script — exercises the same db_ops code path the
 * /api/safety-checklist route uses, so verification proves the service
 * path works, not just raw psql.
 *
 * Run with: DB_BACKEND=postgres node scripts/seed-safety-checklist.js
 */

import { initializeDb } from '../backend/shared/common/database-factory.js';
import { db_ops } from '../backend/shared/common/database.js';
import { SAFETY_CHECKLIST_SEED } from '../backend/services/safety-checklist/seed-data.js';

const backend = await initializeDb();
console.log(`[seed] backend = ${backend}`);

const existing = await db_ops.getAll('safety_checklist', 1, 0);
if (existing && existing.length > 0) {
  console.log(`[seed] table already has ${existing.length} row(s) — skipping seed`);
} else {
  for (const item of SAFETY_CHECKLIST_SEED) {
    const { itemId, ...rest } = item;
    await db_ops.insert('safety_checklist', 'item_id', itemId, rest);
  }
  console.log(`[seed] inserted ${SAFETY_CHECKLIST_SEED.length} rows`);
}

const all = await db_ops.getAll('safety_checklist', 500, 0);
console.log(`[seed] verified total rows = ${all.length}`);

const sample = all.find(r => r.item_id === 'SC-DECISION-6');
if (sample) {
  console.log(`[seed] sample SC-DECISION-6:`, JSON.stringify({
    item_id: sample.item_id,
    status: sample.data.status,
    label: sample.data.label,
    note: sample.data.note
  }, null, 2));
}

process.exit(0);
