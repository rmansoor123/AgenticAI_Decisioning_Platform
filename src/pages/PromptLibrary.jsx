import { useState, useEffect } from 'react';
import { BookOpen, Search, Plus, Edit3, Trash2, ChevronDown, ChevronRight, FileText, CheckCircle, RefreshCw, Cloud, Layers, TestTube, Clock } from 'lucide-react';
import { safeJson } from '../utils/api'

const API_BASE = '/api';

const AGENT_LABELS = {
  'shared': 'Shared',
  'seller-onboarding': 'Seller Onboarding',
  'fraud-investigation': 'Fraud Investigation',
  'alert-triage': 'Alert Triage',
  'rule-optimization': 'Rule Optimization',
  'cross-domain': 'Cross-Domain Correlation',
  'policy-evolution': 'Policy Evolution',
  'payout-risk': 'Payout Risk',
  'listing-intelligence': 'Listing Intelligence',
  'profile-mutation': 'Profile Mutation',
  'returns-abuse': 'Returns Abuse',
};

const AGENT_COLORS = {
  'shared': 'text-blue-400',
  'seller-onboarding': 'text-emerald-400',
  'fraud-investigation': 'text-red-400',
  'alert-triage': 'text-amber-400',
  'rule-optimization': 'text-purple-400',
  'cross-domain': 'text-cyan-400',
  'policy-evolution': 'text-pink-400',
  'payout-risk': 'text-orange-400',
  'listing-intelligence': 'text-indigo-400',
  'profile-mutation': 'text-teal-400',
  'returns-abuse': 'text-rose-400',
};

const AGENT_BG_COLORS = {
  'shared': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'seller-onboarding': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'fraud-investigation': 'bg-red-500/20 text-red-400 border-red-500/30',
  'alert-triage': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'rule-optimization': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'cross-domain': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'policy-evolution': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'payout-risk': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'listing-intelligence': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  'profile-mutation': 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  'returns-abuse': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

const PRIORITY_COLORS = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const PHASE_COLORS = {
  think: 'bg-blue-500/20 text-blue-400',
  plan: 'bg-green-500/20 text-green-400',
  observe: 'bg-amber-500/20 text-amber-400',
  reflect: 'bg-purple-500/20 text-purple-400',
  decide: 'bg-red-500/20 text-red-400',
  replan: 'bg-orange-500/20 text-orange-400',
};

function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-white mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-white mt-6 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-white mt-6 mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-800 px-1.5 py-0.5 rounded text-emerald-400 text-sm">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="text-gray-300 ml-4 list-disc">$1</li>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-gray-600 pl-4 text-gray-400 italic my-2">$1</blockquote>')
    .replace(/\n\n/g, '<br/><br/>');
}

export default function PromptLibrary() {
  const [prompts, setPrompts] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editMetadata, setEditMetadata] = useState({ agent: 'shared', phases: ['think'], priority: 'medium' });
  const [newId, setNewId] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ agent: 'all', phase: 'all', priority: 'all' });
  const [modal, setModal] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set(Object.keys(AGENT_LABELS)));
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [testVariables, setTestVariables] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [versions, setVersions] = useState(null);
  const [showVersions, setShowVersions] = useState(false);
  const [activeTab, setActiveTab] = useState('content'); // content | test | versions

  const fetchPrompts = async () => {
    try {
      const res = await fetch(`${API_BASE}/prompts`);
      const data = await safeJson(res);
      if (data.success) {
        setPrompts(data.data);
      }
    } catch (error) {
      console.error('Error fetching prompts:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/prompts/stats`);
      const data = await safeJson(res);
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchPrompts(), fetchStats()]);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedPrompt(null);
      setVersions(null);
      setTestResult(null);
      setActiveTab('content');
      return;
    }
    let cancelled = false;
    const fetchPrompt = async () => {
      try {
        const res = await fetch(`${API_BASE}/prompts/${selectedId}`);
        const data = await safeJson(res);
        if (!cancelled && data.success) {
          setSelectedPrompt(data.data);
        }
      } catch (error) {
        if (!cancelled) console.error('Error fetching prompt:', error);
      }
    };
    fetchPrompt();
    return () => { cancelled = true; };
  }, [selectedId]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`${API_BASE}/prompts/sync`, { method: 'POST' });
      const data = await safeJson(res);
      if (data.success) {
        setSyncResult(data.data);
        await fetchStats();
      }
    } catch (error) {
      console.error('Sync error:', error);
    }
    setSyncing(false);
  };

  const handleTestPrompt = async () => {
    if (!selectedId) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      let variables = {};
      if (testVariables.trim()) {
        try {
          variables = JSON.parse(testVariables);
        } catch {
          setTestResult({ error: 'Invalid JSON in variables field' });
          setTestLoading(false);
          return;
        }
      }
      const res = await fetch(`${API_BASE}/prompts/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptName: selectedId, variables })
      });
      const data = await safeJson(res);
      if (data.success) {
        setTestResult(data.data);
      } else {
        setTestResult({ error: data.error || 'Test failed' });
      }
    } catch (error) {
      setTestResult({ error: error.message });
    }
    setTestLoading(false);
  };

  const handleFetchVersions = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`${API_BASE}/prompts/${selectedId}/versions`);
      const data = await safeJson(res);
      if (data.success) {
        setVersions(data.data);
      }
    } catch (error) {
      console.error('Error fetching versions:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'versions' && selectedId) {
      handleFetchVersions();
    }
  }, [activeTab, selectedId]);

  const filteredPrompts = prompts.filter(p => {
    if (filters.agent !== 'all' && p.agent !== filters.agent) return false;
    if (filters.phase !== 'all' && (!p.phases || !p.phases.includes(filters.phase))) return false;
    if (filters.priority !== 'all' && p.priority !== filters.priority) return false;
    if (search && !p.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const groupedPrompts = {};
  for (const agent of Object.keys(AGENT_LABELS)) {
    const agentPrompts = filteredPrompts.filter(p => p.agent === agent);
    if (agentPrompts.length > 0) {
      groupedPrompts[agent] = agentPrompts;
    }
  }

  const toggleGroup = (agent) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(agent)) {
        next.delete(agent);
      } else {
        next.add(agent);
      }
      return next;
    });
  };

  const handleSelect = (id) => {
    if (editMode || creating) return;
    setSelectedId(id);
    setActiveTab('content');
    setTestResult(null);
    setVersions(null);
  };

  const handleEdit = () => {
    if (!selectedPrompt) return;
    setEditContent(selectedPrompt.content || '');
    setEditMetadata({
      agent: selectedPrompt.agent || 'shared',
      phases: selectedPrompt.phases || ['think'],
      priority: selectedPrompt.priority || 'medium',
    });
    setEditMode(true);
    setCreating(false);
  };

  const handleNewPrompt = () => {
    setCreating(true);
    setEditMode(false);
    setSelectedId(null);
    setSelectedPrompt(null);
    setNewId('');
    setEditContent('');
    setEditMetadata({ agent: 'shared', phases: ['think'], priority: 'medium' });
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setCreating(false);
  };

  const handleSaveConfirm = async () => {
    try {
      if (creating) {
        const res = await fetch(`${API_BASE}/prompts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: newId,
            agent: editMetadata.agent,
            phases: editMetadata.phases,
            priority: editMetadata.priority,
            content: editContent,
          }),
        });
        const result = await safeJson(res);
        if (!result.success) {
          console.error('Save failed:', result.error);
          setModal(null);
          return;
        }
        await fetchPrompts();
        setSelectedId(newId);
        setCreating(false);
      } else {
        const res = await fetch(`${API_BASE}/prompts/${selectedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: editMetadata.agent,
            phases: editMetadata.phases,
            priority: editMetadata.priority,
            content: editContent,
          }),
        });
        const result = await safeJson(res);
        if (!result.success) {
          console.error('Update failed:', result.error);
          setModal(null);
          return;
        }
        await fetchPrompts();
        const detailRes = await fetch(`${API_BASE}/prompts/${selectedId}`);
        const data = await detailRes.json();
        if (data.success) {
          setSelectedPrompt(data.data);
        }
        setEditMode(false);
      }
      await fetchStats();
    } catch (error) {
      console.error('Error saving prompt:', error);
    }
    setModal(null);
  };

  const handleDeleteConfirm = async () => {
    try {
      const res = await fetch(`${API_BASE}/prompts/${selectedId}`, { method: 'DELETE' });
      const result = await safeJson(res);
      if (!result.success) {
        console.error('Delete failed:', result.error);
        setModal(null);
        return;
      }
      await fetchPrompts();
      setSelectedId(null);
      setSelectedPrompt(null);
    } catch (error) {
      console.error('Error deleting prompt:', error);
    }
    setModal(null);
  };

  const togglePhase = (phase) => {
    setEditMetadata(prev => {
      const phases = prev.phases.includes(phase)
        ? prev.phases.filter(p => p !== phase)
        : [...prev.phases, phase];
      return { ...prev, phases: phases.length > 0 ? phases : prev.phases };
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-gray-400 text-center py-20">Loading prompt library...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 h-full">
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <BookOpen size={24} className="text-emerald-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Prompt Library</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              Manage, version, and test prompts across all {stats?.totalPrompts || prompts.length} agents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Sync to Langfuse */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-all ${
              syncing
                ? 'bg-gray-700/30 text-gray-500 border-gray-600 cursor-wait'
                : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/30'
            }`}
          >
            <Cloud size={16} className={syncing ? 'animate-pulse' : ''} />
            {syncing ? 'Syncing...' : 'Sync to Langfuse'}
          </button>
          {syncResult && (
            <span className="text-xs text-emerald-400">
              {syncResult.synced} synced
            </span>
          )}
          {/* New Prompt */}
          <button
            onClick={handleNewPrompt}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-all"
          >
            <Plus size={16} />
            New Prompt
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-[#1a1f2e] border border-gray-700 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Prompts</div>
          <div className="text-2xl font-bold text-white">{stats?.totalPrompts || prompts.length}</div>
        </div>
        <div className="bg-[#1a1f2e] border border-gray-700 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">By Agent</div>
          <div className="text-2xl font-bold text-white">{stats?.byAgent ? Object.keys(stats.byAgent).length : 0}</div>
          <div className="text-xs text-gray-500 mt-1">agent groups</div>
        </div>
        <div className="bg-[#1a1f2e] border border-gray-700 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">By Phase</div>
          <div className="text-2xl font-bold text-white">{stats?.byPhase ? Object.keys(stats.byPhase).length : 0}</div>
          <div className="text-xs text-gray-500 mt-1">phase types</div>
        </div>
        <div className="bg-[#1a1f2e] border border-gray-700 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Langfuse Sync</div>
          <div className={`text-sm font-semibold mt-1 ${stats?.langfuse?.available ? 'text-emerald-400' : 'text-gray-500'}`}>
            {stats?.langfuse?.available ? 'Connected' : 'Unavailable'}
          </div>
          {stats?.langfuse?.synced && (
            <div className="text-xs text-gray-500 mt-1">{stats.langfuse.synced} synced, {stats.langfuse.fetched} fetched</div>
          )}
        </div>
        <div className="bg-[#1a1f2e] border border-gray-700 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">PromptLayer</div>
          <div className={`text-sm font-semibold mt-1 ${stats?.promptLayer?.available ? 'text-emerald-400' : stats?.promptLayer?.configured ? 'text-amber-400' : 'text-gray-500'}`}>
            {stats?.promptLayer?.available ? 'Active' : stats?.promptLayer?.configured ? 'Configured' : 'Not Configured'}
          </div>
          <div className="text-xs text-gray-500 mt-1">LLM call tracking</div>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filters.agent}
          onChange={(e) => setFilters(prev => ({ ...prev, agent: e.target.value }))}
          className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
        >
          <option value="all">All Agents</option>
          {Object.entries(AGENT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={filters.phase}
          onChange={(e) => setFilters(prev => ({ ...prev, phase: e.target.value }))}
          className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
        >
          <option value="all">All Phases</option>
          <option value="think">Think</option>
          <option value="plan">Plan</option>
          <option value="observe">Observe</option>
          <option value="reflect">Reflect</option>
        </select>
        <select
          value={filters.priority}
          onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
          className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
        >
          <option value="all">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search prompts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500/50 focus:outline-none w-56"
          />
        </div>
      </div>

      {/* Main Layout: Sidebar + Content */}
      <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 340px)' }}>
        {/* Left Sidebar */}
        <div className="w-72 shrink-0 bg-[#1a1f2e] border border-gray-700 rounded-xl overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
          {Object.keys(groupedPrompts).length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-8 px-4">No prompts match filters</div>
          ) : (
            Object.entries(groupedPrompts).map(([agent, agentPrompts]) => (
              <div key={agent} className="border-b border-gray-700/50 last:border-b-0">
                <button
                  onClick={() => toggleGroup(agent)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-all"
                >
                  <div className="flex items-center gap-2">
                    {expandedGroups.has(agent) ? (
                      <ChevronDown size={14} className="text-gray-500" />
                    ) : (
                      <ChevronRight size={14} className="text-gray-500" />
                    )}
                    <span className={`text-sm font-medium ${AGENT_COLORS[agent] || 'text-gray-400'}`}>
                      {AGENT_LABELS[agent] || agent}
                    </span>
                  </div>
                  <span className="text-xs bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded-full">
                    {agentPrompts.length}
                  </span>
                </button>
                {expandedGroups.has(agent) && (
                  <div className="pb-1">
                    {agentPrompts.map(prompt => (
                      <button
                        key={prompt.id}
                        onClick={() => handleSelect(prompt.id)}
                        className={`w-full text-left px-4 py-2.5 pl-9 flex items-center justify-between gap-2 transition-all text-sm ${
                          selectedId === prompt.id
                            ? 'bg-emerald-500/10 border-l-2 border-emerald-500/30'
                            : 'hover:bg-gray-800/30 border-l-2 border-transparent'
                        }`}
                      >
                        <span className={`truncate ${selectedId === prompt.id ? 'text-white' : 'text-gray-300'}`}>
                          {prompt.id}
                        </span>
                        {prompt.priority && (
                          <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${PRIORITY_COLORS[prompt.priority] || ''}`}>
                            {prompt.priority}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 bg-[#1a1f2e] border border-gray-700 rounded-xl overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
          {creating ? (
            /* New Prompt Mode */
            <div className="p-6 space-y-6">
              <h2 className="text-xl font-bold text-white">Create New Prompt</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Prompt ID</label>
                  <input
                    type="text"
                    value={newId}
                    onChange={(e) => setNewId(e.target.value)}
                    placeholder="e.g. shared-risk-factors"
                    className="w-full bg-[#12121a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Agent</label>
                  <select
                    value={editMetadata.agent}
                    onChange={(e) => setEditMetadata(prev => ({ ...prev, agent: e.target.value }))}
                    className="w-full bg-[#12121a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                  >
                    {Object.entries(AGENT_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Phases</label>
                  <div className="flex gap-3">
                    {Object.keys(PHASE_COLORS).map(phase => (
                      <label key={phase} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editMetadata.phases.includes(phase)}
                          onChange={() => togglePhase(phase)}
                          className="accent-emerald-500"
                        />
                        <span className="text-gray-300 capitalize">{phase}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Priority</label>
                  <select
                    value={editMetadata.priority}
                    onChange={(e) => setEditMetadata(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full bg-[#12121a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Content (Markdown)</label>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full bg-[#12121a] border border-gray-700 rounded-lg px-4 py-3 text-sm text-white font-mono focus:border-emerald-500/50 focus:outline-none resize-none min-h-[500px]"
                    placeholder="Write your prompt content in markdown..."
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Preview</label>
                  <div
                    className="bg-[#12121a] border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-300 overflow-y-auto min-h-[500px]"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 bg-gray-700/50 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { if (newId.trim() && editContent.trim()) setModal('save'); }}
                  disabled={!newId.trim() || !editContent.trim()}
                  className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all ${newId.trim() && editContent.trim() ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' : 'bg-gray-700/30 text-gray-500 border-gray-600 cursor-not-allowed'}`}
                >
                  Save
                </button>
              </div>
            </div>
          ) : editMode && selectedPrompt ? (
            /* Edit Mode */
            <div className="p-6 space-y-6">
              <h2 className="text-xl font-bold text-white">Edit: {selectedId}</h2>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Agent</label>
                  <select
                    value={editMetadata.agent}
                    onChange={(e) => setEditMetadata(prev => ({ ...prev, agent: e.target.value }))}
                    className="w-full bg-[#12121a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                  >
                    {Object.entries(AGENT_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Phases</label>
                  <div className="flex gap-3">
                    {Object.keys(PHASE_COLORS).map(phase => (
                      <label key={phase} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editMetadata.phases.includes(phase)}
                          onChange={() => togglePhase(phase)}
                          className="accent-emerald-500"
                        />
                        <span className="text-gray-300 capitalize">{phase}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Priority</label>
                  <select
                    value={editMetadata.priority}
                    onChange={(e) => setEditMetadata(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full bg-[#12121a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Content (Markdown)</label>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full bg-[#12121a] border border-gray-700 rounded-lg px-4 py-3 text-sm text-white font-mono focus:border-emerald-500/50 focus:outline-none resize-none min-h-[500px]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Preview</label>
                  <div
                    className="bg-[#12121a] border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-300 overflow-y-auto min-h-[500px]"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 bg-gray-700/50 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setModal('save')}
                  className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-all"
                >
                  Save
                </button>
              </div>
            </div>
          ) : selectedPrompt ? (
            /* View Mode */
            <div className="p-6 space-y-6">
              {/* Prompt Header */}
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <h2 className="text-2xl font-bold text-white font-mono">{selectedPrompt.id}</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2.5 py-1 rounded border ${AGENT_BG_COLORS[selectedPrompt.agent] || ''}`}>
                      {AGENT_LABELS[selectedPrompt.agent] || selectedPrompt.agent}
                    </span>
                    <span className={`text-xs px-2.5 py-1 rounded border ${PRIORITY_COLORS[selectedPrompt.priority] || ''}`}>
                      {selectedPrompt.priority}
                    </span>
                    {selectedPrompt.phases?.map(phase => (
                      <span key={phase} className={`text-xs px-2.5 py-1 rounded ${PHASE_COLORS[phase] || ''}`}>
                        {phase}
                      </span>
                    ))}
                    {selectedPrompt.version && (
                      <span className="text-xs text-gray-500 ml-2">v{selectedPrompt.version}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-all"
                  >
                    <Edit3 size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() => setModal('delete')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm hover:bg-red-500/20 transition-all"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-700">
                <button
                  onClick={() => setActiveTab('content')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'content'
                      ? 'border-emerald-500 text-white'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <FileText size={14} className="inline mr-1.5" />
                  Content
                </button>
                <button
                  onClick={() => setActiveTab('test')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'test'
                      ? 'border-emerald-500 text-white'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <TestTube size={14} className="inline mr-1.5" />
                  Test
                </button>
                <button
                  onClick={() => setActiveTab('versions')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'versions'
                      ? 'border-emerald-500 text-white'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Clock size={14} className="inline mr-1.5" />
                  Versions
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'content' && (
                <div
                  className="text-sm text-gray-300 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedPrompt.content) }}
                />
              )}

              {activeTab === 'test' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Variables (JSON) -- use {'{{variableName}}'} in your prompt
                    </label>
                    <textarea
                      value={testVariables}
                      onChange={(e) => setTestVariables(e.target.value)}
                      placeholder={'{\n  "agentName": "PayoutRiskAgent",\n  "tools": "verify_bank, check_velocity"\n}'}
                      className="w-full bg-[#12121a] border border-gray-700 rounded-lg px-4 py-3 text-sm text-white font-mono focus:border-emerald-500/50 focus:outline-none resize-none h-32"
                    />
                  </div>
                  <button
                    onClick={handleTestPrompt}
                    disabled={testLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-all"
                  >
                    <TestTube size={14} />
                    {testLoading ? 'Testing...' : 'Test Prompt'}
                  </button>
                  {testResult && (
                    <div className="bg-[#12121a] border border-gray-700 rounded-lg p-4">
                      {testResult.error ? (
                        <div className="text-red-400 text-sm">{testResult.error}</div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>Source: <span className={testResult.source === 'langfuse' ? 'text-indigo-400' : 'text-emerald-400'}>{testResult.source}</span></span>
                            <span>Version: {testResult.version}</span>
                            {testResult.variablesApplied?.length > 0 && (
                              <span>Variables: {testResult.variablesApplied.join(', ')}</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-300 font-mono whitespace-pre-wrap bg-gray-900/50 rounded-lg p-3 max-h-96 overflow-y-auto">
                            {testResult.content}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'versions' && (
                <div className="space-y-4">
                  {versions ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm text-gray-400">
                        <span>Local version: <span className="text-white font-mono">v{versions.localVersion}</span></span>
                        <span className={`text-xs px-2 py-0.5 rounded ${versions.langfuseAvailable ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700/50 text-gray-500'}`}>
                          {versions.langfuseAvailable ? 'Langfuse Connected' : 'Langfuse Unavailable'}
                        </span>
                      </div>
                      {versions.langfuseVersions?.length > 0 ? (
                        <div className="space-y-2">
                          {versions.langfuseVersions.map((v, i) => (
                            <div key={i} className="bg-[#12121a] border border-gray-700 rounded-lg p-3 flex items-center justify-between">
                              <div>
                                <span className="text-sm text-white font-mono">v{v.version}</span>
                                {v.labels?.length > 0 && (
                                  <span className="ml-2 text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">
                                    {v.labels.join(', ')}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">
                                {v.contentPreview && `${v.contentPreview}...`}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-gray-500 text-sm py-4">
                          {versions.langfuseAvailable
                            ? 'No versions found in Langfuse. Click "Sync to Langfuse" to push prompts.'
                            : 'Langfuse not connected. Version history is available when Langfuse is configured.'}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-sm py-4">Loading version history...</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* No Selection Placeholder */
            <div className="flex flex-col items-center justify-center h-full py-20 text-gray-500">
              <FileText size={48} className="mb-4 opacity-50" />
              <p className="text-lg">Select a prompt from the sidebar</p>
              <p className="text-sm mt-1">or create a new prompt to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* Save Confirmation Modal */}
      {modal === 'save' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle size={20} className="text-emerald-400" />
              <h3 className="text-lg font-semibold text-white">Confirm Save</h3>
            </div>
            <p className="text-gray-400 text-sm mb-6">
              Save changes to <code className="bg-gray-800 px-1.5 py-0.5 rounded text-emerald-400 text-sm">{creating ? newId : selectedId}</code>? This will immediately update the prompt used by agents and push a new version to Langfuse.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 bg-gray-700/50 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfirm}
                className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modal === 'delete' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <Trash2 size={20} className="text-red-400" />
              <h3 className="text-lg font-semibold text-white">Confirm Delete</h3>
            </div>
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to delete <code className="bg-gray-800 px-1.5 py-0.5 rounded text-emerald-400 text-sm">{selectedId}</code>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 bg-gray-700/50 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
