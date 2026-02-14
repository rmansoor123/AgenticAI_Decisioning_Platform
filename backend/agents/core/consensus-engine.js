/**
 * Consensus Engine - Multi-agent voting and agreement
 *
 * Strategies: majority, unanimous, weighted
 * Tracks disagreements for learning.
 */

import { getMemoryStore } from './memory-store.js';

class ConsensusEngine {
  constructor() {
    this.memoryStore = getMemoryStore();
    this.sessions = new Map();
    this.stats = {
      consensusReached: 0,
      consensusFailed: 0,
      totalSessions: 0
    };
  }

  createSession(sessionId, config = {}) {
    const session = {
      sessionId,
      strategy: config.strategy || 'majority',
      requiredVoters: config.requiredVoters || [],
      votes: [],
      status: 'open',
      createdAt: new Date().toISOString()
    };
    this.sessions.set(sessionId, session);
    this.stats.totalSessions++;
    return session;
  }

  vote(sessionId, agentId, decision, confidence = 0.5, reasoning = '') {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'open') return null;
    if (session.votes.find(v => v.agentId === agentId)) return null;

    session.votes.push({
      agentId,
      decision,
      confidence,
      reasoning,
      votedAt: new Date().toISOString()
    });

    return session;
  }

  evaluate(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const votes = session.votes;
    if (votes.length === 0) return { consensus: false, reason: 'No votes cast' };

    let result;
    switch (session.strategy) {
      case 'unanimous':
        result = this._evaluateUnanimous(votes);
        break;
      case 'weighted':
        result = this._evaluateWeighted(votes);
        break;
      case 'majority':
      default:
        result = this._evaluateMajority(votes);
    }

    session.status = 'closed';
    session.result = result;

    if (result.consensus) {
      this.stats.consensusReached++;
    } else {
      this.stats.consensusFailed++;
      this._logDisagreement(session);
    }

    return result;
  }

  _evaluateMajority(votes) {
    const counts = {};
    for (const v of votes) {
      counts[v.decision] = (counts[v.decision] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const [topDecision, topCount] = sorted[0];
    const consensus = topCount > votes.length / 2;

    return {
      consensus,
      decision: consensus ? topDecision : null,
      votes: counts,
      reason: consensus
        ? `Majority agreed on ${topDecision} (${topCount}/${votes.length})`
        : `No majority: ${sorted.map(([d, c]) => `${d}(${c})`).join(' vs ')}`
    };
  }

  _evaluateUnanimous(votes) {
    const decisions = new Set(votes.map(v => v.decision));
    const consensus = decisions.size === 1;
    return {
      consensus,
      decision: consensus ? votes[0].decision : null,
      reason: consensus
        ? `Unanimous agreement on ${votes[0].decision}`
        : `Disagreement: ${Array.from(decisions).join(' vs ')}`
    };
  }

  _evaluateWeighted(votes) {
    const weightedCounts = {};
    for (const v of votes) {
      weightedCounts[v.decision] = (weightedCounts[v.decision] || 0) + v.confidence;
    }
    const totalWeight = Object.values(weightedCounts).reduce((a, b) => a + b, 0);
    const sorted = Object.entries(weightedCounts).sort((a, b) => b[1] - a[1]);
    const [topDecision, topWeight] = sorted[0];
    const consensus = topWeight / totalWeight > 0.6;

    return {
      consensus,
      decision: consensus ? topDecision : null,
      weightedVotes: weightedCounts,
      reason: consensus
        ? `Weighted consensus on ${topDecision} (${(topWeight / totalWeight * 100).toFixed(0)}%)`
        : `No weighted consensus: ${sorted.map(([d, w]) => `${d}(${(w / totalWeight * 100).toFixed(0)}%)`).join(' vs ')}`
    };
  }

  _logDisagreement(session) {
    const agentIds = session.votes.map(v => v.agentId);
    for (const agentId of agentIds) {
      this.memoryStore.saveLongTerm(agentId, 'correction', {
        type: 'disagreement',
        sessionId: session.sessionId,
        myVote: session.votes.find(v => v.agentId === agentId),
        allVotes: session.votes,
        result: session.result,
        learnedAt: new Date().toISOString()
      }, 0.7);
    }
  }

  getStats() {
    return {
      ...this.stats,
      activeSessions: Array.from(this.sessions.values()).filter(s => s.status === 'open').length
    };
  }
}

let instance = null;

export function getConsensusEngine() {
  if (!instance) {
    instance = new ConsensusEngine();
  }
  return instance;
}

export default { ConsensusEngine, getConsensusEngine };
