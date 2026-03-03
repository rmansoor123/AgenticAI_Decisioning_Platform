/**
 * Agent Rate Limiter — Per-agent throughput throttling.
 * Tracks decisions per minute/hour per agent and rejects excess.
 * Singleton: getAgentRateLimiter()
 */

const DEFAULT_LIMITS = {
  decisionsPerMinute: 30,
  decisionsPerHour: 500,
  llmCallsPerMinute: 60,
};

class AgentRateLimiter {
  constructor(limits = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.windows = new Map(); // agentId → { minute: { count, resetAt }, hour: { count, resetAt } }
    this.stats = { checked: 0, allowed: 0, rejected: 0 };
  }

  checkLimit(agentId, type = 'decision') {
    this.stats.checked++;
    const now = Date.now();
    if (!this.windows.has(agentId)) {
      this.windows.set(agentId, {
        minute: { count: 0, resetAt: now + 60000 },
        hour: { count: 0, resetAt: now + 3600000 },
      });
    }
    const window = this.windows.get(agentId);
    // Reset expired windows
    if (now >= window.minute.resetAt) { window.minute = { count: 0, resetAt: now + 60000 }; }
    if (now >= window.hour.resetAt) { window.hour = { count: 0, resetAt: now + 3600000 }; }
    // Check limits
    const minuteLimit = type === 'llm' ? this.limits.llmCallsPerMinute : this.limits.decisionsPerMinute;
    const hourLimit = this.limits.decisionsPerHour;
    if (window.minute.count >= minuteLimit) {
      this.stats.rejected++;
      return { allowed: false, reason: `Rate limit exceeded: ${window.minute.count}/${minuteLimit} per minute`, retryAfterMs: window.minute.resetAt - now };
    }
    if (type !== 'llm' && window.hour.count >= hourLimit) {
      this.stats.rejected++;
      return { allowed: false, reason: `Rate limit exceeded: ${window.hour.count}/${hourLimit} per hour`, retryAfterMs: window.hour.resetAt - now };
    }
    // Allow
    window.minute.count++;
    if (type !== 'llm') window.hour.count++;
    this.stats.allowed++;
    return { allowed: true };
  }

  getAgentUsage(agentId) {
    const window = this.windows.get(agentId);
    if (!window) return { minuteCount: 0, hourCount: 0 };
    const now = Date.now();
    return {
      minuteCount: now < window.minute.resetAt ? window.minute.count : 0,
      hourCount: now < window.hour.resetAt ? window.hour.count : 0,
      limits: this.limits,
    };
  }

  getStats() { return { ...this.stats, trackedAgents: this.windows.size }; }
}

let instance = null;
export function getAgentRateLimiter() {
  if (!instance) instance = new AgentRateLimiter();
  return instance;
}
export default { AgentRateLimiter, getAgentRateLimiter };
