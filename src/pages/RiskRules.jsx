import { useState, useEffect } from 'react';
import { Shield, Search, ChevronDown, ChevronRight, Activity, AlertTriangle, Zap, Eye } from 'lucide-react';

const API_BASE = '/api';

const CHECKPOINTS = [
  { id: 'all', label: 'All Checkpoints', icon: Shield },
  { id: 'onboarding', label: 'Onboarding', icon: Shield },
  { id: 'ato', label: 'Account Takeover', icon: AlertTriangle },
  { id: 'payout', label: 'Payout', icon: Activity },
  { id: 'listing', label: 'Listing', icon: Eye },
  { id: 'shipping', label: 'Shipping', icon: Zap },
  { id: 'transaction', label: 'Transaction', icon: Activity },
];

const SEVERITY_COLORS = {
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  LOW: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const ACTION_COLORS = {
  BLOCK: 'bg-red-500/20 text-red-400',
  REVIEW: 'bg-yellow-500/20 text-yellow-400',
  CHALLENGE: 'bg-orange-500/20 text-orange-400',
  FLAG: 'bg-blue-500/20 text-blue-400',
  ALLOW_WITH_LIMIT: 'bg-green-500/20 text-green-400',
};

const TYPE_COLORS = {
  THRESHOLD: 'text-cyan-400',
  VELOCITY: 'text-purple-400',
  LIST_MATCH: 'text-pink-400',
  ML_SCORE: 'text-green-400',
  COMPOSITE: 'text-orange-400',
  PATTERN: 'text-yellow-400',
};

export default function RiskRules() {
  const [activeCheckpoint, setActiveCheckpoint] = useState('all');
  const [groupedRules, setGroupedRules] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedRule, setExpandedRule] = useState(null);
  const [stats, setStats] = useState({});

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const res = await fetch(`${API_BASE}/rules/by-checkpoint`);
        const data = await res.json();
        if (data.success) {
          setGroupedRules(data.data);
          const allRules = Object.values(data.data).flatMap(g => g.rules);
          setStats({
            total: allRules.length,
            active: allRules.filter(r => r.status === 'ACTIVE').length,
            critical: allRules.filter(r => r.severity === 'CRITICAL').length,
            avgCatchRate: allRules.length > 0
              ? Math.round(allRules.reduce((sum, r) => sum + (r.performance?.catchRate || 0), 0) / allRules.length * 100)
              : 0,
          });
        }
      } catch (error) {
        console.error('Error fetching rules:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRules();
  }, []);

  const getDisplayRules = () => {
    let rules = [];
    if (activeCheckpoint === 'all') {
      rules = Object.values(groupedRules).flatMap(g => g.rules);
    } else {
      rules = groupedRules[activeCheckpoint]?.rules || [];
    }
    if (search) {
      const s = search.toLowerCase();
      rules = rules.filter(r =>
        r.name?.toLowerCase().includes(s) ||
        r.description?.toLowerCase().includes(s) ||
        r.tags?.some(t => t.toLowerCase().includes(s))
      );
    }
    return rules;
  };

  const displayRules = getDisplayRules();

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-gray-400 text-center py-20">Loading rules library...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Risk Rules Library</h1>
          <p className="text-gray-400 mt-1">Detection rules organized by checkpoint across the seller lifecycle</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-4 py-2 text-sm">
            <span className="text-gray-400">Total:</span> <span className="text-white font-bold">{stats.total}</span>
            <span className="text-gray-600 mx-2">|</span>
            <span className="text-gray-400">Active:</span> <span className="text-green-400 font-bold">{stats.active}</span>
            <span className="text-gray-600 mx-2">|</span>
            <span className="text-gray-400">Catch Rate:</span> <span className="text-cyan-400 font-bold">{stats.avgCatchRate}%</span>
          </div>
        </div>
      </div>

      {/* Checkpoint Tabs */}
      <div className="flex gap-2 flex-wrap">
        {CHECKPOINTS.map(cp => {
          const count = cp.id === 'all'
            ? Object.values(groupedRules).reduce((sum, g) => sum + g.total, 0)
            : groupedRules[cp.id]?.total || 0;
          const Icon = cp.icon;
          return (
            <button
              key={cp.id}
              onClick={() => setActiveCheckpoint(cp.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeCheckpoint === cp.id
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-[#1a1f2e] text-gray-400 border border-gray-700 hover:border-gray-600'
              }`}
            >
              <Icon size={14} />
              {cp.label}
              <span className="text-xs opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Search rules by name, description, or tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#1a1f2e] border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-cyan-500/50 focus:outline-none"
        />
      </div>

      {/* Rules Grid */}
      <div className="space-y-3">
        {displayRules.length === 0 ? (
          <div className="text-center text-gray-500 py-12">No rules found for this checkpoint</div>
        ) : (
          displayRules.map(rule => (
            <div
              key={rule.ruleId}
              className="bg-[#1a1f2e] border border-gray-700 rounded-lg overflow-hidden hover:border-gray-600 transition-all"
            >
              {/* Rule Header */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer"
                onClick={() => setExpandedRule(expandedRule === rule.ruleId ? null : rule.ruleId)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {expandedRule === rule.ruleId ? <ChevronDown size={14} className="text-gray-500 shrink-0" /> : <ChevronRight size={14} className="text-gray-500 shrink-0" />}
                  <span className={`text-xs font-mono ${TYPE_COLORS[rule.type] || 'text-gray-400'}`}>{rule.type}</span>
                  <span className="text-white font-medium truncate">{rule.name}</span>
                  {rule.severity && (
                    <span className={`text-xs px-2 py-0.5 rounded border ${SEVERITY_COLORS[rule.severity]}`}>{rule.severity}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {rule.tags?.map(tag => (
                    <span key={tag} className="text-xs bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded">{tag}</span>
                  ))}
                  <span className={`text-xs px-2 py-0.5 rounded ${ACTION_COLORS[rule.action] || ''}`}>{rule.action}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    rule.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                    rule.status === 'SHADOW' ? 'bg-purple-500/20 text-purple-400' :
                    rule.status === 'TESTING' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>{rule.status}</span>
                  <span className="text-xs text-gray-500">{rule.performance?.catchRate ? `${Math.round(rule.performance.catchRate * 100)}%` : '-'}</span>
                </div>
              </div>

              {/* Expanded Detail */}
              {expandedRule === rule.ruleId && (
                <div className="border-t border-gray-700 px-4 py-3 bg-[#0f1320]">
                  <p className="text-sm text-gray-400 mb-3">{rule.description || 'No description'}</p>
                  <div className="grid grid-cols-4 gap-4 mb-3">
                    <div>
                      <div className="text-xs text-gray-500">Triggered</div>
                      <div className="text-sm text-white font-mono">{rule.performance?.triggered?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">True Positives</div>
                      <div className="text-sm text-green-400 font-mono">{rule.performance?.truePositives?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">False Positives</div>
                      <div className="text-sm text-red-400 font-mono">{rule.performance?.falsePositives?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">FP Rate</div>
                      <div className="text-sm text-yellow-400 font-mono">{rule.performance?.falsePositiveRate ? `${Math.round(rule.performance.falsePositiveRate * 100)}%` : '-'}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Conditions</div>
                    <div className="space-y-1">
                      {rule.conditions?.map((c, i) => (
                        <div key={i} className="text-xs font-mono text-gray-300 bg-[#1a1f2e] px-2 py-1 rounded">
                          {c.field} <span className="text-cyan-400">{c.operator}</span> <span className="text-yellow-400">{JSON.stringify(c.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
