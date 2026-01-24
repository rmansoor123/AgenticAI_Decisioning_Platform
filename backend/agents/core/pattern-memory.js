/**
 * Pattern Memory - Learn from successful investigations
 * Stores and retrieves patterns from past investigations to improve future decisions
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Pattern types
 */
export const PATTERN_TYPES = {
  FRAUD_INDICATOR: 'fraud_indicator',
  FALSE_POSITIVE: 'false_positive',
  SUSPICIOUS_BEHAVIOR: 'suspicious_behavior',
  LEGITIMATE_PATTERN: 'legitimate_pattern',
  NETWORK_CONNECTION: 'network_connection',
  VELOCITY_ANOMALY: 'velocity_anomaly'
};

/**
 * Pattern confidence levels
 */
export const CONFIDENCE_LEVELS = {
  LOW: 0.3,
  MEDIUM: 0.6,
  HIGH: 0.8,
  VERY_HIGH: 0.95
};

/**
 * Pattern Memory Class
 */
class PatternMemory {
  constructor() {
    this.patterns = new Map(); // patternId -> pattern
    this.patternIndex = {
      byType: new Map(),      // type -> Set<patternId>
      byFeature: new Map(),   // feature -> Set<patternId>
      byOutcome: new Map()    // outcome -> Set<patternId>
    };
    this.stats = {
      patternsLearned: 0,
      patternsApplied: 0,
      successfulMatches: 0
    };
  }

  /**
   * Learn a new pattern from an investigation
   * @param {Object} params - Pattern parameters
   */
  learnPattern(params) {
    const {
      type,
      features,
      outcome,
      confidence,
      source,
      context = {}
    } = params;

    // Check for similar existing patterns
    const similar = this.findSimilarPatterns(features, type);
    if (similar.length > 0) {
      // Reinforce existing pattern instead of creating new one
      return this.reinforcePattern(similar[0].patternId, outcome, confidence);
    }

    const patternId = `PAT-${uuidv4().slice(0, 8).toUpperCase()}`;
    const pattern = {
      patternId,
      type,
      features,
      outcome,
      confidence,
      source,
      context,
      occurrences: 1,
      reinforcements: 0,
      successRate: outcome === 'FRAUD_CONFIRMED' || outcome === 'LEGITIMATE_CONFIRMED' ? 1 : 0,
      totalValidations: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store pattern
    this.patterns.set(patternId, pattern);

    // Index pattern
    this.indexPattern(pattern);

    this.stats.patternsLearned++;

    return pattern;
  }

  /**
   * Index pattern for fast retrieval
   */
  indexPattern(pattern) {
    // Index by type
    if (!this.patternIndex.byType.has(pattern.type)) {
      this.patternIndex.byType.set(pattern.type, new Set());
    }
    this.patternIndex.byType.get(pattern.type).add(pattern.patternId);

    // Index by features
    for (const [feature, value] of Object.entries(pattern.features)) {
      const key = `${feature}:${this.normalizeFeatureValue(value)}`;
      if (!this.patternIndex.byFeature.has(key)) {
        this.patternIndex.byFeature.set(key, new Set());
      }
      this.patternIndex.byFeature.get(key).add(pattern.patternId);
    }

    // Index by outcome
    if (!this.patternIndex.byOutcome.has(pattern.outcome)) {
      this.patternIndex.byOutcome.set(pattern.outcome, new Set());
    }
    this.patternIndex.byOutcome.get(pattern.outcome).add(pattern.patternId);
  }

  /**
   * Reinforce an existing pattern
   */
  reinforcePattern(patternId, outcome, newConfidence) {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return null;

    pattern.occurrences++;
    pattern.reinforcements++;

    // Update success rate
    const wasSuccess = outcome === 'FRAUD_CONFIRMED' || outcome === 'LEGITIMATE_CONFIRMED';
    pattern.totalValidations++;
    pattern.successRate = (pattern.successRate * (pattern.totalValidations - 1) + (wasSuccess ? 1 : 0)) / pattern.totalValidations;

    // Update confidence (weighted average)
    pattern.confidence = (pattern.confidence * 0.7) + (newConfidence * 0.3);
    pattern.updatedAt = new Date().toISOString();

    return pattern;
  }

  /**
   * Find similar patterns
   */
  findSimilarPatterns(features, type = null, threshold = 0.7) {
    const candidates = new Map();

    // Get candidate patterns by type
    if (type && this.patternIndex.byType.has(type)) {
      for (const patternId of this.patternIndex.byType.get(type)) {
        candidates.set(patternId, 0);
      }
    }

    // Score by feature matches
    for (const [feature, value] of Object.entries(features)) {
      const key = `${feature}:${this.normalizeFeatureValue(value)}`;
      if (this.patternIndex.byFeature.has(key)) {
        for (const patternId of this.patternIndex.byFeature.get(key)) {
          const current = candidates.get(patternId) || 0;
          candidates.set(patternId, current + 1);
        }
      }
    }

    // Calculate similarity scores
    const featureCount = Object.keys(features).length;
    const results = [];

    for (const [patternId, matchCount] of candidates) {
      const pattern = this.patterns.get(patternId);
      if (pattern) {
        const similarity = matchCount / Math.max(featureCount, Object.keys(pattern.features).length);
        if (similarity >= threshold) {
          results.push({
            patternId,
            pattern,
            similarity,
            matchCount
          });
        }
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Match current case against learned patterns
   * @param {Object} caseFeatures - Features of the current case
   */
  matchPatterns(caseFeatures) {
    const matches = [];

    for (const [patternId, pattern] of this.patterns) {
      const matchResult = this.calculateMatch(caseFeatures, pattern);
      if (matchResult.score > 0.5) {
        matches.push({
          patternId,
          pattern,
          ...matchResult
        });
      }
    }

    // Sort by match score and confidence
    matches.sort((a, b) => {
      const scoreA = a.score * a.pattern.confidence * a.pattern.successRate;
      const scoreB = b.score * b.pattern.confidence * b.pattern.successRate;
      return scoreB - scoreA;
    });

    this.stats.patternsApplied++;
    if (matches.length > 0) {
      this.stats.successfulMatches++;
    }

    return {
      matches: matches.slice(0, 10),
      totalMatched: matches.length,
      recommendation: this.generateRecommendation(matches)
    };
  }

  /**
   * Calculate match score between case and pattern
   */
  calculateMatch(caseFeatures, pattern) {
    let matchedFeatures = 0;
    let weightedScore = 0;
    const matchDetails = [];

    for (const [feature, patternValue] of Object.entries(pattern.features)) {
      if (feature in caseFeatures) {
        const caseValue = caseFeatures[feature];
        const featureMatch = this.compareFeatureValues(caseValue, patternValue);

        if (featureMatch.matched) {
          matchedFeatures++;
          weightedScore += featureMatch.score;
          matchDetails.push({
            feature,
            patternValue,
            caseValue,
            score: featureMatch.score
          });
        }
      }
    }

    const totalFeatures = Object.keys(pattern.features).length;
    const score = totalFeatures > 0 ? weightedScore / totalFeatures : 0;

    return {
      score,
      matchedFeatures,
      totalFeatures,
      matchDetails
    };
  }

  /**
   * Compare feature values
   */
  compareFeatureValues(caseValue, patternValue) {
    // Boolean comparison
    if (typeof caseValue === 'boolean' && typeof patternValue === 'boolean') {
      return { matched: caseValue === patternValue, score: caseValue === patternValue ? 1 : 0 };
    }

    // Numeric comparison (with tolerance)
    if (typeof caseValue === 'number' && typeof patternValue === 'number') {
      const tolerance = Math.abs(patternValue) * 0.2; // 20% tolerance
      const diff = Math.abs(caseValue - patternValue);
      if (diff <= tolerance) {
        return { matched: true, score: 1 - (diff / Math.max(tolerance, 1)) };
      }
      return { matched: false, score: 0 };
    }

    // String/category comparison
    if (typeof caseValue === 'string' && typeof patternValue === 'string') {
      return {
        matched: caseValue.toLowerCase() === patternValue.toLowerCase(),
        score: caseValue.toLowerCase() === patternValue.toLowerCase() ? 1 : 0
      };
    }

    // Range comparison
    if (typeof patternValue === 'object' && patternValue.min !== undefined && patternValue.max !== undefined) {
      const inRange = caseValue >= patternValue.min && caseValue <= patternValue.max;
      return { matched: inRange, score: inRange ? 1 : 0 };
    }

    return { matched: false, score: 0 };
  }

  /**
   * Generate recommendation based on matches
   */
  generateRecommendation(matches) {
    if (matches.length === 0) {
      return {
        action: 'UNKNOWN',
        confidence: 0,
        reason: 'No matching patterns found'
      };
    }

    // Count outcomes
    const outcomes = {};
    let totalWeight = 0;

    for (const match of matches) {
      const weight = match.score * match.pattern.confidence * match.pattern.successRate;
      outcomes[match.pattern.outcome] = (outcomes[match.pattern.outcome] || 0) + weight;
      totalWeight += weight;
    }

    // Find dominant outcome
    let dominantOutcome = null;
    let maxWeight = 0;

    for (const [outcome, weight] of Object.entries(outcomes)) {
      if (weight > maxWeight) {
        maxWeight = weight;
        dominantOutcome = outcome;
      }
    }

    const confidence = totalWeight > 0 ? maxWeight / totalWeight : 0;

    // Map outcome to action
    const actionMap = {
      'FRAUD_CONFIRMED': 'BLOCK',
      'SUSPICIOUS': 'REVIEW',
      'LEGITIMATE_CONFIRMED': 'APPROVE',
      'FALSE_POSITIVE': 'APPROVE'
    };

    return {
      action: actionMap[dominantOutcome] || 'REVIEW',
      confidence,
      reason: `Based on ${matches.length} similar patterns (${dominantOutcome})`,
      topPattern: matches[0]?.patternId,
      outcomeDistribution: outcomes
    };
  }

  /**
   * Normalize feature value for indexing
   */
  normalizeFeatureValue(value) {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return Math.round(value / 10) * 10; // Bucket numbers
    if (typeof value === 'string') return value.toLowerCase().trim();
    return String(value);
  }

  /**
   * Provide feedback on a pattern application
   */
  provideFeedback(patternId, actualOutcome, wasCorrect) {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return false;

    pattern.totalValidations++;
    if (wasCorrect) {
      pattern.successRate = (pattern.successRate * (pattern.totalValidations - 1) + 1) / pattern.totalValidations;
      pattern.confidence = Math.min(0.99, pattern.confidence * 1.05);
    } else {
      pattern.successRate = (pattern.successRate * (pattern.totalValidations - 1)) / pattern.totalValidations;
      pattern.confidence = Math.max(0.1, pattern.confidence * 0.9);
    }

    pattern.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Get pattern by ID
   */
  getPattern(patternId) {
    return this.patterns.get(patternId);
  }

  /**
   * Get all patterns of a type
   */
  getPatternsByType(type) {
    const patternIds = this.patternIndex.byType.get(type);
    if (!patternIds) return [];
    return Array.from(patternIds).map(id => this.patterns.get(id)).filter(Boolean);
  }

  /**
   * Get top patterns by confidence
   */
  getTopPatterns(limit = 20) {
    return Array.from(this.patterns.values())
      .sort((a, b) => (b.confidence * b.successRate) - (a.confidence * a.successRate))
      .slice(0, limit);
  }

  /**
   * Export patterns for persistence
   */
  exportPatterns() {
    return {
      patterns: Array.from(this.patterns.values()),
      stats: this.stats,
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Import patterns
   */
  importPatterns(data) {
    const { patterns } = data;
    for (const pattern of patterns) {
      this.patterns.set(pattern.patternId, pattern);
      this.indexPattern(pattern);
    }
    return patterns.length;
  }

  /**
   * Get memory statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalPatterns: this.patterns.size,
      byType: Object.fromEntries(
        Array.from(this.patternIndex.byType.entries()).map(([k, v]) => [k, v.size])
      ),
      byOutcome: Object.fromEntries(
        Array.from(this.patternIndex.byOutcome.entries()).map(([k, v]) => [k, v.size])
      )
    };
  }

  /**
   * Clear all patterns
   */
  clear() {
    this.patterns.clear();
    this.patternIndex.byType.clear();
    this.patternIndex.byFeature.clear();
    this.patternIndex.byOutcome.clear();
  }
}

// Singleton instance
let memoryInstance = null;

export function getPatternMemory() {
  if (!memoryInstance) {
    memoryInstance = new PatternMemory();
  }
  return memoryInstance;
}

export default { PatternMemory, getPatternMemory, PATTERN_TYPES, CONFIDENCE_LEVELS };
