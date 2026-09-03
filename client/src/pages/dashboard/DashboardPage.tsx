import { CSSProperties, DragEvent, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
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

interface WeeklyProgress {
  label: string;
  count: number;
  isToday: boolean;
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
  totalValue: number;
}

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

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

  const metrics = [
    [dashboard.stats.totalLeads, `Active ${crmTerms.leadPlural}`],
    [dashboard.stats.totalClients, crmTerms.recordPlural],
    [dashboard.stats.newThisWeek, `New ${crmTerms.leadPlural} this week`],
    [dashboard.stats.followupsDue, 'Follow-ups due'],
    [dashboard.stats.openWork, 'Open work'],
    [dashboard.stats.overdue, 'Overdue work'],
    [money.format(dashboard.totalValue), 'Pipeline value'],
    [`${dashboard.stats.deliveredPercent}%`, 'Work delivered']
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
        {metrics.map(([value, label]) => (
          <article className="dashboard-metric" key={label}>
            <span className="dashboard-metric-copy"><strong>{value}</strong><small>{label}</small></span>
          </article>
        ))}
      </section>

      <section className="dashboard-summary-grid">
        <article className="dashboard-summary-card">
          <h2>Work progress <span>{dashboard.stats.completedWork} completed</span></h2>
          <div className="dashboard-progress"><span style={{ width: `${dashboard.stats.deliveredPercent}%` }} /></div>
          <div className="weekly-bar-chart" aria-label="Work completed this week">
            {dashboard.weeklyWorkProgress.map(day => (
              <div className={`bar-col${day.isToday ? ' is-today' : ''}`} key={day.label}>
                <span style={{ height: `${day.count ? Math.max(16, day.count / weeklyMax * 100) : 0}%` }} />
                <strong>{day.count}</strong><small>{day.label}</small>
              </div>
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
                {card.customers.map(customer => (
                  <Link
                    className="deal-card"
                    draggable
                    key={customer._id}
                    to={`/customers/${customer._id}`}
                    onDragStart={event => event.dataTransfer.setData('text/customer-id', customer._id)}
                  >
                    <strong>{customer.name}</strong>
                    <span>{customer.company || customer.email || customer.phone || 'No contact details'}</span>
                    <small>{money.format(customer.value || 0)}</small>
                  </Link>
                ))}
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
