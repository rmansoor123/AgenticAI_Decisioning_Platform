import { useState, useMemo } from 'react';
import {
  Shield, Search, ChevronDown, ChevronRight, Filter, BookOpen,
  Target, Zap, AlertTriangle, Eye, Activity, Lock, Users, Scale, Gauge,
  Hash, TrendingUp, CheckCircle2, XCircle, BarChart3, Layers, Server,
  Package, CreditCard, UserCheck, Globe, FileCheck, ShieldAlert, Cpu, Box
} from 'lucide-react';
import { RULES, CATEGORIES, CHECKPOINTS, SERVICES, getStats, getServiceStats } from '../data/rules-repository';

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
  RESTRICT: 'bg-purple-500/20 text-purple-400',
  HOLD: 'bg-pink-500/20 text-pink-400',
  MONITOR: 'bg-teal-500/20 text-teal-400',
};

const STATUS_COLORS = {
  ACTIVE: 'bg-green-500/20 text-green-400',
  SHADOW: 'bg-purple-500/20 text-purple-400',
  PLANNED: 'bg-gray-500/20 text-gray-400',
};

const CATEGORY_ICONS = {
  SELLER_IDENTITY: Shield,
  LISTING_INTEGRITY: Eye,
  TRANSACTION_MANIPULATION: Activity,
  FULFILLMENT_FRAUD: Zap,
  BUYER_ABUSE: AlertTriangle,
  PAYMENT_FRAUD: Lock,
  ACCOUNT_TAKEOVER: Target,
  NETWORK_RINGS: Users,
  POLICY_ABUSE: Scale,
  VELOCITY_BEHAVIORAL: Gauge,
};

const SERVICE_ICONS = {
  'seller-onboarding': Shield,
  'account-setup': Package,
  'item-setup': Box,
  'seller-listing': Eye,
  'pricing': TrendingUp,
  'seller-shipping': Zap,
  'seller-payout': CreditCard,
  'returns': AlertTriangle,
  'seller-ato': Target,
  'profile-updates': UserCheck,
  'transaction-processing': Activity,
  'payment-processing': Lock,
  'buyer-trust': ShieldAlert,
  'network-intelligence': Globe,
  'review-integrity': FileCheck,
  'policy-enforcement': Scale,
  'compliance-aml': Shield,
  'behavioral-analytics': Cpu,
};

export default function RulesRepository() {
  const [viewMode, setViewMode] = useState('service'); // 'category' | 'service'
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeService, setActiveService] = useState('all');
  const [selectedCheckpoint, setSelectedCheckpoint] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedRule, setExpandedRule] = useState(null);
  const [sortBy, setSortBy] = useState('score');
  const [sortDir, setSortDir] = useState('desc');

  const stats = useMemo(() => getStats(), []);
  const serviceStats = useMemo(() => getServiceStats(), []);

  const filteredRules = useMemo(() => {
    let rules = [...RULES];

    if (viewMode === 'category' && activeCategory !== 'all') {
      rules = rules.filter(r => r.category === activeCategory);
    }
    if (viewMode === 'service' && activeService !== 'all') {
      rules = rules.filter(r => r.service === activeService);
    }
    if (selectedCheckpoint !== 'all') {
      rules = rules.filter(r => r.checkpoint === selectedCheckpoint);
    }
    if (selectedSeverity !== 'all') {
      rules = rules.filter(r => r.severity === selectedSeverity);
    }
    if (selectedStatus !== 'all') {
      rules = rules.filter(r => r.status === selectedStatus);
    }
    if (search) {
      const s = search.toLowerCase();
      rules = rules.filter(r =>
        r.name.toLowerCase().includes(s) ||
        r.trigger.toLowerCase().includes(s) ||
        r.id.toLowerCase().includes(s) ||
        r.service?.toLowerCase().includes(s) ||
        r.tags?.some(t => t.toLowerCase().includes(s)) ||
        r.description?.toLowerCase().includes(s)
      );
    }

    rules.sort((a, b) => {
      let av, bv;
      if (sortBy === 'score') { av = a.score; bv = b.score; }
      else if (sortBy === 'catchRate') { av = a.performance?.catchRate || 0; bv = b.performance?.catchRate || 0; }
      else if (sortBy === 'triggered') { av = a.performance?.triggered || 0; bv = b.performance?.triggered || 0; }
      else if (sortBy === 'fpRate') { av = a.performance?.falsePositiveRate || 0; bv = b.performance?.falsePositiveRate || 0; }
      else { av = a.id; bv = b.id; }
      return sortDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
    });

    return rules;
  }, [viewMode, activeCategory, activeService, selectedCheckpoint, selectedSeverity, selectedStatus, search, sortBy, sortDir]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ field, children, className = '' }) => (
    <th
      className={`text-left text-xs font-medium px-4 py-3 cursor-pointer hover:text-cyan-400 transition-colors select-none ${
        sortBy === field ? 'text-cyan-400' : 'text-gray-500'
      } ${className}`}
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortBy === field && (
          <span className="text-[10px]">{sortDir === 'desc' ? '▼' : '▲'}</span>
        )}
      </span>
    </th>
  );

  const getServiceInfo = (serviceId) => SERVICES.find(s => s.id === serviceId);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BookOpen size={24} className="text-cyan-400" />
            <h1 className="text-2xl font-bold text-white">Risk & Decision Rules Repository</h1>
          </div>
          <p className="text-gray-400 mt-1 ml-9">106 marketplace-grade rules mapped to 18 business services (10 active, 8 proposed)</p>
        </div>
        {/* View Mode Toggle */}
        <div className="flex items-center bg-[#1a1f2e] border border-gray-700 rounded-lg p-0.5">
          <button
            onClick={() => { setViewMode('service'); setActiveCategory('all'); }}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'service' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Server size={12} /> By Service
          </button>
          <button
            onClick={() => { setViewMode('category'); setActiveService('all'); }}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'category' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Layers size={12} /> By Category
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-7 gap-3">
        <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500">Total Rules</div>
          <div className="text-xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500">Active</div>
          <div className="text-xl font-bold text-green-400">{stats.active}</div>
        </div>
        <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500">Shadow</div>
          <div className="text-xl font-bold text-purple-400">{stats.shadow}</div>
        </div>
        <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500">Critical</div>
          <div className="text-xl font-bold text-red-400">{stats.critical}</div>
        </div>
        <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500">Active Services</div>
          <div className="text-xl font-bold text-cyan-400">{stats.existingServices}</div>
        </div>
        <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500">Proposed Services</div>
          <div className="text-xl font-bold text-amber-400">{stats.proposedServices}</div>
        </div>
        <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500">Showing</div>
          <div className="text-xl font-bold text-white">{filteredRules.length}</div>
        </div>
      </div>

      {/* Service Tabs (when viewing by service) */}
      {viewMode === 'service' && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveService('all')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeService === 'all'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-[#1a1f2e] text-gray-400 border border-gray-700 hover:border-gray-600'
              }`}
            >
              All Services <span className="opacity-60">({stats.total})</span>
            </button>
            {SERVICES.filter(s => s.id !== 'all' && s.exists).map(svc => {
              const Icon = SERVICE_ICONS[svc.id] || Hash;
              const count = serviceStats[svc.id]?.total || 0;
              return (
                <button
                  key={svc.id}
                  onClick={() => setActiveService(svc.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeService === svc.id
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-[#1a1f2e] text-gray-400 border border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <Icon size={12} className={svc.color} />
                  {svc.label}
                  <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 flex-wrap">
            {SERVICES.filter(s => !s.exists).map(svc => {
              const Icon = SERVICE_ICONS[svc.id] || Hash;
              const count = serviceStats[svc.id]?.total || 0;
              return (
                <button
                  key={svc.id}
                  onClick={() => setActiveService(svc.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeService === svc.id
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-[#1a1f2e] text-gray-500 border border-gray-700/50 border-dashed hover:border-gray-600'
                  }`}
                >
                  <Icon size={12} className={svc.color} />
                  {svc.label}
                  <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1 rounded">PROPOSED</span>
                  <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Category Tabs (when viewing by category) */}
      {viewMode === 'category' && (
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => {
            const Icon = CATEGORY_ICONS[cat.id] || Hash;
            const count = cat.id === 'all' ? RULES.length : RULES.filter(r => r.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeCategory === cat.id
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-[#1a1f2e] text-gray-400 border border-gray-700 hover:border-gray-600'
                }`}
              >
                {cat.id !== 'all' && <Icon size={12} />}
                {cat.label}
                <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Service Detail Banner */}
      {viewMode === 'service' && activeService !== 'all' && (() => {
        const svc = getServiceInfo(activeService);
        if (!svc) return null;
        return (
          <div className={`border rounded-lg p-4 ${svc.exists ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-amber-500/5 border-amber-500/20 border-dashed'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${svc.color}`}>{svc.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${svc.exists ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {svc.exists ? 'ACTIVE SERVICE' : 'PROPOSED SERVICE'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{svc.description}</p>
                {svc.path && <p className="text-[10px] text-gray-600 font-mono mt-1">{svc.path}</p>}
                {!svc.exists && (
                  <p className="text-[10px] text-amber-500/80 mt-1 italic">This service does not exist yet. Rules below should be implemented when this service is created.</p>
                )}
              </div>
              <div className="flex gap-3 text-center">
                <div>
                  <div className="text-lg font-bold text-white">{serviceStats[activeService]?.total || 0}</div>
                  <div className="text-[10px] text-gray-500">Rules</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-400">{serviceStats[activeService]?.active || 0}</div>
                  <div className="text-[10px] text-gray-500">Active</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-red-400">{serviceStats[activeService]?.critical || 0}</div>
                  <div className="text-[10px] text-gray-500">Critical</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-cyan-400">{Math.round((serviceStats[activeService]?.avgCatchRate || 0) * 100)}%</div>
                  <div className="text-[10px] text-gray-500">Catch Rate</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Filters Row */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search rules by name, trigger condition, tag, service, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1a1f2e] border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:border-cyan-500/50 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-500" />
          <select value={selectedCheckpoint} onChange={(e) => setSelectedCheckpoint(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none">
            <option value="all">All Checkpoints</option>
            {CHECKPOINTS.map(cp => <option key={cp} value={cp}>{cp.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={selectedSeverity} onChange={(e) => setSelectedSeverity(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none">
            <option value="all">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none">
            <option value="all">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SHADOW">Shadow</option>
          </select>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="w-8 px-3 py-3"></th>
              <SortHeader field="id" className="w-20">ID</SortHeader>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Rule Name</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 w-28">Service</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 w-24">Severity</th>
              <SortHeader field="score" className="w-16">Score</SortHeader>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 w-20">Action</th>
              <SortHeader field="catchRate" className="w-16">Catch%</SortHeader>
              <SortHeader field="fpRate" className="w-14">FP%</SortHeader>
              <SortHeader field="triggered" className="w-16">Fired</SortHeader>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 w-20">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center text-gray-500 py-12">No rules match your filters</td>
              </tr>
            ) : (
              filteredRules.map(rule => {
                const isExpanded = expandedRule === rule.id;
                const CatIcon = CATEGORY_ICONS[rule.category] || Hash;
                const svcInfo = getServiceInfo(rule.service);
                return (
                  <tr key={rule.id} className="group">
                    <td colSpan={11} className="p-0">
                      <div
                        className={`flex items-center cursor-pointer transition-all ${
                          isExpanded ? 'bg-cyan-500/5 border-l-2 border-l-cyan-500' : 'hover:bg-[#0f1320] border-l-2 border-l-transparent'
                        }`}
                        onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                      >
                        <div className="w-8 px-3 py-2.5 flex items-center">
                          {isExpanded
                            ? <ChevronDown size={12} className="text-cyan-400" />
                            : <ChevronRight size={12} className="text-gray-600 group-hover:text-gray-400" />
                          }
                        </div>
                        <div className="w-20 px-4 py-2.5">
                          <span className="text-xs font-mono text-gray-400">{rule.id}</span>
                        </div>
                        <div className="flex-1 px-4 py-2.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <CatIcon size={12} className={CATEGORIES.find(c => c.id === rule.category)?.color || 'text-gray-400'} />
                            <span className="text-sm text-white truncate">{rule.name}</span>
                          </div>
                        </div>
                        <div className="w-28 px-4 py-2.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${svcInfo?.exists ? 'bg-gray-700/50 text-gray-300' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20 border-dashed'}`}>
                            {svcInfo?.label || rule.service}
                          </span>
                        </div>
                        <div className="w-24 px-4 py-2.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[rule.severity]}`}>
                            {rule.severity}
                          </span>
                        </div>
                        <div className="w-16 px-4 py-2.5">
                          <span className="text-sm font-mono font-bold text-white">{rule.score}</span>
                        </div>
                        <div className="w-20 px-4 py-2.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${ACTION_COLORS[rule.action] || ''}`}>
                            {rule.action}
                          </span>
                        </div>
                        <div className="w-16 px-4 py-2.5">
                          <span className={`text-xs font-mono ${
                            (rule.performance?.catchRate || 0) >= 0.90 ? 'text-green-400' :
                            (rule.performance?.catchRate || 0) >= 0.70 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {rule.performance?.catchRate ? `${Math.round(rule.performance.catchRate * 100)}%` : '—'}
                          </span>
                        </div>
                        <div className="w-14 px-4 py-2.5">
                          <span className={`text-xs font-mono ${
                            (rule.performance?.falsePositiveRate || 0) <= 0.10 ? 'text-green-400' :
                            (rule.performance?.falsePositiveRate || 0) <= 0.25 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {rule.performance?.falsePositiveRate ? `${Math.round(rule.performance.falsePositiveRate * 100)}%` : '—'}
                          </span>
                        </div>
                        <div className="w-16 px-4 py-2.5">
                          <span className="text-xs font-mono text-gray-400">
                            {rule.performance?.triggered ? `${(rule.performance.triggered / 1000).toFixed(1)}K` : '—'}
                          </span>
                        </div>
                        <div className="w-20 px-4 py-2.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[rule.status] || ''}`}>
                            {rule.status}
                          </span>
                        </div>
                      </div>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div className="border-t border-gray-700/50 bg-[#0f1320] px-6 py-4 space-y-4">
                          {/* Service + Checkpoint Row */}
                          <div className="flex gap-4 items-center">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500 font-medium">SERVICE:</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${svcInfo?.exists ? 'bg-cyan-500/10 text-cyan-400' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 border-dashed'}`}>
                                {svcInfo?.label || rule.service}
                                {svcInfo && !svcInfo.exists && ' (proposed)'}
                              </span>
                              {svcInfo?.path && <span className="text-[10px] text-gray-600 font-mono">{svcInfo.path}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500 font-medium">CHECKPOINT:</span>
                              <span className="text-[10px] text-gray-400 font-mono">{rule.checkpoint.replace(/_/g, ' ')}</span>
                            </div>
                          </div>

                          {/* Trigger Condition */}
                          <div>
                            <div className="text-xs text-gray-500 mb-1 font-medium flex items-center gap-1">
                              <Target size={10} /> TRIGGER CONDITION
                            </div>
                            <div className="text-sm text-white bg-[#1a1f2e] border border-gray-700/50 rounded px-3 py-2">
                              {rule.trigger}
                            </div>
                          </div>

                          {/* Description */}
                          <div>
                            <div className="text-xs text-gray-500 mb-1 font-medium">DESCRIPTION</div>
                            <p className="text-sm text-gray-300">{rule.description}</p>
                          </div>

                          {/* Performance + Conditions */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-gray-500 mb-2 font-medium flex items-center gap-1">
                                <BarChart3 size={10} /> PERFORMANCE
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-[#1a1f2e] rounded px-3 py-2">
                                  <div className="text-[10px] text-gray-500">Triggered</div>
                                  <div className="text-sm font-mono text-white">{rule.performance?.triggered?.toLocaleString() || 0}</div>
                                </div>
                                <div className="bg-[#1a1f2e] rounded px-3 py-2">
                                  <div className="text-[10px] text-gray-500">True Positives</div>
                                  <div className="text-sm font-mono text-green-400 flex items-center gap-1">
                                    <CheckCircle2 size={10} /> {rule.performance?.truePositives?.toLocaleString() || 0}
                                  </div>
                                </div>
                                <div className="bg-[#1a1f2e] rounded px-3 py-2">
                                  <div className="text-[10px] text-gray-500">False Positives</div>
                                  <div className="text-sm font-mono text-red-400 flex items-center gap-1">
                                    <XCircle size={10} /> {rule.performance?.falsePositives?.toLocaleString() || 0}
                                  </div>
                                </div>
                                <div className="bg-[#1a1f2e] rounded px-3 py-2">
                                  <div className="text-[10px] text-gray-500">Catch Rate</div>
                                  <div className={`text-sm font-mono font-bold ${
                                    (rule.performance?.catchRate || 0) >= 0.90 ? 'text-green-400' : 'text-yellow-400'
                                  }`}>
                                    {rule.performance?.catchRate ? `${Math.round(rule.performance.catchRate * 100)}%` : '—'}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-2 font-medium">CONDITIONS</div>
                              <div className="space-y-1">
                                {rule.conditions?.map((c, i) => (
                                  <div key={i} className="text-xs font-mono bg-[#1a1f2e] px-3 py-1.5 rounded flex items-center gap-1">
                                    <span className="text-gray-300">{c.field}</span>
                                    <span className="text-cyan-400 mx-1">{c.operator}</span>
                                    <span className="text-yellow-400">{JSON.stringify(c.value)}</span>
                                    {c.threshold && <span className="text-gray-500 ml-1">(threshold: {c.threshold})</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Tags */}
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-[10px] text-gray-500 font-medium">TAGS:</span>
                            {rule.tags?.map(tag => (
                              <span key={tag}
                                className="text-[10px] bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded cursor-pointer hover:text-white hover:bg-gray-600/50 transition-colors"
                                onClick={(e) => { e.stopPropagation(); setSearch(tag); }}
                              >{tag}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
