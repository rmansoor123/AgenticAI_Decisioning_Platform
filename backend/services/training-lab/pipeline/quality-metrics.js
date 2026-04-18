/**
 * Training Data Quality Metrics
 * Measures: completeness, accuracy, diversity, freshness, toxicity.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

class QualityMetrics {
  constructor() {
    this.stats = { evaluations: 0 };
  }

  async evaluateDataset(documents) {
    const startTime = Date.now();
    this.stats.evaluations++;

    const metrics = {
      completeness: this._measureCompleteness(documents),
      diversity: this._measureDiversity(documents),
      freshness: this._measureFreshness(documents),
      toxicity: this._measureToxicity(documents),
      balance: this._measureBalance(documents),
      overall: 0
    };

    // Overall score = weighted average
    metrics.overall = Math.round(
      metrics.completeness.score * 0.25 +
      metrics.diversity.score * 0.25 +
      metrics.freshness.score * 0.20 +
      (100 - metrics.toxicity.score) * 0.15 + // invert: low toxicity = good
      metrics.balance.score * 0.15
    );

    return {
      documentCount: documents.length,
      metrics,
      evaluatedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime
    };
  }

  _measureCompleteness(docs) {
    const requiredFields = ['content', 'format', 'sourceId'];
    let totalScore = 0;
    const missing = {};

    for (const doc of docs) {
      let docScore = 0;
      for (const field of requiredFields) {
        if (doc[field]) docScore += 100 / requiredFields.length;
        else {
          missing[field] = (missing[field] || 0) + 1;
        }
      }
      totalScore += docScore;
    }

    return {
      score: docs.length > 0 ? Math.round(totalScore / docs.length) : 0,
      missingFields: missing,
      documentsWithAllFields: docs.filter(d => requiredFields.every(f => d[f])).length,
      total: docs.length
    };
  }

  _measureDiversity(docs) {
    const formats = new Set(docs.map(d => d.format));
    const sources = new Set(docs.map(d => d.sourceId));
    const labels = new Set(docs.flatMap(d => d.autoLabels || d.labels || []));
    const languages = new Set(docs.map(d => d.language || 'en'));

    const maxDiversity = 4; // format + source + label + language
    const actualDiversity = (
      Math.min(formats.size / 3, 1) +
      Math.min(sources.size / 5, 1) +
      Math.min(labels.size / 5, 1) +
      Math.min(languages.size / 3, 1)
    ) / maxDiversity;

    return {
      score: Math.round(actualDiversity * 100),
      formats: Array.from(formats),
      sources: Array.from(sources),
      uniqueLabels: Array.from(labels),
      languages: Array.from(languages)
    };
  }

  _measureFreshness(docs) {
    const now = Date.now();
    let freshCount = 0;
    let staleCount = 0;
    const FRESHNESS_THRESHOLD = 30 * 86400000; // 30 days

    for (const doc of docs) {
      const age = now - new Date(doc.ingestedAt || doc.crawledAt || 0).getTime();
      if (age < FRESHNESS_THRESHOLD) freshCount++;
      else staleCount++;
    }

    return {
      score: docs.length > 0 ? Math.round(freshCount / docs.length * 100) : 0,
      fresh: freshCount,
      stale: staleCount,
      thresholdDays: 30
    };
  }

  _measureToxicity(docs) {
    // Simplified toxicity detection -- in production: use Perspective API or similar
    const toxicPatterns = /\b(hate|kill|violence|racist|sexist|abuse|exploit)\b/gi;
    let toxicCount = 0;
    let flaggedDocs = [];

    for (const doc of docs) {
      const content = doc.content || doc.cleanedContent || '';
      const matches = content.match(toxicPatterns);
      if (matches && matches.length > 2) { // threshold: 3+ toxic words
        toxicCount++;
        flaggedDocs.push({ docId: doc.docId, matchCount: matches.length });
      }
    }

    return {
      score: docs.length > 0 ? Math.round(toxicCount / docs.length * 100) : 0,
      toxicDocuments: toxicCount,
      totalDocuments: docs.length,
      flaggedDocs: flaggedDocs.slice(0, 10)
    };
  }

  _measureBalance(docs) {
    // Label distribution balance
    const labelCounts = {};
    for (const doc of docs) {
      for (const label of (doc.autoLabels || doc.labels || ['unlabeled'])) {
        labelCounts[label] = (labelCounts[label] || 0) + 1;
      }
    }

    const counts = Object.values(labelCounts);
    if (counts.length <= 1) return { score: 50, distribution: labelCounts, entropy: 0 };

    const total = counts.reduce((s, c) => s + c, 0);
    const entropy = -counts.reduce((s, c) => {
      const p = c / total;
      return s + (p > 0 ? p * Math.log2(p) : 0);
    }, 0);
    const maxEntropy = Math.log2(counts.length);
    const balance = maxEntropy > 0 ? entropy / maxEntropy : 0;

    return {
      score: Math.round(balance * 100),
      distribution: labelCounts,
      entropy: Math.round(entropy * 100) / 100,
      maxEntropy: Math.round(maxEntropy * 100) / 100,
      labelCount: Object.keys(labelCounts).length
    };
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getQualityMetrics() {
  if (!instance) instance = new QualityMetrics();
  return instance;
}
export default { QualityMetrics, getQualityMetrics };
