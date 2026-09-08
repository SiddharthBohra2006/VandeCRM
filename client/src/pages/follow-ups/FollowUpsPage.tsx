import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { followUpsApi, FollowUpStats, FollowUpActivity } from '../../api/follow-ups';
import { Customer } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/Icons';
import CustomSelect from '../../components/CustomSelect';
import DatePicker from '../../components/DatePicker';

const AVATAR_PALETTES = [
  { bg: '#eff6ff', color: '#2563eb' },
  { bg: '#ecfdf5', color: '#059669' },
  { bg: '#faf5ff', color: '#7c3aed' },
  { bg: '#f0fdfa', color: '#0d9488' },
  { bg: '#fdf2f8', color: '#db2777' },
  { bg: '#fff7ed', color: '#ea580c' },
  { bg: '#fffbeb', color: '#d97706' },
];

const FOLLOW_UP_TIMES = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 ? 30 : 0;
  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const label = new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { value, label };
});

function getAvatarColor(str: string) {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function initialsOf(name: string) {
  return (name || 'L').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'L';
}

function normalizePhone(phone?: string) {
  if (!phone) return '';
  return phone.replace(/[^0-9+]/g, '');
}

function toDatetimeLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formatDueDate(value?: string | null) {
  if (!value) return { date: 'Not set', time: '', isOverdue: false, isToday: false, isUpcoming: false, tag: '' };
  const d = new Date(value);
  const now = new Date();

  const isToday = d.toDateString() === now.toDateString();
  const isOverdue = d < now && !isToday;

  const dateStr = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  let tag = 'Upcoming';
  if (isOverdue) tag = 'Overdue';
  else if (isToday) tag = 'Today';

  return { date: dateStr, time: timeStr, isOverdue, isToday, tag };
}

function getStageStyle(stageName?: string) {
  const s = (stageName || '').toLowerCase();
  if (s.includes('call')) return { bg: 'rgba(124, 58, 237, 0.15)', color: '#c084fc', border: 'rgba(124, 58, 237, 0.3)' };
  if (s.includes('message')) return { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' };
  if (s.includes('proposal') || s.includes('won') || s.includes('close')) return { bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
  if (s.includes('lost') || s.includes('reject')) return { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
  return { bg: 'var(--bg-soft, #f8fafc)', color: 'var(--text)', border: 'var(--border)' };
}

export default function FollowUpsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [followUps, setFollowUps] = useState<Customer[]>([]);
  const [completedFollowUps, setCompletedFollowUps] = useState<FollowUpActivity[]>([]);
  const [stats, setStats] = useState<FollowUpStats>({ due: 0, today: 0, upcoming: 0, overdue: 0, completed: 0, all: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState('');

  // Row edit state
  const [rescheduleData, setRescheduleData] = useState<Record<string, { nextFollowUpAt: string; comment: string }>>({});
  const [completeNotes, setCompleteNotes] = useState<Record<string, string>>({});

  // Selection & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('earliest');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showDateRange, setShowDateRange] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const currentView = searchParams.get('view') || 'all';

  useEffect(() => {
    loadTasks();
  }, [searchParams]);

  async function loadTasks() {
    try {
      setLoading(true);
      setError('');
      const res = await followUpsApi.list({ view: currentView });
      setFollowUps(res.followUps || []);
      setCompletedFollowUps(res.completedFollowUps || []);
      setStats(res.stats || { due: 0, today: 0, upcoming: 0, overdue: 0, completed: 0, all: 0 });

      // Initialize reschedule state for rows
      const initResched: Record<string, { nextFollowUpAt: string; comment: string }> = {};
      (res.followUps || []).forEach(t => {
        initResched[t._id] = {
          nextFollowUpAt: toDatetimeLocal(t.nextFollowUpAt),
          comment: '',
        };
      });
      setRescheduleData(initResched);
      setCompleteNotes({});
    } catch (err: any) {
      setError(err.message || 'Failed to load follow-ups');
    } finally {
      setLoading(false);
    }
  }

  function handleTabClick(view: string) {
    const updated = new URLSearchParams(searchParams);
    updated.set('view', view);
    setSearchParams(updated);
    setPage(1);
  }

  async function handleComplete(taskId: string) {
    const comment = String(completeNotes[taskId] || '').trim();
    if (!comment) {
      setError('Add a comment before completing the follow-up.');
      return;
    }
    try {
      setBusyId(taskId);
      setError('');
      await followUpsApi.complete(taskId, comment);
      setSuccess('Follow-up completed successfully.');
      setTimeout(() => setSuccess(''), 3000);
      await loadTasks();
    } catch (err: any) {
      setError(err.message || 'Failed to complete follow-up');
    } finally {
      setBusyId('');
    }
  }

  async function handleReschedule(taskId: string, dateStr: string) {
    try {
      setBusyId(taskId);
      setError('');
      const row = rescheduleData[taskId] || { nextFollowUpAt: dateStr, comment: '' };
      const nextAt = dateStr || row.nextFollowUpAt;
      if (!nextAt) {
        setError('Please choose a valid follow-up date and time.');
        return;
      }
      const comment = String(completeNotes[taskId] || '').trim();
      if (!comment) {
        setError('Add a comment explaining the schedule change.');
        return;
      }
      await followUpsApi.reschedule(taskId, new Date(nextAt).toISOString(), comment);
      setSuccess('Follow-up rescheduled.');
      setTimeout(() => setSuccess(''), 3000);
      await loadTasks();
    } catch (err: any) {
      setError(err.message || 'Failed to reschedule follow-up');
    } finally {
      setBusyId('');
    }
  }

  // Derived filter options
  const uniqueStages = useMemo(() => {
    const map = new Map<string, string>();
    followUps.forEach(f => {
      if (f.stage?.name) map.set(f.stage._id || f.stage.name, f.stage.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
  }, [followUps]);

  const uniqueClients = useMemo(() => {
    const map = new Map<string, string>();
    followUps.forEach(f => {
      const name = (f.clientCompany as any)?.name;
      if (name) map.set(name, name);
    });
    return Array.from(map.entries()).map(([name]) => ({ value: name, label: name }));
  }, [followUps]);

  const uniqueOwners = useMemo(() => {
    const map = new Map<string, string>();
    followUps.forEach(f => {
      const name = f.assignedTo?.name;
      if (name) map.set(f.assignedTo?._id || name, name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
  }, [followUps]);

  // Filtered and Sorted list
  const filteredFollowUps = useMemo(() => {
    let result = [...followUps];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f =>
        f.name?.toLowerCase().includes(q) ||
        f.phone?.includes(q) ||
        f.email?.toLowerCase().includes(q) ||
        (f.clientCompany as any)?.name?.toLowerCase().includes(q) ||
        (f.campaign as any)?.name?.toLowerCase().includes(q) ||
        f.assignedTo?.name?.toLowerCase().includes(q) ||
        f.notes?.toLowerCase().includes(q)
      );
    }

    if (stageFilter !== 'all') {
      result = result.filter(f => f.stage?._id === stageFilter || f.stage?.name === stageFilter);
    }

    if (clientFilter !== 'all') {
      result = result.filter(f => (f.clientCompany as any)?.name === clientFilter);
    }

    if (ownerFilter !== 'all') {
      result = result.filter(f => f.assignedTo?._id === ownerFilter || f.assignedTo?.name === ownerFilter);
    }

    if (typeFilter === 'lead') result = result.filter(f => !f.stage?.isWon);
    if (typeFilter === 'client') result = result.filter(f => Boolean(f.stage?.isWon));

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter(f => f.nextFollowUpAt && new Date(f.nextFollowUpAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59');
      result = result.filter(f => f.nextFollowUpAt && new Date(f.nextFollowUpAt) <= to);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'earliest') {
        const da = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : 9999999999999;
        const db = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : 9999999999999;
        return da - db;
      }
      if (sortBy === 'latest') {
        const da = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : 0;
        const db = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : 0;
        return db - da;
      }
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      return 0;
    });

    return result;
  }, [followUps, searchQuery, stageFilter, clientFilter, ownerFilter, typeFilter, dateFrom, dateTo, sortBy]);

  // Pagination slice
  const totalItems = filteredFollowUps.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedFollowUps = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredFollowUps.slice(start, start + pageSize);
  }, [filteredFollowUps, page, pageSize]);

  function exportCSV() {
    if (filteredFollowUps.length === 0) return;
    const headers = ['Name', 'Phone', 'Email', 'Due', 'Stage', 'Client', 'Campaign', 'Owner'];
    const rows = filteredFollowUps.map(f => [
      `"${(f.name || '').replace(/"/g, '""')}"`,
      `"${f.phone || ''}"`,
      `"${f.email || ''}"`,
      `"${f.nextFollowUpAt ? new Date(f.nextFollowUpAt).toLocaleString() : ''}"`,
      `"${f.stage?.name || ''}"`,
      `"${(f.clientCompany as any)?.name || ''}"`,
      `"${(f.campaign as any)?.name || ''}"`,
      `"${f.assignedTo?.name || ''}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `follow_ups_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="page-container follow-ups-page">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {/* 1. Header & Quick Actions */}
      <section className="follow-ups-header">
        <div className="follow-ups-title-cluster">
          <div className="follow-ups-header-icon">
            <Icon name="calendar" size={22} />
          </div>
          <div>
            <div className="follow-ups-eyebrow">FOLLOW-UPS</div>
            <h1 className="follow-ups-title">Follow-ups</h1>
            <p className="follow-ups-subtitle">Never miss a client. Track, manage and close every follow-up.</p>
          </div>
        </div>

        <div className="follow-ups-header-actions">
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn-add-followup"
              onClick={() => setShowAddMenu(prev => !prev)}
            >
              <Icon name="plus" size={16} />
              <span>Add follow-up</span>
              <Icon name="chevron-down" size={14} />
            </button>
            {showAddMenu && (
              <div
                className="dropdown-menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 6,
                  background: 'var(--panel, #18182b)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '6px 0',
                  minWidth: 190,
                  zIndex: 100,
                  boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                }}
              >
                <Link
                  to="/customers/new"
                  className="dropdown-item"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', color: 'var(--text)', textDecoration: 'none', fontSize: '0.82rem' }}
                  onClick={() => setShowAddMenu(false)}
                >
                  <Icon name="user-plus" size={14} />
                  <span>New Lead & Follow-up</span>
                </Link>
                <Link
                  to="/work"
                  className="dropdown-item"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', color: 'var(--text)', textDecoration: 'none', fontSize: '0.82rem' }}
                  onClick={() => setShowAddMenu(false)}
                >
                  <Icon name="layout-grid" size={14} />
                  <span>Work Center Tasks</span>
                </Link>
              </div>
            )}
          </div>

          <Link to="/customers/import" className="btn-followup-secondary">
            <Icon name="upload" size={14} />
            <span>Import</span>
          </Link>

          <button type="button" className="btn-followup-secondary" onClick={exportCSV}>
            <Icon name="download" size={14} />
            <span>Export</span>
          </button>
        </div>
      </section>

      {/* 2. Stat Metric Cards (6 Cards) */}
      <section className="follow-ups-metrics-grid">
        {/* Today */}
        <div
          className={`follow-ups-metric-card ${currentView === 'today' ? 'active' : ''}`}
          onClick={() => handleTabClick('today')}
        >
          <div className="follow-ups-metric-head">
            <div className="follow-ups-metric-left">
              <span className="follow-ups-metric-icon today">
                <Icon name="calendar" size={14} />
              </span>
              <span className="follow-ups-metric-title">Today</span>
            </div>
            <Icon name="chevron-right" size={13} className="follow-ups-metric-chevron" />
          </div>
          <div className="follow-ups-metric-count">{stats.today}</div>
          <div className="follow-ups-metric-sub">Scheduled for today</div>
        </div>

        {/* Upcoming */}
        <div
          className={`follow-ups-metric-card ${currentView === 'upcoming' ? 'active' : ''}`}
          onClick={() => handleTabClick('upcoming')}
        >
          <div className="follow-ups-metric-head">
            <div className="follow-ups-metric-left">
              <span className="follow-ups-metric-icon upcoming">
                <Icon name="calendar-days" size={14} />
              </span>
              <span className="follow-ups-metric-title">Upcoming</span>
            </div>
            <Icon name="chevron-right" size={13} className="follow-ups-metric-chevron" />
          </div>
          <div className="follow-ups-metric-count">{stats.upcoming}</div>
          <div className="follow-ups-metric-sub">Next 7 days</div>
        </div>

        {/* Completed (This Week) */}
        <div
          className={`follow-ups-metric-card ${currentView === 'completed' ? 'active' : ''}`}
          onClick={() => handleTabClick('completed')}
        >
          <div className="follow-ups-metric-head">
            <div className="follow-ups-metric-left">
              <span className="follow-ups-metric-icon completed">
                <Icon name="check" size={14} />
              </span>
              <span className="follow-ups-metric-title">Completed (This Week)</span>
            </div>
          </div>
          <div className="follow-ups-metric-count">{stats.completed}</div>
          <div className="follow-ups-metric-sub">Follow-ups completed</div>
        </div>

        {/* Overdue */}
        <div
          className={`follow-ups-metric-card ${currentView === 'overdue' ? 'active' : ''}`}
          onClick={() => handleTabClick('overdue')}
        >
          <div className="follow-ups-metric-head">
            <div className="follow-ups-metric-left">
              <span className="follow-ups-metric-icon overdue">
                <Icon name="x" size={14} />
              </span>
              <span className="follow-ups-metric-title">Overdue</span>
            </div>
            <Icon name="chevron-right" size={13} className="follow-ups-metric-chevron" />
          </div>
          <div className="follow-ups-metric-count">
            {stats.overdue}
          </div>
          <div className="follow-ups-metric-sub">Action required</div>
        </div>
      </section>

      {/* 3. Queue Tabs & Date Range */}
      <section className="follow-ups-tabs-bar">
        <div className="follow-ups-tabs-list">
          {[
            { id: 'all', label: 'All Follow-ups' },
            { id: 'due', label: 'Due Now' },
            { id: 'today', label: 'Today' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'completed', label: 'Completed' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`follow-ups-tab-btn ${currentView === tab.id ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {currentView !== 'completed' && <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <button
            type="button"
            className={`follow-ups-date-range-btn ${dateFrom || dateTo ? 'active' : ''}`}
            onClick={() => setShowDateRange(prev => !prev)}
          >
            <Icon name="calendar" size={14} style={{ color: dateFrom || dateTo ? '#a855f7' : 'var(--muted)' }} />
            <span>{dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : dateFrom || dateTo || 'Select date range'}</span>
            <Icon name="chevron-down" size={12} />
          </button>
          {showDateRange && (
            <div
              className="follow-ups-date-popover"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 6,
                background: 'var(--panel, #18182b)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '14px 16px',
                zIndex: 100,
                boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                minWidth: 240,
              }}
            >
              <label style={{ fontSize: '0.76rem', fontWeight: 650, color: 'var(--muted)' }}>
                From
                <input
                  type="date"
                  className="follow-ups-reschedule-input"
                  style={{ width: '100%', marginTop: 4 }}
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                />
              </label>
              <label style={{ fontSize: '0.76rem', fontWeight: 650, color: 'var(--muted)' }}>
                To
                <input
                  type="date"
                  className="follow-ups-reschedule-input"
                  style={{ width: '100%', marginTop: 4 }}
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setPage(1); }}
                />
              </label>
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  className="btn-followup-secondary"
                  style={{ justifyContent: 'center' }}
                  onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
                >
                  <Icon name="x" size={13} /> Clear
                </button>
              )}
            </div>
          )}
        </div>}
      </section>

      {/* 4. Filters & Search Bar */}
      {currentView !== 'completed' && <section className="follow-ups-filters-card">
        <div className="follow-ups-filters-group">
          {/* Stage Filter */}
          <div className="follow-ups-filter-select">
            <CustomSelect
              value={stageFilter}
              onChange={val => { setStageFilter(val); setPage(1); }}
              options={[{ value: 'all', label: 'All stages' }, ...uniqueStages]}
              variant="compact"
              style={{ minWidth: 125 }}
            />
          </div>

          {/* Client Filter */}
          <div className="follow-ups-filter-select">
            <CustomSelect
              value={clientFilter}
              onChange={val => { setClientFilter(val); setPage(1); }}
              options={[{ value: 'all', label: 'All clients' }, ...uniqueClients]}
              variant="compact"
              style={{ minWidth: 125 }}
            />
          </div>

          {/* Owner Filter */}
          <div className="follow-ups-filter-select">
            <CustomSelect
              value={ownerFilter}
              onChange={val => { setOwnerFilter(val); setPage(1); }}
              options={[{ value: 'all', label: 'All owners' }, ...uniqueOwners]}
              variant="compact"
              style={{ minWidth: 125 }}
            />
          </div>

          {/* Type Filter */}
          <div className="follow-ups-filter-select">
            <CustomSelect
              value={typeFilter}
              onChange={val => { setTypeFilter(val); setPage(1); }}
              options={[
                { value: 'all', label: 'All types' },
                { value: 'lead', label: 'Leads' },
                { value: 'client', label: 'Clients' },
              ]}
              variant="compact"
              style={{ minWidth: 115 }}
            />
          </div>
        </div>

        {/* Search Input */}
        <div className="follow-ups-search-box">
          <Icon name="search" size={15} className="follow-ups-search-icon" />
          <input
            type="text"
            className="follow-ups-search-input"
            placeholder="Search by client, owner, note..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>

        {/* Sort By Select */}
        <div className="follow-ups-sort-group">
          <span>Sort by</span>
          <div className="follow-ups-filter-select">
            <CustomSelect
              value={sortBy}
              onChange={val => setSortBy(val)}
              options={[
                { value: 'earliest', label: 'Due date (earliest)' },
                { value: 'latest', label: 'Due date (latest)' },
                { value: 'name', label: 'Name (A–Z)' },
              ]}
              variant="compact"
              style={{ minWidth: 165 }}
            />
          </div>
        </div>
      </section>}

      {/* 5. Follow-ups Data Table */}
      {currentView === 'completed' ? (
        <section className="follow-ups-table-card">
          <table className="follow-ups-table">
            <thead>
              <tr>
                <th>LEAD / CONTACT</th>
                <th>COMPLETED AT</th>
                <th>COMPLETED BY</th>
                <th>NOTE</th>
                <th>COMMENT</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                    Loading completed follow-ups...
                  </td>
                </tr>
              ) : completedFollowUps.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
                    No completed follow-ups yet.
                  </td>
                </tr>
              ) : (
                completedFollowUps.map(activity => {
                  const cust = activity.customer;
                  const avatarColor = getAvatarColor(cust?.name || '');
                  return (
                    <tr key={activity._id}>
                      <td>
                        <div className="follow-ups-lead-cell">
                          <span
                            className="follow-ups-lead-avatar"
                            style={{ background: avatarColor.bg, color: avatarColor.color }}
                          >
                            {initialsOf(cust?.name || 'Unknown')}
                          </span>
                          <div className="follow-ups-lead-info">
                            {cust ? (
                              <Link to={`/customers/${cust._id}`} className="follow-ups-lead-name">
                                {cust.name}
                              </Link>
                            ) : (
                              <span className="follow-ups-lead-name">Unknown Lead</span>
                            )}
                            <span className="follow-ups-lead-phone">{cust?.phone || cust?.email || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text)' }}>
                          {new Date(activity.createdAt).toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <div className="follow-ups-owner-cell">
                          <span className="follow-ups-owner-avatar">
                            {initialsOf(activity.user?.name || 'Admin')}
                          </span>
                          <span>{activity.user?.name || 'Admin'}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>
                          {activity.note || '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                          {activity.comment || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="follow-ups-table-card">
        <table className="follow-ups-table">
          <thead>
            <tr>
              <th>LEAD / CONTACT</th>
              <th>DUE ↕</th>
              <th>STAGE</th>
              <th>CLIENT / CAMPAIGN</th>
              <th>FOLLOW-UP OWNER</th>
              <th>RESCHEDULE</th>
              <th>COMMENT <span aria-hidden="true">*</span></th>
              <th style={{ textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                  Loading follow-ups...
                </td>
              </tr>
            ) : paginatedFollowUps.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
                  No follow-ups match your current filters.
                </td>
              </tr>
            ) : (
              paginatedFollowUps.map(task => {
                const avatarColor = getAvatarColor(task.name);
                const cleanPhone = normalizePhone(task.phone);
                const dueInfo = formatDueDate(task.nextFollowUpAt);
                const stageStyle = getStageStyle(task.stage?.name);
                const row = rescheduleData[task._id] || { nextFollowUpAt: '', comment: '' };

                return (
                  <tr key={task._id}>
                    {/* LEAD / CONTACT */}
                    <td>
                      <div className="follow-ups-lead-cell">
                        <span
                          className="follow-ups-lead-avatar"
                          style={{ background: avatarColor.bg, color: avatarColor.color }}
                        >
                          {initialsOf(task.name)}
                        </span>
                        <div className="follow-ups-lead-info">
                          <Link to={`/customers/${task._id}`} className="follow-ups-lead-name">
                            {task.name}
                          </Link>
                          <span className="follow-ups-lead-phone">
                            {task.phone || task.email || '—'}
                          </span>
                          <div className="follow-ups-comm-chips">
                            {cleanPhone && (
                              <>
                                <a
                                  href={`https://wa.me/${cleanPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="comm-chip wa"
                                  title="Open WhatsApp chat"
                                >
                                  <Icon name="message-circle" size={11} /> WA
                                </a>
                                <a
                                  href={`tel:${cleanPhone}`}
                                  className="comm-chip call"
                                  title="Call phone"
                                >
                                  <Icon name="phone" size={11} /> Call
                                </a>
                              </>
                            )}
                            {task.email && (
                              <a
                                href={`mailto:${task.email}`}
                                className="comm-chip email"
                                title="Send email"
                              >
                                <Icon name="mail" size={11} /> Email
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* DUE */}
                    <td>
                      <div className="follow-ups-due-cell">
                        <span className={`follow-ups-due-date ${dueInfo.tag.toLowerCase().replace(' ', '-')}`}>
                          {dueInfo.date}
                        </span>
                        {dueInfo.time && (
                          <span className="follow-ups-due-time" style={{ color: 'var(--muted)' }}>
                            {dueInfo.time}
                          </span>
                        )}
                        {dueInfo.tag && (
                          <span className={`follow-ups-due-tag ${dueInfo.tag.toLowerCase().replace(' ', '-')}`}>
                            {dueInfo.tag}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* STAGE */}
                    <td>
                      <span
                        className="follow-ups-stage-pill"
                        style={{
                          background: stageStyle.bg,
                          color: stageStyle.color,
                          border: `1px solid ${stageStyle.border}`,
                        }}
                      >
                        {task.stage?.name || 'No stage'}
                      </span>
                    </td>

                    {/* CLIENT / CAMPAIGN */}
                    <td>
                      <div className="follow-ups-client-cell">
                        <span className="follow-ups-client-name">
                          {(task.clientCompany as any)?.name || 'No company'}
                        </span>
                        <span className="follow-ups-campaign-name">
                          {(task.campaign as any)?.name || 'No campaign'}
                        </span>
                      </div>
                    </td>

                    {/* FOLLOW-UP OWNER */}
                    <td>
                      <div className="follow-ups-owner-cell">
                        <span className="follow-ups-owner-avatar">
                          {initialsOf(task.assignedTo?.name || 'Admin')}
                        </span>
                        <span>{task.assignedTo?.name || 'Admin'}</span>
                      </div>
                    </td>

                    {/* RESCHEDULE */}
                    <td>
                      <div className="follow-ups-reschedule-controls">
                        <DatePicker
                          value={row.nextFollowUpAt.slice(0, 10)}
                          onChange={date => {
                            setError('');
                            const time = row.nextFollowUpAt.slice(11, 16) || '10:00';
                            setRescheduleData(prev => ({
                              ...prev,
                              [task._id]: { ...row, nextFollowUpAt: date ? `${date}T${time}` : '' },
                            }));
                          }}
                          placeholder="Choose date"
                          aria-label={`Follow-up date for ${task.name}`}
                        />
                        <CustomSelect
                          value={row.nextFollowUpAt.slice(11, 16) || '10:00'}
                          onChange={time => {
                            setError('');
                            const date = row.nextFollowUpAt.slice(0, 10);
                            if (!date) return;
                            setRescheduleData(prev => ({
                              ...prev,
                              [task._id]: { ...row, nextFollowUpAt: `${date}T${time}` },
                            }));
                          }}
                          options={FOLLOW_UP_TIMES}
                          variant="compact"
                          style={{ minWidth: 112 }}
                        />
                      </div>
                      <button
                        type="button"
                        className="follow-ups-save-date"
                        disabled={!row.nextFollowUpAt || busyId === task._id}
                        onClick={() => void handleReschedule(task._id, row.nextFollowUpAt)}
                      >
                        {busyId === task._id ? 'Saving…' : 'Save date'}
                      </button>
                    </td>

                    {/* REQUIRED CHANGE COMMENT */}
                    <td>
                      <input
                        type="text"
                        className={`follow-ups-note-input ${completeNotes[task._id]?.trim() ? '' : 'required-empty'}`}
                        placeholder="Required: explain the update"
                        value={completeNotes[task._id] || ''}
                        onChange={e => {
                          setError('');
                          setCompleteNotes({ ...completeNotes, [task._id]: e.target.value });
                        }}
                        aria-required="true"
                      />
                    </td>

                    {/* ACTIONS */}
                    <td>
                      <div className="follow-ups-actions-cell">
                        <Link
                          to={`/customers/${task._id}`}
                          className="follow-ups-menu-btn"
                          title="View customer timeline"
                        >
                          ···
                        </Link>
                        <button
                          type="button"
                          className="btn-complete-followup"
                          disabled={busyId === task._id}
                          onClick={() => handleComplete(task._id)}
                        >
                          {busyId === task._id ? 'Saving…' : 'Complete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </section>
      )}

      {/* 6. Pagination Footer */}
      {currentView !== 'completed' && totalItems > 0 && (
        <section className="follow-ups-pagination-bar">
          <div>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems} follow-ups
          </div>

          <div className="work-pagination-controls">
            <button
              type="button"
              className="work-page-btn"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Previous page"
            >
              ‹
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                type="button"
                className={`work-page-btn ${page === p ? 'active' : ''}`}
                style={page === p ? { background: '#7c3aed !important', borderColor: '#7c3aed !important' } : undefined}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}

            <button
              type="button"
              className="work-page-btn"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
