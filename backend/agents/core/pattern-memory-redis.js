/**
 * Redis-backed pattern memory.
 * Same interface as PatternMemory (learnPattern, matchPatterns, reinforcePattern, etc.).
 * Uses Redis Hashes for pattern storage, Sorted Sets for type/outcome indexes.
 * Falls back to in-memory PatternMemory on any Redis error.
 *
 * Key patterns:
 *   pattern:{patternId}          — Hash holding the pattern object
 *   pattern:idx:type:{type}      — Sorted Set (score = confidence)
 *   pattern:idx:outcome:{outcome} — Sorted Set (score = confidence)
 *   pattern:all                  — Set of all pattern IDs
 */

import { getRedisClient, isRedisAvailable } from '../../shared/common/redis-client.js';
import { getPatternMemory, PATTERN_TYPES, CONFIDENCE_LEVELS } from './pattern-memory.js';

class PatternMemoryRedis {
  constructor() {
    this.stats = { patternsLearned: 0, patternsApplied: 0, successfulMatches: 0, errors: 0 };
    this.fallback = getPatternMemory();
  }

  _redis() {
    const redis = getRedisClient();
    return (redis && isRedisAvailable()) ? redis : null;
  }

  async learnPattern({ type, features, outcome, confidence, source, context = {} }) {
    const redis = this._redis();
    if (!redis) {
      return this.fallback.learnPattern({ type, features, outcome, confidence, source, context });
    }

    try {
      const patternId = `PAT-${type.slice(0, 6)}-${Date.now().toString(36)}`;
      const pattern = {
        patternId, type, features, outcome, confidence, source, context,
        occurrences: 1, reinforcements: 0, successRate: 1.0,
        totalValidations: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };

      const pipeline = redis.pipeline();
      pipeline.set(`pattern:${patternId}`, JSON.stringify(pattern));
      pipeline.sadd('pattern:all', patternId);
      pipeline.zadd(`pattern:idx:type:${type}`, confidence, patternId);
      if (outcome) {
        pipeline.zadd(`pattern:idx:outcome:${outcome}`, confidence, patternId);
      }
      // Index by each feature key for matching
      if (features && typeof features === 'object') {
        for (const key of Object.keys(features)) {
          pipeline.sadd(`pattern:idx:feature:${key}`, patternId);
        }
      }
      await pipeline.exec();

      this.stats.patternsLearned++;
      return pattern;
    } catch (err) {
      this.stats.errors++;
      console.warn(`[pattern-memory-redis] learnPattern error: ${err.message}`);
      return this.fallback.learnPattern({ type, features, outcome, confidence, source, context });
    }
  }

  async reinforcePattern(patternId, outcome, newConfidence) {
    const redis = this._redis();
    if (!redis) return this.fallback.reinforcePattern(patternId, outcome, newConfidence);

    try {
      const raw = await redis.get(`pattern:${patternId}`);
      if (!raw) return null;

      const pattern = JSON.parse(raw);
      pattern.reinforcements++;
      pattern.occurrences++;
      pattern.confidence = newConfidence ?? pattern.confidence;
      pattern.outcome = outcome ?? pattern.outcome;
      pattern.updatedAt = new Date().toISOString();

      await redis.set(`pattern:${patternId}`, JSON.stringify(pattern));
      return pattern;
    } catch (err) {
      this.stats.errors++;
      console.warn(`[pattern-memory-redis] reinforcePattern error: ${err.message}`);
      return this.fallback.reinforcePattern(patternId, outcome, newConfidence);
    }
  }

  async matchPatterns(caseFeatures) {
    const redis = this._redis();
    if (!redis) return this.fallback.matchPatterns(caseFeatures);

    try {
      // Get all pattern IDs
      const allIds = await redis.smembers('pattern:all');
      if (!allIds || allIds.length === 0) {
        return { matches: [], totalMatched: 0, recommendation: null };
      }

      // Fetch all patterns in batch
      const pipeline = redis.pipeline();
      for (const id of allIds) {
        pipeline.get(`pattern:${id}`);
      }
      const results = await pipeline.exec();

      const matches = [];
      for (const [err, raw] of results) {
        if (err || !raw) continue;
        const pattern = JSON.parse(raw);
        const match = this._calculateMatch(caseFeatures, pattern);
        if (match.score > 0.3) {
          matches.push({
            patternId: pattern.patternId,
            pattern,
            score: match.score,
            matchedFeatures: match.matchedFeatures,
            totalFeatures: match.totalFeatures,
            matchDetails: match.matchDetails,
          });
        }
      }

      matches.sort((a, b) => b.score - a.score);
      this.stats.patternsApplied++;
      if (matches.length > 0) this.stats.successfulMatches++;

      return {
        matches: matches.slice(0, 20),
        totalMatched: matches.length,
        recommendation: matches.length > 0 ? this._generateRecommendation(matches) : null,
      };
    } catch (err) {
      this.stats.errors++;
      console.warn(`[pattern-memory-redis] matchPatterns error: ${err.message}`);
      return this.fallback.matchPatterns(caseFeatures);
    }
  }

  _calculateMatch(caseFeatures, pattern) {
    if (!pattern.features || !caseFeatures) return { score: 0, matchedFeatures: 0, totalFeatures: 0, matchDetails: [] };
    const patternKeys = Object.keys(pattern.features);
    let matched = 0;
    const matchDetails = [];

    for (const key of patternKeys) {
      if (key in caseFeatures) {
        const caseVal = caseFeatures[key];
        const patVal = pattern.features[key];
        const { matched: isMatch, score } = this._compareFeatureValues(caseVal, patVal);
        if (isMatch) {
          matched++;
          matchDetails.push({ feature: key, score });
        }
      }
    }

    return {
      score: patternKeys.length > 0 ? (matched / patternKeys.length) * pattern.confidence : 0,
      matchedFeatures: matched,
      totalFeatures: patternKeys.length,
      matchDetails,
    };
  }

  _compareFeatureValues(caseVal, patternVal) {
    if (caseVal === patternVal) return { matched: true, score: 1.0 };
    if (typeof caseVal === 'number' && typeof patternVal === 'number') {
      const diff = Math.abs(caseVal - patternVal);
      const maxVal = Math.max(Math.abs(caseVal), Math.abs(patternVal), 1);
      const similarity = 1 - (diff / maxVal);
      return { matched: similarity > 0.7, score: similarity };
    }
    if (typeof caseVal === 'string' && typeof patternVal === 'string') {
      const match = caseVal.toLowerCase() === patternVal.toLowerCase();
      return { matched: match, score: match ? 1.0 : 0 };
    }
    return { matched: false, score: 0 };
  }

  _generateRecommendation(matches) {
    const topMatch = matches[0];
    const outcomes = {};
    for (const m of matches) {
      const o = m.pattern.outcome || 'unknown';
      outcomes[o] = (outcomes[o] || 0) + 1;
    }
    return {
      action: topMatch.pattern.outcome || 'review',
      confidence: topMatch.score,
      reason: `Matched ${matches.length} pattern(s), top score ${topMatch.score.toFixed(2)}`,
      topPattern: topMatch.patternId,
      outcomeDistribution: outcomes,
    };
  }

  async provideFeedback(patternId, actualOutcome, wasCorrect) {
    const redis = this._redis();
    if (!redis) return this.fallback.provideFeedback(patternId, actualOutcome, wasCorrect);

    try {
      const raw = await redis.get(`pattern:${patternId}`);
      if (!raw) return false;

      const pattern = JSON.parse(raw);
      pattern.totalValidations++;
      if (wasCorrect) {
        pattern.successRate = ((pattern.successRate * (pattern.totalValidations - 1)) + 1) / pattern.totalValidations;
        pattern.confidence = Math.min(1.0, pattern.confidence * 1.05);
      } else {
        pattern.successRate = (pattern.successRate * (pattern.totalValidations - 1)) / pattern.totalValidations;
        pattern.confidence = Math.max(0.1, pattern.confidence * 0.9);
      }
      pattern.updatedAt = new Date().toISOString();

      await redis.set(`pattern:${patternId}`, JSON.stringify(pattern));
      return true;
    } catch (err) {
      this.stats.errors++;
      return this.fallback.provideFeedback(patternId, actualOutcome, wasCorrect);
    }
  }

  async getPattern(patternId) {
    const redis = this._redis();
    if (!redis) return this.fallback.getPattern(patternId);
    try {
      const raw = await redis.get(`pattern:${patternId}`);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return this.fallback.getPattern(patternId);
    }
  }

  async getPatternsByType(type) {
    const redis = this._redis();
    if (!redis) return this.fallback.getPatternsByType(type);
    try {
      const ids = await redis.zrevrange(`pattern:idx:type:${type}`, 0, -1);
      if (!ids.length) return [];
      const pipeline = redis.pipeline();
      for (const id of ids) pipeline.get(`pattern:${id}`);
      const results = await pipeline.exec();
      return results.filter(([e, r]) => !e && r).map(([, r]) => JSON.parse(r));
    } catch {
      return this.fallback.getPatternsByType(type);
    }
  }

  async getTopPatterns(limit = 20) {
    const redis = this._redis();
    if (!redis) return this.fallback.getTopPatterns(limit);
    try {
      const allIds = await redis.smembers('pattern:all');
      if (!allIds.length) return [];
      const pipeline = redis.pipeline();
      for (const id of allIds) pipeline.get(`pattern:${id}`);
      const results = await pipeline.exec();
      const patterns = results.filter(([e, r]) => !e && r).map(([, r]) => JSON.parse(r));
      patterns.sort((a, b) => b.confidence - a.confidence);
      return patterns.slice(0, limit);
    } catch {
      return this.fallback.getTopPatterns(limit);
    }
  }

  async getStats() {
    const redis = this._redis();
    const totalPatterns = redis ? await redis.scard('pattern:all').catch(() => 0) : 0;
    return { ...this.stats, totalPatterns, backend: 'redis' };
  }

  async exportPatterns() {
    const patterns = await this.getTopPatterns(10000);
    return { patterns, stats: await this.getStats(), exportedAt: new Date().toISOString() };
  }

  async importPatterns(data) {
    let count = 0;
    for (const p of (data.patterns || [])) {
      await this.learnPattern(p);
      count++;
    }
    return count;
  }

  async clear() {
    const redis = this._redis();
    if (!redis) return this.fallback.clear();
    try {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', 'pattern:*', 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== '0');
    } catch (err) {
      console.warn(`[pattern-memory-redis] clear error: ${err.message}`);
    }
  }
}

let instance = null;

export function getPatternMemoryRedis() {
  if (!instance) instance = new PatternMemoryRedis();
  return instance;
}

export { PatternMemoryRedis, PATTERN_TYPES, CONFIDENCE_LEVELS };
