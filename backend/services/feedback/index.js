import express from 'express';
import { db_ops } from '../../shared/common/database.js';
import { getConfidenceCalibrator } from '../../agents/core/confidence-calibrator.js';

const router = express.Router();

// Valid values for validation
const VALID_LABELS = ['correct', 'incorrect'];
const VALID_REASONS = [
  'false_positive',
  'false_negative',
  'wrong_severity',
  'missing_evidence',
  'good_decision',
  'other'
];

/**
 * Generate a unique feedback ID.
 * Format: FB-{timestamp.toString(36)}-{random}
 */
function generateFeedbackId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `FB-${ts}-${rand}`;
}

// ─── POST / — Submit feedback on a decision ───────────────────────────────

router.post('/', (req, res) => {
  try {
    const { decisionId, correctLabel, reason, analystId, notes } = req.body;

    // Validate required fields
    if (!decisionId) {
      return res.status(400).json({ success: false, error: 'decisionId is required' });
    }
    if (!correctLabel) {
      return res.status(400).json({ success: false, error: 'correctLabel is required' });
    }
    if (!VALID_LABELS.includes(correctLabel)) {
      return res.status(400).json({
        success: false,
        error: `correctLabel must be one of: ${VALID_LABELS.join(', ')}`
      });
    }
    if (reason && !VALID_REASONS.includes(reason)) {
      return res.status(400).json({
        success: false,
        error: `reason must be one of: ${VALID_REASONS.join(', ')}`
      });
    }

    const feedbackId = generateFeedbackId();
    const entry = {
      feedbackId,
      decisionId,
      correctLabel,
      reason: reason || null,
      analystId: analystId || null,
      notes: notes || null,
      createdAt: new Date().toISOString()
    };

    // Persist feedback
    db_ops.insert('agent_feedback', 'feedback_id', feedbackId, entry);

    // Feed into confidence calibrator
    try {
      const calibrator = getConfidenceCalibrator();
      // Look up the original decision to get its confidence score
      const decisionRecord = db_ops.getById('agent_decisions', 'decision_id', decisionId);
      if (decisionRecord?.data) {
        const confidence = decisionRecord.data.confidence
          || decisionRecord.data._rawConfidence
          || 0.5;
        const wasCorrect = correctLabel === 'correct';
        calibrator.recordPrediction(decisionId, confidence, wasCorrect);
      }
    } catch (calibratorError) {
      // Calibrator failure is non-fatal
      console.warn('Confidence calibrator update failed:', calibratorError.message);
    }

    res.json({ success: true, data: entry });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /queue — Decisions pending review (sorted by confidence ASC) ─────

router.get('/queue', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const agentId = req.query.agentId || null;

    // Get all decisions
    const allDecisions = db_ops.getAll('agent_decisions', 10000, 0);

    // Get all feedback to determine which decisions have already been reviewed
    const allFeedback = db_ops.getAll('agent_feedback', 10000, 0);
    const reviewedDecisionIds = new Set(
      allFeedback.map(f => f.data?.decisionId).filter(Boolean)
    );

    // Filter to pending (not yet reviewed) decisions
    let pending = allDecisions.filter(d => {
      const decisionId = d.decision_id || d.data?.decisionId;
      return !reviewedDecisionIds.has(decisionId);
    });

    // Optionally filter by agentId
    if (agentId) {
      pending = pending.filter(d => d.data?.agentId === agentId);
    }

    // Sort by confidence ascending (lowest confidence first = needs most review)
    pending.sort((a, b) => {
      const confA = a.data?.confidence ?? 1;
      const confB = b.data?.confidence ?? 1;
      return confA - confB;
    });

    const total = pending.length;
    const page = pending.slice(0, limit).map(d => d.data);

    res.json({ success: true, data: page, total });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /stats — Feedback statistics ─────────────────────────────────────

router.get('/stats', (req, res) => {
  try {
    const allFeedback = db_ops.getAll('agent_feedback', 10000, 0).map(r => r.data);

    const total = allFeedback.length;
    let correct = 0;
    let incorrect = 0;
    const byReason = {};
    const byAnalyst = {};
    let recentCount = 0;
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

    allFeedback.forEach(fb => {
      if (fb.correctLabel === 'correct') correct++;
      if (fb.correctLabel === 'incorrect') incorrect++;

      if (fb.reason) {
        byReason[fb.reason] = (byReason[fb.reason] || 0) + 1;
      }

      if (fb.analystId) {
        byAnalyst[fb.analystId] = (byAnalyst[fb.analystId] || 0) + 1;
      }

      if (fb.createdAt && new Date(fb.createdAt).getTime() > twentyFourHoursAgo) {
        recentCount++;
      }
    });

    const accuracy = total > 0 ? Math.round((correct / total) * 10000) / 10000 : 0;

    res.json({
      success: true,
      data: {
        total,
        correct,
        incorrect,
        accuracy,
        byReason,
        byAnalyst,
        recentCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
