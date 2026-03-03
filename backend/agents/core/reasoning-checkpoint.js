/**
 * Reasoning Checkpoint - Saves/loads intermediate TPAOR state.
 *
 * Enables crash recovery and debugging by persisting each reasoning step.
 * Uses SQLite for durability via the project's db_ops pattern.
 */

import { db_ops } from '../../shared/common/database.js';

const CHECKPOINT_TABLE = 'reasoning_checkpoints';

class ReasoningCheckpoint {
  constructor() {
    this.stats = { saved: 0, loaded: 0, resumed: 0, expired: 0 };
  }

  /**
   * Save a checkpoint at a specific reasoning phase.
   * @param {string} sessionId - The reasoning session ID (traceId)
   * @param {string} agentId - The agent performing reasoning
   * @param {string} phase - Current phase: 'think', 'plan', 'act', 'observe', 'reflect'
   * @param {Object} state - The state to persist
   */
  save(sessionId, agentId, phase, state) {
    const checkpointId = `CKPT-${sessionId}-${phase}`;
    const checkpoint = {
      checkpointId,
      sessionId,
      agentId,
      phase,
      state: JSON.stringify(state).slice(0, 50000),
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    db_ops.insert(CHECKPOINT_TABLE, 'checkpoint_id', checkpointId, checkpoint);
    this.stats.saved++;
    return checkpointId;
  }

  /**
   * Load the latest checkpoint for a session.
   * @param {string} sessionId - The reasoning session ID
   * @returns {Object|null} { phase, state, savedAt } or null
   */
  load(sessionId) {
    const all = db_ops.getAll(CHECKPOINT_TABLE, 100, 0)
      .map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data)
      .filter(c => c.sessionId === sessionId && new Date(c.expiresAt) > new Date())
      .sort((a, b) => {
        const timeDiff = new Date(b.savedAt) - new Date(a.savedAt);
        if (timeDiff !== 0) return timeDiff;
        // Tiebreak by phase ordering (later phases win)
        const phaseOrder = ['think', 'plan', 'act', 'observe', 'reflect', 'judge', 'conclude'];
        return phaseOrder.indexOf(b.phase) - phaseOrder.indexOf(a.phase);
      });

    if (all.length === 0) return null;

    this.stats.loaded++;
    const latest = all[0];
    return {
      phase: latest.phase,
      state: JSON.parse(latest.state),
      savedAt: latest.savedAt,
      agentId: latest.agentId,
    };
  }

  /**
   * Load all checkpoints for a session (for debugging/replay).
   */
  loadAll(sessionId) {
    return db_ops.getAll(CHECKPOINT_TABLE, 100, 0)
      .map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data)
      .filter(c => c.sessionId === sessionId)
      .sort((a, b) => {
        const phaseOrder = ['think', 'plan', 'act', 'observe', 'reflect', 'judge', 'conclude'];
        return phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase);
      })
      .map(c => ({
        phase: c.phase,
        state: JSON.parse(c.state),
        savedAt: c.savedAt,
      }));
  }

  /**
   * Clear checkpoints for a completed session.
   */
  clear(sessionId) {
    const all = db_ops.getAll(CHECKPOINT_TABLE, 100, 0)
      .map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data)
      .filter(c => c.sessionId === sessionId);

    for (const c of all) {
      db_ops.delete(CHECKPOINT_TABLE, 'checkpoint_id', c.checkpointId);
    }
  }

  /**
   * Purge expired checkpoints (housekeeping).
   */
  purgeExpired() {
    const now = new Date().toISOString();
    const all = db_ops.getAll(CHECKPOINT_TABLE, 500, 0)
      .map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data)
      .filter(c => c.expiresAt && c.expiresAt < now);

    for (const c of all) {
      db_ops.delete(CHECKPOINT_TABLE, 'checkpoint_id', c.checkpointId);
      this.stats.expired++;
    }

    return all.length;
  }

  /**
   * Check if a session can be resumed from checkpoint.
   */
  canResume(sessionId) {
    const checkpoint = this.load(sessionId);
    if (!checkpoint) return { resumable: false };
    return {
      resumable: true,
      phase: checkpoint.phase,
      savedAt: checkpoint.savedAt,
      agentId: checkpoint.agentId,
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

// Singleton
let instance = null;
export function getReasoningCheckpoint() {
  if (!instance) instance = new ReasoningCheckpoint();
  return instance;
}

export default { ReasoningCheckpoint, getReasoningCheckpoint };
