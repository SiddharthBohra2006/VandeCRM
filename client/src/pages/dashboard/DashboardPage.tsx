import { CSSProperties, DragEvent, useCallback, useEffect, useState } from 'react';
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
  dashboardViews: { _id: string; name: string }[];
  totalValue: number;
  totalCustomers: number;
  dashboardCardsCustomized?: boolean;
  dashboardHiddenCards?: string[];
  dashboardCardOrder?: string[];
  dashboardHiddenSections?: string[];
  recentMovements?: Movement[];
  movementSamples?: Movement[];
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
const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const ICON_PALETTE: Record<string, string> = {
  users: '#5287ff', 'user-plus': '#5287ff', 'building-2': '#f28a24',
  clock: '#16b8a6', 'triangle-alert': '#f45b55', megaphone: '#a259ff',
  check: '#a259ff', video: '#6574ff', palette: '#5287ff', globe: '#679cff',
  'file-text': '#f28a24', calendar: '#16b8a6', 'clipboard-list': '#a259ff',
  target: '#f59e0b', filter: '#16b8a6', sparkles: '#a259ff',
};

const SECTION_CHOICES: [string, string][] = [
  ['metrics', 'Metrics grid'],
  ['work-progress', 'Work progress'],
  ['deadlines', 'Upcoming deadlines'],
  ['pipeline', 'Active pipeline'],
  ['attention', 'Needs attention'],
  ['recent', 'Recent movements'],
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

function movementTone(group: string, tone?: string) {
  if (tone) return tone;
  if (group === 'leads') return 'amber';
  if (group === 'campaigns') return 'violet';
  return 'blue';
}

export default function DashboardPage() {
  const { user, activeCompany, crmTerms } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeTab, setCustomizeTab] = useState<'cards' | 'sections'>('cards');
  const [editHidden, setEditHidden] = useState<Set<string>>(new Set());
  const [editOrder, setEditOrder] = useState<string[]>([]);
  const [editSections, setEditSections] = useState<Set<string>>(new Set());
  const [pinSearch, setPinSearch] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [movementFilter, setMovementFilter] = useState<'all' | 'work' | 'leads' | 'campaigns'>('all');
  const [previewMovement, setPreviewMovement] = useState<Movement | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const campaign = searchParams.get('campaign');
      setDashboard(await api.get<DashboardResponse>(`/dashboard${campaign ? `?campaign=${encodeURIComponent(campaign)}` : ''}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

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

  if (loading && !dashboard) return <div className="loading">Loading dashboard…</div>;
  if (error && !dashboard) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!dashboard) return <div className="empty-state">Dashboard data is unavailable.</div>;

  const moduleCard = (m: WorkTypeSummary): DashboardMetricCard => ({
    href: `/work/${m.key}`,
    icon: m.icon || 'clipboard-list',
    value: String(m.open || 0),
    label: m.name,
    key: `work-${m.key}`,
    defaultVisible: true,
    category: 'Work',
    breakdown: `${m.total || 0} total · ${m.completed || 0} delivered`
  });

  const cards: DashboardMetricCard[] = [
    { href: '/customers', icon: 'users', value: String(dashboard.stats.totalLeads), label: `Active ${crmTerms.leadPlural}`, key: 'total-leads', defaultVisible: true, category: 'Leads & Clients', breakdown: `${dashboard.totalCustomers || 0} total records` },
    { href: '/clients', icon: 'building-2', value: String(dashboard.stats.totalClients), label: crmTerms.recordPlural, key: 'total-clients', defaultVisible: true, category: 'Leads & Clients', breakdown: 'Won pipeline' },
    { href: '/customers', icon: 'user-plus', value: String(dashboard.stats.newThisWeek), label: `New ${crmTerms.leadPlural} this week`, key: 'new-this-week', defaultVisible: true, category: 'Leads & Clients', breakdown: 'Past 7 days' },
    { href: '/customers', icon: 'clock', value: String(dashboard.stats.followupsDue), label: 'Follow-ups due', key: 'followups-due', defaultVisible: true, category: 'Leads & Clients', breakdown: 'Overdue now' },
    { href: '/customers', icon: 'target', value: money.format(dashboard.totalValue), label: 'Pipeline value', key: 'pipeline-value', defaultVisible: true, category: 'Leads & Clients', breakdown: 'Active deals' },
    { href: '/customers', icon: 'triangle-alert', value: String(dashboard.stats.staleCustomers), label: 'Stale leads', key: 'stale-leads', defaultVisible: true, category: 'Leads & Clients', breakdown: 'No contact 14d+' },
    { href: '/customers', icon: 'megaphone', value: money.format(dashboard.stats.adSpend), label: 'Total ad spend', key: 'ad-spend', defaultVisible: false, category: 'Finance', breakdown: 'This workspace' },
    { href: '/work', icon: 'clipboard-list', value: String(dashboard.stats.openWork), label: 'Open work', key: 'open-work', defaultVisible: true, category: 'Work & Tasks', breakdown: 'In progress' },
    { href: '/work', icon: 'check', value: `${dashboard.stats.deliveredPercent}%`, label: 'Work delivered', key: 'delivered', defaultVisible: true, category: 'Work & Tasks', breakdown: `${dashboard.stats.completedWork} delivered` },
    { href: '/work', icon: 'triangle-alert', value: String(dashboard.stats.overdue), label: 'Overdue work', key: 'overdue', defaultVisible: true, category: 'Work & Tasks', breakdown: 'Past deadline' },
    ...dashboard.moduleStats.map(moduleCard)
  ];
  const weeklyMax = Math.max(1, ...dashboard.weeklyWorkProgress.map(day => day.count));

  const hiddenCards = new Set(dashboard.dashboardHiddenCards || []);
  const savedOrder = dashboard.dashboardCardOrder || [];
  const orderedCards = [
    ...[...cards].sort((a, b) => {
      const ia = savedOrder.indexOf(a.key);
      const ib = savedOrder.indexOf(b.key);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    }),
  ];
  const visibleCards = orderedCards.filter(card => !hiddenCards.has(card.key));

  const movementSampleFeed = dashboard.movementSamples || [];
  const movementFeedRaw = dashboard.recentMovements || [];
  const isSampleFeed = movementFeedRaw.length === 0;
  const fullFeed = isSampleFeed ? movementSampleFeed : movementFeedRaw;
  const movementGroups = new Set(fullFeed.map(m => m.group));
  const visibleMovementGroups = movementFilter === 'all' ? movementGroups : new Set([movementFilter]);
  const movementCounts = (key: 'all' | 'work' | 'leads' | 'campaigns') => key === 'all' ? fullFeed.length : fullFeed.filter(m => m.group === key).length;
  const shownMovements = fullFeed.filter(m => movementFilter === 'all' || m.group === movementFilter);

  const openCustomize = () => {
    setEditHidden(new Set(dashboard.dashboardHiddenCards || []));
    setEditOrder([...savedOrder, ...cards.map(c => c.key).filter(k => !(savedOrder || []).includes(k))]);
    setEditSections(new Set(dashboard.dashboardHiddenSections || []));
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
      setError('');
      await api.post<{ ok: true, hiddenSections: string[] }>('/dashboard/preferences/dashboard', {
        hiddenSections: [...editSections],
        dashboardHiddenCards: [...editHidden],
        dashboardCardOrder: editOrder,
      });
      setCustomizeOpen(false);
      await loadDashboard();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save dashboard preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  const resetDefaults = () => {
    setEditHidden(new Set());
    setEditOrder(cards.map(card => card.key));
    setEditSections(new Set());
  };

  const query = pinSearch.trim().toLowerCase();
  const pinnedCards = editOrder.map(key => cards.find(card => card.key === key)).filter((card): card is DashboardMetricCard => Boolean(card));
  const availableCards = cards.filter(card => !editHidden.has(card.key) && (!query || card.label.toLowerCase().includes(query) || (card.breakdown || '').toLowerCase().includes(query)));
  const availableHiddenCards = cards.filter(card => editHidden.has(card.key) && (!query || card.label.toLowerCase().includes(query)));
  const visiblePinnedCount = pinnedCards.filter(card => !editHidden.has(card.key)).length;

  const sectionChoices = SECTION_CHOICES.map(([key, label]) => ({ key, label, visible: !editSections.has(key) }));

  const dragStartPinned = (key: string) => (e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragKey(key);
  };
  const dragOverPinned = (key: string) => (e: DragEvent) => {
    e.preventDefault();
  };
  const dropPinned = (target: string) => (e: DragEvent) => {
    e.preventDefault();
    if (dragKey && dragKey !== target) reorderPinned(dragKey, target);
    setDragKey(null);
  };

  const currentHour = new Date().getHours();
  const timeGreeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const userName = user?.name ? user.name.split(' ')[0] : 'there';

  return (
    <div className="page-container">
      <section className="page-head dashboard-head">
        <div>
          <p className="eyebrow">{timeGreeting}, {userName} 👋</p>
          <h1>Dashboard</h1>
          <p className="page-subtitle">
            {activeCompany ? `Workspace overview for ${activeCompany.name}. ` : 'Workspace overview. '}
            Track pipeline health, delivery, and the work needing attention.
          </p>
        </div>
        <div className="dashboard-head-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="btn" type="button" onClick={openCustomize}>Pin dashboard cards</button>
          <Link to="/customers/new" className="btn primary">New {crmTerms.leadSingular}</Link>
        </div>
      </section>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {!editSections.has('metrics') && (
        <section className="dashboard-metrics dashboard-reference-grid" aria-label="Dashboard metrics">
          {visibleCards.map(card => {
            const theme = getCardTheme(card.icon);
            return (
              <Link
                className="dashboard-metric"
                key={card.key}
                to={card.href}
                style={{ '--metric-accent': theme.color, '--row-accent': theme.color } as CSSProperties}
              >
                <span className="dashboard-metric-icon"><Icon name={card.icon} size={20} /></span>
                <span className="dashboard-metric-copy">
                  <strong>{card.value}</strong>
                  <small>{card.label}</small>
                </span>
                {card.breakdown && <span className="metric-breakdown">{card.breakdown}</span>}
              </Link>
            );
          })}
        </section>
      )}

      <section className="dashboard-summary-grid">
        {!editSections.has('work-progress') && (
          <article className="dashboard-summary-card">
            <h2>Work progress <span>{dashboard.stats.completedWork} completed</span></h2>
            <div className="dashboard-progress"><span style={{ width: `${dashboard.stats.deliveredPercent}%` }} /></div>
            <div className="weekly-bar-chart" aria-label="Work completed this week">
              {dashboard.weeklyWorkProgress.map(day => (
                <details className={`bar-col${day.isToday ? ' is-today' : ''}`} key={day.label}>
                  <summary>
                    <span className="bar-fill" style={{ height: `${day.count ? Math.max(16, day.count / weeklyMax * 100) : 0}%` }} />
                    <strong className="bar-count">{day.count}</strong>
                    <small className="bar-label">{day.label}</small>
                  </summary>
                  <div className="weekly-day-popover">
                    <header>
                      <span>{day.label}</span>
                      <span>{day.count} delivered</span>
                    </header>
                    {day.items.length === 0 && <p>No work completed on {day.label}.</p>}
                    {day.items.map(item => (
                      <Link to={`/work/${item.type || 'task'}/${item._id}`} key={item._id}>
                        <span><strong>{item.title}</strong><small>{item.module}</small></span>
                        <time>{item.completedAt ? date.format(new Date(item.completedAt)) : ''}</time>
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </article>
        )}

        {!editSections.has('deadlines') && (
          <article className="dashboard-summary-card">
            <h2>Upcoming deadlines</h2>
            {dashboard.upcomingDeadlines.length === 0 ? <p>No overdue or upcoming deadlines.</p> : dashboard.upcomingDeadlines.map(item => (
              <Link to={`/work/${item.workType?.key || 'task'}/${item._id}`} key={item._id}>
                <strong>{item.title}</strong><span>{date.format(new Date(item.deadline))}</span>
              </Link>
            ))}
          </article>
        )}

        {!editSections.has('attention') && (
          <article className="dashboard-summary-card">
            <h2>Needs attention</h2>
            {dashboard.attentionCustomers.length === 0 ? <p>No follow-ups or stale leads need attention.</p> : dashboard.attentionCustomers.map(customer => (
              <Link to={`/customers/${customer._id}`} key={customer._id}>
                <strong>{customer.name}</strong><span>{customer.nextFollowUpAt ? date.format(new Date(customer.nextFollowUpAt)) : 'Needs contact'}</span>
              </Link>
            ))}
          </article>
        )}

        <article className="dashboard-summary-card">
          <h2>Work modules</h2>
          {dashboard.moduleStats.length === 0 ? <p>No work modules are assigned.</p> : dashboard.moduleStats.map(module => (
            <Link to={`/work/${module.key}`} key={module.key}>
              <strong>{module.name}</strong><span>{module.open} open · {module.completed} completed</span>
            </Link>
          ))}
        </article>
      </section>

      {!editSections.has('pipeline') && (
        <section className="pipeline-board pipeline-board-v2">
          <header className="board-head">
            <div><p className="eyebrow">Pipeline</p><h2>Active {crmTerms.pipelineName.toLowerCase()}</h2></div>
            <select
              aria-label="Filter pipeline by campaign"
              value={searchParams.get('campaign') || ''}
              onChange={event => setSearchParams(event.target.value ? { campaign: event.target.value } : {})}
            >
              <option value="">All campaigns</option>
              {dashboard.campaigns.map(campaign => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}
            </select>
          </header>
          <div className="pipeline" aria-label="Sales pipeline stages">
            {dashboard.stageCards.map(card => (
              <article
                className="stage-column"
                key={card.stage._id}
                style={{ '--stage-color': card.stage.color } as CSSProperties}
                onDragOver={event => event.preventDefault()}
                onDrop={event => void moveCustomer(event, card.stage._id)}
              >
                <header><h2>{card.stage.name}</h2><span>{card.count}</span><strong>{money.format(card.value)}</strong></header>
                <div className="stage-list">
                  {card.customers.length === 0 && <div className="stage-empty"><strong>No {crmTerms.leadPlural.toLowerCase()}</strong></div>}
                  {card.customers.map(customer => {
                    const owner = customer.assignedTo?.name;
                    const source = customer.campaign?.name || customer.source || customer.utmSource || null;
                    const meta = [customer.clientCompany?.name, source].filter(Boolean).join(' · ');
                    return (
                      <Link
                        className="deal-card"
                        draggable
                        key={customer._id}
                        to={`/customers/${customer._id}`}
                        onDragStart={event => event.dataTransfer.setData('text/customer-id', customer._id)}
                      >
                        <strong className="deal-name">{customer.name}</strong>
                        {customer.labels.length > 0 && (
                          <div className="label-row">
                            {customer.labels.map(label => (
                              <span className="pill" key={label._id} style={{ '--pill': label.color } as CSSProperties}>{label.name}</span>
                            ))}
                          </div>
                        )}
                        {meta && <span className="deal-meta">{meta}</span>}
                        <div className="deal-card-footer">
                          <span className="deal-owner">
                            <span className="deal-owner-avatar">{initials(owner)}</span>
                            <span>{owner || 'Unassigned'}</span>
                            <time>{customer.updatedAt ? date.format(new Date(customer.updatedAt)) : ''}</time>
                          </span>
                          <strong className="deal-value">{money.format(customer.value || 0)}</strong>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {fullFeed.length > 0 && (
        <section className="business-grid dashboard-movement-grid">
          <article className="business-panel movement-panel movement-panel-v2" data-movement-feed>
            <header className="movement-header">
              <div className="movement-heading">
                <span className="movement-heading-icon"><Icon name="activity" size={21} /></span>
                <div><h2>Recent movements</h2><p>What your team has been working on.</p></div>
              </div>
              <span className={`movement-count${isSampleFeed ? ' movement-sample-badge' : ''}`}>{isSampleFeed ? 'Sample activity' : `${fullFeed.length} latest updates`}</span>
            </header>
            <div className="movement-toolbar">
              <div className="movement-tabs" role="group" aria-label="Filter recent movements">
                {(['all', 'work', 'leads', 'campaigns'] as const).filter(group => group === 'all' || visibleMovementGroups.has(group)).map(group => (
                  <button
                    type="button"
                    aria-pressed={movementFilter === group}
                    key={group}
                    onClick={() => setMovementFilter(group)}
                  >
                    {group === 'all' ? 'All activity' : group.charAt(0).toUpperCase() + group.slice(1)}<span>{movementCounts(group)}</span>
                  </button>
                ))}
              </div>
              <span className="movement-period"><Icon name="clock" size={13} />Latest first</span>
            </div>
            {isSampleFeed && <p className="movement-demo-note"><Icon name="flask-conical" size={14} />Preview data · These examples will be replaced by real activity as your team works.</p>}
            {shownMovements.length === 0 ? (
              <div className="movement-empty"><p>No activity recorded yet. Updates will appear here when accessible records change.</p></div>
            ) : (
              <ol className="movement-list">
                {shownMovements.map(movement => (
                  <li className="movement-item" data-movement-group={movement.group} data-tone={movementTone(movement.group, movement.tone)} key={movement.id}>
                    <div className="movement-avatar-wrap">
                      <span className="movement-avatar" aria-hidden="true">{initials(movement.actor)}</span>
                      <span className="movement-action-icon"><Icon name={movement.icon || 'users'} size={10} /></span>
                    </div>
                    <div className="movement-content">
                      <div className="movement-meta"><strong>{movement.actor}</strong><span>{movement.action || 'made an update'}</span></div>
                      {movement.href ? (
                        <Link className="movement-record" to={movement.href}>{movement.title}<Icon name="arrow-up-right" size={12} /></Link>
                      ) : movement.sample ? (
                        <button type="button" className="movement-record movement-preview-trigger" onClick={() => setPreviewMovement(movement)}>{movement.title}<Icon name="arrow-up-right" size={12} /></button>
                      ) : (
                        <strong className="movement-record">{movement.title}</strong>
                      )}
                      <p>{movement.message}</p>
                      <div className="movement-tags">
                        <span className="movement-category">{movement.category}</span>
                        {movement.status && <span className="movement-status"><span aria-hidden="true" />{movement.status}</span>}
                      </div>
                    </div>
                    <time dateTime={movement.createdAt} title={new Date(movement.createdAt).toLocaleString('en-IN')}>{relativeTime(movement.createdAt)}<small>{new Date(movement.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</small></time>
                  </li>
                ))}
              </ol>
            )}
            <footer className="movement-footer">
              <span><Icon name={isSampleFeed ? 'info' : 'shield-check'} size={12} />{isSampleFeed ? 'Sample names and events · No records added to your CRM' : 'Activity from records you can access in this CRM'}</span>
              <a href="/" onClick={event => { event.preventDefault(); void loadDashboard(); }}>Refresh activity<Icon name="refresh-cw" size={12} /></a>
            </footer>
          </article>
        </section>
      )}

      {!editSections.has('recent') && (
        <section className="dashboard-summary-grid">
          <article className="dashboard-summary-card">
            <h2>Recent {crmTerms.leadPlural}</h2>
            {dashboard.recentCustomers.length === 0 ? <p>No {crmTerms.leadPlural.toLowerCase()} yet.</p> : dashboard.recentCustomers.map(customer => (
              <Link to={`/customers/${customer._id}`} key={customer._id}><strong>{customer.name}</strong><span>{customer.stage?.name || 'No stage'}</span></Link>
            ))}
          </article>
        </section>
      )}

      {customizeOpen && (
        <div
          className="modal-overlay dashboard-customize-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Pin dashboard cards"
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.55)' }}
          onClick={event => { if (event.target === event.currentTarget) setCustomizeOpen(false); }}
        >
          <div className="simple-dialog dashboard-customize-dialog" style={{ width: 'min(900px, calc(100vw - 2rem))', maxWidth: '900px', height: 620, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--panel)', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>
            <div className="modal-header">
              <div>
                <h2>Pin dashboard cards</h2>
                <p>Choose the lead, client, and work summaries you need. Drag to reorder. Changes are saved for you only.</p>
              </div>
              <button className="modal-close" type="button" onClick={() => setCustomizeOpen(false)} aria-label="Close">&times;</button>
            </div>

            <div className="tabs-nav-bar">
              <button type="button" className={`tab-nav-btn${customizeTab === 'cards' ? ' active' : ''}`} onClick={() => setCustomizeTab('cards')}>
                <Icon name="layout-grid" size={16} />
                <span>Dashboard cards</span>
              </button>
              <button type="button" className={`tab-nav-btn${customizeTab === 'sections' ? ' active' : ''}`} onClick={() => setCustomizeTab('sections')}>
                <Icon name="file-text" size={16} />
                <span>Page sections</span>
              </button>
            </div>

            {customizeTab === 'cards' ? (
              <div className="dashboard-customize-panel dashboard-cards-panel active">
                <div className="pin-cards-split">
                  <div className="pin-cards-col pin-avail-col">
                    <div className="pin-col-header">
                      <div className="pin-col-title-row"><strong>AVAILABLE CARDS</strong></div>
                      <small>Drag or click + to add</small>
                    </div>
                    <div className="pin-search-wrap">
                      <Icon name="search" className="pin-search-icon" size={14} />
                      <input type="text" className="pin-search-input" placeholder="Search cards..." autoComplete="off" value={pinSearch} onChange={event => setPinSearch(event.target.value)} />
                    </div>
                    <div className="pin-avail-groups" id="pinAvailGroups">
                      {(() => {
                        const categories = ['Leads & Clients', 'Work & Tasks', 'Finance', 'Custom Fields'];
                        return categories.map(cat => {
                          const groupCards = [...availableHiddenCards.filter(c => c.category === cat), ...availableCards.filter(c => c.category === cat)];
                          if (!groupCards.length) return null;
                          return (
                            <div className="pin-cat-group" key={cat}>
                              <span className="pin-cat-title">{cat.toUpperCase()}</span>
                              <div className="pin-cat-items">
                                {groupCards.map(card => {
                                  const theme = getCardTheme(card.icon);
                                  return (
                                    <div className="pin-card-item pin-avail-item" data-card-key={card.key} data-card-title={card.label.toLowerCase()} key={card.key}>
                                      <span className="pin-item-icon" style={{ color: theme.color, background: theme.bg }}><Icon name={card.icon} size={14} /></span>
                                      <span className="pin-item-name">{card.label}</span>
                                      <button type="button" className="pin-add-btn" onClick={() => toggleCard(card.key, true)} title="Add to dashboard"><Icon name="plus" size={13} /></button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  <div className="pin-cards-col pin-pinned-col">
                    <div className="pin-col-header">
                      <div className="pin-col-title-row">
                        <strong>PINNED TO DASHBOARD</strong>
                        <span className="pinned-count-pill">{visiblePinnedCount} cards pinned</span>
                      </div>
                      <small>Drag to reorder • Click ✕ to remove</small>
                    </div>
                    <div className="pin-pinned-list" id="pinnedCardsList">
                      {pinnedCards.map(card => {
                        const theme = getCardTheme(card.icon);
                        const isHidden = editHidden.has(card.key);
                        return (
                          <div
                            className="pin-card-item pin-pinned-item"
                            data-card-key={card.key}
                            draggable
                            key={card.key}
                            hidden={isHidden}
                            onDragStart={dragStartPinned(card.key)}
                            onDragOver={dragOverPinned(card.key)}
                            onDrop={dropPinned(card.key)}
                            style={{ opacity: dragKey === card.key ? 0.5 : 1, display: isHidden ? 'none' : 'flex' }}
                          >
                            <span className="pin-drag-handle" title="Drag to reorder">⠿</span>
                            <span className="pin-item-icon" style={{ color: theme.color, background: theme.bg }}><Icon name={card.icon} size={14} /></span>
                            <span className="pin-item-name">{card.label}</span>
                            <label className="switch-toggle" title="Toggle visibility" onClick={event => event.stopPropagation()}>
                              <input type="checkbox" checked={!isHidden} onChange={event => toggleCard(card.key, event.target.checked)} />
                              <span className="switch-slider" />
                            </label>
                            <button type="button" className="pin-remove-btn" onClick={() => toggleCard(card.key, false)} title="Remove card"><Icon name="x" size={13} /></button>
                          </div>
                        );
                      })}
                      {pinnedCards.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.8rem', padding: '8px' }}>No cards pinned.</p>}
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
                      <input type="checkbox" checked={visible} onChange={event => setEditSections(prev => {
                        const next = new Set(prev);
                        if (event.target.checked) next.delete(key); else next.add(key);
                        return next;
                      })} />
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
                <button className="btn" type="button" onClick={() => setCustomizeOpen(false)}>Cancel</button>
                <button className="btn primary" type="button" onClick={() => void submitPreferences()} disabled={savingPrefs}>
                  {savingPrefs ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewMovement && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: '#10182870', backdropFilter: 'blur(3px)' }} onClick={event => { if (event.target === event.currentTarget) setPreviewMovement(null); }}>
          <div className="movement-preview-dialog" style={{ width: 'min(480px, calc(100vw - 32px))', padding: 24, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--panel)', color: 'var(--text)', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
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
