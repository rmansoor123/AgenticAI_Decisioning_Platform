/**
 * Migration Runner
 * Handles database schema migrations for the Fraud Detection Platform
 */

import initialSchema from './001-initial-schema.js';
import sellerImages from './002-seller-images.js';
import riskProfiles from './003-risk-profiles.js';
import knowledgeBase from './004-knowledge-base.js';
import agentMemory from './005-agent-memory.js';
import orchestration from './006-orchestration.js';
import observability from './007-observability.js';

const migrations = [
  { version: '001', name: 'initial-schema', migration: initialSchema },
  { version: '002', name: 'seller-images', migration: sellerImages },
  { version: '003', name: 'risk-profiles', migration: riskProfiles },
  { version: '004', name: 'knowledge-base', migration: knowledgeBase },
  { version: '005', name: 'agent-memory', migration: agentMemory },
  { version: '006', name: 'orchestration', migration: orchestration },
  { version: '007', name: 'observability', migration: observability }
];

/**
 * Run all pending migrations
 */
export function runMigrations(db) {
  // Ensure migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get applied migrations
  const appliedVersions = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(row => row.version)
  );

  // Run pending migrations
  let migrationsApplied = 0;
  for (const { version, name, migration } of migrations) {
    if (!appliedVersions.has(version)) {
      console.log(`Applying migration ${version}: ${name}...`);
      try {
        migration.up(db);
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
        migrationsApplied++;
        console.log(`Migration ${version} applied successfully`);
      } catch (error) {
        console.error(`Migration ${version} failed:`, error.message);
        throw error;
      }
    }
  }

  if (migrationsApplied === 0) {
    console.log('Database schema is up to date');
  } else {
    console.log(`Applied ${migrationsApplied} migration(s)`);
  }

  return migrationsApplied;
}

/**
 * Rollback the last migration
 */
export function rollbackMigration(db) {
  const lastMigration = db.prepare(
    'SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'
  ).get();

  if (!lastMigration) {
    console.log('No migrations to rollback');
    return false;
  }

  const migration = migrations.find(m => m.version === lastMigration.version);
  if (migration) {
    console.log(`Rolling back migration ${migration.version}: ${migration.name}...`);
    migration.migration.down(db);
    db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(migration.version);
    console.log(`Migration ${migration.version} rolled back successfully`);
    return true;
  }

  return false;
}

/**
 * Get migration status
 */
export function getMigrationStatus(db) {
  try {
    const applied = db.prepare('SELECT * FROM schema_migrations ORDER BY applied_at').all();
    return {
      applied,
      pending: migrations.filter(m => !applied.find(a => a.version === m.version)),
      total: migrations.length
    };
  } catch (error) {
    return {
      applied: [],
      pending: migrations,
      total: migrations.length
    };
  }
}

export default { runMigrations, rollbackMigration, getMigrationStatus };
