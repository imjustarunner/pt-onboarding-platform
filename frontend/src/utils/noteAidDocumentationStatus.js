/**
 * Note Aid documentation workflow statuses across left library + right work queue.
 *
 * - not_started: right queue only
 * - started: both panels (opened / in progress, not finished)
 * - completed: left only (generated / finished writing, not signed)
 * - signed: left only (provider signed)
 */

export const DOC_STATUS = {
  NOT_STARTED: 'not_started',
  STARTED: 'started',
  COMPLETED: 'completed',
  SIGNED: 'signed'
};

/** How a note is linked: no client/session, client only, or session (appointment). */
export const NOTE_CONNECTION = {
  UNLINKED: 'unlinked',
  CLIENT: 'client',
  SESSION: 'session'
};

export const NOTE_CONNECTION_META = {
  [NOTE_CONNECTION.UNLINKED]: {
    key: NOTE_CONNECTION.UNLINKED,
    label: 'Unlinked',
    shortLabel: 'Unlinked',
    sortOrder: 0,
    title: 'Not connected to a session or client',
    // Slate — standalone / initials-only
    color: '#475569',
    bg: '#f8fafc',
    border: '#cbd5e1',
    icon: 'file'
  },
  [NOTE_CONNECTION.CLIENT]: {
    key: NOTE_CONNECTION.CLIENT,
    label: 'Client linked',
    shortLabel: 'Client',
    sortOrder: 1,
    title: 'Connected to a client, not a session',
    // Indigo — chart client without appointment
    color: '#4338ca',
    bg: '#eef2ff',
    border: '#a5b4fc',
    icon: 'user'
  },
  [NOTE_CONNECTION.SESSION]: {
    key: NOTE_CONNECTION.SESSION,
    label: 'Session linked',
    shortLabel: 'Session',
    sortOrder: 2,
    title: 'Connected to a booked session',
    // Teal — appointment / office event
    color: '#0f766e',
    bg: '#f0fdfa',
    border: '#5eead4',
    icon: 'calendar'
  }
};

export const LEFT_PANEL_CONNECTION_KEYS = [
  NOTE_CONNECTION.UNLINKED,
  NOTE_CONNECTION.CLIENT,
  NOTE_CONNECTION.SESSION
];

export const DOC_STATUS_META = {
  [DOC_STATUS.NOT_STARTED]: {
    key: DOC_STATUS.NOT_STARTED,
    label: 'Not started',
    shortLabel: 'Queue',
    sortOrder: 0,
    // Right-panel only — teal pending
    color: '#0f766e',
    bg: '#f0fdfa',
    border: '#99f6e4'
  },
  [DOC_STATUS.STARTED]: {
    key: DOC_STATUS.STARTED,
    label: 'Started',
    shortLabel: 'In progress',
    sortOrder: 1,
    // Amber — started, not finished
    color: '#b45309',
    bg: '#fffbeb',
    border: '#fcd34d'
  },
  [DOC_STATUS.COMPLETED]: {
    key: DOC_STATUS.COMPLETED,
    label: 'Completed',
    shortLabel: 'Done',
    sortOrder: 2,
    // Slate/blue — finished writing, not signed
    color: '#1d4ed8',
    bg: '#eff6ff',
    border: '#93c5fd'
  },
  [DOC_STATUS.SIGNED]: {
    key: DOC_STATUS.SIGNED,
    label: 'Signed',
    shortLabel: 'Signed',
    sortOrder: 3,
    // Green — completed and signed
    color: '#047857',
    bg: '#ecfdf5',
    border: '#6ee7b7'
  }
};

export const LEFT_PANEL_STATUS_TABS = [
  DOC_STATUS.STARTED,
  DOC_STATUS.COMPLETED,
  DOC_STATUS.SIGNED
];

export function normalizeDocStatus(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'active' || s === 'in_progress' || s === 'started') return DOC_STATUS.STARTED;
  if (s === 'done' || s === 'completed' || s === 'complete') return DOC_STATUS.COMPLETED;
  if (s === 'signed' || s === 'completed_signed') return DOC_STATUS.SIGNED;
  if (s === 'pending' || s === 'not_started' || s === 'queued') return DOC_STATUS.NOT_STARTED;
  if (s === 'skipped') return DOC_STATUS.NOT_STARTED;
  return DOC_STATUS.NOT_STARTED;
}

export function docStatusMeta(status) {
  const key = normalizeDocStatus(status);
  return DOC_STATUS_META[key] || DOC_STATUS_META[DOC_STATUS.NOT_STARTED];
}

export function noteConnectionMeta(connection) {
  const key = normalizeNoteConnection(connection);
  return NOTE_CONNECTION_META[key] || NOTE_CONNECTION_META[NOTE_CONNECTION.UNLINKED];
}

export function normalizeNoteConnection(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'session' || s === 'appointment' || s === 'office_event') return NOTE_CONNECTION.SESSION;
  if (s === 'client' || s === 'client_only' || s === 'chart') return NOTE_CONNECTION.CLIENT;
  if (s === 'unlinked' || s === 'none' || s === 'standalone') return NOTE_CONNECTION.UNLINKED;
  return NOTE_CONNECTION.UNLINKED;
}

/**
 * Classify note linkage:
 * - session: has office event and/or clinical session
 * - client: has client, no session
 * - unlinked: no client and no session
 */
export function deriveNoteConnection(entity = {}) {
  if (!entity) return NOTE_CONNECTION.UNLINKED;
  if (entity.connection || entity.noteConnection || entity.connectionType) {
    return normalizeNoteConnection(
      entity.connection || entity.noteConnection || entity.connectionType
    );
  }
  const officeEventId = Number(
    entity.officeEventId
    || entity.office_event_id
    || entity.raw?.officeEventId
    || entity.raw?.office_event_id
    || 0
  );
  const clinicalSessionId = Number(
    entity.clinicalSessionId
    || entity.clinical_session_id
    || entity.raw?.clinicalSessionId
    || entity.raw?.clinical_session_id
    || 0
  );
  if (officeEventId > 0 || clinicalSessionId > 0) return NOTE_CONNECTION.SESSION;

  const clientId = Number(
    entity.clientId
    || entity.client_id
    || entity.raw?.clientId
    || entity.raw?.client_id
    || 0
  );
  if (clientId > 0) return NOTE_CONNECTION.CLIENT;
  return NOTE_CONNECTION.UNLINKED;
}

/** Does this status belong on the left library panel? */
export function isLeftPanelStatus(status) {
  const key = normalizeDocStatus(status);
  return key === DOC_STATUS.STARTED
    || key === DOC_STATUS.COMPLETED
    || key === DOC_STATUS.SIGNED;
}

/** Does this status belong on the right smart queue? */
export function isRightPanelStatus(status) {
  const key = normalizeDocStatus(status);
  return key === DOC_STATUS.NOT_STARTED
    || key === DOC_STATUS.STARTED
    || key === DOC_STATUS.COMPLETED
    || key === DOC_STATUS.SIGNED;
}

/**
 * Derive status for a clinical note draft row.
 * Signed drafts are rare (drafts aren't signed); treat archived+output as completed.
 */
export function deriveDraftDocStatus(draft) {
  if (!draft) return DOC_STATUS.NOT_STARTED;
  if (draft.doc_status || draft.docStatus) {
    return normalizeDocStatus(draft.doc_status || draft.docStatus);
  }
  if (draft.provider_signed_at || draft.signed_at || draft.signedAt) {
    return DOC_STATUS.SIGNED;
  }
  const hasOutput = !!(
    draft.output_json
    || draft.outputJson
    || (draft.has_output != null && Number(draft.has_output) === 1)
  );
  if (hasOutput || draft.archived_at) {
    return DOC_STATUS.COMPLETED;
  }
  const hasInput = !!(String(draft.input_text || draft.inputText || '').trim());
  if (hasInput || draft.client_id || draft.service_code) {
    return DOC_STATUS.STARTED;
  }
  return DOC_STATUS.STARTED;
}

/**
 * Map legacy work-queue status → documentation status.
 * Supports new statuses and old pending/active/done.
 */
export function deriveWorkQueueDocStatus(item) {
  if (!item) return DOC_STATUS.NOT_STARTED;
  if (item.docStatus) return normalizeDocStatus(item.docStatus);
  return normalizeDocStatus(item.status);
}

/** Filter work-queue items for the right smart queue. */
export function filterWorkQueueForRightPanel(items) {
  return (items || []).filter((i) => isRightPanelStatus(deriveWorkQueueDocStatus(i)));
}

export function initialsFromDisplayName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z]{1,4}(?:[.\s]+[A-Za-z]{1,4})*$/.test(raw.replace(/,/g, '')) && raw.length <= 12) {
    return raw.replace(/\s+/g, ' ');
  }
  const parts = raw.replace(/,/g, ' ').split(/\s+/).filter((p) => /[A-Za-z]/.test(p) && !/^(iv|iii|ii|jr|sr)$/i.test(p));
  if (!parts.length) return raw.slice(0, 3).toUpperCase();
  if (parts.length === 1) return `${parts[0].slice(0, 1).toUpperCase()}.`;
  return `${parts[0].slice(0, 1).toUpperCase()}. ${parts[parts.length - 1].slice(0, 1).toUpperCase()}.`;
}

/**
 * Build left-library rows from drafts + started/completed/signed work-queue items
 * and signed chart notes (so Done/Signed show across tenants).
 */
export function buildLeftLibraryRows({ drafts = [], workQueueItems = [], signedSessions = [] } = {}) {
  const rows = [];
  const seenWorkIds = new Set();

  for (const d of drafts || []) {
    const status = deriveDraftDocStatus(d);
    if (!isLeftPanelStatus(status)) continue;
    const connection = deriveNoteConnection(d);
    rows.push({
      id: `draft_${d.id}`,
      source: 'draft',
      draftId: d.id,
      workQueueId: d.work_queue_id || d.workQueueId || null,
      docStatus: status,
      connection,
      clientId: d.client_id || d.clientId || null,
      officeEventId: d.office_event_id || d.officeEventId || null,
      clinicalSessionId: d.clinical_session_id || d.clinicalSessionId || null,
      client_full_name: d.client_full_name || d.clientFullName || null,
      initials: d.initials || initialsFromDisplayName(d.client_full_name || d.clientFullName),
      agency_name: d.agency_name || d.agencyName || null,
      client_type: d.client_type || d.clientType || null,
      service_code: d.service_code || d.serviceCode || null,
      date_of_service: d.date_of_service || d.dateOfService || null,
      created_at: d.created_at || d.updated_at || null,
      archived_at: d.archived_at || null,
      raw: d
    });
  }

  for (const item of workQueueItems || []) {
    const status = deriveWorkQueueDocStatus(item);
    if (!isLeftPanelStatus(status)) continue;
    // Prefer draft row when queue item is already linked to a draft shown above
    if (item.draftId) {
      const linked = rows.find((r) => String(r.draftId) === String(item.draftId));
      if (linked) {
        linked.workQueueId = linked.workQueueId || item.id;
        continue;
      }
    }
    if (seenWorkIds.has(item.id)) continue;
    seenWorkIds.add(item.id);
    const connection = deriveNoteConnection(item);
    rows.push({
      id: `wq_${item.id}`,
      source: 'work_queue',
      draftId: item.draftId || null,
      workQueueId: item.id,
      docStatus: status,
      connection,
      clientId: item.clientId || null,
      officeEventId: item.officeEventId || null,
      clinicalSessionId: item.clinicalSessionId || null,
      client_full_name: item.clientName || null,
      initials: initialsFromDisplayName(item.clientName || item.initials),
      agency_name: null,
      client_type: null,
      service_code: item.serviceCode || null,
      date_of_service: item.date || null,
      created_at: item.startedAt || item.updatedAt || item.date || null,
      archived_at: null,
      noteKind: item.noteKind || null,
      raw: item
    });
  }

  for (const s of signedSessions || []) {
    const name = s.clientName || s.client_full_name || null;
    const hasSession = Number(s.officeEventId || s.office_event_id || 0) > 0
      || Number(s.clinicalSessionId || s.clinical_session_id || 0) > 0;
    rows.push({
      id: `signed_${s.noteId || s.id}`,
      source: 'signed_note',
      draftId: s.draftId || null,
      workQueueId: null,
      docStatus: DOC_STATUS.SIGNED,
      connection: hasSession ? NOTE_CONNECTION.SESSION : NOTE_CONNECTION.CLIENT,
      clientId: s.clientId || s.client_id || null,
      officeEventId: s.officeEventId || s.office_event_id || null,
      clinicalSessionId: s.clinicalSessionId || s.clinical_session_id || null,
      client_full_name: name,
      initials: s.initials || initialsFromDisplayName(name),
      agency_name: s.agencyName || s.agency_name || null,
      client_type: null,
      service_code: s.serviceCode || s.service_code || null,
      date_of_service: s.dateOfService || s.date_of_service || null,
      created_at: s.signedAt || s.provider_signed_at || null,
      archived_at: null,
      raw: s
    });
  }

  return collapseLeftLibraryRows(rows);
}

/** Map 90832/90834/90837 (and "90832 / 90834 / 90837" labels) to one psychotherapy family. */
export function normalizeSessionServiceCode(code) {
  const raw = String(code || '').toUpperCase();
  const m = raw.match(/\b(90\d{3}|H\d{4}|T\d{4}|G\d{4})\b/);
  const c = m ? m[1] : '';
  if (/^9083[24789]$/.test(c)) return '90837';
  return c;
}

/**
 * Identity for one clinical session note. Used to collapse leftover duplicate drafts.
 */
export function sessionDedupeKey(row = {}) {
  const oe = Number(row.officeEventId || row.office_event_id || 0);
  if (oe > 0) return `oe:${oe}`;
  const cs = Number(row.clinicalSessionId || row.clinical_session_id || 0);
  if (cs > 0) return `cs:${cs}`;
  const cid = Number(row.clientId || row.client_id || 0);
  const dos = String(row.date_of_service || row.dateOfService || row.date || '').slice(0, 10);
  const code = normalizeSessionServiceCode(row.service_code || row.serviceCode || row.noteKind);
  if (cid > 0 && dos && code) return `cdc:${cid}:${dos}:${code}`;
  if (cid > 0 && dos) return `cd:${cid}:${dos}`;
  return null;
}

/** True only when a draft is the same person/session as this ToDo row. */
export function draftMatchesWorkQueueItem(draft, item) {
  if (!draft || !item) return false;
  const itemClient = Number(item.clientId || item.client_id || 0);
  const draftClient = Number(draft.client_id || draft.clientId || 0);
  if (itemClient && draftClient && itemClient !== draftClient) return false;
  const itemOe = Number(item.officeEventId || item.office_event_id || 0);
  const draftOe = Number(draft.office_event_id || draft.officeEventId || 0);
  if (itemOe && draftOe && itemOe !== draftOe) return false;
  if (item.draftId && String(draft.id) === String(item.draftId)) {
    return !itemClient || !draftClient || itemClient === draftClient;
  }
  const itemKey = sessionDedupeKey({
    officeEventId: item.officeEventId,
    clinicalSessionId: item.clinicalSessionId,
    clientId: item.clientId,
    date_of_service: item.date,
    service_code: item.serviceCode
  });
  const draftKey = sessionDedupeKey(draft);
  if (itemKey && draftKey && itemKey === draftKey) return true;
  return false;
}

function libraryRowRank(row) {
  let n = 0;
  if (row?.docStatus === DOC_STATUS.SIGNED) n += 40;
  if (row?.docStatus === DOC_STATUS.COMPLETED) n += 12;
  if (row?.source === 'draft') n += 8;
  else if (row?.source === 'signed_note') n += 4;
  else if (row?.source === 'work_queue') n += 2;
  const raw = row?.raw || {};
  if (raw.output_json || raw.has_output) n += 6;
  if (String(raw.input_text || raw.inputText || '').trim()) n += 3;
  if (row?.client_full_name || row?.initials) n += 5;
  if (row?.agency_name) n += 1;
  return n;
}

function mergeCollapsedLibraryRows(a, b) {
  const signed = a.docStatus === DOC_STATUS.SIGNED || b.docStatus === DOC_STATUS.SIGNED;
  const aHasName = !!(a.client_full_name || a.initials);
  const bHasName = !!(b.client_full_name || b.initials);
  let keep;
  let drop;
  if (aHasName !== bHasName) {
    keep = aHasName ? a : b;
    drop = aHasName ? b : a;
  } else if ((a.source === 'draft') !== (b.source === 'draft')) {
    keep = a.source === 'draft' ? a : b;
    drop = keep === a ? b : a;
  } else {
    const takeA = libraryRowRank(a) > libraryRowRank(b)
      || (libraryRowRank(a) === libraryRowRank(b)
        && String(a.created_at || '') >= String(b.created_at || ''));
    keep = takeA ? a : b;
    drop = takeA ? b : a;
  }
  return {
    ...keep,
    docStatus: signed ? DOC_STATUS.SIGNED : keep.docStatus,
    workQueueId: keep.workQueueId || drop.workQueueId || null,
    draftId: keep.draftId || drop.draftId || null,
    clientId: keep.clientId || drop.clientId || null,
    officeEventId: keep.officeEventId || drop.officeEventId || null,
    clinicalSessionId: keep.clinicalSessionId || drop.clinicalSessionId || null,
    client_full_name: keep.client_full_name || drop.client_full_name || null,
    initials: keep.initials || drop.initials || null,
    agency_name: keep.agency_name || drop.agency_name || null,
    service_code: keep.service_code || drop.service_code || null,
    date_of_service: keep.date_of_service || drop.date_of_service || null
  };
}

/** Keep one left-library row per session; signed status wins, names merge from either side. */
export function collapseLeftLibraryRows(rows = []) {
  const passthrough = [];
  const byKey = new Map();
  for (const row of rows || []) {
    const key = sessionDedupeKey(row);
    if (!key) {
      passthrough.push(row);
      continue;
    }
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    byKey.set(key, mergeCollapsedLibraryRows(prev, row));
  }
  return [...passthrough, ...byKey.values()];
}

export function filterLeftLibraryRows(
  rows,
  { tab = 'started', search = '', connection = '', tenant = '' } = {}
) {
  const q = String(search || '').trim().toLowerCase();
  const tenantQ = String(tenant || '').trim().toLowerCase();
  let list = Array.isArray(rows) ? rows : [];
  if (tab === 'all') {
    list = list.filter((r) => isLeftPanelStatus(r.docStatus));
  } else if (LEFT_PANEL_STATUS_TABS.includes(tab)) {
    list = list.filter((r) => normalizeDocStatus(r.docStatus) === tab);
  } else if (tab === 'active') {
    // legacy: started + completed (not signed)
    list = list.filter(
      (r) => r.docStatus === DOC_STATUS.STARTED || r.docStatus === DOC_STATUS.COMPLETED
    );
  } else if (tab === 'archived') {
    list = list.filter((r) => r.docStatus === DOC_STATUS.SIGNED || r.archived_at);
  } else {
    list = list.filter((r) => normalizeDocStatus(r.docStatus) === DOC_STATUS.STARTED);
  }
  if (connection && LEFT_PANEL_CONNECTION_KEYS.includes(connection)) {
    list = list.filter((r) => normalizeNoteConnection(r.connection) === connection);
  }
  if (tenantQ) {
    list = list.filter((r) => String(r.agency_name || '').trim().toLowerCase() === tenantQ);
  }
  if (!q) return list;
  return list.filter((r) => {
    const hay = [
      r.client_full_name,
      r.initials,
      r.agency_name,
      r.client_type,
      r.service_code,
      r.date_of_service,
      r.docStatus,
      r.connection,
      r.id
    ]
      .map((x) => String(x || '').toLowerCase())
      .join(' ');
    return hay.includes(q);
  });
}

export function sortLeftLibraryRows(
  rows,
  { statusOrder = true, connectionOrder = false, dateOrder = 'newest' } = {}
) {
  const dir = dateOrder === 'oldest' ? 1 : -1;
  return [...(rows || [])].sort((a, b) => {
    if (connectionOrder) {
      const ao = noteConnectionMeta(a.connection).sortOrder;
      const bo = noteConnectionMeta(b.connection).sortOrder;
      if (ao !== bo) return ao - bo;
    }
    if (statusOrder) {
      const ao = docStatusMeta(a.docStatus).sortOrder;
      const bo = docStatusMeta(b.docStatus).sortOrder;
      if (ao !== bo) return ao - bo;
    }
    const ad = String(a.date_of_service || a.created_at || '');
    const bd = String(b.date_of_service || b.created_at || '');
    const cmp = ad.localeCompare(bd);
    if (cmp) return cmp * dir;
    return String(a.id).localeCompare(String(b.id)) * dir;
  });
}

/**
 * Group left rows by documentation status, connection, or date/client/etc.
 */
export function groupLeftLibraryRows(rows, { groupBy = 'status', dateOrder = 'newest' } = {}) {
  if (groupBy === 'status') {
    const buckets = LEFT_PANEL_STATUS_TABS.map((key) => {
      const meta = DOC_STATUS_META[key];
      const drafts = sortLeftLibraryRows(
        (rows || []).filter((r) => normalizeDocStatus(r.docStatus) === key),
        { statusOrder: false, connectionOrder: true, dateOrder }
      );
      return {
        key: `status:${key}`,
        label: meta.label,
        month: key === DOC_STATUS.STARTED ? 'IP' : key === DOC_STATUS.COMPLETED ? 'DN' : 'SG',
        day: String(drafts.length),
        sortKey: String(meta.sortOrder).padStart(2, '0'),
        docStatus: key,
        drafts
      };
    }).filter((g) => g.drafts.length);
    return buckets;
  }

  if (groupBy === 'connection') {
    return LEFT_PANEL_CONNECTION_KEYS.map((key) => {
      const meta = NOTE_CONNECTION_META[key];
      const drafts = sortLeftLibraryRows(
        (rows || []).filter((r) => normalizeNoteConnection(r.connection) === key),
        { statusOrder: true, connectionOrder: false, dateOrder }
      );
      return {
        key: `connection:${key}`,
        label: meta.label,
        month: key === NOTE_CONNECTION.UNLINKED ? 'UL' : key === NOTE_CONNECTION.CLIENT ? 'CL' : 'SS',
        day: String(drafts.length),
        sortKey: String(meta.sortOrder).padStart(2, '0'),
        connection: key,
        drafts
      };
    }).filter((g) => g.drafts.length);
  }

  // Reuse date/client grouping shape expected by sidebar — map `drafts` field
  const map = new Map();
  for (const r of rows || []) {
    let key;
    let label;
    let month = '—';
    let day = '—';
    let sortKey;
    if (groupBy === 'client') {
      label = String(r.client_full_name || r.initials || 'Unlinked').trim() || 'Unlinked';
      key = `client:${label.toLowerCase()}`;
      sortKey = label.toLowerCase();
      month = 'CL';
      day = String(label).slice(0, 2).toUpperCase();
    } else if (groupBy === 'tenant') {
      label = String(r.agency_name || 'Unknown tenant').trim() || 'Unknown tenant';
      key = `tenant:${label.toLowerCase()}`;
      sortKey = label.toLowerCase();
      month = 'TN';
      day = String(label).slice(0, 2).toUpperCase();
    } else if (groupBy === 'service_date') {
      const dos = String(r.date_of_service || '').slice(0, 10);
      key = /^\d{4}-\d{2}-\d{2}$/.test(dos) ? `dos:${dos}` : 'dos:unknown';
      label = key === 'dos:unknown' ? 'No service date' : dos;
      sortKey = key === 'dos:unknown' ? '0000-00-00' : dos;
      if (key !== 'dos:unknown') {
        const [, m, d] = dos.split('-');
        month = m;
        day = d;
      } else {
        month = 'DOS';
        day = '—';
      }
    } else {
      // Created date (groupBy === 'date')
      let createdKey = 'unknown';
      const rawCreated = r.created_at;
      if (rawCreated) {
        const asStr = String(rawCreated);
        if (/^\d{4}-\d{2}-\d{2}/.test(asStr)) {
          createdKey = asStr.slice(0, 10);
        } else {
          try {
            const d = new Date(rawCreated);
            if (!Number.isNaN(d.getTime())) createdKey = d.toISOString().slice(0, 10);
          } catch {
            createdKey = 'unknown';
          }
        }
      }
      key = createdKey === 'unknown' ? 'created:unknown' : `created:${createdKey}`;
      label = createdKey === 'unknown' ? 'Unknown created date' : createdKey;
      sortKey = createdKey === 'unknown' ? '0000-00-00' : createdKey;
      if (createdKey !== 'unknown') {
        const [, m, d] = createdKey.split('-');
        month = m;
        day = d;
      } else {
        month = 'CRT';
        day = '—';
      }
    }
    if (!map.has(key)) {
      map.set(key, { key, label, month, day, sortKey, drafts: [] });
    }
    map.get(key).drafts.push(r);
  }
  const groups = [...map.values()].map((g) => ({
    ...g,
    drafts: sortLeftLibraryRows(g.drafts, { statusOrder: true, connectionOrder: true, dateOrder })
  }));
  const dir = dateOrder === 'oldest' ? 1 : -1;
  groups.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)) * dir);
  return groups;
}
