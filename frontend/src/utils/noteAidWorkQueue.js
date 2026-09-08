/**
 * Note Aid work-queue helpers.
 *
 * PHI policy: client names / todo actions must NEVER be written to localStorage
 * or sessionStorage. Queue state is persisted on the server (encrypted payload)
 * and cached in memory for the SPA session. Legacy browser keys are scrubbed.
 */

import api from '../services/api';

/** @type {Map<string|number, Array>} */
const memoryWorkQueues = new Map();

const LEGACY_PREFIX = 'noteAidWorkQueue:';

/** @type {Map<string|number, ReturnType<typeof setTimeout>>} */
const syncTimers = new Map();

export function workQueueStorageKey(userId) {
  const uid = Number(userId || 0) || 'anon';
  const day = new Date().toISOString().slice(0, 10);
  return `${LEGACY_PREFIX}${uid}:${day}`;
}

/** Normalize work-queue / DOS values to YYYY-MM-DD (rejects ambiguous weekday-only labels). */
export function toWorkQueueDateOnly(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const mdy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (mdy) {
    let yyyy = mdy[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${String(mdy[1]).padStart(2, '0')}-${String(mdy[2]).padStart(2, '0')}`;
  }
  // Recover corrupted mysql Date stringification: "Mon Aug 03 2026 00:00:00 GMT-0600"
  const withYear = s.match(
    /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{4}/i
  );
  if (withYear) {
    const d = new Date(withYear[0]);
    if (!Number.isNaN(d.getTime())) return toWorkQueueDateOnly(d);
  }
  // Short display form "Mon Aug 03" — assume current year (best-effort for stale UI cache).
  const short = s.match(/^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+([A-Za-z]{3})\s+(\d{1,2})$/i);
  if (short) {
    const d = new Date(`${short[1]} ${short[2]}, ${new Date().getFullYear()} 12:00:00`);
    if (!Number.isNaN(d.getTime())) return toWorkQueueDateOnly(d);
  }
  return null;
}

/** Convert "1 PM" / "10:30 AM" labels into HH:MM (24h). */
export function timeLabelToHhMm(label) {
  const m = String(label || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && hour < 12) hour += 12;
  if (ap === 'AM' && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Build a local ISO start from YYYY-MM-DD + time label for queue → note porting.
 */
export function scheduledStartFromQueueDateAndTime(dateOnly, timeLabel) {
  const dos = toWorkQueueDateOnly(dateOnly);
  const hhmm = timeLabelToHhMm(timeLabel);
  if (!dos || !hhmm) return null;
  const d = new Date(`${dos}T${hhmm}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Remove legacy work-queue keys that may contain PHI. */
export function scrubLegacyWorkQueueStorage(userId = null) {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LEGACY_PREFIX)) continue;
      if (userId != null) {
        const uid = Number(userId || 0) || 'anon';
        if (!key.startsWith(`${LEGACY_PREFIX}${uid}:`)) continue;
      }
      keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

export function loadWorkQueue(userId) {
  scrubLegacyWorkQueueStorage(userId);
  const uid = Number(userId || 0) || 'anon';
  const items = memoryWorkQueues.get(uid);
  return Array.isArray(items) ? items.map((row) => ({ ...row })) : [];
}

export function saveWorkQueue(userId, items) {
  const uid = Number(userId || 0) || 'anon';
  memoryWorkQueues.set(uid, Array.isArray(items) ? items.map((row) => ({ ...row })) : []);
  scrubLegacyWorkQueueStorage(userId);
}

/** Clear in-memory queue and scrub any leftover browser keys for this user. */
export function clearAllWorkQueues(userId) {
  const uid = Number(userId || 0) || 'anon';
  memoryWorkQueues.delete(uid);
  const timer = syncTimers.get(uid);
  if (timer) {
    clearTimeout(timer);
    syncTimers.delete(uid);
  }
  scrubLegacyWorkQueueStorage(userId);
}

function normalizeApiItems(items) {
  return (Array.isArray(items) ? items : []).map((row) => ({
    ...row,
    id: row.id || row.clientKey || (row.serverId ? `srv_${row.serverId}` : newWorkQueueItemId()),
    clientKey: row.clientKey || row.id || null,
    serverId: row.serverId || null,
    status: row.status || row.docStatus || 'not_started',
    docStatus: row.docStatus || row.status || 'not_started'
  }));
}

/** Load queue from server into memory cache. */
export async function fetchWorkQueueFromApi(userId) {
  scrubLegacyWorkQueueStorage(userId);
  const res = await api.get('/clinical-notes/work-queue', { skipGlobalLoading: true });
  const items = normalizeApiItems(res?.data?.items);
  saveWorkQueue(userId, items);
  return items;
}

/** Full reconcile to server (source of truth after Clear / lifecycle updates). */
export async function syncWorkQueueToApi(userId, items) {
  const list = Array.isArray(items) ? items : [];
  // Never PUT an empty list — that used to wipe the server queue on reload races.
  // Intentional clear goes through clearWorkQueueOnApi.
  if (!list.length) {
    return fetchWorkQueueFromApi(userId);
  }
  saveWorkQueue(userId, list);
  const res = await api.put(
    '/clinical-notes/work-queue',
    { items: list },
    { skipGlobalLoading: true }
  );
  const saved = normalizeApiItems(res?.data?.items);
  saveWorkQueue(userId, saved);
  return saved;
}

/** Debounced sync — coalesces rapid status patches. */
export function scheduleWorkQueueSync(userId, items, { delayMs = 400 } = {}) {
  const uid = Number(userId || 0) || 'anon';
  saveWorkQueue(userId, items);
  const prev = syncTimers.get(uid);
  if (prev) clearTimeout(prev);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      syncTimers.delete(uid);
      try {
        resolve(await syncWorkQueueToApi(userId, loadWorkQueue(userId)));
      } catch (err) {
        reject(err);
      }
    }, delayMs);
    syncTimers.set(uid, timer);
  });
}

/** Flush any pending debounced sync immediately. */
export async function flushWorkQueueSync(userId) {
  const uid = Number(userId || 0) || 'anon';
  const prev = syncTimers.get(uid);
  if (prev) {
    clearTimeout(prev);
    syncTimers.delete(uid);
  }
  return syncWorkQueueToApi(userId, loadWorkQueue(userId));
}

/** Append / upsert without wiping other rows (import + Tasks handoff). */
export async function appendWorkQueueToApi(userId, items) {
  const res = await api.post(
    '/clinical-notes/work-queue',
    { items: Array.isArray(items) ? items : [] },
    { skipGlobalLoading: true }
  );
  const saved = normalizeApiItems(res?.data?.items);
  // Merge into memory cache by client key
  const existing = loadWorkQueue(userId);
  const byKey = new Map(existing.map((i) => [String(i.clientKey || i.id), i]));
  for (const row of saved) {
    byKey.set(String(row.clientKey || row.id), row);
  }
  const merged = Array.from(byKey.values());
  saveWorkQueue(userId, merged);
  return { saved, merged };
}

export async function clearWorkQueueOnApi(userId) {
  clearAllWorkQueues(userId);
  await api.delete('/clinical-notes/work-queue', { skipGlobalLoading: true });
  return [];
}

export function newWorkQueueItemId() {
  return `wq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ymdFromDateParts(mmRaw, ddRaw, yyRaw) {
  const mm = String(mmRaw).padStart(2, '0');
  const dd = String(ddRaw).padStart(2, '0');
  let yyyy = String(yyRaw);
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

function classifyTodoAction(action) {
  const actionLower = String(action || '').toLowerCase();
  const codeMatch = String(action || '').match(/\((\d{5}|[A-Z]\d{4})\)/i);
  let serviceCode = codeMatch ? codeMatch[1].toUpperCase() : null;

  // True skip: 99415 / supervision. H0031 "Consultation" is the additional-assessment
  // session type (not intake) and must be queued as a progress/additional note.
  if (/\b99415\b/.test(action) || /supervision/i.test(action)) {
    return { skip: true, reason: 'consultation' };
  }
  if (/consultation/i.test(action) && serviceCode !== 'H0031') {
    return { skip: true, reason: 'consultation' };
  }

  let noteKind = 'progress';
  if (/intake/i.test(actionLower)) {
    noteKind = 'intake';
    serviceCode = serviceCode || '90791';
  } else if (/termination/i.test(actionLower)) {
    noteKind = 'termination';
  } else if (/treatment\s*plan/i.test(actionLower)) {
    noteKind = 'treatment_plan';
  } else if (serviceCode === 'H0031') {
    // Consultation (H0031) / progress Note (H0031) → additional assessment, not intake.
    noteKind = 'progress';
    serviceCode = 'H0031';
  } else {
    noteKind = 'progress';
    serviceCode = serviceCode || '90837';
  }

  const timeMatch = String(action || '').match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  let timeLabel = null;
  if (timeMatch) {
    timeLabel = timeMatch[2]
      ? `${timeMatch[1]}:${timeMatch[2]} ${timeMatch[3].toUpperCase()}`
      : `${timeMatch[1]} ${timeMatch[3].toUpperCase()}`;
  }

  return { skip: false, noteKind, serviceCode, timeLabel };
}

function pushParsedItem(items, skipped, { date, name, action }) {
  if (!name || !action) return;
  const classified = classifyTodoAction(action);
  if (classified.skip) {
    skipped.push({ date, name, action, reason: classified.reason || 'consultation' });
    return;
  }
  items.push({
    id: newWorkQueueItemId(),
    date,
    clientName: name,
    action,
    noteKind: classified.noteKind,
    serviceCode: classified.serviceCode,
    timeLabel: classified.timeLabel,
    status: 'not_started',
    clientId: null,
    agencyId: null,
    organizationId: null
  });
}

/**
 * Single-line day list:
 * "4/9/26 Sheldon Baron Create a Progress Note for Therapy Session (90837) on 4/9 at 12 pm."
 */
function parseOneLineTodo(line) {
  const m = String(line || '').match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s+(.+)$/
  );
  if (!m) return null;
  const rest = String(m[4] || '').trim();
  // Action usually starts with "Create a/an …"
  let split = rest.match(/^(.*?)\s+(Create\s+(?:a|an)\s+.+)$/i);
  if (!split) {
    // Fallback: first two tokens = name, remainder = action
    const parts = rest.split(/\s+/);
    if (parts.length < 3) return null;
    split = [null, parts.slice(0, 2).join(' '), parts.slice(2).join(' ')];
  }
  const name = String(split[1] || '').trim();
  const action = String(split[2] || '').trim();
  if (!name || !action) return null;
  return {
    date: ymdFromDateParts(m[1], m[2], m[3]),
    name,
    action
  };
}

/**
 * Parse pasted clinician ToDo list.
 * Supports:
 *  - 3-line blocks (date / name / action)
 *  - single-line rows (date name action…)
 * Skips 99415 / supervision / non-H0031 Consultation. Keeps H0031 Consultation
 * (additional assessment), progress, intake, termination, treatment-plan renewal.
 */
export function parseNoteAidTodoList(rawText) {
  const raw = String(rawText || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return { items: [], skipped: [], unparsed: 0 };

  const lines = raw.split('\n').map((l) => l.trim());
  const items = [];
  const skipped = [];
  let unparsed = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i += 1;
      continue;
    }

    // Prefer single-line rows when date + more text share one line.
    const oneLine = parseOneLineTodo(line);
    if (oneLine) {
      pushParsedItem(items, skipped, oneLine);
      i += 1;
      continue;
    }

    const dateMatch = line.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*$/);
    if (!dateMatch) {
      unparsed += 1;
      i += 1;
      continue;
    }

    const date = ymdFromDateParts(dateMatch[1], dateMatch[2], dateMatch[3]);

    i += 1;
    while (i < lines.length && !lines[i]) i += 1;
    const name = lines[i] || '';
    i += 1;
    while (i < lines.length && !lines[i]) i += 1;
    const action = lines[i] || '';
    i += 1;

    if (!name || !action) {
      unparsed += 1;
      continue;
    }
    pushParsedItem(items, skipped, { date, name, action });
  }

  return { items, skipped, unparsed };
}

export function normalizePersonNameKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function namesLikelySamePerson(a, b) {
  const na = normalizePersonNameKey(a);
  const nb = normalizePersonNameKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const pa = na.split(' ');
  const pb = nb.split(' ');
  if (pa.length < 2 || pb.length < 2) return false;
  return pa[0] === pb[0] && pa[pa.length - 1] === pb[pa.length - 1];
}

/** Prefer the chart with the most durable identity data (and oldest id on ties). */
export function scoreTodoClientCompleteness(client) {
  if (!client) return -1;
  let score = 0;
  const status = String(client.status || client.client_status_key || '').toUpperCase();
  if (status && status !== 'ARCHIVED') score += 20;
  if (client.date_of_birth || client.dateOfBirth) score += 8;
  if (client.contact_phone || client.contactPhone) score += 4;
  if (client.email) score += 3;
  if (client.demographics_phi_enc || client.demographicsPhiEnc || client.demographics_on_file || client.demographicsOnFile) {
    score += 6;
  }
  const full = String(client.full_name || client.fullName || '').trim();
  if (full.includes(' ')) score += 2;
  if (client.provider_id || client.providerId) score += 1;
  // Older records win ties so repeated ToDos converge on the first chart.
  const id = Number(client.id || 0) || 0;
  if (id > 0) score += Math.max(0, 1000000 - id) / 1000000;
  return score;
}

function normalizeInitialsCompareKey(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Attach a ToDo name to an existing client on:
 * 1) unique exact full-name / first+last match, or
 * 2) unique initials match (or best completeness when several share initials).
 * Do not use substring name matches — "Ann" must not steal "Joanna".
 */
export function matchTodoClientFromSearchRows(todoName, rows = []) {
  const nameKey = normalizePersonNameKey(todoName);
  if (!nameKey) return null;
  const list = Array.isArray(rows) ? rows : [];

  const exact = list.filter((c) => {
    const full = normalizePersonNameKey(c.full_name || c.fullName || '');
    const firstLast = normalizePersonNameKey(
      [c.first_name || c.firstName, c.last_name || c.lastName].filter(Boolean).join(' ')
    );
    return full === nameKey || (firstLast && firstLast === nameKey);
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    return [...exact].sort((a, b) => scoreTodoClientCompleteness(b) - scoreTodoClientCompleteness(a))[0];
  }

  const initialsKey = normalizeInitialsCompareKey(deriveInitialsFromName(todoName));
  if (!initialsKey || initialsKey.length < 2 || initialsKey === 'TBD') return null;
  const byInitials = list.filter((c) => {
    const status = String(c.status || '').toUpperCase();
    if (status === 'ARCHIVED') return false;
    const rowKey = normalizeInitialsCompareKey(c.initials || '');
    return rowKey && rowKey === initialsKey;
  });
  if (!byInitials.length) return null;
  if (byInitials.length === 1) return byInitials[0];
  return [...byInitials].sort((a, b) => scoreTodoClientCompleteness(b) - scoreTodoClientCompleteness(a))[0];
}

export function deriveInitialsFromName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0].replace(/[^A-Za-z]/g, '');
    const last = parts[parts.length - 1].replace(/[^A-Za-z]/g, '');
    if (first.length >= 3 && last.length >= 3) {
      return `${first.slice(0, 3)}${last.slice(0, 3)}`.toUpperCase();
    }
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  }
  if (parts.length === 1) {
    const w = parts[0].replace(/[^A-Za-z]/g, '');
    return w.slice(0, 6).toUpperCase() || 'TBD';
  }
  return 'TBD';
}
