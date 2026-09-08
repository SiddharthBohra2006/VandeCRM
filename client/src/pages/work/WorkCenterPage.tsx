import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { workApi, WorkType, WorkItem } from '../../api/work';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission, canChangeWorkStatus } from '../../utils/permissions';
import { isWorkItemClosed } from '../../utils/workStatus';
import CustomSelect from '../../components/CustomSelect';
import BulkCreateModal from '../../components/work/BulkCreateModal';
import Icon from '../../components/Icons';

export default function WorkCenterPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [rawItems, setRawItems] = useState<WorkItem[]>([]);
  const [users, setUsers] = useState<{ _id: string; name: string; email?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [newWorkOpen, setNewWorkOpen] = useState(false);
  const newWorkRef = useRef<HTMLDivElement>(null);

  // Search & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Calendar View State
  const [calendarDate, setCalendarDate] = useState(new Date());

  // URL State
  const currentTab = searchParams.get('tab') || 'all';
  const currentModule = searchParams.get('module') || '';
  const currentStatus = searchParams.get('status') || 'open';
  const currentAssignee = searchParams.get('assignee') || searchParams.get('person') || (currentTab === 'my-work' ? 'me' : 'all');
  const currentPriority = searchParams.get('priority') || 'all';
  const currentDue = searchParams.get('due') || 'all';
  const currentSort = searchParams.get('sort') || 'due';

  useEffect(() => {
    loadWorkCenter();
  }, []);

  // Close new work dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (newWorkRef.current && !newWorkRef.current.contains(e.target as Node)) {
        setNewWorkOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadWorkCenter() {
    try {
      setLoading(true);
      setError('');
      const res = await workApi.getCenter();
      setWorkTypes(res.workTypes || []);
      setUsers(res.users || []);
      setRawItems(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load work center');
    } finally {
      setLoading(false);
    }
  }

  function handleParamChange(key: string, value: string) {
    const updated = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      updated.set(key, value);
    } else {
      updated.delete(key);
    }
    setPage(1);
    setSearchParams(updated);
  }

  function handleTabChange(tab: string) {
    const updated = new URLSearchParams(searchParams);
    if (tab === 'all') {
      updated.delete('tab');
      updated.delete('assignee');
    } else if (tab === 'my-work') {
      updated.set('tab', 'my-work');
      updated.set('assignee', 'me');
    } else {
      updated.set('tab', tab);
    }
    setPage(1);
    setSearchParams(updated);
  }

  async function handleAssign(item: WorkItem, toUser: string) {
    const type = item.workType?.key;
    if (!type) return;
    try {
      if (toUser) {
        await workApi.delegate(type, item._id, { toUser });
      } else {
        await workApi.update(type, item._id, { assignedTo: null });
      }
      setRawItems(prev =>
        prev.map(i => {
          if (i._id !== item._id) return i;
          const assignedUser = users.find(u => u._id === toUser);
          return {
            ...i,
            assignedTo: assignedUser ? { _id: assignedUser._id, name: assignedUser.name } : undefined,
          };
        })
      );
    } catch (err: any) {
      setError(err.message || 'Could not assign work item');
    }
  }

  async function handleStatusChange(item: WorkItem, newStatus: string) {
    const type = item.workType?.key;
    if (!type || item.status === newStatus) return;
    try {
      await workApi.updateStatus(type, item._id, newStatus);
      setRawItems(prev =>
        prev.map(i => (i._id === item._id ? { ...i, status: newStatus } : i))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  }

  // Calculate KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    let openCount = 0;
    let dueTodayCount = 0;
    let overdueCount = 0;
    let unassignedCount = 0;

    rawItems.forEach(item => {
      const wt = item.workType || workTypes.find(t => t._id === item.module || t.key === item.workType?.key);
      const isClosed = isWorkItemClosed(item, wt);

      if (!isClosed) {
        openCount++;
        if (!item.assignedTo) {
          unassignedCount++;
        }
        if (item.deadline) {
          const d = new Date(item.deadline);
          if (d < startOfToday) {
            overdueCount++;
          } else if (d >= startOfToday && d <= endOfToday) {
            dueTodayCount++;
          }
        }
      }
    });

    return {
      open: openCount,
      dueToday: dueTodayCount,
      overdue: overdueCount,
      unassigned: unassignedCount,
    };
  }, [rawItems, workTypes]);

  // Filtered & Sorted Items
  const filteredItems = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    let list = [...rawItems];

    // Module / Area Filter
    if (currentModule) {
      list = list.filter(item => item.workType?.key === currentModule || item.workType?._id === currentModule);
    }

    // Status Filter
    if (currentStatus === 'open') {
      list = list.filter(item => !isWorkItemClosed(item, item.workType || workTypes.find(t => t._id === item.module)));
    } else if (currentStatus === 'completed') {
      list = list.filter(item => isWorkItemClosed(item, item.workType || workTypes.find(t => t._id === item.module)));
    } else if (currentStatus === 'today') {
      list = list.filter(item => {
        const closed = isWorkItemClosed(item, item.workType || workTypes.find(t => t._id === item.module));
        if (closed || !item.deadline) return false;
        const d = new Date(item.deadline);
        return d <= endOfToday;
      });
    } else if (currentStatus === 'overdue') {
      list = list.filter(item => {
        const closed = isWorkItemClosed(item, item.workType || workTypes.find(t => t._id === item.module));
        if (closed || !item.deadline) return false;
        return new Date(item.deadline) < startOfToday;
      });
    }

    // Assignee Filter
    if (currentAssignee === 'me' && user) {
      list = list.filter(item => {
        const isAssigned = item.assignedTo && String(item.assignedTo._id || item.assignedTo) === String(user._id);
        const isSecondary = item.secondaryAssignee && String(item.secondaryAssignee._id || item.secondaryAssignee) === String(user._id);
        const isCollab = (item.collaborators || []).some(c => String(c._id || c) === String(user._id));
        return isAssigned || isSecondary || isCollab;
      });
    } else if (currentAssignee === 'unassigned') {
      list = list.filter(item => !item.assignedTo);
    } else if (currentAssignee && currentAssignee !== 'all') {
      list = list.filter(item => String(item.assignedTo?._id || item.assignedTo) === currentAssignee);
    }

    // Priority Filter
    if (currentPriority && currentPriority !== 'all') {
      list = list.filter(item => String(item.priority || '').toLowerCase() === currentPriority.toLowerCase());
    }

    // Due Filter
    if (currentDue === 'today') {
      list = list.filter(item => {
        if (!item.deadline) return false;
        const d = new Date(item.deadline);
        return d >= startOfToday && d <= endOfToday;
      });
    } else if (currentDue === 'this_week') {
      list = list.filter(item => {
        if (!item.deadline) return false;
        const d = new Date(item.deadline);
        return d >= startOfToday && d <= endOfWeek;
      });
    } else if (currentDue === 'this_month') {
      list = list.filter(item => {
        if (!item.deadline) return false;
        const d = new Date(item.deadline);
        return d >= startOfToday && d <= endOfMonth;
      });
    } else if (currentDue === 'overdue') {
      list = list.filter(item => item.deadline && new Date(item.deadline) < startOfToday);
    }

    // Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => {
        const titleMatch = String(item.title || '').toLowerCase().includes(q);
        const clientMatch = item.customer && typeof item.customer === 'object' && String((item.customer as any).name || '').toLowerCase().includes(q);
        const notesMatch = String(item.notes || '').toLowerCase().includes(q);
        return titleMatch || clientMatch || notesMatch;
      });
    }

    // Sorting
    const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const ownerName = (item: WorkItem) => item.assignedTo?.name || '';
    list.sort((a, b) => {
      switch (currentSort) {
        case 'priority':
          return (priorityRank[String(a.priority || '').toLowerCase()] ?? 9) - (priorityRank[String(b.priority || '').toLowerCase()] ?? 9);
        case 'title':
          return String(a.title || '').localeCompare(String(b.title || ''));
        case 'status':
          return String(a.status || '').localeCompare(String(b.status || ''));
        case 'owner':
          return ownerName(a).localeCompare(ownerName(b));
        case 'due':
        default: {
          const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
          const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
          return da - db;
        }
      }
    });

    return list;
  }, [rawItems, workTypes, currentModule, currentStatus, currentAssignee, currentPriority, currentDue, currentSort, searchQuery, user]);

  // Paginated Items
  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  // Calendar days calculation (uses filteredItems safely after declaration)
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days: Array<{
      dayNumber: number;
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      items: WorkItem[];
    }> = [];

    const now = new Date();

    // Previous month padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      days.push({
        dayNumber: prevMonthDays - i,
        date: d,
        isCurrentMonth: false,
        isToday: false,
        items: filteredItems.filter(item => {
          if (!item.deadline) return false;
          const id = new Date(item.deadline);
          return id.getFullYear() === d.getFullYear() && id.getMonth() === d.getMonth() && id.getDate() === d.getDate();
        }),
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(year, month, i);
      const isToday = d.toDateString() === now.toDateString();
      days.push({
        dayNumber: i,
        date: d,
        isCurrentMonth: true,
        isToday,
        items: filteredItems.filter(item => {
          if (!item.deadline) return false;
          const id = new Date(item.deadline);
          return id.getFullYear() === year && id.getMonth() === month && id.getDate() === i;
        }),
      });
    }

    // Next month padding to fill grid
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({
        dayNumber: i,
        date: d,
        isCurrentMonth: false,
        isToday: false,
        items: filteredItems.filter(item => {
          if (!item.deadline) return false;
          const id = new Date(item.deadline);
          return id.getFullYear() === d.getFullYear() && id.getMonth() === d.getMonth() && id.getDate() === d.getDate();
        }),
      });
    }

    return days;
  }, [calendarDate, filteredItems]);

  // Row selection helpers
  function toggleSelectAll() {
    if (selectedIds.size === paginatedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedItems.map(i => i._id)));
    }
  }

  function toggleSelectRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function formatDate(val?: string | Date | null): string {
    if (!val) return '—';
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatRelativeDue(val?: string | Date | null): { text: string; className: string } {
    if (!val) return { text: '', className: 'normal' };
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return { text: '', className: 'normal' };

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((target.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)}d overdue`, className: 'urgent' };
    }
    if (diffDays === 0) {
      return { text: 'Due today', className: 'urgent' };
    }
    if (diffDays === 1) {
      return { text: 'Tomorrow', className: 'soon' };
    }
    if (diffDays <= 3) {
      return { text: `${diffDays} days left`, className: 'urgent' };
    }
    if (diffDays <= 7) {
      return { text: `${diffDays} days left`, className: 'soon' };
    }
    return { text: `${diffDays} days left`, className: 'normal' };
  }

  function getStatusColor(statusKey?: string, wt?: WorkType | null): string {
    const statusObj = wt?.statuses?.find(s => s.key === statusKey);
    if (statusObj?.color) return statusObj.color;
    const lower = String(statusKey || '').toLowerCase();
    if (lower.includes('done') || lower.includes('complete') || lower.includes('deliver') || lower.includes('won')) return '#16a34a';
    if (lower.includes('review') || lower.includes('progress') || lower.includes('edit')) return '#3b82f6';
    if (lower.includes('design') || lower.includes('figma')) return '#8b5cf6';
    if (lower.includes('cancel') || lower.includes('reject') || lower.includes('lost')) return '#dc2626';
    return '#f59e0b';
  }

  function getInitials(name?: string): string {
    if (!name) return '?';
    return name
      .trim()
      .split(/\s+/)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  if (loading && rawItems.length === 0) {
    return <div className="loading" style={{ padding: '3rem', textAlign: 'center' }}>Loading Work Center...</div>;
  }

  return (
    <div className="work-center-page">
      {error && <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* 1. Page Header */}
      <header className="work-center-header">
        <div className="work-header-info">
          <span className="work-eyebrow">WORK</span>
          <h1 className="work-title">Work</h1>
          <p className="work-subtitle">Tasks and deliverables across the agency.</p>
        </div>

        <div className="work-head-actions">
          {/* New Work Dropdown */}
          <div className="btn-new-work-dropdown-wrap" ref={newWorkRef}>
            <button
              type="button"
              className="btn-new-work"
              onClick={() => setNewWorkOpen(!newWorkOpen)}
              aria-expanded={newWorkOpen}
            >
              <Icon name="plus" size={16} />
              <span>New work</span>
              <Icon name="chevron-down" size={14} />
            </button>

            {newWorkOpen && (
              <div className="new-work-popover">
                <div style={{ padding: '6px 10px 4px', fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Choose Work Area
                </div>
                {workTypes.map(wt => (
                  <Link
                    key={wt._id}
                    to={`/work/${wt.key}?new=1`}
                    className="new-work-popover-item"
                    onClick={() => setNewWorkOpen(false)}
                  >
                    <Icon name={wt.icon || 'clipboard-list'} size={15} style={{ color: wt.color || '#ea580c' }} />
                    <span>{wt.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Add multiple tasks */}
          <button
            type="button"
            className="btn-work-secondary"
            onClick={() => setShowBulk(true)}
          >
            <Icon name="plus-circle" size={16} />
            <span>Add multiple tasks</span>
          </button>

          {/* Lead Follow-ups */}
          {hasPermission(user, 'tasks.view') && (
            <Link to="/follow-ups" className="btn-work-secondary">
              <Icon name="clipboard-check" size={16} />
              <span>Lead Follow-ups</span>
            </Link>
          )}
        </div>
      </header>

      {/* 2. Main View Tabs */}
      <nav className="work-view-tabs">
        <button
          type="button"
          className={`work-view-tab ${currentTab === 'overview' ? 'active' : ''}`}
          onClick={() => handleTabChange('overview')}
        >
          <Icon name="layout-dashboard" size={16} />
          <span>Overview</span>
        </button>

        <button
          type="button"
          className={`work-view-tab ${currentTab === 'my-work' ? 'active' : ''}`}
          onClick={() => handleTabChange('my-work')}
        >
          <Icon name="user" size={16} />
          <span>My Work</span>
        </button>

        <button
          type="button"
          className={`work-view-tab ${currentTab === 'all' ? 'active' : ''}`}
          onClick={() => handleTabChange('all')}
        >
          <Icon name="list" size={16} />
          <span>All Work</span>
        </button>

        <button
          type="button"
          className={`work-view-tab ${currentTab === 'calendar' ? 'active' : ''}`}
          onClick={() => handleTabChange('calendar')}
        >
          <Icon name="calendar" size={16} />
          <span>Calendar</span>
        </button>

        <Link
          to="/work/threads"
          className="work-view-tab"
        >
          <Icon name="send" size={16} />
          <span>Team Chat</span>
        </Link>
      </nav>

      {/* 3. Work Area Pills Filter */}
      <div className="work-area-pills-bar">
        <div className="work-area-pills-list">
          <button
            type="button"
            className={`work-area-pill ${currentModule === '' ? 'active' : ''}`}
            onClick={() => handleParamChange('module', '')}
          >
            <span>All work</span>
          </button>

          {workTypes.map(type => {
            const isSelected = currentModule === type.key;
            return (
              <button
                key={type._id}
                type="button"
                className={`work-area-pill ${isSelected ? 'active' : ''}`}
                onClick={() => handleParamChange('module', isSelected ? '' : type.key)}
              >
                <Icon name={type.icon || 'clipboard-list'} size={14} style={{ color: isSelected ? '#fff' : type.color }} />
                <span>{type.name}</span>
              </button>
            );
          })}
        </div>

        {hasPermission(user, 'settings.view') && (
          <Link to="/settings?tab=customization" className="work-manage-areas-btn" title="Customize work areas">
            <Icon name="settings" size={14} />
            <span>Manage areas</span>
          </Link>
        )}
      </div>

      {/* 4. Filter & KPI Card */}
      <div className="work-filter-kpi-card">
        {/* Filter Controls Row */}
        <div className="work-filter-controls-row">
          <div className="work-filter-selects-group">
            {/* Status Select */}
            <div className="work-filter-item">
              <span>Status</span>
              <CustomSelect
                value={currentStatus}
                onChange={val => handleParamChange('status', val)}
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'today', label: 'Due today' },
                  { value: 'overdue', label: 'Overdue' },
                  { value: 'completed', label: 'Closed' },
                  { value: 'all', label: 'All status' },
                ]}
                variant="compact"
                style={{ minWidth: 105 }}
              />
            </div>

            {/* Assignee Select */}
            <div className="work-filter-item">
              <span>Assignee</span>
              <CustomSelect
                value={currentAssignee}
                onChange={val => handleParamChange('assignee', val)}
                options={[
                  { value: 'all', label: 'All assignees' },
                  { value: 'me', label: 'Assigned to me' },
                  { value: 'unassigned', label: 'Unassigned' },
                  ...users.map(u => ({ value: u._id, label: u.name })),
                ]}
                variant="compact"
                style={{ minWidth: 130 }}
              />
            </div>

            {/* Priority Select */}
            <div className="work-filter-item">
              <span>Priority</span>
              <CustomSelect
                value={currentPriority}
                onChange={val => handleParamChange('priority', val)}
                options={[
                  { value: 'all', label: 'All priorities' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                ]}
                variant="compact"
                style={{ minWidth: 120 }}
              />
            </div>

            {/* Due Select */}
            <div className="work-filter-item">
              <span>Due</span>
              <CustomSelect
                value={currentDue}
                onChange={val => handleParamChange('due', val)}
                options={[
                  { value: 'all', label: 'Any time' },
                  { value: 'today', label: 'Today' },
                  { value: 'this_week', label: 'This week' },
                  { value: 'this_month', label: 'This month' },
                  { value: 'overdue', label: 'Overdue' },
                ]}
                variant="compact"
                style={{ minWidth: 105 }}
              />
            </div>

            {/* Sort by Select */}
            <div className="work-filter-item">
              <span>Sort by</span>
              <CustomSelect
                value={currentSort}
                onChange={val => handleParamChange('sort', val)}
                options={[
                  { value: 'due', label: 'Due date (soonest first)' },
                  { value: 'priority', label: 'Priority (high → low)' },
                  { value: 'title', label: 'Title (A–Z)' },
                  { value: 'status', label: 'Status' },
                  { value: 'owner', label: 'Owner' },
                ]}
                variant="compact"
                style={{ minWidth: 175 }}
              />
            </div>
          </div>

          {/* Search Box */}
          <div className="work-search-box">
            <Icon name="search" size={15} className="work-search-icon" />
            <input
              type="text"
              className="work-search-input"
              placeholder="Search work, client, or keyword..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {/* Bottom KPI Stats Row */}
        <div className="work-kpi-stats-row">
          <div className="work-kpi-stat-item">
            <span className="work-kpi-stat-icon"><Icon name="file-text" size={16} color="var(--text)" /></span>
            <span className="work-kpi-stat-num">{kpis.open}</span>
            <span className="work-kpi-stat-label">Open</span>
          </div>

          <div className="work-kpi-stat-item">
            <span className="work-kpi-stat-icon"><Icon name="calendar" size={16} color="#ea580c" /></span>
            <span className="work-kpi-stat-num">{kpis.dueToday}</span>
            <span className="work-kpi-stat-label">Due today</span>
          </div>

          <div className="work-kpi-stat-item">
            <span className="work-kpi-stat-icon"><Icon name="alert-triangle" size={16} color="#dc2626" /></span>
            <span className="work-kpi-stat-num">{kpis.overdue}</span>
            <span className="work-kpi-stat-label">Overdue</span>
          </div>

          <div className="work-kpi-stat-item">
            <span className="work-kpi-stat-icon"><Icon name="users" size={16} color="#3b82f6" /></span>
            <span className="work-kpi-stat-num">{kpis.unassigned}</span>
            <span className="work-kpi-stat-label">Unassigned</span>
          </div>
        </div>
      </div>

      {/* 5. Work Items Table OR Calendar View */}
      {currentTab === 'calendar' ? (
        <div className="work-calendar-card">
          <div className="work-calendar-header">
            <div className="work-calendar-nav">
              <button
                type="button"
                className="work-calendar-nav-btn"
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                aria-label="Previous month"
              >
                <Icon name="chevron-left" size={16} />
              </button>
              <button
                type="button"
                className="work-calendar-today-btn"
                onClick={() => setCalendarDate(new Date())}
              >
                Today
              </button>
              <button
                type="button"
                className="work-calendar-nav-btn"
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                aria-label="Next month"
              >
                <Icon name="chevron-right" size={16} />
              </button>
              <h2 className="work-calendar-title">
                {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h2>
            </div>
            <div className="work-calendar-legend">
              <span className="work-calendar-item-count">{filteredItems.filter(i => i.deadline).length} scheduled deliverables</span>
            </div>
          </div>

          <div className="work-calendar-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="work-calendar-day-head">{d}</div>
            ))}

            {calendarDays.map((cell, idx) => (
              <div
                key={idx}
                className={`work-calendar-cell ${cell.isCurrentMonth ? '' : 'outside'} ${cell.isToday ? 'today' : ''}`}
              >
                <div className="work-calendar-cell-head">
                  <span className={`work-calendar-day-number ${cell.isToday ? 'today-pill' : ''}`}>
                    {cell.dayNumber}
                  </span>
                  {cell.items.length > 0 && (
                    <span className="work-calendar-cell-count">{cell.items.length}</span>
                  )}
                </div>
                <div className="work-calendar-cell-events">
                  {cell.items.slice(0, 3).map(item => {
                    const wt = item.workType || workTypes.find(t => t.key === item.workType?.key || t._id === item.module);
                    const statusColor = getStatusColor(item.status, wt);
                    return (
                      <Link
                        key={item._id}
                        to={`/work/${item.workType?.key || 'task'}/${item._id}`}
                        className="work-calendar-chip"
                        style={{
                          borderLeftColor: wt?.color || '#ea580c',
                        }}
                        title={`${item.title} (${wt?.name || 'Task'})`}
                      >
                        <span className="work-calendar-chip-dot" style={{ background: statusColor }} />
                        <span className="work-calendar-chip-title">{item.title}</span>
                      </Link>
                    );
                  })}
                  {cell.items.length > 3 && (
                    <div className="work-calendar-more">
                      +{cell.items.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="work-table-card">
            <table className="work-table">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      className="work-checkbox"
                      checked={paginatedItems.length > 0 && selectedIds.size === paginatedItems.length}
                      onChange={toggleSelectAll}
                      aria-label="Select all work items"
                    />
                  </th>
                  <th>WORK ↕</th>
                  <th>AREA ↕</th>
                  <th>OWNER ↕</th>
                  <th>STATUS ↕</th>
                  <th>PRIORITY ↕</th>
                  <th>DUE ↕</th>
                  <th style={{ width: 48, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--muted)' }}>
                      <Icon name="clipboard-list" size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
                      <strong>No work items found</strong>
                      <p style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>Try adjusting your filters or search terms.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map(item => {
                    const typeKey = item.workType?.key || 'task';
                    const wt = item.workType || workTypes.find(t => t.key === typeKey || t._id === item.module);
                    const statusObj = wt?.statuses?.find(s => s.key === item.status);
                    const statusColor = getStatusColor(item.status, wt);
                    const isSelected = selectedIds.has(item._id);
                    const dueInfo = formatRelativeDue(item.deadline);
                    const isStatusAllowed = canChangeWorkStatus(user, wt, item.status);

                    const priorityLower = String(item.priority || 'medium').toLowerCase();

                    return (
                      <tr key={item._id} className={isSelected ? 'selected' : ''}>
                        {/* Checkbox */}
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            className="work-checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(item._id)}
                            aria-label={`Select ${item.title}`}
                          />
                        </td>

                        {/* WORK (Title & Client) */}
                        <td>
                          <div className="work-item-title-wrap">
                            <Link to={`/work/${typeKey}/${item._id}`} className="work-item-title">
                              {item.title}
                            </Link>
                            <span className="work-item-client">
                              {item.customer && typeof item.customer === 'object'
                                ? (item.customer as any).name
                                : '—'}
                            </span>
                          </div>
                        </td>

                        {/* AREA */}
                        <td>
                          <span className="work-item-area">
                            <Icon
                              name={wt?.icon || 'clipboard-list'}
                              size={15}
                              style={{ color: wt?.color || '#ea580c' }}
                            />
                            <span>{wt?.name || typeKey}</span>
                          </span>
                        </td>

                        {/* OWNER */}
                        <td>
                          <CustomSelect
                            className="work-table-select"
                            variant="compact"
                            placeholder="Unassigned"
                            value={item.assignedTo?._id || ''}
                            onChange={val => void handleAssign(item, val)}
                            options={[
                              { value: '', label: 'Unassigned' },
                              ...users.map(member => ({ value: member._id, label: member.name })),
                            ]}
                            buttonRenderer={() => {
                              const assigned = item.assignedTo;
                              if (assigned?.name) {
                                return (
                                  <div className="work-owner-pill">
                                    <span className="work-owner-avatar">{getInitials(assigned.name)}</span>
                                    <span>{assigned.name}</span>
                                    <Icon name="chevron-down" size={12} style={{ color: 'var(--muted)', marginLeft: 2 }} />
                                  </div>
                                );
                              }
                              return (
                                <div className="work-owner-pill">
                                  <span className="work-owner-avatar unassigned">
                                    <Icon name="user" size={11} />
                                  </span>
                                  <span style={{ color: 'var(--muted)' }}>Unassigned</span>
                                  <Icon name="chevron-down" size={12} style={{ color: 'var(--muted)', marginLeft: 2 }} />
                                </div>
                              );
                            }}
                          />
                        </td>

                        {/* STATUS */}
                        <td>
                          {isStatusAllowed ? (
                            <CustomSelect
                              className="work-table-select"
                              variant="compact"
                              value={item.status}
                              onChange={val => void handleStatusChange(item, val)}
                              options={(wt?.statuses || []).map(s => ({ value: s.key, label: s.label }))}
                              buttonRenderer={() => (
                                <div
                                  className="work-status-pill"
                                  style={{
                                    background: `color-mix(in srgb, ${statusColor} 12%, var(--panel, #ffffff))`,
                                    color: statusColor,
                                    border: `1px solid color-mix(in srgb, ${statusColor} 30%, transparent)`,
                                  }}
                                >
                                  <span className="work-status-dot" style={{ background: statusColor }} />
                                  <span>{statusObj?.label || item.status}</span>
                                  <Icon name="chevron-down" size={12} style={{ opacity: 0.7, marginLeft: 2 }} />
                                </div>
                              )}
                            />
                          ) : (
                            <div
                              className="work-status-pill"
                              style={{
                                background: `color-mix(in srgb, ${statusColor} 12%, var(--panel, #ffffff))`,
                                color: statusColor,
                                border: `1px solid color-mix(in srgb, ${statusColor} 30%, transparent)`,
                                cursor: 'default',
                              }}
                              title="Locked for review — only managers can change status"
                            >
                              <span className="work-status-dot" style={{ background: statusColor }} />
                              <span>{statusObj?.label || item.status}</span>
                            </div>
                          )}
                        </td>

                        {/* PRIORITY */}
                        <td>
                          <span className={`work-priority-badge ${priorityLower}`}>
                            <Icon
                              name={priorityLower === 'low' ? 'chevron-down' : 'chevron-up'}
                              size={14}
                            />
                            <span style={{ textTransform: 'capitalize' }}>{item.priority || 'Medium'}</span>
                          </span>
                        </td>

                        {/* DUE */}
                        <td>
                          <div className="work-due-cell">
                            <span className="work-due-date">{formatDate(item.deadline)}</span>
                            {dueInfo.text && (
                              <span className={`work-due-relative ${dueInfo.className}`}>{dueInfo.text}</span>
                            )}
                          </div>
                        </td>

                        {/* ROW ACTIONS */}
                        <td style={{ textAlign: 'right' }}>
                          <div className="work-row-actions">
                            <Link
                              to={`/work/${typeKey}/${item._id}`}
                              className="work-row-menu-btn"
                              title="Open details"
                            >
                              ···
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 6. Pagination Footer */}
          {totalItems > 0 && (
            <div className="work-pagination-bar">
              <div>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems} items
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
            </div>
          )}
        </>
      )}

      {/* Bulk Create Modal */}
      <BulkCreateModal
        isOpen={showBulk}
        onClose={() => setShowBulk(false)}
        onSuccess={loadWorkCenter}
        workTypes={workTypes}
        users={users}
        lockedWorkType={false}
      />
    </div>
  );
}

