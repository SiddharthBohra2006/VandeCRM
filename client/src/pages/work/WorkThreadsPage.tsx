import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { workApi, WorkType, WorkItem } from '../../api/work';
import { useAuth } from '../../contexts/AuthContext';
import { isWorkItemClosed } from '../../utils/workStatus';
import DatePicker from '../../components/DatePicker';
import Icon from '../../components/Icons';
import CustomSelect from '../../components/CustomSelect';

interface Member { _id: string; name: string; email?: string }

const AVATAR_COLORS = ['#b45309', '#0f766e', '#475569', '#9a3412', '#4338ca', '#0369a1', '#701a75', '#3f6212', '#57534e', '#854d0e'];
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const avatarColor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const isClosedItem = (item: WorkItem, workType: WorkType | undefined) => isWorkItemClosed(item, workType);
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
  const currentView = searchParams.get('view') || '';
  const currentOwner = searchParams.get('owner') || '';
  const currentModule = searchParams.get('module') || '';

  // Right pane tab: 'chat' or 'history'
  const [paneTab, setPaneTab] = useState<'chat' | 'history'>('chat');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'pending' | 'done' | 'overdue' | 'handoff'>('all');
  const [historyQuery, setHistoryQuery] = useState('');

  const [draft, setDraft] = useState('');
  const [draftType, setDraftType] = useState('');
  const [draftPriority, setDraftPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [draftDeadline, setDraftDeadline] = useState('');
  const [draftAssignee, setDraftAssignee] = useState('');
  const [sending, setSending] = useState(false);
  const [forwardItem, setForwardItem] = useState<string | null>(null);

  // Bulk Multi-Task Creation state
  const [composerMode, setComposerMode] = useState<'single' | 'bulk'>('single');
  const [bulkText, setBulkText] = useState('');
  const [bulkCleanBullets, setBulkCleanBullets] = useState(true);

  const [cmd, setCmd] = useState<'area' | 'assignee' | null>(null);
  const [cmdFilter, setCmdFilter] = useState('');
  const [cmdIndex, setCmdIndex] = useState(0);

  const [subOpen, setSubOpen] = useState<string | null>(null);
  const [subTitle, setSubTitle] = useState('');
  const [subAssignee, setSubAssignee] = useState('');

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

  const filteredItems = useMemo(() => {
    let list = items;
    const isClosed = (item: WorkItem) => isClosedItem(item, workTypeOf(item));
    if (currentModule) {
      list = list.filter(item => item.workType?.key === currentModule || item.workType?._id === currentModule);
    }
    if (currentOwner === 'me' && user) {
      list = list.filter(item => {
        const isAssigned = item.assignedTo && String(item.assignedTo._id || item.assignedTo) === String(user._id);
        const isSecondary = item.secondaryAssignee && String(item.secondaryAssignee._id || item.secondaryAssignee) === String(user._id);
        const isCollab = (item.collaborators || []).some(c => String(c._id || c) === String(user._id));
        return isAssigned || isSecondary || isCollab;
      });
    }
    if (currentView === 'open') {
      list = list.filter(item => !isClosed(item));
    } else if (currentView === 'completed') {
      list = list.filter(item => isClosed(item));
    } else if (currentView === 'today' || currentView === 'overdue') {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      const cutoff = currentView === 'overdue' ? now : tomorrow;
      list = list.filter(item => !isClosed(item) && item.deadline && new Date(item.deadline) < cutoff);
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, currentView, currentOwner, currentModule, user, workTypes]);

  const itemsByAssignee = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    for (const item of filteredItems) {
      if (item.parentRecord) continue;
      const key = String(item.assignedTo?._id || item.assignedTo || '') || 'unassigned';
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    map.forEach(list => list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    return map;
  }, [filteredItems]);

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
  }, [itemsByAssignee, users, query]);

  const activeConversation = useMemo(() => {
    if (!activeId) return conversations[0] || null;
    const found = conversations.find(c => c.id === activeId);
    if (found) return found;
    const userObj = users.find(u => u._id === activeId);
    if (userObj) return { id: userObj._id, name: userObj.name, lastAt: '', open: 0, done: 0 };
    if (activeId === 'unassigned') return { id: 'unassigned', name: 'Unassigned', lastAt: '', open: 0, done: 0 };
    return conversations[0] || null;
  }, [conversations, activeId, users]);

  const currentActiveId = activeConversation?.id || activeId;
  const activeTasks = currentActiveId ? (itemsByAssignee.get(currentActiveId) || []) : [];

  // All historical tasks for this person across the system
  const personAllTasks = useMemo(() => {
    if (!currentActiveId) return [];
    return items.filter(item => {
      if (currentActiveId === 'unassigned') {
        return !item.assignedTo;
      }
      const isAssigned = item.assignedTo && String(item.assignedTo._id || item.assignedTo) === currentActiveId;
      const isSecondary = item.secondaryAssignee && String(item.secondaryAssignee._id || item.secondaryAssignee) === currentActiveId;
      const isCollab = (item.collaborators || []).some(c => String(c._id || c) === currentActiveId);
      const isCreator = item.createdBy && String(item.createdBy._id || item.createdBy) === currentActiveId;
      const isInHops = (item.workflowHistory || []).some(ev =>
        String(ev.fromUser?._id || ev.fromUser) === currentActiveId ||
        String(ev.toUser?._id || ev.toUser) === currentActiveId ||
        String(ev.actor?._id || ev.actor) === currentActiveId
      );
      return isAssigned || isSecondary || isCollab || isCreator || isInHops;
    }).sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  }, [items, currentActiveId]);

  const personHistoryFiltered = useMemo(() => {
    let list = personAllTasks;
    const isClosed = (item: WorkItem) => isClosedItem(item, workTypeOf(item));
    if (historyFilter === 'pending') list = list.filter(i => !isClosed(i));
    if (historyFilter === 'done') list = list.filter(i => isClosed(i));
    if (historyFilter === 'overdue') list = list.filter(i => !isClosed(i) && i.deadline && new Date(i.deadline) < new Date());
    if (historyFilter === 'handoff') list = list.filter(i => (i.workflowHistory || []).some(ev => ev.event === 'forwarded' || ev.event === 'assigned'));
    if (historyQuery.trim()) {
      const q = historyQuery.toLowerCase();
      list = list.filter(i => i.title.toLowerCase().includes(q) || workTypeOf(i)?.name?.toLowerCase().includes(q));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personAllTasks, historyFilter, historyQuery, workTypes]);

  const personStats = useMemo(() => {
    const total = personAllTasks.length;
    const done = personAllTasks.filter(i => isClosedItem(i, workTypeOf(i))).length;
    const pending = total - done;
    const overdue = personAllTasks.filter(i => !isClosedItem(i, workTypeOf(i)) && i.deadline && new Date(i.deadline) < new Date()).length;
    const handoffs = personAllTasks.filter(i => (i.workflowHistory || []).some(ev => ev.event === 'forwarded' || ev.event === 'assigned')).length;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pending, overdue, handoffs, rate };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personAllTasks, workTypes]);

  useEffect(() => {
    if (!activeId && conversations.length && !loading) {
      const first = conversations.find(c => c.id === user?._id) || conversations[0];
      setActiveId(first.id);
      setSearchParams({ person: first.id }, { replace: true });
    }
  }, [conversations, activeId, loading, user, setSearchParams]);

  useEffect(() => {
    if (scrollerRef.current && paneTab === 'chat') {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [currentActiveId, activeTasks.length, reloading, paneTab]);

  function selectPerson(id: string) {
    setActiveId(id);
    setSearchParams({ person: id }, { replace: true });
    setSuccess('');
    setError('');
  }

  function draftAssigneeId() {
    return draftAssignee || (currentActiveId !== 'unassigned' ? currentActiveId : '');
  }

  async function sendTask(e?: React.FormEvent) {
    e?.preventDefault();
    const cleanDraft = draft.trim();
    const lines = cleanDraft.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setSending(true);
    setError('');
    setSuccess('');
    try {
      let type = draftType || (workTypes[0]?.key || 'task');
      const matchingType = workTypes.find(t => t.key === type || t._id === type);
      const targetKey = matchingType?.key || type || 'task';
      const assignee = draftAssigneeId();

      if (lines.length === 1) {
        await workApi.create(targetKey, {
          title: lines[0],
          priority: draftPriority,
          deadline: draftDeadline || undefined,
          ...(assignee ? { assignedTo: assignee } : {}),
        });
      } else {
        await workApi.bulkCreate(targetKey, {
          titles: lines.join('\n'),
          priority: draftPriority,
          deadline: draftDeadline || undefined,
          ...(assignee ? { assignedTo: assignee } : {}),
        });
      }
      setSuccess(lines.length === 1 ? 'Task created.' : `${lines.length} tasks created.`);
      setDraft('');
      setDraftDeadline('');
      setDraftAssignee('');
      setCmd(null);
      await loadCenter();
    } catch (err: any) {
      setError(err.message || 'Could not send task. Please verify your permissions and active workspace.');
    } finally {
      setSending(false);
    }
  }

  // Parse lines for bulk mode with optional bullet stripping
  const bulkTaskTitles = useMemo(() => {
    if (!bulkText.trim()) return [];
    return bulkText
      .split(/\r?\n/)
      .map(line => {
        let t = line.trim();
        if (bulkCleanBullets) {
          // Strip leading numbered list format like "1.", "1)", "(1)", bullets "-", "*", "•", "–"
          t = t.replace(/^(\d+[\.\)]|\(\d+\)|[-*•–—►>])\s*/, '').trim();
        }
        return t;
      })
      .filter(Boolean);
  }, [bulkText, bulkCleanBullets]);

  async function handleBulkCreate(e?: React.FormEvent) {
    e?.preventDefault();
    if (bulkTaskTitles.length === 0) return;
    setSending(true);
    setError('');
    setSuccess('');
    try {
      let type = draftType || (workTypes[0]?.key || 'task');
      const matchingType = workTypes.find(t => t.key === type || t._id === type);
      const targetKey = matchingType?.key || type || 'task';
      const assignee = draftAssigneeId();

      await workApi.bulkCreate(targetKey, {
        titles: bulkTaskTitles.join('\n'),
        priority: draftPriority,
        deadline: draftDeadline || undefined,
        ...(assignee ? { assignedTo: assignee } : {}),
      });

      const targetUserName = users.find(u => u._id === assignee)?.name || (currentActiveId === 'unassigned' ? 'Unassigned' : activeConversation?.name) || 'team member';
      setSuccess(`🎉 Successfully created ${bulkTaskTitles.length} tasks for ${targetUserName}!`);
      setBulkText('');
      setDraftDeadline('');
      await loadCenter();
    } catch (err: any) {
      setError(err.message || 'Could not create batch tasks. Please verify your permissions.');
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
  const effAssignee = draftAssignee || (currentActiveId !== 'unassigned' ? currentActiveId : '');
  const effAssigneeName = users.find(u => u._id === effAssignee)?.name || '';
  const draftWorkType = workTypes.find(t => t.key === draftType || t._id === draftType);

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
      else if (e.key === 'Enter') {
        if (options.length > 0) {
          e.preventDefault();
          selectCmd();
        } else {
          setCmd(null);
        }
      }
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
      const parentAssigneeId = typeof parent.assignedTo === 'string' ? parent.assignedTo : parent.assignedTo?._id;
      const targetAssignee = subAssignee || (parentAssigneeId ? String(parentAssigneeId) : null);
      await workApi.createSubtask(type, parent._id, {
        title: subTitle.trim(),
        ...(targetAssignee ? { assignedTo: targetAssignee } : {}),
      });
      setSubTitle('');
      setSubAssignee('');
      setSubOpen(null);
      setSuccess(`Subtask added under "${parent.title}".`);
      await loadCenter();
    } catch (err: any) {
      setError(err.message || 'Could not add subtask');
    }
  }

  // Component to render a full task card (shared by chat thread & history)
  function renderTaskCard(item: WorkItem, isChatMode = true) {
    const wt = workTypeOf(item);
    const closed = isClosedItem(item, wt);
    const statusMeta = wt?.statuses?.find(s => s.key === item.status);
    const overdue = !closed && item.deadline && new Date(item.deadline).getTime() < Date.now();
    const hops = (item.workflowHistory || []).filter(ev => ev.event === 'forwarded' || ev.event === 'assigned');
    const subs = subtasksByParent.get(item._id) || [];
    const parent = typeof item.parentRecord === 'object' && item.parentRecord ? item.parentRecord : null;

    return (
      <article
        key={item._id}
        style={{
          maxWidth: isChatMode ? '84%' : '100%',
          background: closed ? 'color-mix(in srgb, var(--panel) 82%, var(--muted))' : 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: isChatMode ? '4px 14px 14px 14px' : 12,
          padding: '.75rem .9rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          opacity: closed ? .7 : 1,
        }}
      >
        {/* Parent chain indicator if this item is itself a subtask */}
        {parent && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', padding: '2px 8px', borderRadius: 6, background: 'color-mix(in srgb, var(--gold) 15%, var(--panel))', border: '1px solid var(--border)', fontSize: '.64rem', color: 'var(--text)', marginBottom: '.4rem' }}>
            <Icon name="link" size={11} />
            <span>Subtask of: <strong>{parent.title || 'Parent Task'}</strong></span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.35rem' }}>
          {wt && <span className="pill" style={{ fontSize: '.62rem', borderColor: wt.color || 'var(--border)', color: wt.color || 'var(--text)', fontWeight: 700 }}>{wt.name}</span>}
          <span style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'capitalize', color: closed ? 'var(--muted)' : item.priority === 'high' ? 'var(--red)' : item.priority === 'low' ? 'var(--muted)' : 'var(--gold)' }}>
            {closed ? '✓ done' : `${item.priority} priority`}
          </span>
          {overdue && <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--red)', border: '1px solid rgba(220,38,38,.3)', borderRadius: 999, padding: '1px 7px', background: 'rgba(220,38,38,.06)' }}>overdue</span>}
          {item.deadline && !closed && !overdue && (
            <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 7px' }}>
              due {new Date(item.deadline).toLocaleDateString([], { day: 'numeric', month: 'short' })}
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: '.62rem', color: 'var(--muted)' }}>{timeLabel(item.createdAt)}</span>
        </div>

        <Link to={`/work/${wt?.key || 'task'}/${item._id}`} style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none', display: 'block', marginBottom: '.25rem' }}>
          {item.title}
        </Link>
        {item.customer && <small style={{ color: 'var(--muted)', fontSize: '.7rem', display: 'block' }}>Client: {((item.customer as any).name) || 'Business'}</small>}

        {/* ----------------- SUBTASK HIERARCHY / CHAIN ----------------- */}
        {(subs.length > 0 || subOpen === item._id) && (
          <div style={{ marginTop: '.65rem', padding: '.75rem .95rem', border: '1px solid var(--border)', borderRadius: 10, background: 'color-mix(in srgb, var(--panel) 70%, var(--bg, #f4f6fb))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.45rem' }}>
              <small style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
                <Icon name="list-checks" size={13} />
                Sub-tasks Chain · {subs.filter(s => isClosedItem(s, wt)).length}/{subs.length} done
              </small>
              {subOpen !== item._id && (
                <button type="button" onClick={() => { setSubOpen(item._id); setSubTitle(''); setSubAssignee(''); }} className="btn small outline" style={{ fontSize: '.68rem', padding: '2px 9px', height: 24, fontWeight: 700 }}>
                  + Add Subtask
                </button>
              )}
            </div>

            {subs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', position: 'relative', paddingLeft: '.25rem' }}>
                {subs.map((sub, sIdx) => {
                  const sc = isClosedItem(sub, wt);
                  const isLast = sIdx === subs.length - 1 && subOpen !== item._id;
                  const rawAssignee = sub.assignedTo as any;
                  const subAssigneeObj = rawAssignee && typeof rawAssignee === 'object' && rawAssignee.name ? rawAssignee : users.find(u => u._id === String(rawAssignee?._id || rawAssignee || ''));

                  return (
                    <div key={sub._id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.76rem', position: 'relative' }}>
                      {/* Tree branch connector */}
                      <span style={{ color: 'var(--muted)', opacity: .6, fontFamily: 'monospace', fontSize: '.75rem', userSelect: 'none' }}>
                        {isLast ? '└─' : '├─'}
                      </span>
                      <button
                        type="button"
                        title={sc ? 'Reopen subtask' : 'Mark subtask done'}
                        onClick={() => toggleComplete(sub)}
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: sc ? 'var(--green)' : 'var(--muted)', display: 'inline-flex', alignItems: 'center' }}
                      >
                        <Icon name={sc ? 'check-circle' : 'circle'} size={15} aria-hidden />
                      </button>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textDecoration: sc ? 'line-through' : 'none', color: sc ? 'var(--muted)' : 'var(--text)', fontWeight: sc ? 400 : 500 }}>
                        {sub.title}
                      </span>
                      {subAssigneeObj && (
                        <span style={{ fontSize: '.62rem', padding: '2px 7px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', flexShrink: 0, fontWeight: 600 }}>
                          {subAssigneeObj.name}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Subtask Inline Composer */}
            {subOpen === item._id && (
              <div style={{ marginTop: subs.length > 0 ? '.6rem' : 0, paddingTop: subs.length > 0 ? '.6rem' : 0, borderTop: subs.length > 0 ? '1px dashed var(--border)' : 'none' }}>
                <div style={{ display: 'flex', gap: '.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    autoFocus
                    value={subTitle}
                    onChange={e => setSubTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); addSubtask(item); }
                      if (e.key === 'Escape') { setSubOpen(null); }
                    }}
                    placeholder="Sub-task title… (Enter to add)"
                    style={{ flex: '1 1 180px', minWidth: 160, fontSize: '.78rem', height: 32, padding: '0 .7rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
                  />
                  <div style={{ width: 140 }}>
                    <CustomSelect
                      value={subAssignee}
                      onChange={setSubAssignee}
                      placeholder="Assignee…"
                      variant="compact"
                      options={[
                        { value: '', label: 'Assignee…' },
                        ...users.map(u => ({ value: u._id, label: u.name })),
                      ]}
                    />
                  </div>
                  <button className="btn small primary" type="button" onClick={() => addSubtask(item)} style={{ fontSize: '.72rem', padding: '0 12px', height: 32, fontWeight: 700 }}>Add</button>
                  <button className="btn small outline" type="button" onClick={() => setSubOpen(null)} style={{ fontSize: '.72rem', padding: '0 10px', height: 32 }}>✕</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------- WORKFLOW / HANDOFF CHAIN ----------------- */}
        {hops.length > 0 && (() => {
          const chainSteps: { name: string; event: string; at?: string }[] = [];
          hops.forEach((ev, i) => {
            const from = ev.fromUser?.name || (i === 0 ? 'Creator' : '');
            if (from && (!chainSteps.length || chainSteps[chainSteps.length - 1].name !== from)) {
              chainSteps.push({ name: from, event: 'started', at: ev.at });
            }
            const to = ev.toUser?.name || '';
            if (to && (!chainSteps.length || chainSteps[chainSteps.length - 1].name !== to)) {
              chainSteps.push({ name: to, event: ev.event, at: ev.at });
            }
          });

          return (
            <div style={{ marginTop: '.45rem', padding: '.4rem .55rem', border: '1px solid var(--border)', borderRadius: 8, background: 'color-mix(in srgb, var(--panel) 85%, var(--border))', fontSize: '.64rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.3rem' }}>
                <Icon name="forward" size={11} aria-hidden />
                <span>Task Handoff Chain ({chainSteps.length} hops)</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', alignItems: 'center' }}>
                {chainSteps.map((step, sIdx) => {
                  const isCurrent = sIdx === chainSteps.length - 1;
                  return (
                    <span key={sIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem' }}>
                      {sIdx > 0 && <span style={{ color: 'var(--muted)', fontWeight: 800, fontSize: '.7rem' }}>→</span>}
                      <span
                        style={{
                          padding: '2px 7px',
                          borderRadius: 999,
                          background: isCurrent ? 'var(--gold)' : 'var(--surface)',
                          color: isCurrent ? 'var(--accent-text, #111)' : 'var(--text)',
                          fontWeight: isCurrent ? 800 : 600,
                          border: isCurrent ? 'none' : '1px solid var(--border)',
                          fontSize: '.62rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '.25rem',
                        }}
                      >
                        {step.name}
                        {isCurrent && <span style={{ fontSize: '.54rem', opacity: .8 }}>(active)</span>}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ----------------- ACTION BUTTONS ----------------- */}
        <div style={{ display: 'flex', gap: '.4rem', marginTop: '.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
          <button className="btn small outline" onClick={() => { setSubOpen(subOpen === item._id ? null : item._id); setSubTitle(''); setSubAssignee(''); }} title="Add a sub-task" style={{ fontSize: '.68rem', padding: '3px 9px' }}>
            <Icon name="list-checks" size={12} aria-hidden /> + Sub-task
          </button>
          {statusMeta && <span style={{ fontSize: '.62rem', color: 'var(--muted)', marginLeft: 'auto' }}>{statusMeta.label}</span>}
        </div>

        {/* Forward Popover */}
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
    );
  }

  return (
    <div className="page-container" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem', flexShrink: 0 }}>
          <div>
            <h1 style={{ margin: 0 }}>Team Chat <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 700 }}>— task threads & work chain</span></h1>
            <p className="page-subtitle">Collaborate in real-time, link subtask chains, hand off tasks, and inspect individual task history.</p>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <button className="btn small outline" onClick={() => { setError(''); setSuccess(''); loadCenter(); }} disabled={reloading}>{reloading ? 'Refreshing…' : '↻ Refresh'}</button>
            <div className="view-toggle-group">
              <Link to={{ pathname: '/work', search: searchParams.toString() }} className="view-toggle-btn" title="Table view">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </Link>
              <Link to={{ pathname: '/work/threads', search: searchParams.toString() }} className="view-toggle-btn active" title="Chat view">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </Link>
            </div>
          </div>
        </div>

        {error && <div className="auth-error" style={{ marginBottom: '.6rem', flexShrink: 0 }}>{error}</div>}
        {success && <div className="import-result" style={{ borderLeftColor: 'var(--green)', marginBottom: '.6rem', flexShrink: 0 }}><div className="import-result-title"><strong>{success}</strong></div></div>}

        {loading ? (
          <div className="loading" style={{ padding: '3rem' }}>Loading team chat…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '290px minmax(0,1fr)', gap: 0, border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--panel)', height: 'calc(100vh - 200px)', minHeight: 520, boxShadow: '0 10px 34px rgba(0,0,0,0.08)' }}>
            {/* ---------- Left rail: conversations ---------- */}
            <aside style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--panel)', minHeight: 0, height: '100%', overflow: 'hidden' }}>
              <div style={{ padding: '.75rem .85rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search teammates…"
                  aria-label="Search teammates"
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 999, padding: '.45rem .85rem', fontSize: '.8rem', background: 'color-mix(in srgb, var(--bg) 60%, var(--panel))', color: 'var(--text)' }}
                />
              </div>
              <div style={{ overflowY: 'auto', flex: '1 1 0', minHeight: 0 }}>
                {conversations.length === 0 && <p style={{ padding: '1.2rem', fontSize: '.78rem', color: 'var(--muted)' }}>No teammates with tasks yet. Type below to start.</p>}
                {conversations.map(c => {
                  const isActive = c.id === currentActiveId;
                  const member = users.find(u => u._id === c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => selectPerson(c.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '.75rem', width: '100%', padding: '.75rem .95rem', cursor: 'pointer',
                        textAlign: 'left', border: 'none',
                        background: isActive ? 'color-mix(in srgb, var(--gold) 12%, var(--panel))' : 'transparent',
                        borderLeft: isActive ? '3px solid var(--gold)' : '3px solid transparent',
                        borderBottom: '1px solid var(--border)', color: 'var(--text)', position: 'relative',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      <span style={{ width: 38, height: 38, minWidth: 38, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 750, fontSize: '.78rem', color: '#fff', background: c.id === 'unassigned' ? 'var(--muted)' : avatarColor(c.id), boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
                        {c.id === 'unassigned' ? '?' : initialsOf(c.name)}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.4rem' }}>
                          <strong style={{ fontSize: '.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</strong>
                          <small style={{ fontSize: '.62rem', color: 'var(--muted)', flexShrink: 0 }}>{timeLabel(c.lastAt)}</small>
                        </span>
                        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.4rem', marginTop: 2 }}>
                          <small style={{ fontSize: '.7rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.open || c.done
                              ? <span>{c.open} pending · {c.done} done</span>
                              : 'no tasks'}
                          </small>
                          {c.open > 0 && <span style={{ background: 'var(--gold)', color: 'var(--accent-text, #111)', borderRadius: 999, minWidth: 18, height: 18, padding: '0 5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.62rem', fontWeight: 800, flexShrink: 0 }}>{c.open}</span>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* ---------- Right pane: chat & history ---------- */}
            <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100%', background: 'color-mix(in srgb, var(--panel) 40%, var(--bg, #faf6f0))', overflow: 'hidden' }}>
              {activeConversation ? (
                <>
                  {/* Pane Header with Tab Selector */}
                  <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.85rem', padding: '.75rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--panel)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', minWidth: 0 }}>
                      <span style={{ width: 40, height: 40, minWidth: 40, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 750, fontSize: '.82rem', color: '#fff', background: activeConversation.id === 'unassigned' ? 'var(--muted)' : avatarColor(activeConversation.id), boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
                        {activeConversation.id === 'unassigned' ? '?' : initialsOf(activeConversation.name)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
                          <strong style={{ color: 'var(--text)', fontSize: '.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeConversation.name}</strong>
                          {activeConversation.id === 'unassigned' && (
                            <span style={{ fontSize: '.64rem', padding: '1px 7px', borderRadius: 999, background: 'color-mix(in srgb, var(--gold) 15%, var(--panel))', color: 'var(--gold)', fontWeight: 750 }}>
                              Unassigned
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 1 }}>
                          {personStats.pending > 0 ? `${personStats.pending} pending · ${personStats.done} done (${personStats.rate}%)` : `${personStats.done} done · all clear`}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', flexShrink: 0 }}>
                      {currentActiveId === 'unassigned' && (
                        <div style={{ width: 150 }}>
                          <CustomSelect
                            value={draftAssignee}
                            onChange={setDraftAssignee}
                            placeholder="Assign who…"
                            variant="compact"
                            options={[
                              { value: '', label: 'Assign who…' },
                              ...users.map(u => ({ value: u._id, label: u.name })),
                            ]}
                          />
                        </div>
                      )}

                      {/* View Switcher: Chat Thread vs Person Task History */}
                      <div style={{ display: 'inline-flex', padding: 2, background: 'color-mix(in srgb, var(--bg) 60%, var(--panel))', border: '1px solid var(--border)', borderRadius: 8, gap: 2 }}>
                        <button
                          type="button"
                          onClick={() => setPaneTab('chat')}
                          style={{
                            border: 'none',
                            background: paneTab === 'chat' ? 'var(--panel)' : 'transparent',
                            color: paneTab === 'chat' ? 'var(--text)' : 'var(--muted)',
                            padding: '.3rem .7rem',
                            borderRadius: 6,
                            fontSize: '.74rem',
                            fontWeight: paneTab === 'chat' ? 750 : 500,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '.35rem',
                          }}
                        >
                          <Icon name="message-circle" size={13} />
                          <span>Chat Thread</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaneTab('history')}
                          style={{
                            border: 'none',
                            background: paneTab === 'history' ? 'var(--panel)' : 'transparent',
                            color: paneTab === 'history' ? 'var(--text)' : 'var(--muted)',
                            padding: '.3rem .7rem',
                            borderRadius: 6,
                            fontSize: '.74rem',
                            fontWeight: paneTab === 'history' ? 750 : 500,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '.35rem',
                          }}
                        >
                          <Icon name="history" size={13} />
                          <span>Task History ({personStats.total})</span>
                        </button>
                      </div>
                    </div>
                  </header>

                  {/* -------------------- TAB 1: CHAT THREAD -------------------- */}
                  {paneTab === 'chat' && (
                    <>
                      {/* messages scroller */}
                      <div ref={scrollerRef} style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                        {activeTasks.length === 0 && (
                          <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--muted)' }}>
                            <Icon name="send" size={28} style={{ opacity: .4 }} />
                            <p style={{ fontSize: '.84rem', marginTop: '.4rem' }}>No tasks in this thread yet. Type or paste tasks below to start.</p>
                          </div>
                        )}
                        {activeTasks.map((item, idx) => {
                          const prev = idx > 0 ? activeTasks[idx - 1] : null;
                          const showDay = !prev || daySeparator(prev.createdAt) !== daySeparator(item.createdAt);
                          return (
                            <div key={item._id}>
                              {showDay && <div style={{ textAlign: 'center', margin: '.35rem 0' }}><span style={{ fontSize: '.64rem', fontWeight: 750, color: 'var(--muted)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px' }}>{daySeparator(item.createdAt)}</span></div>}
                              {renderTaskCard(item, true)}
                            </div>
                          );
                        })}
                      </div>

                      {/* SLEEK COMPACT INTEGRATED COMPOSER */}
                      <div style={{ flexShrink: 0, margin: '0.65rem 1.15rem 1rem', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 4px 18px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* Composer Toolbar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', padding: '.45rem .75rem', borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--panel) 70%, var(--bg, #faf6f0))' }}>
                          {/* Mode Switcher */}
                          <div style={{ display: 'inline-flex', padding: 2, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 7, gap: 2 }}>
                            <button
                              type="button"
                              onClick={() => setComposerMode('single')}
                              style={{
                                border: 'none',
                                background: composerMode === 'single' ? 'var(--gold)' : 'transparent',
                                color: composerMode === 'single' ? 'var(--accent-text, #111)' : 'var(--muted)',
                                padding: '.25rem .6rem',
                                borderRadius: 5,
                                fontSize: '.72rem',
                                fontWeight: composerMode === 'single' ? 750 : 500,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '.3rem',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <Icon name="message-square" size={12} />
                              <span>Single Task</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setComposerMode('bulk')}
                              style={{
                                border: 'none',
                                background: composerMode === 'bulk' ? 'var(--gold)' : 'transparent',
                                color: composerMode === 'bulk' ? 'var(--accent-text, #111)' : 'var(--muted)',
                                padding: '.25rem .6rem',
                                borderRadius: 5,
                                fontSize: '.72rem',
                                fontWeight: composerMode === 'bulk' ? 750 : 500,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '.3rem',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <Icon name="zap" size={12} />
                              <span>⚡ Multi-Task (Bulk)</span>
                            </button>
                          </div>

                          {/* Quick Controls */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
                            <div style={{ width: 135 }}>
                              <CustomSelect
                                value={draftType}
                                onChange={setDraftType}
                                variant="compact"
                                options={workTypes.map(t => ({ value: t.key, label: t.name }))}
                              />
                            </div>

                            <div style={{ display: 'inline-flex', gap: '2px', background: 'var(--panel)', padding: '2px', borderRadius: 6, border: '1px solid var(--border)' }}>
                              {(['low', 'medium', 'high'] as const).map(p => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => setDraftPriority(p)}
                                  aria-pressed={draftPriority === p}
                                  style={{
                                    fontSize: '.65rem',
                                    padding: '2px 7px',
                                    textTransform: 'capitalize',
                                    background: draftPriority === p ? 'color-mix(in srgb, var(--gold) 20%, var(--panel))' : 'transparent',
                                    color: draftPriority === p ? 'var(--gold)' : 'var(--muted)',
                                    border: draftPriority === p ? '1px solid var(--gold)' : '1px solid transparent',
                                    borderRadius: 4,
                                    fontWeight: draftPriority === p ? 750 : 500,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {p === 'low' ? 'Low' : p === 'medium' ? 'Normal' : 'High'}
                                </button>
                              ))}
                            </div>

                            <div style={{ width: 120 }}>
                              <DatePicker value={draftDeadline} onChange={setDraftDeadline} placeholder="Due date" style={{ fontSize: '.72rem', height: 28 }} aria-label="Deadline" />
                            </div>
                            {draftDeadline && (
                              <button type="button" className="btn small outline" onClick={() => setDraftDeadline('')} style={{ fontSize: '.65rem', padding: '2px 6px', height: 28 }}>✕</button>
                            )}
                          </div>
                        </div>

                        {/* MODE 1: SINGLE TASK */}
                        {composerMode === 'single' ? (
                          <form onSubmit={sendTask} style={{ padding: '.55rem .85rem .6rem' }}>
                            <div style={{ position: 'relative' }}>
                              {cmd && (
                                <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)', boxShadow: '0 10px 30px rgba(0,0,0,.15)' }}>
                                  <div style={{ padding: '.45rem .75rem .3rem', fontSize: '.64rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                                    {cmd === 'area' ? 'Create task in…' : 'Assign to whom?'}
                                  </div>
                                  <div style={{ maxHeight: 220, overflowY: 'auto', paddingBottom: '.3rem' }}>
                                    {(cmd === 'area' ? areaOptions : assigneeOptions).map((opt, i) => {
                                      const isArea = cmd === 'area';
                                      return (
                                        <button
                                          key={isArea ? (opt as WorkType)._id : (opt as Member)._id}
                                          type="button"
                                          onClick={() => { setCmdIndex(i); selectCmd(i); }}
                                          onMouseEnter={() => setCmdIndex(i)}
                                          style={{
                                            display: 'flex', alignItems: 'center', gap: '.55rem', width: '100%', padding: '.45rem .75rem',
                                            textAlign: 'left', border: 'none', background: i === cmdIndex ? 'color-mix(in srgb, var(--gold) 12%, var(--panel))' : 'transparent',
                                            color: 'var(--text)', cursor: 'pointer',
                                          }}
                                        >
                                          {isArea ? (
                                            <>
                                              <span style={{ width: 10, height: 10, minWidth: 10, borderRadius: '50%', background: (opt as any).color }} />
                                              <b style={{ fontSize: '.78rem' }}>{(opt as WorkType).name}</b>
                                              <small style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: '.62rem' }}>/{(opt as WorkType).key}</small>
                                            </>
                                          ) : (
                                            <>
                                              <span style={{ width: 22, height: 22, minWidth: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 750, fontSize: '.58rem', background: avatarColor((opt as Member)._id) }}>
                                                {initialsOf((opt as Member).name)}
                                              </span>
                                              <b style={{ fontSize: '.78rem' }}>{(opt as Member).name}</b>
                                            </>
                                          )}
                                        </button>
                                      );
                                    })}
                                    {cmd === 'area' && areaOptions.length === 0 && (
                                      <div style={{ padding: '.5rem .75rem', fontSize: '.7rem', color: 'var(--muted)' }}>No work area matches "{cmdFilter}". <button type="button" className="btn small outline" style={{ marginLeft: '.3rem', padding: '1px 6px' }} onClick={() => setCmd(null)}>Type instead</button></div>
                                    )}
                                  </div>
                                </div>
                              )}

                              <textarea
                                value={draft}
                                onChange={e => handleDraft(e.target.value)}
                                onKeyDown={onDraftKeyDown}
                                rows={draft.split('\n').length > 1 ? 2 : 1}
                                placeholder={cmd === 'area' ? 'Search work area… (Enter to pick)' : cmd === 'assignee' ? 'Pick who it’s for…' : `Type a task for ${activeConversation.name}… (Press Enter to send, / for shortcuts)`}
                                aria-label="New task"
                                style={{ width: '100%', border: 'none', outline: 'none', padding: '.2rem 0', fontSize: '.86rem', resize: 'none', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', lineHeight: 1.45 }}
                              />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.35rem', paddingTop: '.35rem', borderTop: '1px solid color-mix(in srgb, var(--border) 60%, transparent)' }}>
                              <small style={{ fontSize: '.68rem', color: 'var(--muted)' }}>
                                Press <b>Enter</b> to send, <b>Shift+Enter</b> for newline, <b>/</b> for area/assignee
                              </small>
                              <button className="btn primary small" type="submit" disabled={sending || !draft.trim()} style={{ height: 30, padding: '0 .9rem', display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontWeight: 750, fontSize: '.76rem' }}>
                                <Icon name="send" size={13} aria-hidden /> {sending ? 'Sending…' : 'Send'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          /* MODE 2: MULTI-TASK BULK CREATOR */
                          <form onSubmit={handleBulkCreate} style={{ padding: '.55rem .85rem .6rem' }}>
                            <textarea
                              value={bulkText}
                              onChange={e => setBulkText(e.target.value)}
                              rows={3}
                              placeholder={`Paste task list here (one per line):\n1. Shoot product launch reel\n2. Design 3 carousel graphics\n3. Write marketing captions`}
                              aria-label="Bulk task input"
                              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '.5rem .75rem', fontSize: '.84rem', resize: 'vertical', background: 'color-mix(in srgb, var(--bg, #faf6f0) 50%, var(--panel))', color: 'var(--text)', fontFamily: 'inherit', lineHeight: 1.45 }}
                            />

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.45rem', flexWrap: 'wrap', gap: '.5rem' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontSize: '.72rem', cursor: 'pointer', color: 'var(--muted)', userSelect: 'none' }}>
                                <input
                                  type="checkbox"
                                  checked={bulkCleanBullets}
                                  onChange={e => setBulkCleanBullets(e.target.checked)}
                                  style={{ cursor: 'pointer', accentColor: 'var(--gold)', width: 14, height: 14 }}
                                />
                                <span>Auto-strip bullets (1. 2. - •)</span>
                              </label>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                                {bulkTaskTitles.length > 0 && (
                                  <span style={{ fontSize: '.74rem', fontWeight: 750, color: 'var(--gold)' }}>
                                    ⚡ {bulkTaskTitles.length} tasks ready
                                  </span>
                                )}
                                <button
                                  className="btn primary small"
                                  type="submit"
                                  disabled={sending || bulkTaskTitles.length === 0}
                                  style={{ height: 30, padding: '0 .95rem', display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontWeight: 800, fontSize: '.76rem' }}
                                >
                                  <Icon name="zap" size={13} aria-hidden />
                                  <span>{sending ? 'Creating…' : `Create ${bulkTaskTitles.length ? `${bulkTaskTitles.length} Tasks` : 'Tasks'}`}</span>
                                </button>
                              </div>
                            </div>
                          </form>
                        )}
                      </div>
                    </>
                  )}

                  {/* -------------------- TAB 2: PERSON TASK HISTORY -------------------- */}
                  {paneTab === 'history' && (
                    <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* Person KPI Summary Cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '.6rem' }}>
                        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '.65rem .8rem' }}>
                          <small style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total Tasks</small>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{personStats.total}</div>
                        </div>
                        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '.65rem .8rem' }}>
                          <small style={{ fontSize: '.62rem', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase' }}>Pending</small>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--gold)', marginTop: 2 }}>{personStats.pending}</div>
                        </div>
                        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '.65rem .8rem' }}>
                          <small style={{ fontSize: '.62rem', color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase' }}>Completed</small>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--green)', marginTop: 2 }}>{personStats.done} <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)' }}>({personStats.rate}%)</span></div>
                        </div>
                        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '.65rem .8rem' }}>
                          <small style={{ fontSize: '.62rem', color: 'var(--red)', fontWeight: 700, textTransform: 'uppercase' }}>Overdue</small>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: personStats.overdue > 0 ? 'var(--red)' : 'var(--text)', marginTop: 2 }}>{personStats.overdue}</div>
                        </div>
                        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '.65rem .8rem' }}>
                          <small style={{ fontSize: '.62rem', color: 'var(--teal)', fontWeight: 700, textTransform: 'uppercase' }}>Handoffs</small>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--teal)', marginTop: 2 }}>{personStats.handoffs}</div>
                        </div>
                      </div>

                      {/* Filter & Search Bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                          {(['all', 'pending', 'done', 'overdue', 'handoff'] as const).map(f => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setHistoryFilter(f)}
                              style={{
                                border: '1px solid var(--border)',
                                background: historyFilter === f ? 'var(--gold)' : 'var(--panel)',
                                color: historyFilter === f ? 'var(--accent-text, #111)' : 'var(--text)',
                                fontWeight: historyFilter === f ? 700 : 500,
                                fontSize: '.68rem',
                                padding: '.25rem .65rem',
                                borderRadius: 999,
                                textTransform: 'capitalize',
                                cursor: 'pointer',
                              }}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                        <input
                          value={historyQuery}
                          onChange={e => setHistoryQuery(e.target.value)}
                          placeholder="Filter history tasks…"
                          style={{ fontSize: '.75rem', padding: '.3rem .65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', minWidth: 170 }}
                        />
                      </div>

                      {/* History Task Feed */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
                        {personHistoryFiltered.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--muted)' }}>
                            <Icon name="history" size={28} style={{ opacity: .4, marginBottom: '.4rem' }} />
                            <p style={{ fontSize: '.84rem', margin: 0 }}>No task history found for {activeConversation.name} matching this filter.</p>
                          </div>
                        ) : (
                          personHistoryFiltered.map(item => renderTaskCard(item, false))
                        )}
                      </div>
                    </div>
                  )}
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