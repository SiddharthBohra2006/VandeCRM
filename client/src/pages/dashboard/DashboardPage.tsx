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

function getCardTheme(icon: string) {
  const color = ICON_PALETTE[icon] || '#7886a5';
  return { color, bg: `color-mix(in srgb, ${color} 10%, var(--panel))` };
}

function initials(name?: string | null) {
  if (!name) return '—';
  return name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
}

export default function DashboardPage() {
  const { crmTerms } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);

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
    { href: '/customers', icon: 'users', value: String(dashboard.stats.totalLeads), label: `Active ${crmTerms.leadPlural}`, key: 'total-leads', defaultVisible: true, category: 'Leads', breakdown: `${dashboard.totalCustomers || 0} total records` },
    { href: '/clients', icon: 'building-2', value: String(dashboard.stats.totalClients), label: crmTerms.recordPlural, key: 'total-clients', defaultVisible: true, category: 'Leads', breakdown: 'Won pipeline' },
    { href: '/customers', icon: 'user-plus', value: String(dashboard.stats.newThisWeek), label: `New ${crmTerms.leadPlural} this week`, key: 'new-this-week', defaultVisible: true, category: 'Leads', breakdown: 'Past 7 days' },
    { href: '/customers', icon: 'clock', value: String(dashboard.stats.followupsDue), label: 'Follow-ups due', key: 'followups-due', defaultVisible: true, category: 'Leads', breakdown: 'Overdue now' },
    { href: '/customers', icon: 'triangle-alert', value: String(dashboard.stats.staleCustomers), label: 'Stale leads', key: 'stale-leads', defaultVisible: true, category: 'Leads', breakdown: 'No contact 14d+' },
    { href: '/work', icon: 'clipboard-list', value: String(dashboard.stats.openWork), label: 'Open work', key: 'open-work', defaultVisible: true, category: 'Work', breakdown: 'In progress' },
    { href: '/work', icon: 'check', value: `${dashboard.stats.deliveredPercent}%`, label: 'Work delivered', key: 'delivered', defaultVisible: true, category: 'Work', breakdown: `${dashboard.stats.completedWork} delivered` },
    { href: '/work', icon: 'triangle-alert', value: String(dashboard.stats.overdue), label: 'Overdue work', key: 'overdue', defaultVisible: true, category: 'Work', breakdown: 'Past deadline' },
    { href: '/customers', icon: 'target', value: money.format(dashboard.totalValue), label: 'Pipeline value', key: 'pipeline-value', defaultVisible: true, category: 'Pipeline', breakdown: 'Active deals' },
    ...dashboard.moduleStats.map(moduleCard)
  ];
  const weeklyMax = Math.max(1, ...dashboard.weeklyWorkProgress.map(day => day.count));

  return (
    <div className="page-container">
      <section className="page-head dashboard-head">
        <div>
          <p className="eyebrow">Workspace overview</p>
          <h1>Dashboard</h1>
          <p>Track pipeline health, delivery, and the work needing attention.</p>
        </div>
        <Link to="/customers/new" className="btn primary">New {crmTerms.leadSingular}</Link>
      </section>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="dashboard-metrics dashboard-reference-grid" aria-label="Dashboard metrics">
        {cards.map(card => {
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

      <section className="dashboard-summary-grid">
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

        <article className="dashboard-summary-card">
          <h2>Upcoming deadlines</h2>
          {dashboard.upcomingDeadlines.length === 0 ? <p>No overdue or upcoming deadlines.</p> : dashboard.upcomingDeadlines.map(item => (
            <Link to={`/work/${item.workType?.key || 'task'}/${item._id}`} key={item._id}>
              <strong>{item.title}</strong><span>{date.format(new Date(item.deadline))}</span>
            </Link>
          ))}
        </article>

        <article className="dashboard-summary-card">
          <h2>Needs attention</h2>
          {dashboard.attentionCustomers.length === 0 ? <p>No follow-ups or stale leads need attention.</p> : dashboard.attentionCustomers.map(customer => (
            <Link to={`/customers/${customer._id}`} key={customer._id}>
              <strong>{customer.name}</strong><span>{customer.nextFollowUpAt ? date.format(new Date(customer.nextFollowUpAt)) : 'Needs contact'}</span>
            </Link>
          ))}
        </article>

        <article className="dashboard-summary-card">
          <h2>Work modules</h2>
          {dashboard.moduleStats.length === 0 ? <p>No work modules are assigned.</p> : dashboard.moduleStats.map(module => (
            <Link to={`/work/${module.key}`} key={module.key}>
              <strong>{module.name}</strong><span>{module.open} open · {module.completed} completed</span>
            </Link>
          ))}
        </article>
      </section>

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

      <section className="dashboard-summary-grid">
        <article className="dashboard-summary-card">
          <h2>Recent {crmTerms.leadPlural}</h2>
          {dashboard.recentCustomers.length === 0 ? <p>No {crmTerms.leadPlural.toLowerCase()} yet.</p> : dashboard.recentCustomers.map(customer => (
            <Link to={`/customers/${customer._id}`} key={customer._id}><strong>{customer.name}</strong><span>{customer.stage?.name || 'No stage'}</span></Link>
          ))}
        </article>
      </section>
    </div>
  );
}
