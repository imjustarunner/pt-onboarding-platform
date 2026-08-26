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
  return key === DOC_STATUS.NOT_STARTED || key === DOC_STATUS.STARTED;
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

/**
 * Build left-library rows from drafts + started/completed/signed work-queue items.
 * Work-queue rows that are only not_started are excluded.
 */
export function buildLeftLibraryRows({ drafts = [], workQueueItems = [] } = {}) {
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
      initials: d.initials || null,
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
    if (item.draftId && rows.some((r) => String(r.draftId) === String(item.draftId))) {
      continue;
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
      initials: null,
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

  return rows;
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
