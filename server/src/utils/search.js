const TYPES = ['all', 'leads', 'clients', 'work', 'activities', 'history', 'team', 'campaigns', 'workspaces'];

function searchOptions(query) {
  const q = String(query.q || '').trim().slice(0, 160);
  const type = TYPES.includes(query.type) ? query.type : 'all';
  const dateField = ['created', 'updated', 'scheduled'].includes(query.dateField) ? query.dateField : 'updated';
  const offset = Math.max(-840, Math.min(840, Number(query.tz) || 0));
  
  let from = String(query.from || '');
  let to = String(query.to || '');
  const preset = String(query.preset || '');

  if (preset) {
    const now = new Date();
    const toYMD = d => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    if (preset === 'today') {
      from = toYMD(now);
      to = toYMD(now);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      from = toYMD(y);
      to = toYMD(y);
    } else if (preset === 'week') {
      const w = new Date(now);
      w.setDate(w.getDate() - 6);
      from = toYMD(w);
      to = toYMD(now);
    } else if (preset === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      from = toYMD(m);
      to = toYMD(now);
    }
  }

  const date = value => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid date.');
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) throw new Error('Choose a valid date.');
    return new Date(+parsed + offset * 60000);
  };

  const start = date(from), end = date(to);
  if (start && end && start > end) throw new Error('The end date must be on or after the start date.');
  const range = { ...(start ? { $gte: start } : {}), ...(end ? { $lt: new Date(+end + 86400000) } : {}) };

  return {
    q,
    type,
    dateField,
    preset,
    from,
    to,
    tz: offset,
    range,
    module: /^[a-f\d]{24}$/i.test(String(query.module || '')) ? String(query.module) : '',
    page: Math.max(1, Math.min(50, parseInt(query.page, 10) || 1))
  };
}

function textMatch(q, fields = []) {
  if (!q) return {};
  if (/^[a-f\d]{24}$/i.test(q)) return { _id: q };
  const safeQ = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = { $regex: safeQ, $options: 'i' };

  if (fields.length) {
    if (fields.length === 1) return { [fields[0]]: regex };
    return { $or: fields.map(field => ({ [field]: regex })) };
  }

  return {
    $or: [
      { name: regex },
      { title: regex },
      { notes: regex },
      { message: regex },
      { email: regex },
      { company: regex }
    ]
  };
}

module.exports = { TYPES, searchOptions, textMatch };
