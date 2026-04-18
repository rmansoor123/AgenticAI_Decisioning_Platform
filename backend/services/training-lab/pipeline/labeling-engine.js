/**
 * Labeling Engine -- human + AI labeling with model-as-a-judge evaluation.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

class LabelingEngine {
  constructor() {
    this.stats = { labeled: 0, autoLabeled: 0, humanLabeled: 0, judged: 0 };
    this.reviewQueue = [];
  }

  /**
   * Auto-label using rule-based + LLM-based labeling.
   */
  async autoLabel(document) {
    const content = document.content || '';
    const labels = [];
    const confidence = {};

    // Rule-based labeling
    const ruleLabels = {
      'fraud_detection': /fraud|scam|phishing|suspicious|money laundering/i,
      'financial': /payment|transaction|billing|invoice|credit|debit/i,
      'identity': /identity|kyc|verification|passport|document/i,
      'compliance': /compliance|regulation|legal|policy|gdpr|aml/i,
      'technical': /api|code|function|algorithm|database|server/i,
      'customer_service': /support|help|complaint|issue|resolution/i,
      'security': /security|breach|vulnerability|attack|encryption/i,
      'risk': /risk|threat|exposure|mitigation|assessment/i
    };

    for (const [label, pattern] of Object.entries(ruleLabels)) {
      const matches = content.match(pattern);
      if (matches) {
        labels.push(label);
        confidence[label] = Math.min(0.95, 0.5 + matches.length * 0.1);
      }
    }

    if (labels.length === 0) {
      labels.push('general');
      confidence['general'] = 0.3;
    }

    // Sentiment
    const positiveWords = (content.match(/\b(good|great|excellent|success|approved|valid)\b/gi) || []).length;
    const negativeWords = (content.match(/\b(bad|fail|error|rejected|invalid|fraud)\b/gi) || []).length;
    const sentiment = positiveWords > negativeWords ? 'POSITIVE' : negativeWords > positiveWords ? 'NEGATIVE' : 'NEUTRAL';

    // Difficulty
    const avgSentenceLength = content.split(/[.!?]+/).reduce((s, sent) => s + sent.split(/\s+/).length, 0) / Math.max(1, (content.match(/[.!?]+/g) || []).length);
    const difficulty = avgSentenceLength > 20 ? 'HARD' : avgSentenceLength > 12 ? 'MEDIUM' : 'EASY';

    this.stats.autoLabeled++;
    this.stats.labeled++;

    return {
      docId: document.docId, labels, confidence,
      sentiment, difficulty,
      method: 'AUTO', labeledAt: new Date().toISOString()
    };
  }

  /**
   * Model-as-a-Judge -- use LLM to evaluate label quality.
   */
  async modelJudge(document, proposedLabels) {
    this.stats.judged++;

    // Simulate model judgment (in production: call LLM via gateway)
    const content = (document.content || '').substring(0, 500);
    const judgments = [];

    for (const label of proposedLabels) {
      // Check if label matches content
      const relevanceScore = this._judgeRelevance(content, label);
      judgments.push({
        label,
        relevant: relevanceScore > 0.5,
        confidence: relevanceScore,
        reasoning: relevanceScore > 0.7 ? `Strong match: content clearly relates to ${label}`
          : relevanceScore > 0.5 ? `Moderate match: content partially relates to ${label}`
          : `Weak match: content does not strongly relate to ${label}`
      });
    }

    const agreement = judgments.filter(j => j.relevant).length / judgments.length;

    return {
      docId: document.docId,
      judgments,
      overallAgreement: Math.round(agreement * 100),
      recommendedLabels: judgments.filter(j => j.relevant).map(j => j.label),
      rejectedLabels: judgments.filter(j => !j.relevant).map(j => j.label),
      method: 'MODEL_JUDGE',
      judgedAt: new Date().toISOString()
    };
  }

  _judgeRelevance(content, label) {
    const keywords = {
      'fraud_detection': ['fraud', 'scam', 'suspicious', 'alert', 'risk'],
      'financial': ['payment', 'money', 'transaction', 'bank', 'credit'],
      'identity': ['identity', 'verify', 'document', 'kyc', 'passport'],
      'compliance': ['legal', 'regulation', 'policy', 'compliance', 'audit'],
      'technical': ['code', 'api', 'function', 'system', 'architecture'],
      'security': ['security', 'breach', 'encrypt', 'attack', 'protect'],
      'risk': ['risk', 'threat', 'mitigate', 'assess', 'score'],
      'general': []
    };

    const labelKeywords = keywords[label] || [];
    if (labelKeywords.length === 0) return 0.3;

    const lowerContent = content.toLowerCase();
    const matches = labelKeywords.filter(kw => lowerContent.includes(kw)).length;
    return Math.min(0.95, matches / labelKeywords.length);
  }

  /**
   * Submit for human review.
   */
  submitForReview(document, reason = 'LOW_CONFIDENCE') {
    const reviewItem = {
      reviewId: `REV-${Date.now().toString(36).toUpperCase()}`,
      docId: document.docId,
      content: (document.content || '').substring(0, 500),
      currentLabels: document.autoLabels || document.labels || [],
      reason,
      status: 'PENDING',
      submittedAt: new Date().toISOString()
    };
    this.reviewQueue.push(reviewItem);
    return reviewItem;
  }

  /**
   * Complete human review.
   */
  completeReview(reviewId, humanLabels, reviewer) {
    const item = this.reviewQueue.find(r => r.reviewId === reviewId);
    if (!item) return null;

    item.status = 'COMPLETED';
    item.humanLabels = humanLabels;
    item.reviewer = reviewer;
    item.completedAt = new Date().toISOString();
    this.stats.humanLabeled++;
    this.stats.labeled++;

    // Calculate inter-annotator agreement
    const autoLabels = new Set(item.currentLabels);
    const humanSet = new Set(humanLabels);
    const intersection = [...autoLabels].filter(l => humanSet.has(l)).length;
    const union = new Set([...autoLabels, ...humanSet]).size;
    item.agreement = union > 0 ? Math.round(intersection / union * 100) : 0;

    return item;
  }

  getReviewQueue() {
    return this.reviewQueue.filter(r => r.status === 'PENDING');
  }

  getStats() { return { ...this.stats, pendingReviews: this.reviewQueue.filter(r => r.status === 'PENDING').length }; }
}

let instance = null;
export function getLabelingEngine() {
  if (!instance) instance = new LabelingEngine();
  return instance;
}
export default { LabelingEngine, getLabelingEngine };
