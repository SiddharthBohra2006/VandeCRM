import { CSSProperties, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/Icons';
import { Customer, Stage } from '../../types';

interface DashboardStats {
  totalLeads: number;
  totalClients: number;
  newThisWeek: number;
  followupsDue: number;
  staleCustomers: number;
  openWork: number;
  completedWork: number;
  overdue: number;
  adSpend: number;
  deliveredPercent: number;
}

interface StageCard {
  stage: Stage;
  customers: Customer[];
  count: number;
  value: number;
}

interface WorkTypeSummary {
  key: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  open: number;
  completed: number;
}

interface WorkItem {
  _id: string;
  title: string;
  deadline: string;
  workType?: { key: string; name: string };
}

interface WeeklyDayItem {
  _id: string;
  title: string;
  module: string;
  type: string;
  completedAt: string;
  status: string;
}

interface WeeklyProgress {
  label: string;
  count: number;
  isToday: boolean;
  date: string;
  items: WeeklyDayItem[];
}

interface DashboardMetricCard {
  href: string;
  icon: string;
  value: string;
  label: string;
  key: string;
  defaultVisible: boolean;
  category: string;
  breakdown?: string;
}

interface DashboardResponse {
  ok: true;
  stats: DashboardStats;
  stageCards: StageCard[];
  moduleStats: WorkTypeSummary[];
  upcomingDeadlines: WorkItem[];
  weeklyWorkProgress: WeeklyProgress[];
  recentCustomers: Customer[];
  attentionCustomers: Customer[];
  campaigns: { _id: string; name: string }[];
  dashboardViews: { _id: string; name: string; hiddenSections?: string[]; cardOrder?: string[]; customFieldMetrics?: string[] }[];
  totalValue: number;
  totalCustomers: number;
  dashboardCardsCustomized?: boolean;
  dashboardHiddenCards?: string[];
  dashboardCardOrder?: string[];
  dashboardHiddenSections?: string[];
  recentMovements?: Movement[];
  movementSamples?: Movement[];
  availableDashboardFields?: { _id: string; key: string; label: string; type: string }[];
}

interface Movement {
  id: string;
  actor: string;
  title: string;
  message: string;
  category: string;
  group: string;
  action?: string;
  icon?: string;
  status?: string;
  tone?: string;
  href?: string;
  sample?: boolean;
  createdAt: string;
}

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const ICON_PALETTE: Record<string, string> = {
  users: '#5287ff', 'user-plus': '#5287ff', 'building-2': '#f28a24',
  clock: '#16b8a6', 'triangle-alert': '#f45b55', megaphone: '#a259ff',
  check: '#a259ff', video: '#6574ff', palette: '#5287ff', globe: '#679cff',
  'file-text': '#f28a24', calendar: '#16b8a6', 'clipboard-list': '#a259ff',
  target: '#f59e0b', filter: '#16b8a6', sparkles: '#a259ff',
};

const SECTION_CHOICES: [string, string][] = [
  ['work-progress', 'Work progress'],
  ['deadlines', 'Upcoming deadlines'],
  ['pipeline', 'Active pipeline'],
  ['attention', 'Needs attention'],
  ['recent', 'Recent movements'],
  ['activity', 'Activity log'],
];

function getCardTheme(icon: string) {
  const color = ICON_PALETTE[icon] || '#7886a5';
  return { color, bg: `color-mix(in srgb, ${color} 10%, var(--panel))` };
}

function initials(name?: string | null) {
  if (!name) return '—';
  return name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
}

function relativeTime(iso: string) {
  const dateValue = new Date(iso);
  const minutes = Math.max(0, Math.floor((Date.now() - dateValue.getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return dateValue.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function DashboardPage() {
  const { user, activeCompany, crmTerms } = useAuth();
  const [searchParams] = useSearchParams();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeTab, setCustomizeTab] = useState<'cards' | 'sections'>('cards');
  const [editHidden, setEditHidden] = useState<Set<string>>(new Set());
  const [editOrder, setEditOrder] = useState<string[]>([]);
  const [editSections, setEditSections] = useState<Set<string>>(new Set());
  const [savedSections, setSavedSections] = useState<Set<string>>(new Set());
  const [pinSearch, setPinSearch] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [viewName, setViewName] = useState('');
  const [savingView, setSavingView] = useState(false);
  const viewNameRef = useRef('');
  
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dashboardDragKey, setDashboardDragKey] = useState<string | null>(null);

  const [movementFilter, setMovementFilter] = useState<'all' | 'work' | 'leads' | 'campaigns'>('all');
  const [previewMovement, setPreviewMovement] = useState<Movement | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const campaign = searchParams.get('campaign');
      const data = await api.get<DashboardResponse>(`/dashboard${campaign ? `?campaign=${encodeURIComponent(campaign)}` : ''}`);
      setDashboard(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (dashboard) {
      const hidden = new Set(dashboard.dashboardHiddenSections || []);
      setSavedSections(hidden);
      setEditSections(new Set(hidden));
    }
  }, [dashboard]);

  async function moveCustomer(event: DragEvent, stageId: string) {
    event.preventDefault();
    const customerId = event.dataTransfer.getData('text/customer-id');
    if (!customerId || moving) return;
    try {
      setMoving(true);
      await api.post<{ ok: true }>('/dashboard/pipeline/move', { customerId, stageId });
      await loadDashboard();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move lead');
    } finally {
      setMoving(false);
    }
  }

  if (loading && !dashboard) return <div className="loading" style={{ padding: '3rem' }}>Loading dashboard…</div>;
  if (error && !dashboard) return <div className="alert alert-error" role="alert" style={{ margin: '2rem' }}>{error}</div>;
  if (!dashboard) return <div className="empty-state" style={{ padding: '3rem' }}>Dashboard data is unavailable.</div>;

  const moduleCard = (m: WorkTypeSummary): DashboardMetricCard => ({
    href: `/work/${m.key}`,
    icon: m.icon || 'clipboard-list',
    value: String(m.open || 0),
    label: `${m.name} In Progress`,
    key: `module-${m.key}-open`,
    defaultVisible: true,
    category: 'Work & Tasks',
    breakdown: `${m.completed || 0} completed · ${m.total || 0} total`
  });

  const fieldCard = (f: { key: string; label: string }): DashboardMetricCard => {
    const allCustomers = dashboard.stageCards.flatMap(c => c.customers);
    const total = allCustomers.filter(c => {
      const v = (c as any).customData?.get?.(f.key) ?? (c as any).customData?.[f.key];
      return v !== undefined && v !== null && v !== '' && v !== false;
    }).length;
    return {
      href: '/customers',
      icon: 'filter',
      value: String(total),
      label: f.label,
      key: `field-${f.key}`,
      defaultVisible: false,
      category: 'Custom Fields',
      breakdown: `Filled across ${crmTerms.leadPlural.toLowerCase()}`
    };
  };

  const cards: DashboardMetricCard[] = [
    { href: '/customers', icon: 'users', value: String(dashboard.stats.totalLeads), label: 'Open Leads', key: 'leads-total', defaultVisible: true, category: 'Leads & Clients' },
    { href: '/clients', icon: 'building-2', value: String(dashboard.stats.totalClients), label: 'Clients', key: 'clients-total', defaultVisible: true, category: 'Leads & Clients' },
    { href: '/customers', icon: 'user-plus', value: String(dashboard.stats.newThisWeek), label: 'New Leads This Week', key: 'leads-new-week', defaultVisible: false, category: 'Leads & Clients' },
    { href: '/customers', icon: 'building-2', value: money.format(dashboard.totalValue), label: 'Pipeline Value', key: 'pipeline-value', defaultVisible: false, category: 'Leads & Clients' },
    { href: '/customers', icon: 'clock', value: String(dashboard.stats.followupsDue), label: 'Follow-ups Due', key: 'followups-due', defaultVisible: false, category: 'Leads & Clients' },
    { href: '/customers', icon: 'triangle-alert', value: String(dashboard.stats.staleCustomers), label: 'Stale Leads', key: 'leads-stale', defaultVisible: false, category: 'Leads & Clients' },
    { href: '/campaigns', icon: 'megaphone', value: money.format(dashboard.stats.adSpend), label: 'Total Ad Spend', key: 'ad-spend', defaultVisible: true, category: 'Finance' },
    { href: '/work?view=overdue', icon: 'triangle-alert', value: String(dashboard.stats.overdue), label: 'Overdue Work', key: 'work-overdue', defaultVisible: true, category: 'Work & Tasks' },
    ...dashboard.moduleStats.map(moduleCard),
    ...(dashboard.availableDashboardFields || []).map(fieldCard)
  ];

  const weeklyMax = Math.max(1, ...dashboard.weeklyWorkProgress.map(day => day.count));

  const hiddenCards = new Set(dashboard.dashboardHiddenCards || []);
  const savedOrder = dashboard.dashboardCardOrder || [];
  const orderedCards = [
    ...cards.sort((a, b) => {
      const ia = savedOrder.indexOf(a.key);
      const ib = savedOrder.indexOf(b.key);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    })
  ];
  const visibleCards = orderedCards.filter(card => !hiddenCards.has(card.key));

  const movementSampleFeed = dashboard.movementSamples || [];
  const movementFeedRaw = dashboard.recentMovements || [];
  const isSampleFeed = movementFeedRaw.length === 0;
  const fullFeed = isSampleFeed ? movementSampleFeed : movementFeedRaw;
  const shownMovements = fullFeed.filter(m => movementFilter === 'all' || m.group === movementFilter);

  const openCustomize = () => {
    setEditHidden(new Set(dashboard.dashboardHiddenCards || []));
    setEditOrder([...savedOrder, ...cards.map(c => c.key).filter(k => !(savedOrder || []).includes(k))]);
    setEditSections(new Set(savedSections));
    setPinSearch('');
    setCustomizeTab('cards');
    setCustomizeOpen(true);
  };

  const toggleCard = (key: string, visible: boolean) => {
    setEditHidden(prev => {
      const next = new Set(prev);
      if (visible) next.delete(key); else next.add(key);
      return next;
    });
  };

  const reorderPinned = (from: string, to: string) => {
    setEditOrder(prev => {
      const next = [...prev];
      const fromIndex = next.indexOf(from);
      const toIndex = next.indexOf(to);
      if (fromIndex === -1 || toIndex === -1) return prev;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, from);
      return next;
    });
  };

  const submitPreferences = async () => {
    try {
      setSavingPrefs(true);
      await api.post<{ ok: true }>('/dashboard/preferences/dashboard', {
        hiddenSections: [...editSections],
        dashboardHiddenCards: [...editHidden],
        dashboardCardOrder: editOrder,
      });
      setSavedSections(new Set(editSections));
      setCustomizeOpen(false);
      await loadDashboard();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save dashboard preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  const resetDefaults = () => {
    const defaultHiddenKeys = cards.filter(c => !c.defaultVisible).map(c => c.key);
    setEditHidden(new Set(defaultHiddenKeys));
    setEditOrder(cards.map(card => card.key));
    setEditSections(new Set());
  };

  const query = pinSearch.trim().toLowerCase();
  const pinnedCards = editOrder
    .map(key => cards.find(card => card.key === key))
    .filter((card): card is DashboardMetricCard => card !== undefined && !editHidden.has(card.key));

  const unpinnedCards = cards.filter(card => editHidden.has(card.key) && (!query || card.label.toLowerCase().includes(query)));

  const sectionChoices = SECTION_CHOICES.map(([key, label]) => ({ key, label, visible: !editSections.has(key) }));

  const dragStartModalPinned = (key: string) => (e: DragEvent) => {
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
    setDragKey(key);
  };
  const dragOverModalPinned = (e: DragEvent) => {
    e.preventDefault();
  };
  const dropModalPinned = (targetKey: string) => (e: DragEvent) => {
    e.preventDefault();
    const sourceKey = dragKey || e.dataTransfer.getData('text/plain');
    if (sourceKey && sourceKey !== targetKey) {
      reorderPinned(sourceKey, targetKey);
    }
    setDragKey(null);
  };

  const dragStartDashboardMetric = (key: string) => (e: DragEvent) => {
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
    setDashboardDragKey(key);
  };
  const dragOverDashboardMetric = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const dropDashboardMetric = (targetKey: string) => async (e: DragEvent) => {
    e.preventDefault();
    const sourceKey = dashboardDragKey || e.dataTransfer.getData('text/plain');
    if (!sourceKey || sourceKey === targetKey) {
      setDashboardDragKey(null);
      return;
    }
    const currentOrder = orderedCards.map(c => c.key);
    const fromIndex = currentOrder.indexOf(sourceKey);
    const toIndex = currentOrder.indexOf(targetKey);
    if (fromIndex === -1 || toIndex === -1) {
      setDashboardDragKey(null);
      return;
    }
    const newOrder = [...currentOrder];
    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, sourceKey);
    
    setDashboard(prev => prev ? { ...prev, dashboardCardOrder: newOrder } : null);
    setDashboardDragKey(null);

    try {
      await api.post('/dashboard/preferences/dashboard', {
        dashboardCardOrder: newOrder,
        dashboardHiddenCards: [...hiddenCards],
        hiddenSections: [...savedSections]
      });
    } catch (_) {}
  };

  const userName = user?.name ? user.name.split(' ')[0] : 'Admin';
  const roleLabel = user?.customRole?.name || (user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Team member');
  const headerDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const dashboardSubtitle = user?.role === 'admin' || user?.role === 'manager'
    ? `Here's the ${activeCompany ? activeCompany.name : 'selected CRM'} overview for today.`
    : `Here's your ${roleLabel} workspace in ${activeCompany ? activeCompany.name : 'the selected CRM'}.`;

  const isEmptyDashboard = dashboard.totalCustomers === 0 && dashboard.moduleStats.length === 0;

  return (
    <div className="page-container dashboard-page">
      <section className="page-head dashboard-head">
        <div>
          <h1>Good morning, {userName} <span aria-hidden="true">👋</span></h1>
          <p className="page-subtitle">{dashboardSubtitle}</p>
        </div>
        <div className="dashboard-head-actions">
          <time dateTime={new Date().toISOString().slice(0, 10)}>{headerDate}</time>
          <button className="btn" type="button" onClick={openCustomize}>Pin dashboard cards</button>
        </div>
      </section>

      {error && <div className="notice danger" style={{ margin: '0 0 1rem 0' }}>{error}</div>}

      {isEmptyDashboard && (
        <section className="dashboard-welcome" aria-label="Workspace ready">
          <h2>Your workspace is ready 🎉</h2>
          <p className="dashboard-welcome-sub">
            Everything is set up for <strong>{activeCompany?.name || 'your CRM'}</strong>. New records and work will appear here automatically.
          </p>
        </section>
      )}

      {!editSections.has('metrics') && (
        <section className="dashboard-metrics dashboard-reference-grid" aria-label="Dashboard metrics">
          {visibleCards.map(card => {
            const theme = getCardTheme(card.icon);
            return (
              <Link
                className={`dashboard-metric${dashboardDragKey === card.key ? ' is-dragging' : ''}`}
                key={card.key}
                to={card.href}
                draggable
                onDragStart={dragStartDashboardMetric(card.key)}
                onDragOver={dragOverDashboardMetric}
                onDrop={dropDashboardMetric(card.key)}
                onDragEnd={() => setDashboardDragKey(null)}
                style={{
                  '--metric-accent': theme.color,
                  opacity: dashboardDragKey === card.key ? 0.5 : 1,
                  cursor: 'grab'
                } as CSSProperties}
              >
                <span className="dashboard-metric-icon">
                  <Icon name={card.icon} size={20} />
                </span>
                <span className="dashboard-metric-copy">
                  <strong>{card.value}</strong>
                  <small>{card.label}</small>
                  {card.breakdown && <small className="metric-breakdown">{card.breakdown}</small>}
                </span>
                <Icon name="arrow-up-right" className="dashboard-metric-open" size={14} />
              </Link>
            );
          })}
        </section>
      )}

      <section className="dashboard-summary-grid">
        {!savedSections.has('work-progress') && (
          <article className="dashboard-luxury-card work-progress-card">
            <header className="luxury-card-head">
              <div className="luxury-card-title">
                <span className="card-icon-amber"><Icon name="target" size={18} /></span>
                <h3>Work progress</h3>
              </div>
              <span className="badge-amber-subtle">{dashboard.stats.completedWork} completed</span>
            </header>
            <div className="luxury-card-body">
              <div className="progress-meter-row">
                <div className="donut-progress-box">
                  <div className="donut-progress" style={{ '--progress': dashboard.stats.deliveredPercent } as CSSProperties}>
                    <span className="donut-val">{dashboard.stats.deliveredPercent}%</span>
                  </div>
                </div>
                <div className="progress-stats-stack">
                  <div className="progress-stat-pill">
                    <strong>{dashboard.stats.openWork}</strong>
                    <span>In progress</span>
                  </div>
                  <div className="progress-stat-pill">
                    <strong>{dashboard.stats.overdue}</strong>
                    <span>Overdue</span>
                  </div>
                </div>
              </div>

              <div className="weekly-bar-chart" aria-label="Work completed this week">
                {dashboard.weeklyWorkProgress.map(day => (
                  <details className={`bar-col${day.isToday ? ' is-today' : ''}`} key={day.label}>
                    <summary>
                      <span className="bar-fill" style={{ height: `${day.count ? Math.max(16, (day.count / weeklyMax) * 100) : 0}%` }} />
                      <strong className="bar-count">{day.count}</strong>
                      <small className="bar-label">{day.label}</small>
                    </summary>
                    <div className="weekly-day-popover">
                      <header><span>{day.label}</span><strong>{day.count} items</strong></header>
                      <ul>
                        {day.items.map(item => (
                          <li key={item._id}>
                            <Link to={`/work/${item.type}/${item._id}`}>{item.title}</Link>
                            <small>{item.module}</small>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </article>
        )}

        {!savedSections.has('deadlines') && (
          <article className="dashboard-luxury-card deadlines-card">
            <header className="luxury-card-head">
              <div className="luxury-card-title">
                <span className="card-icon-red"><Icon name="clock" size={18} /></span>
                <h3>Upcoming deadlines</h3>
              </div>
              <span className="badge-red-subtle">{dashboard.upcomingDeadlines.length} due soon</span>
            </header>
            <div className="luxury-card-body">
              <div className="deadlines-list">
                {dashboard.upcomingDeadlines.slice(0, 5).map(item => (
                  <Link to={`/work/${item.workType?.key || 'tasks'}/${item._id}`} className="deadline-item" key={item._id}>
                    <div className="deadline-info">
                      <strong>{item.title}</strong>
                      <span>{item.workType?.name || 'Task'}</span>
                    </div>
                    <time dateTime={item.deadline}>{new Date(item.deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</time>
                  </Link>
                ))}
                {dashboard.upcomingDeadlines.length === 0 && (
                  <div className="card-empty-state">
                    <Icon name="check-circle-2" size={24} />
                    <p>No immediate deadlines approaching.</p>
                  </div>
                )}
              </div>
            </div>
          </article>
        )}

        {!savedSections.has('attention') && (
          <article className="dashboard-luxury-card attention-card">
            <header className="luxury-card-head">
              <div className="luxury-card-title">
                <span className="card-icon-amber"><Icon name="triangle-alert" size={18} /></span>
                <h3>Needs attention</h3>
              </div>
              <span className="badge-amber-subtle">{dashboard.attentionCustomers.length} leads</span>
            </header>
            <div className="luxury-card-body">
              <div className="attention-list">
                {dashboard.attentionCustomers.slice(0, 5).map(customer => (
                  <Link to={`/customers/${customer._id}`} className="attention-item" key={customer._id}>
                    <div className="attention-avatar">{initials(customer.name)}</div>
                    <div className="attention-info">
                      <strong>{customer.name}</strong>
                      <span>{customer.company || customer.phone || 'Direct Lead'}</span>
                    </div>
                    <span className="attention-tag">{customer.nextFollowUpAt ? 'Follow-up due' : 'Stale lead'}</span>
                  </Link>
                ))}
                {dashboard.attentionCustomers.length === 0 && (
                  <div className="card-empty-state">
                    <Icon name="sparkles" size={24} />
                    <p>All leads and clients are up to date.</p>
                  </div>
                )}
              </div>
            </div>
          </article>
        )}
      </section>

      {!savedSections.has('pipeline') && (
        <section className="dashboard-pipeline-section" aria-label="Active pipeline">
          <div className="section-head">
            <h2>Active pipeline</h2>
            <Link to="/pipeline" className="view-all-link">View board <Icon name="arrow-right" size={14} /></Link>
          </div>
          <div className="dashboard-pipeline-grid">
            {dashboard.stageCards.map(stageCard => (
              <div
                className="dashboard-stage-column"
                key={stageCard.stage._id}
                onDragOver={e => e.preventDefault()}
                onDrop={e => moveCustomer(e, stageCard.stage._id)}
              >
                <div className="stage-column-header">
                  <div className="stage-title-wrap">
                    <span className="stage-dot" style={{ background: stageCard.stage.color || '#3b82f6' }} />
                    <h4>{stageCard.stage.name}</h4>
                  </div>
                  <span className="stage-count-badge">{stageCard.count}</span>
                </div>
                <div className="stage-cards-container">
                  {stageCard.customers.slice(0, 6).map(customer => (
                    <div
                      className="pipeline-lead-card"
                      key={customer._id}
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/customer-id', customer._id)}
                    >
                      <Link to={`/customers/${customer._id}`} className="lead-card-title">{customer.name}</Link>
                      <div className="lead-card-meta">
                        <span>{customer.company || '—'}</span>
                        <strong>Rs. {(customer.value || 0).toLocaleString('en-IN')}</strong>
                      </div>
                    </div>
                  ))}
                  {stageCard.customers.length === 0 && (
                    <div className="empty-stage-placeholder">Drop leads here</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!savedSections.has('recent') && (
        <section className="dashboard-movements-section">
          <div className="section-head">
            <h2>Recent movements</h2>
            <div className="movement-filter-pills">
              {(['all', 'work', 'leads', 'campaigns'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  className={`filter-pill${movementFilter === tab ? ' active' : ''}`}
                  onClick={() => setMovementFilter(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="movement-feed-card">
            {shownMovements.slice(0, 8).map(movement => (
              <div className="movement-feed-item" key={movement.id}>
                <div className="movement-icon-wrap"><Icon name={movement.icon || 'activity'} size={14} /></div>
                <div className="movement-content">
                  <div className="movement-meta"><strong>{movement.actor}</strong> <span>{movement.action || 'updated'}</span></div>
                  <Link to={movement.href || '#'} className="movement-title">{movement.title}</Link>
                  <p className="movement-msg">{movement.message}</p>
                </div>
                <time className="movement-time">{relativeTime(movement.createdAt)}</time>
              </div>
            ))}
          </div>
        </section>
      )}

      {customizeOpen && (
        <div
          className="modal-overlay dashboard-customize-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Pin dashboard cards"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(3px)'
          }}
          onClick={event => { if (event.target === event.currentTarget) setCustomizeOpen(false); }}
        >
          <div className="dashboard-customize-dialog">
            <form onSubmit={e => { e.preventDefault(); void submitPreferences(); }}>
              <div className="modal-header">
                <div>
                  <h2>Pin dashboard cards</h2>
                  <p>Choose the lead, client, and work summaries you need. Drag to reorder. Changes are saved for you only.</p>
                </div>
                <button className="modal-close" type="button" onClick={() => setCustomizeOpen(false)} aria-label="Close">&times;</button>
              </div>

              <div className="tabs-nav-bar">
                <button
                  type="button"
                  className={`tab-nav-btn${customizeTab === 'cards' ? ' active' : ''}`}
                  onClick={() => setCustomizeTab('cards')}
                >
                  <Icon name="layout-grid" size={16} />
                  <span>Dashboard cards</span>
                </button>
                <button
                  type="button"
                  className={`tab-nav-btn${customizeTab === 'sections' ? ' active' : ''}`}
                  onClick={() => setCustomizeTab('sections')}
                >
                  <Icon name="file-text" size={16} />
                  <span>Page sections</span>
                </button>
              </div>

              {customizeTab === 'cards' ? (
                <div className="dashboard-customize-panel dashboard-cards-panel active">
                  <div className="pin-cards-split">
                    <div className="pin-cards-col pin-avail-col">
                      <div className="pin-col-header">
                        <div className="pin-col-title-row">
                          <strong>AVAILABLE CARDS</strong>
                        </div>
                        <small>Drag or click + to add</small>
                      </div>

                      <div className="pin-search-wrap">
                        <Icon name="search" className="pin-search-icon" size={14} />
                        <input
                          type="text"
                          className="pin-search-input"
                          placeholder="Search cards..."
                          autoComplete="off"
                          value={pinSearch}
                          onChange={event => setPinSearch(event.target.value)}
                        />
                      </div>

                      <div className="pin-avail-groups" id="pinAvailGroups">
                        {['Leads & Clients', 'Work & Tasks', 'Finance', 'Custom Fields'].map(cat => {
                          const groupCards = unpinnedCards.filter(c => c.category === cat);
                          if (!groupCards.length) return null;
                          return (
                            <div className="pin-cat-group" key={cat}>
                              <span className="pin-cat-title">{cat.toUpperCase()}</span>
                              <div className="pin-cat-items">
                                {groupCards.map(card => {
                                  const theme = getCardTheme(card.icon);
                                  return (
                                    <div className="pin-card-item pin-avail-item" key={card.key}>
                                      <span className="pin-item-icon" style={{ color: theme.color, background: theme.bg }}>
                                        <Icon name={card.icon} size={14} />
                                      </span>
                                      <span className="pin-item-name">{card.label}</span>
                                      <button
                                        type="button"
                                        className="pin-add-btn"
                                        onClick={() => toggleCard(card.key, true)}
                                        title="Add to dashboard"
                                      >
                                        <Icon name="plus" size={13} />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        {unpinnedCards.length === 0 && (
                          <p style={{ color: 'var(--muted)', fontSize: '0.75rem', padding: '1rem', textAlign: 'center' }}>
                            All available cards are pinned to your dashboard.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pin-cards-col pin-pinned-col">
                      <div className="pin-col-header">
                        <div className="pin-col-title-row">
                          <strong>PINNED TO DASHBOARD</strong>
                          <span className="pinned-count-pill">{pinnedCards.length} cards pinned</span>
                        </div>
                        <small>Drag to reorder • Click ✕ to remove</small>
                      </div>

                      <div className="pin-pinned-list" id="pinnedCardsList">
                        {pinnedCards.map(card => {
                          const theme = getCardTheme(card.icon);
                          return (
                            <div
                              className="pin-card-item pin-pinned-item"
                              key={card.key}
                              draggable
                              onDragStart={dragStartModalPinned(card.key)}
                              onDragOver={dragOverModalPinned}
                              onDrop={dropModalPinned(card.key)}
                              onDragEnd={() => setDragKey(null)}
                              style={{
                                opacity: dragKey === card.key ? 0.4 : 1,
                                cursor: 'grab'
                              }}
                            >
                              <span className="pin-drag-handle" title="Drag to reorder">⠿</span>
                              <span className="pin-item-icon" style={{ color: theme.color, background: theme.bg }}>
                                <Icon name={card.icon} size={14} />
                              </span>
                              <span className="pin-item-name">{card.label}</span>
                              <label className="switch-toggle" title="Toggle visibility" onClick={event => event.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={!editHidden.has(card.key)}
                                  onChange={event => toggleCard(card.key, event.target.checked)}
                                />
                                <span className="switch-slider" />
                              </label>
                              <button
                                type="button"
                                className="pin-remove-btn"
                                onClick={() => toggleCard(card.key, false)}
                                title="Remove card"
                              >
                                <Icon name="x" size={13} />
                              </button>
                            </div>
                          );
                        })}
                        {pinnedCards.length === 0 && (
                          <p style={{ color: 'var(--muted)', fontSize: '0.78rem', padding: '1.5rem', textAlign: 'center' }}>
                            No cards pinned. Click <strong>+</strong> on any card to add it.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="dashboard-customize-panel dashboard-sections-panel active">
                  <div className="pin-sections-header">
                    <div className="pin-col-header" style={{ marginBottom: 12 }}>
                      <div className="pin-col-title-row"><strong>PAGE SECTIONS</strong></div>
                      <small>Toggle sections on your dashboard to customize your workspace overview.</small>
                    </div>
                  </div>
                  <div className="pin-sections-list">
                    {sectionChoices.map(({ key, label, visible }) => (
                      <label className="dashboard-choice" key={key}>
                        <span className="dashboard-choice-handle" aria-hidden="true">⠿</span>
                        <span className="dashboard-choice-name">{label}</span>
                        <input
                          type="checkbox"
                          checked={visible}
                          onChange={event => setEditSections(prev => {
                            const next = new Set(prev);
                            if (event.target.checked) next.delete(key); else next.add(key);
                            return next;
                          })}
                        />
                        <i aria-hidden="true" />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="modal-footer pin-modal-footer">
                <button className="btn btn-reset-default" type="button" onClick={resetDefaults}>
                  <Icon name="rotate-ccw" size={13} />
                  <span>Reset to default</span>
                </button>
                <div className="modal-footer-right">
                  <button className="btn" type="button" onClick={() => {
                    setEditSections(new Set(savedSections));
                    setCustomizeOpen(false);
                  }}>Cancel</button>
                  <button
                    className="btn primary"
                    type="submit"
                    disabled={savingPrefs}
                    style={{ background: '#ea580c', borderColor: '#ea580c' }}
                  >
                    {savingPrefs ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            </form>

            {dashboard.dashboardViews && dashboard.dashboardViews.length > 0 && (
              <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '0.4rem' }}>Saved Views</div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {dashboard.dashboardViews.map(v => (
                    <button key={v._id} className="btn secondary outline" type="button" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => {
                      setSavedSections(new Set(v.hiddenSections || []));
                      setEditSections(new Set(v.hiddenSections || []));
                      setEditOrder(v.cardOrder || []);
                    }}>{v.name}</button>
                  ))}
                </div>
              </div>
            )}

            <form className="dashboard-layout-save" style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
              onSubmit={async e => {
                e.preventDefault();
                const name = viewNameRef.current || viewName;
                if (!name.trim()) return;
                try {
                  setSavingView(true);
                  await api.post('/dashboard/preferences/dashboard/views', {
                    name: name.trim(),
                    hiddenSections: [...editSections],
                    cardOrder: editOrder,
                  });
                  setViewName('');
                  await loadDashboard();
                } catch (_) {}
                setSavingView(false);
              }}
            >
              <input
                type="text"
                placeholder="Name this layout"
                required
                value={viewName}
                onChange={e => { viewNameRef.current = e.target.value; setViewName(e.target.value); }}
                style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.8rem', background: 'var(--input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}
              />
              <button className="btn secondary" type="submit" disabled={savingView} style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                {savingView ? 'Saving…' : 'Save as view'}
              </button>
            </form>
          </div>
        </div>
      )}

      {previewMovement && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            background: '#10182870',
            backdropFilter: 'blur(3px)'
          }}
          onClick={event => { if (event.target === event.currentTarget) setPreviewMovement(null); }}
        >
          <div
            className="movement-preview-dialog"
            style={{
              width: 'min(480px, calc(100vw - 32px))',
              padding: 24,
              border: '1px solid var(--border)',
              borderRadius: 14,
              background: 'var(--panel)',
              color: 'var(--text)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.2)'
            }}
          >
            <div className="movement-preview-top" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Sample activity preview</span>
              <button type="button" onClick={() => setPreviewMovement(null)} aria-label="Close preview" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            <h2 style={{ margin: '18px 0 10px', fontSize: '1.15rem', lineHeight: 1.45 }}>{previewMovement.title}</h2>
            <p className="movement-preview-actor" style={{ margin: 0, color: 'var(--muted)', fontSize: '0.78rem' }}>{previewMovement.actor}</p>
            <p className="movement-preview-message" style={{ margin: '12px 0 0', color: 'var(--sub)', fontSize: '0.82rem', lineHeight: 1.6 }}>{previewMovement.message}</p>
            <div className="movement-preview-tags" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {previewMovement.category && <span className="movement-category" style={{ padding: '3px 7px', borderRadius: 5, border: '1px solid var(--border)', fontSize: '0.62rem', color: 'var(--muted)' }}>{previewMovement.category}</span>}
              {previewMovement.status && <span className="movement-status" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.63rem' }}><span aria-hidden="true" />{previewMovement.status}</span>}
            </div>
            <p className="movement-preview-note" style={{ margin: '14px 0 0', fontSize: '0.7rem', color: 'var(--muted)' }}>This is a fictional example. Real activity opens the linked CRM record.</p>
            <div style={{ marginTop: 18, textAlign: 'right' }}>
              <button className="btn" type="button" onClick={() => setPreviewMovement(null)}>Back to dashboard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
