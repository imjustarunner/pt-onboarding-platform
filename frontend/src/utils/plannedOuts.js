const COL_STORAGE_KEY = 'planned_outs_column_order_v1';

export const PLANNED_OUT_COLUMNS = [
  { id: 'person', label: 'Person' },
  { id: 'when', label: 'When' },
  { id: 'availability', label: 'Availability' },
  { id: 'emergencies', label: 'Emergencies' },
  { id: 'contact', label: 'Contact' }
];

export function loadColumnOrder() {
  try {
    const raw = localStorage.getItem(COL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed) || !parsed.length) {
      return PLANNED_OUT_COLUMNS.map((c) => c.id);
    }
    const known = new Set(PLANNED_OUT_COLUMNS.map((c) => c.id));
    const ordered = parsed.filter((id) => known.has(id));
    for (const c of PLANNED_OUT_COLUMNS) {
      if (!ordered.includes(c.id)) ordered.push(c.id);
    }
    return ordered;
  } catch {
    return PLANNED_OUT_COLUMNS.map((c) => c.id);
  }
}

export function saveColumnOrder(order) {
  try {
    localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // ignore
  }
}

function fmtMd(ymd) {
  const s = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [, m, d] = s.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function fmtTime(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) {
    const m = String(raw).match(/(\d{2}):(\d{2})/);
    if (!m) return '';
    let h = Number(m[1]);
    const min = m[2];
    const ap = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return min === '00' ? `${h}${ap}` : `${h}:${min}${ap}`;
  }
  let h = d.getHours();
  const min = d.getMinutes();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return min === 0 ? `${h}${ap}` : `${h}:${String(min).padStart(2, '0')}${ap}`;
}

export function formatPlannedOutWhen(row) {
  if (!row) return '';
  const span = String(row.span_type || '');
  if (span === 'all_day' || row.all_day) {
    const start = fmtMd(row.start_date);
    const endExclusive = String(row.end_date || '').slice(0, 10);
    if (endExclusive && start) {
      const endIncl = (() => {
        const d = new Date(`${endExclusive}T12:00:00`);
        d.setDate(d.getDate() - 1);
        return fmtMd(d.toISOString().slice(0, 10));
      })();
      if (endIncl && endIncl !== start) return `${start}-${endIncl}`;
    }
    return start || 'All day';
  }
  if (span === 'half_day') {
    const day = fmtMd(row.start_date || row.start_at);
    const part = String(row.half_day_part || 'am').toUpperCase();
    return `${day} ${part} (half day)`;
  }
  const day = fmtMd(row.start_at || row.start_date);
  const from = fmtTime(row.start_at);
  const to = fmtTime(row.end_at);
  if (day && from && to) return `${day} ${from}-${to}`;
  return day || from || '—';
}

export function formatAvailability(row) {
  return String(row?.availability || '') === 'available' ? 'Available' : 'Unavailable';
}

export function formatEmergencies(row) {
  const em = String(row?.emergencies || 'none');
  if (em === 'okay') return 'Emergencies Okay';
  if (em === 'redirect') {
    const name = String(row?.emergencies_redirect_name || '').trim();
    return name ? `Emergencies to ${name}` : 'Emergencies redirected';
  }
  return '--';
}

export function formatContact(row) {
  const c = String(row?.contact_preference || 'none');
  if (c === 'call_only') return 'Call Only';
  if (c === 'email_only') return 'Email Only';
  return '--';
}

export function displayName(row) {
  const n = String(row?.user_name || '').trim();
  if (n) return n;
  const f = String(row?.user_first_name || '').trim();
  const l = String(row?.user_last_name || '').trim();
  return [f, l].filter(Boolean).join(' ') || 'Team member';
}

export function cellValue(row, colId) {
  switch (colId) {
    case 'person': return displayName(row);
    case 'when': return `Out ${formatPlannedOutWhen(row)}`;
    case 'availability': return formatAvailability(row);
    case 'emergencies': return formatEmergencies(row);
    case 'contact': return formatContact(row);
    default: return '';
  }
}

export function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  if (s === 'revision') return 'Needs revision';
  return 'Pending';
}
