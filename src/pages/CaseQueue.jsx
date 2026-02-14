import { useState, useEffect, useCallback } from 'react';
import { User, Filter } from 'lucide-react';

const API_BASE = 'http://localhost:3005/api';

const PRIORITY_COLORS = {
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  LOW: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const STATUS_COLORS = {
  OPEN: 'bg-blue-500/20 text-blue-400',
  IN_REVIEW: 'bg-purple-500/20 text-purple-400',
  RESOLVED: 'bg-green-500/20 text-green-400',
};

export default function CaseQueue() {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState(null);
  const [caseDetail, setCaseDetail] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCheckpoint, setFilterCheckpoint] = useState('');
  const [noteText, setNoteText] = useState('');

  const fetchCases = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);
      if (filterCheckpoint) params.set('checkpoint', filterCheckpoint);

      const [casesRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/cases?${params}`),
        fetch(`${API_BASE}/cases/stats`)
      ]);

      const casesData = await casesRes.json();
      const statsData = await statsRes.json();

      if (casesData.success) setCases(casesData.data || []);
      if (statsData.success) setStats(statsData.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, filterCheckpoint]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  useEffect(() => {
    const interval = setInterval(fetchCases, 15000);
    return () => clearInterval(interval);
  }, [fetchCases]);

  const fetchCaseDetail = async (caseId) => {
    try {
      const res = await fetch(`${API_BASE}/cases/${caseId}`);
      const data = await res.json();
      if (data.success) setCaseDetail(data.data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleSelectCase = (caseId) => {
    if (selectedCase === caseId) {
      setSelectedCase(null);
      setCaseDetail(null);
    } else {
      setSelectedCase(caseId);
      fetchCaseDetail(caseId);
    }
  };

  const updateStatus = async (caseId, status, resolution) => {
    try {
      const body = { status };
      if (resolution) body.resolution = resolution;
      await fetch(`${API_BASE}/cases/${caseId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      fetchCases();
      if (selectedCase === caseId) fetchCaseDetail(caseId);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const assignCase = async (caseId) => {
    try {
      await fetch(`${API_BASE}/cases/${caseId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee: 'current-analyst@fraud-team.com' })
      });
      fetchCases();
      if (selectedCase === caseId) fetchCaseDetail(caseId);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const addNote = async (caseId) => {
    if (!noteText.trim()) return;
    try {
      await fetch(`${API_BASE}/cases/${caseId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: 'analyst@fraud-team.com', text: noteText })
      });
      setNoteText('');
      fetchCaseDetail(caseId);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const getAge = (createdAt) => {
    const hours = Math.round((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60));
    if (hours < 1) return '< 1h';
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
  };

  if (loading) {
    return <div className="p-6 text-gray-400 text-center py-20">Loading case queue...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Case Investigation Queue</h1>
          <p className="text-gray-400 mt-1">Review and resolve flagged transactions from risk checkpoints</p>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-4">
            <div className="text-xs text-gray-500">Open Cases</div>
            <div className="text-2xl font-bold text-blue-400">{stats.byStatus?.OPEN || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-4">
            <div className="text-xs text-gray-500">In Review</div>
            <div className="text-2xl font-bold text-purple-400">{stats.byStatus?.IN_REVIEW || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-4">
            <div className="text-xs text-gray-500">Critical Priority</div>
            <div className="text-2xl font-bold text-red-400">{stats.byPriority?.CRITICAL || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-4">
            <div className="text-xs text-gray-500">Avg Age</div>
            <div className="text-2xl font-bold text-yellow-400">{stats.avgAgeHours || 0}h</div>
          </div>
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-4">
            <div className="text-xs text-gray-500">Resolved</div>
            <div className="text-2xl font-bold text-green-400">{stats.byStatus?.RESOLVED || 0}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Filter size={14} className="text-gray-500" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select value={filterCheckpoint} onChange={e => setFilterCheckpoint(e.target.value)} className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">All Checkpoints</option>
          <option value="onboarding">Onboarding</option>
          <option value="ato">ATO</option>
          <option value="payout">Payout</option>
          <option value="listing">Listing</option>
          <option value="shipping">Shipping</option>
          <option value="transaction">Transaction</option>
        </select>
        <span className="text-xs text-gray-500 ml-auto">{cases.length} cases</span>
      </div>

      {/* Cases Table */}
      <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Case ID</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Priority</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Checkpoint</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Seller</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Risk Score</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Decision</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Status</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Age</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {cases.map(c => (
              <tr
                key={c.caseId}
                onClick={() => handleSelectCase(c.caseId)}
                className={`border-b border-gray-700/50 cursor-pointer transition-all ${
                  selectedCase === c.caseId ? 'bg-cyan-500/5' : 'hover:bg-[#0f1320]'
                }`}
              >
                <td className="px-4 py-3 text-sm font-mono text-cyan-400">{c.caseId}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded border ${PRIORITY_COLORS[c.priority]}`}>{c.priority}</span></td>
                <td className="px-4 py-3 text-sm text-gray-300 capitalize">{c.checkpoint}</td>
                <td className="px-4 py-3 text-sm text-gray-400 font-mono">{c.sellerId ? c.sellerId.slice(0, 12) + '...' : '-'}</td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-mono ${c.riskScore > 70 ? 'text-red-400' : c.riskScore > 40 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {c.riskScore}
                  </span>
                </td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${c.decision === 'BLOCK' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{c.decision}</span></td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[c.status]}`}>{c.status}</span></td>
                <td className="px-4 py-3 text-sm text-gray-400">{getAge(c.createdAt)}</td>
                <td className="px-4 py-3 text-sm text-gray-400">{c.assignee ? c.assignee.split('@')[0] : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cases.length === 0 && (
          <div className="text-center text-gray-500 py-12">No cases matching filters</div>
        )}
      </div>

      {/* Case Detail Panel */}
      {selectedCase && caseDetail && (
        <div className="bg-[#1a1f2e] border border-cyan-500/30 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">{caseDetail.caseId}</h3>
            <div className="flex gap-2">
              {caseDetail.status === 'OPEN' && (
                <button onClick={() => assignCase(caseDetail.caseId)} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-sm hover:bg-purple-500/30">
                  Take Case
                </button>
              )}
              {caseDetail.status !== 'RESOLVED' && (
                <>
                  <button onClick={() => updateStatus(caseDetail.caseId, 'RESOLVED', 'CONFIRMED_FRAUD')} className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm hover:bg-red-500/30">
                    Confirmed Fraud
                  </button>
                  <button onClick={() => updateStatus(caseDetail.caseId, 'RESOLVED', 'FALSE_POSITIVE')} className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-sm hover:bg-green-500/30">
                    False Positive
                  </button>
                  <button onClick={() => updateStatus(caseDetail.caseId, 'RESOLVED', 'ESCALATED')} className="px-3 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg text-sm hover:bg-orange-500/30">
                    Escalate
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div><div className="text-xs text-gray-500">Priority</div><div className={`text-sm font-bold ${caseDetail.priority === 'CRITICAL' ? 'text-red-400' : caseDetail.priority === 'HIGH' ? 'text-orange-400' : caseDetail.priority === 'MEDIUM' ? 'text-yellow-400' : 'text-green-400'}`}>{caseDetail.priority}</div></div>
            <div><div className="text-xs text-gray-500">Checkpoint</div><div className="text-sm text-white capitalize">{caseDetail.checkpoint}</div></div>
            <div><div className="text-xs text-gray-500">Risk Score</div><div className="text-sm text-white font-mono">{caseDetail.riskScore}</div></div>
            <div><div className="text-xs text-gray-500">Decision</div><div className="text-sm text-white">{caseDetail.decision}</div></div>
          </div>

          {/* Seller Info */}
          {caseDetail.seller && (
            <div className="bg-[#0f1320] rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-2">Seller Information</div>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div><span className="text-gray-400">Name:</span> <span className="text-white">{caseDetail.seller.businessName}</span></div>
                <div><span className="text-gray-400">Email:</span> <span className="text-white">{caseDetail.seller.email}</span></div>
                <div><span className="text-gray-400">Country:</span> <span className="text-white">{caseDetail.seller.country}</span></div>
                <div><span className="text-gray-400">Risk:</span> <span className="text-white">{caseDetail.seller.riskTier}</span></div>
              </div>
            </div>
          )}

          {/* Triggered Rules */}
          {caseDetail.ruleDetails && caseDetail.ruleDetails.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2">Triggered Rules</div>
              <div className="space-y-1">
                {caseDetail.ruleDetails.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-[#0f1320] rounded px-3 py-1.5">
                    <span className="text-cyan-400 font-mono text-xs">{r.ruleId}</span>
                    <span className="text-white">{r.name}</span>
                    {r.severity && <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLORS[r.severity]}`}>{r.severity}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div className="text-xs text-gray-500 mb-2">Investigation Notes</div>
            {caseDetail.notes && caseDetail.notes.length > 0 ? (
              <div className="space-y-2 mb-3">
                {caseDetail.notes.map((n, i) => (
                  <div key={i} className="bg-[#0f1320] rounded px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <User size={10} />
                      <span>{n.author}</span>
                      <span>{new Date(n.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-sm text-gray-300 mt-1">{n.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-600 mb-3">No notes yet</div>
            )}
            {caseDetail.status !== 'RESOLVED' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addNote(caseDetail.caseId)}
                  placeholder="Add investigation note..."
                  className="flex-1 bg-[#0f1320] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-cyan-500/50 focus:outline-none"
                />
                <button onClick={() => addNote(caseDetail.caseId)} className="px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm hover:bg-cyan-500/30">
                  Add Note
                </button>
              </div>
            )}
          </div>

          {caseDetail.resolution && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <div className="text-xs text-gray-500">Resolution</div>
              <div className="text-sm text-green-400 font-bold">{caseDetail.resolution}</div>
              <div className="text-xs text-gray-500 mt-1">Resolved {new Date(caseDetail.resolvedAt).toLocaleString()}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
