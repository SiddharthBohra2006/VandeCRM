import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { workApi, WorkType, WorkItem } from '../../api/work';
import { useAuth } from '../../contexts/AuthContext';
import DatePicker from '../../components/DatePicker';
import Icon from '../../components/Icons';

interface Member { _id: string; name: string; email?: string }

const AVATAR_COLORS = ['#0f766e', '#2563eb', '#b45309', '#0e7490', '#7c3aed', '#be185d', '#4d7c0f'];
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const avatarColor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const isClosedItem = (item: WorkItem, workType: WorkType | undefined) => {
  const st = workType?.statuses?.find(s => s.key === item.status);
  if (st?.isTerminalWon || st?.isTerminalLost) return true;
  return ['completed', 'delivered', 'done', 'won', 'lost', 'cancelled'].includes(String(item.status || '').toLowerCase());
};
const timeLabel = (iso: string | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const daySeparator = (iso: string | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date(); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
};

export default function WorkThreadsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [users, setUsers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string>(searchParams.get('person') || '');

  const [draft, setDraft] = useState('');
  const [draftType, setDraftType] = useState('');
  const [draftPriority, setDraftPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [draftDeadline, setDraftDeadline] = useState('');
  const [draftAssignee, setDraftAssignee] = useState('');
  const [sending, setSending] = useState(false);
  const [forwardItem, setForwardItem] = useState<string | null>(null);

  const [cmd, setCmd] = useState<'area' | 'assignee' | null>(null);
  const [cmdFilter, setCmdFilter] = useState('');
  const [cmdIndex, setCmdIndex] = useState(0);

  const [subOpen, setSubOpen] = useState<string | null>(null);
  const [subTitle, setSubTitle] = useState('');

  const scrollerRef = useRef<HTMLDivElement>(null);

  async function loadCenter() {
    try {
      setReloading(true);
      const res = await workApi.getCenter();
      setWorkTypes(res.workTypes || []);
      setItems(res.items || []);
      setUsers(res.users || []);
      if (!draftType && res.workTypes?.length) setDraftType(res.workTypes[0].key);
    } catch (err: any) {
      setError(err.message || 'Failed to load team chat');
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }

  useEffect(() => { loadCenter(); }, []);

  const workTypeOf = (item: WorkItem) => item.workType || workTypes.find(t => t._id === item.module || t.key === String((item.module || '')).split('/').pop());

  const itemsByAssignee = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    for (const item of items) {
      if (item.parentRecord) continue;
      const key = String(item.assignedTo?._id || item.assignedTo || '') || 'unassigned';
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    map.forEach(list => list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    return map;
  }, [items]);

  const subtasksByParent = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    for (const item of items) {
      const parentId = typeof item.parentRecord === 'string' ? item.parentRecord : item.parentRecord?._id;
      if (!parentId) continue;
      const list = map.get(String(parentId)) || [];
      list.push(item);
      map.set(String(parentId), list);
    }
    return map;
  }, [items]);

  const conversations = useMemo(() => {
    const list: { id: string; name: string; lastAt: string; open: number; done: number }[] = [];
    const un = itemsByAssignee.get('unassigned') || [];
    if (un.length) list.push({
      id: 'unassigned',
      name: 'Unassigned',
      lastAt: un[un.length - 1]?.updatedAt || '',
      open: un.filter(i => !isClosedItem(i, workTypeOf(i))).length,
      done: un.filter(i => isClosedItem(i, workTypeOf(i))).length,
    });
    const byActivity = users.map(m => {
      const mine = itemsByAssignee.get(m._id) || [];
      const last = mine.length ? mine[mine.length - 1] : null;
      return {
        id: m._id,
        name: m.name,
        lastAt: last?.updatedAt || '',
        open: mine.filter(i => !isClosedItem(i, workTypeOf(i))).length,
        done: mine.filter(i => isClosedItem(i, workTypeOf(i))).length,
      };
    }).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
    list.push(...byActivity.filter(c => c.name.toLowerCase().includes(query.toLowerCase())));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, users, query]);

  const activeConversation = conversations.find(c => c.id === activeId);
  const activeTasks = activeId ? (itemsByAssignee.get(activeId) || []) : [];

  useEffect(() => {
    if (!activeId && conversations.length && !loading) {
      const first = conversations.find(c => c.id === user?._id) || conversations[0];
      setActiveId(first.id);
      setSearchParams({ person: first.id }, { replace: true });
    }
  }, [conversations, activeId, loading, user, setSearchParams]);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [activeId, activeTasks.length, reloading]);

  function selectPerson(id: string) {
    setActiveId(id);
    setSearchParams({ person: id }, { replace: true });
    setSuccess('');
  }

  function draftAssigneeId() {
    return draftAssignee || (activeId !== 'unassigned' ? activeId : '');
  }

  async function sendTask(e?: React.FormEvent) {
    e?.preventDefault();
    const lines = draft.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setSending(true);
    setError('');
    setSuccess('');
    try {
      const type = draftType || workTypes[0]?.key;
      if (!type) { setError('No work area available.'); return; }
      const assignee = draftAssigneeId();
      if (lines.length === 1) {
        await workApi.create(type, {
          title: lines[0],
          priority: draftPriority,
          deadline: draftDeadline || undefined,
          ...(assignee ? { assignedTo: assignee } : {}),
        });
      } else {
        await workApi.bulkCreate(type, {
          titles: lines.join('\n'),
          priority: draftPriority,
          deadline: draftDeadline || undefined,
          ...(assignee ? { assignedTo: assignee } : {}),
        });
      }
      setSuccess(lines.length === 1 ? 'Task sent.' : `${lines.length} tasks sent.`);
      setDraft('');
      setDraftDeadline('');
      setDraftAssignee('');
      await loadCenter();
    } catch (err: any) {
      setError(err.message || 'Could not send task');
    } finally {
      setSending(false);
    }
  }

  async function toggleComplete(item: WorkItem) {
    const wt = workTypeOf(item);
    const type = wt?.key || 'task';
    setError(''); setSuccess('');
    try {
      if (isClosedItem(item, wt)) {
        const firstOpen = wt?.statuses?.find(s => !s.isTerminalWon && !s.isTerminalLost)?.key;
        await workApi.updateStatus(type, item._id, firstOpen || (wt?.statuses?.[0]?.key || 'pending'));
        setSuccess('Reopened.');
      } else {
        const won = wt?.statuses?.find(s => s.isTerminalWon)?.key || (wt?.statuses?.length ? wt.statuses[wt.statuses.length - 1].key : 'completed');
        await workApi.updateStatus(type, item._id, won);
        setSuccess('Completed.');
      }
      await loadCenter();
    } catch (err: any) {
      setError(err.message || 'Could not update status');
    }
  }

  async function forward(item: WorkItem, toUser: string) {
    const type = workTypeOf(item)?.key || 'task';
    setError(''); setSuccess('');
    try {
      await workApi.delegate(type, item._id, { toUser, note: `Forwarded via team chat.` });
      setSuccess(`Forwarded to ${users.find(u => u._id === toUser)?.name || 'teammate'}.`);
      setForwardItem(null);
      await loadCenter();
    } catch (err: any) {
      setError(err.message || 'Could not forward task');
    }
  }

  const recipients = users.filter(u => String(u._id) !== String(user?._id));

  const areaOptions = useMemo(
    () => workTypes.filter(t => `${t.name} ${t.key}`.toLowerCase().includes(cmdFilter)),
    [workTypes, cmdFilter]
  );
  const assigneeOptions = users.filter(u => u.name.toLowerCase().includes(cmdFilter));
  const effAssignee = draftAssignee || (activeId !== 'unassigned' ? activeId : '');
  const effAssigneeName = users.find(u => u._id === effAssignee)?.name || '';
  const draftWorkType = workTypes.find(t => t.key === draftType);

  function handleDraft(text: string) {
    if (cmd === null && text === '/') {
      setCmd('area'); setCmdFilter(''); setCmdIndex(0); return;
    }
    if (cmd === null && text.length > 1 && /(^|[^\d@])/.test(text.slice(-2, -1)) && text.endsWith('/') && !text.endsWith('//')) {
      setDraft(text.replace(/\/$/, ''));
      setCmd('assignee'); setCmdFilter(''); setCmdIndex(0); return;
    }
    if (cmd === 'area') {
      setDraft(text);
      setCmdFilter(text.replace(/^\//, '').toLowerCase());
      setCmdIndex(0);
      return;
    }
    if (cmd === 'assignee') {
      setCmd(null);
      setDraft(text);
      return;
    }
    setDraft(text);
  }

  function selectCmd(overrideIndex?: number) {
    const index = typeof overrideIndex === 'number' ? overrideIndex : cmdIndex;
    if (cmd === 'area') {
      const opt = areaOptions[Math.min(index, areaOptions.length - 1)];
      if (opt) {
        setDraftType(opt.key);
        setDraft('');
        setCmd(null); setCmdFilter(''); setCmdIndex(0);
      }
    } else if (cmd === 'assignee') {
      const opt = assigneeOptions[Math.min(index, assigneeOptions.length - 1)];
      if (opt) {
        setDraftAssignee(opt._id);
        setCmd(null); setCmdFilter(''); setCmdIndex(0);
      }
    }
  }

  function onDraftKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (cmd) {
      const options = cmd === 'area' ? areaOptions : assigneeOptions;
      if (e.key === 'ArrowDown') { e.preventDefault(); setCmdIndex(i => Math.min(i + 1, options.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCmdIndex(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); selectCmd(); }
      else if (e.key === 'Escape') { e.preventDefault(); setCmd(null); }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTask(); }
  }

  async function addSubtask(parent: WorkItem) {
    const type = workTypeOf(parent)?.key || 'task';
    if (!subTitle.trim()) return;
    setError(''); setSuccess('');
    try {
      await workApi.createSubtask(type, parent._id, {
        title: subTitle.trim(),
        ...(String(parent.assignedTo?._id || '') ? { assignedTo: String(parent.assignedTo!._id) } : {}),
      });
      setSubTitle(''); setSubOpen(null);
      setSuccess('Subtask added under "' + parent.title + '".');
      await loadCenter();
    } catch (err: any) {
      setError(err.message || 'Could not add subtask');
    }
  }

  return (
    <div className="page-container">
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0 }}>Team Chat <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 700 }}>— task threads like messages</span></h1>
            <p className="page-subtitle">Pick a teammate, type a task, hit send. They finish it or hand it off down the team.</p>
          </div>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button className="btn small outline" onClick={() => { setError(''); setSuccess(''); loadCenter(); }} disabled={reloading}>{reloading ? 'Refreshing…' : '↻ Refresh'}</button>
            <Link className="btn small" to="/work">Open Work Center</Link>
          </div>
        </div>

        {(error) && <div className="auth-error" style={{ marginBottom: '.6rem' }}>{error}</div>}
        {(success) && <div className="import-result" style={{ borderLeftColor: 'var(--green)', marginBottom: '.6rem' }}><div className="import-result-title"><strong>{success}</strong></div></div>}

        {loading ? (
          <div className="loading" style={{ padding: '3rem' }}>Loading team chat…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)', gap: 0, border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--panel)', height: 'calc(100vh - 210px)', boxShadow: '0 10px 34px rgba(0,0,0,0.08)' }}>
            {/* ---------- Left rail: conversations ---------- */}
            <aside style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface, #fff)' }}>
              <div style={{ padding: '.85rem .9rem', borderBottom: '1px solid var(--border)' }}>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search teammates…"
                  aria-label="Search teammates"
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 999, padding: '.45rem .8rem', fontSize: '.8rem', background: 'var(--bg, #f8f9fc)', color: 'var(--text)' }}
                />
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {conversations.length === 0 && <p style={{ padding: '1.2rem', fontSize: '.78rem', color: 'var(--muted)' }}>No teammates with tasks yet. Create one below.</p>}
                {conversations.map(c => {
                  const isActive = c.id === activeId;
                  const member = users.find(u => u._id === c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => selectPerson(c.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '.7rem', width: '100%', padding: '.7rem .9rem', cursor: 'pointer',
                        textAlign: 'left', border: 'none', background: isActive ? 'var(--gold-dim, #fff6d6)' : 'transparent',
                        borderBottom: '1px solid var(--border)', color: 'var(--text)', position: 'relative',
                      }}
                    >
                      <span style={{ width: 40, height: 40, minWidth: 40, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.8rem', color: '#fff', background: c.id === 'unassigned' ? 'var(--muted)' : avatarColor(c.id) }}>
                        {c.id === 'unassigned' ? '?' : initialsOf(c.name)}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.4rem' }}>
                          <strong style={{ fontSize: '.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</strong>
                          <small style={{ fontSize: '.62rem', color: 'var(--muted)', flexShrink: 0 }}>{timeLabel(c.lastAt)}</small>
                        </span>
                        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.4rem' }}>
                          <small style={{ fontSize: '.7rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.open || c.done
                              ? <span>{c.open} pending · {c.done} done</span>
                              : 'no tasks'}
                          </small>
                          {c.open > 0 && <span style={{ background: 'var(--gold)', color: 'var(--accent-text, #111)', borderRadius: 999, minWidth: 18, height: 18, padding: '0 5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.62rem', fontWeight: 800, flexShrink: 0 }}>{c.open}</span>}
                        </span>
                      </span>
                      {member && isActive && <span style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 34, background: 'var(--gold)', borderRadius: 2 }} />}
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* ---------- Right pane: chat ---------- */}
            <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg, #eef1f6)' }}>
              {activeConversation ? (
                <>
                  <header style={{ display: 'flex', alignItems: 'center', gap: '.7rem', padding: '.7rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
                    <span style={{ width: 38, height: 38, minWidth: 38, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.78rem', color: '#fff', background: activeConversation.id === 'unassigned' ? 'var(--muted)' : avatarColor(activeConversation.id) }}>
                      {activeConversation.id === 'unassigned' ? '?' : initialsOf(activeConversation.name)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ color: 'var(--text)', fontSize: '.9rem' }}>{activeConversation.name}</strong>
                      <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>
                        {activeConversation.open > 0 ? `${activeConversation.open} pending · ${activeConversation.done} done` : `${activeConversation.done} done · all clear`}
                      </div>
                    </div>
                    {activeId === 'unassigned' && (
                      <select value={draftAssignee} onChange={e => setDraftAssignee(e.target.value)} aria-label="Assign to" style={{ fontSize: '.75rem', padding: '.3rem .5rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}>
                        <option value="">Assign who…</option>
                        {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                      </select>
                    )}
                  </header>

                  {/* messages */}
                  <div ref={scrollerRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                    {activeTasks.length === 0 && (
                      <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--muted)' }}>
                        <Icon name="send" size={26} style={{ opacity: .5 }} />
                        <p style={{ fontSize: '.82rem', marginTop: '.4rem' }}>No tasks here yet. Type one below and press Enter.</p>
                      </div>
                    )}
                    {activeTasks.map((item, idx) => {
                      const wt = workTypeOf(item);
                      const prev = idx > 0 ? activeTasks[idx - 1] : null;
                      const showDay = !prev || daySeparator(prev.createdAt) !== daySeparator(item.createdAt);
                      const closed = isClosedItem(item, wt);
                      const statusMeta = wt?.statuses?.find(s => s.key === item.status);
                      const overdue = !closed && item.deadline && new Date(item.deadline).getTime() < Date.now();
                      const hops = (item.workflowHistory || []).filter(ev => ev.event === 'forwarded' || ev.event === 'assigned');
                      const subs = subtasksByParent.get(item._id) || [];
                      return (
                        <div key={item._id}>
                          {showDay && <div style={{ textAlign: 'center', margin: '.3rem 0' }}><span style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px' }}>{daySeparator(item.createdAt)}</span></div>}
                          <article
                            style={{
                              maxWidth: '78%',
                              background: closed ? 'color-mix(in srgb, var(--panel) 80%, var(--muted))' : 'var(--panel)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px 14px 14px 14px',
                              padding: '.65rem .8rem',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                              opacity: closed ? .62 : 1,
                            }}
                          >
                            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.3rem' }}>
                              {wt && <span className="pill" style={{ fontSize: '.6rem', borderColor: wt.color || 'var(--border)' }}>{wt.name}</span>}
                              <span style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'capitalize', color: closed ? 'var(--muted)' : item.priority === 'high' ? 'var(--red)' : item.priority === 'low' ? 'var(--muted)' : 'var(--gold)' }}>{closed ? '✓ done' : item.priority}</span>
                              {overdue && <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--red)', border: '1px solid rgba(220,38,38,.3)', borderRadius: 999, padding: '1px 7px' }}>overdue</span>}
                              {item.deadline && !closed && !overdue && (
                                <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 7px' }}>
                                  due {new Date(item.deadline).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                              <span style={{ marginLeft: 'auto', fontSize: '.6rem', color: 'var(--muted)' }}>{timeLabel(item.createdAt)}</span>
                            </div>

                            <Link to={`/work/${wt?.key || 'task'}/${item._id}`} style={{ fontSize: '.86rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none', display: 'block' }}>{item.title}</Link>
                            {item.customer && <small style={{ color: 'var(--muted)', fontSize: '.7rem' }}>For {((item.customer as any).name) || 'business'}</small>}

                            {subs.length > 0 && (
                              <div style={{ marginTop: '.45rem', display: 'grid', gap: '.3rem', padding: '.45rem .55rem', border: '1px dashed var(--border)', borderRadius: 9, background: 'color-mix(in srgb, var(--panel) 75%, var(--bg))' }}>
                                <small style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Sub-tasks · {subs.filter(s => isClosedItem(s, wt)).length}/{subs.length} done</small>
                                {subs.map(sub => {
                                  const sc = isClosedItem(sub, wt);
                                  return (
                                    <div key={sub._id} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.7rem' }}>
                                      <button type="button" title={sc ? 'Reopen' : 'Mark done'} onClick={() => toggleComplete(sub)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: sc ? 'var(--green)' : 'var(--muted)', display: 'inline-flex' }}>
                                        <Icon name={sc ? 'check-circle' : 'circle'} size={13} aria-hidden />
                                      </button>
                                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: sc ? 'line-through' : 'none', color: sc ? 'var(--muted)' : 'var(--text)' }}>{sub.title}</span>
                                    </div>
                                  );
                                })}
                                {subOpen === item._id && (
                                  <div style={{ display: 'flex', gap: '.35rem' }}>
                                    <input autoFocus value={subTitle} onChange={e => setSubTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(item); } }} placeholder="Sub-task title" style={{ flex: 1, minWidth: 0, fontSize: '.7rem', padding: '.3rem .5rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg,#fff)', color: 'var(--text)' }} />
                                    <button className="btn small" onClick={() => addSubtask(item)} style={{ fontSize: '.66rem', padding: '3px 9px' }}>Add</button>
                                  </div>
                                )}
                              </div>
                            )}

                            {hops.length > 0 && (() => {
                              const chain: string[] = [];
                              hops.forEach((ev, i) => {
                                const from = ev.fromUser?.name || (i === 0 ? 'You' : '');
                                if (from && chain[chain.length - 1] !== from) chain.push(from);
                                const to = ev.toUser?.name || '';
                                if (to && chain[chain.length - 1] !== to) chain.push(to);
                              });
                              return (
                                <div style={{ marginTop: '.4rem', fontSize: '.62rem', color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: '.2rem', alignItems: 'center' }}>
                                  <Icon name="forward" size={11} aria-hidden /> Handed off:{' '}
                                  {chain.map((name, i) => (
                                    <span key={i} style={{ fontWeight: i === chain.length - 1 ? 800 : 700, color: i === chain.length - 1 ? 'var(--gold)' : 'inherit' }}>{i > 0 && ' → '}{name}</span>
                                  ))}
                                </div>
                              );
                            })()}

                            <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
                              {!closed ? (
                                <button className="btn small" onClick={() => toggleComplete(item)} title="Mark complete" style={{ fontSize: '.68rem', padding: '3px 9px' }}>
                                  <Icon name="check" size={12} aria-hidden /> Done
                                </button>
                              ) : (
                                <button className="btn small outline" onClick={() => toggleComplete(item)} title="Reopen" style={{ fontSize: '.68rem', padding: '3px 9px' }}>
                                  <Icon name="rotate-ccw" size={12} aria-hidden /> Reopen
                                </button>
                              )}
<button className="btn small outline" onClick={() => setForwardItem(forwardItem === item._id ? null : item._id)} title="Forward to teammate" style={{ fontSize: '.68rem', padding: '3px 9px' }}>
                                  <Icon name="forward" size={12} aria-hidden /> Forward
                                </button>
                              <button className="btn small outline" onClick={() => { setSubOpen(subOpen === item._id ? null : item._id); setSubTitle(''); }} title="Add a sub-task" style={{ fontSize: '.68rem', padding: '3px 9px' }}>
                                <Icon name="list-checks" size={12} aria-hidden /> Sub-task
                              </button>
                              {statusMeta && <span style={{ fontSize: '.62rem', color: 'var(--muted)', alignSelf: 'center' }}>{statusMeta.label}</span>}
                            </div>

                            {forwardItem === item._id && (
                              <div style={{ marginTop: '.5rem', paddingTop: '.5rem', borderTop: '1px dashed var(--border)', display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
                                <small style={{ width: '100%', fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Hand this task to…</small>
                                {recipients.length === 0 && <small style={{ fontSize: '.7rem', color: 'var(--muted)' }}>No other teammates available.</small>}
                                {recipients.map(u => (
                                  <button key={u._id} className="btn small outline" style={{ fontSize: '.66rem', padding: '2px 8px' }} onClick={() => forward(item, u._id)}>
                                    <Icon name="forward" size={11} aria-hidden /> {u.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </article>
                        </div>
                      );
                    })}
                  </div>

                  {/* composer */}
                  <form onSubmit={sendTask} style={{ background: 'var(--panel)', borderTop: '1px solid var(--border)', padding: '.7rem .9rem' }}>
                    {error && <div style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: '.4rem' }}>{error}</div>}
                    <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <select value={draftType} onChange={e => setDraftType(e.target.value)} aria-label="Work area" style={{ fontSize: '.75rem', padding: '.32rem .5rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}>
                        {workTypes.map(t => <option key={t._id} value={t.key}>{t.name}</option>)}
                      </select>
                      {(['low', 'medium', 'high'] as const).map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setDraftPriority(p)}
                          aria-pressed={draftPriority === p}
                          className="btn small"
                          style={{ fontSize: '.66rem', padding: '3px 9px', textTransform: 'capitalize', background: draftPriority === p ? 'var(--gold)' : 'transparent', color: draftPriority === p ? 'var(--accent-text,#111)' : 'var(--text)', border: '1px solid var(--border)' }}
                        >{p}</button>
                      ))}
                      <DatePicker value={draftDeadline} onChange={setDraftDeadline} placeholder="Deadline" style={{ fontSize: '.75rem' }} aria-label="Deadline" />
                      {draftDeadline && <button type="button" className="btn small outline" onClick={() => setDraftDeadline('')} style={{ fontSize: '.66rem', padding: '3px 8px' }}>✕</button>}
                    </div>
                    <div style={{ position: 'relative', display: 'flex', gap: '.5rem', alignItems: 'flex-end' }}>
                      {cmd && (
                        <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 20, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', boxShadow: '0 12px 34px rgba(0,0,0,.18)' }}>
                          <div style={{ padding: '.45rem .8rem .3rem', fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            {cmd === 'area' ? 'Create task in…' : 'Assign to whom?'}
                          </div>
                          <div style={{ maxHeight: 250, overflowY: 'auto', paddingBottom: '.3rem' }}>
                            {(cmd === 'area' ? areaOptions : assigneeOptions).map((opt, i) => {
                              const isArea = cmd === 'area';
                              return (
                                <button
                                  key={isArea ? (opt as WorkType)._id : (opt as Member)._id}
                                  type="button"
                                  onClick={() => { setCmdIndex(i); selectCmd(i); }}
                                  onMouseEnter={() => setCmdIndex(i)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '.55rem', width: '100%', padding: '.5rem .8rem',
                                    textAlign: 'left', border: 'none', background: i === cmdIndex ? 'color-mix(in srgb, var(--gold) 12%, var(--panel))' : 'transparent',
                                    color: 'var(--text)', cursor: 'pointer',
                                  }}
                                >
                                  {isArea ? (
                                    <>
                                      <span style={{ width: 10, height: 10, minWidth: 10, borderRadius: '50%', background: (opt as any).color }} />
                                      <b style={{ fontSize: '.8rem' }}>{(opt as WorkType).name}</b>
                                      <small style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: '.64rem' }}>/{(opt as WorkType).key}</small>
                                    </>
                                  ) : (
                                    <>
                                      <span style={{ width: 24, height: 24, minWidth: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '.6rem', background: avatarColor((opt as Member)._id) }}>
                                        {initialsOf((opt as Member).name)}
                                      </span>
                                      <b style={{ fontSize: '.8rem' }}>{(opt as Member).name}</b>
                                    </>
                                  )}
                                </button>
                              );
                            })}
                            {cmd === 'area' && areaOptions.length === 0 && (
                              <div style={{ padding: '.6rem .8rem', fontSize: '.72rem', color: 'var(--muted)' }}>No work area matches "{cmdFilter}". <button type="button" className="btn small outline" style={{ marginLeft: '.3rem', padding: '1px 8px' }} onClick={() => setCmd(null)}>Type instead</button></div>
                            )}
                          </div>
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {(draftWorkType || effAssigneeName) ? (
                          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginBottom: '.35rem' }}>
                            {draftWorkType && <span className="pill" style={{ fontSize: '.62rem', borderColor: draftWorkType.color || 'var(--border)' }}>{draftWorkType.name}</span>}
                            {effAssigneeName && <span className="pill" style={{ fontSize: '.62rem' }}>→ {effAssigneeName}</span>}
                          </div>
                        ) : null}
                        <textarea
                          value={draft}
                          onChange={e => handleDraft(e.target.value)}
                          onKeyDown={onDraftKeyDown}
                          rows={draft.split('\n').length > 1 ? 3 : 1}
                          placeholder={cmd === 'area' ? 'Search work area… (Enter to pick)' : cmd === 'assignee' ? 'Pick who it’s for…' : `Type a task for ${activeConversation.name}…  (/ to pick area, / again for owner)`}
                          aria-label="New task"
                          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '.55rem .8rem', fontSize: '.85rem', resize: 'none', background: 'var(--bg,#fff)', color: 'var(--text)', fontFamily: 'inherit' }}
                        />
                      </div>
                      <button className="btn primary" type="submit" disabled={sending || !draft.trim() || !!cmd} style={{ height: 38, display: 'inline-flex', alignItems: 'center', gap: '.35rem', whiteSpace: 'nowrap' }}>
                        <Icon name="send" size={14} aria-hidden /> {sending ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                    {cmd === null && (
                      <small style={{ display: 'block', marginTop: '.4rem', fontSize: '.66rem', color: 'var(--muted)' }}>
                        Tip: type <b>/</b> to choose a work area, then <b>/</b> again to pick who it’s for. Enter sends, Shift+Enter for a new line.
                      </small>
                    )}
                    {draft.split('\n').filter(l => l.trim()).length > 1 && (
                      <small style={{ display: 'block', marginTop: '.35rem', fontSize: '.66rem', color: 'var(--teal)' }}>Multiple lines detected → {draft.split('\n').filter(l => l.trim()).length} tasks will be created at once.</small>
                    )}
                  </form>
                </>
              ) : (
                <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--muted)' }}>
                  <Icon name="mail" size={26} style={{ opacity: .5 }} />
                  <p style={{ fontSize: '.85rem' }}>Pick a teammate on the left to start.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}