import { formatDraftListDate, todayIsoDate } from './noteAidUiHelpers.js';

export function draftCreatedKey(raw) {
  try {
    if (!raw) return 'unknown';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return 'unknown';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return 'unknown';
  }
}

export function draftCreatedDayLabel(raw) {
  try {
    if (!raw) return 'Unknown date';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return 'Unknown date';
    const today = todayIsoDate();
    const key = draftCreatedKey(raw);
    if (key === today) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (key === draftCreatedKey(yesterday.toISOString())) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown date';
  }
}

export function filterClinicalNoteDrafts(drafts, { tab = 'active', search = '' } = {}) {
  const q = String(search || '').trim().toLowerCase();
  let list = Array.isArray(drafts) ? drafts : [];
  if (tab === 'active') list = list.filter((d) => !d?.archived_at);
  else list = list.filter((d) => !!d?.archived_at);
  if (!q) return list;
  return list.filter((d) => {
    const hay = [d?.initials, d?.service_code, d?.date_of_service, d?.id]
      .map((x) => String(x || '').toLowerCase())
      .join(' ');
    return hay.includes(q);
  });
}

export function groupClinicalNoteDrafts(drafts) {
  const map = new Map();
  for (const d of drafts || []) {
    const key = draftCreatedKey(d?.created_at);
    if (!map.has(key)) {
      const parts = formatDraftListDate(d?.created_at);
      map.set(key, {
        key,
        month: parts.month || '—',
        day: parts.day || '—',
        label: draftCreatedDayLabel(d?.created_at),
        sortKey: key === 'unknown' ? '0000-00-00' : key,
        drafts: []
      });
    }
    map.get(key).drafts.push(d);
  }
  return Array.from(map.values())
    .map((g) => ({
      ...g,
      drafts: [...g.drafts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }))
    .sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));
}

export function parseDraftOutput(d) {
  const raw = d?.output_json;
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function defaultDraftTypeLabel(d) {
  const parsed = parseDraftOutput(d);
  if (String(parsed?.meta?.source || '') === 'session_recording') return 'Session Recording';
  const code = String(d?.service_code || parsed?.meta?.serviceCode || '').trim().toUpperCase();
  if (!code) return 'Progress Note';
  return `${code} Note`;
}
