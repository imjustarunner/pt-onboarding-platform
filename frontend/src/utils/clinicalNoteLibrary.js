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

export function draftSearchHaystack(d) {
  return [
    d?.initials,
    d?.client_full_name,
    d?.clientFullName,
    d?.agency_name,
    d?.agencyName,
    d?.client_type,
    d?.clientType,
    d?.service_code,
    d?.date_of_service,
    d?.id
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
}

export function filterClinicalNoteDrafts(drafts, { tab = 'active', search = '' } = {}) {
  const q = String(search || '').trim().toLowerCase();
  let list = Array.isArray(drafts) ? drafts : [];
  if (tab === 'active') list = list.filter((d) => !d?.archived_at);
  else list = list.filter((d) => !!d?.archived_at);
  if (!q) return list;
  return list.filter((d) => draftSearchHaystack(d).includes(q));
}

function draftDosKey(d) {
  const dos = String(d?.date_of_service || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dos)) return dos;
  return draftCreatedKey(d?.created_at);
}

function sortDraftsWithinGroup(drafts, { dateOrder = 'newest' } = {}) {
  const dir = dateOrder === 'oldest' ? 1 : -1;
  return [...(drafts || [])].sort((a, b) => {
    const dosCmp = String(draftDosKey(a)).localeCompare(String(draftDosKey(b)));
    if (dosCmp) return dosCmp * dir;
    const createdCmp = new Date(a.created_at) - new Date(b.created_at);
    if (createdCmp) return createdCmp * dir;
    return (Number(a.id) - Number(b.id)) * dir;
  });
}

function groupLabelForMode(d, mode) {
  if (mode === 'client') {
    return String(d?.client_full_name || d?.clientFullName || d?.initials || 'Unlinked').trim() || 'Unlinked';
  }
  if (mode === 'tenant') {
    return String(d?.agency_name || d?.agencyName || 'Unknown tenant').trim() || 'Unknown tenant';
  }
  if (mode === 'client_type') {
    const t = String(d?.client_type || d?.clientType || '').trim().toLowerCase();
    if (!t) return 'Unknown type';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return null;
}

/**
 * @param {Array} drafts
 * @param {{ groupBy?: 'date'|'client'|'tenant'|'client_type', dateOrder?: 'newest'|'oldest' }} [opts]
 */
export function groupClinicalNoteDrafts(drafts, { groupBy = 'date', dateOrder = 'newest' } = {}) {
  const mode = ['date', 'client', 'tenant', 'client_type'].includes(groupBy) ? groupBy : 'date';
  const map = new Map();

  for (const d of drafts || []) {
    let key;
    let label;
    let month = '—';
    let day = '—';
    let sortKey;

    if (mode === 'date') {
      key = draftCreatedKey(d?.created_at);
      label = draftCreatedDayLabel(d?.created_at);
      const parts = formatDraftListDate(d?.created_at);
      month = parts.month || '—';
      day = parts.day || '—';
      sortKey = key === 'unknown' ? '0000-00-00' : key;
    } else {
      label = groupLabelForMode(d, mode);
      key = `${mode}:${label.toLowerCase()}`;
      sortKey = label.toLowerCase();
      month = mode === 'client' ? 'CL' : mode === 'tenant' ? 'TN' : 'TY';
      day = String(label).slice(0, 2).toUpperCase() || '—';
    }

    if (!map.has(key)) {
      map.set(key, {
        key,
        month,
        day,
        label,
        sortKey,
        drafts: []
      });
    }
    map.get(key).drafts.push(d);
  }

  const groups = Array.from(map.values()).map((g) => ({
    ...g,
    drafts: sortDraftsWithinGroup(g.drafts, { dateOrder })
  }));

  const groupDir = dateOrder === 'oldest' ? 1 : -1;
  if (mode === 'date') {
    groups.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)) * groupDir);
  } else {
    groups.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
  }
  return groups;
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
