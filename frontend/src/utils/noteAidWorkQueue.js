/**
 * Note Aid sticky work-queue helpers (localStorage-backed).
 */

export function workQueueStorageKey(userId) {
  const uid = Number(userId || 0) || 'anon';
  const day = new Date().toISOString().slice(0, 10);
  return `noteAidWorkQueue:${uid}:${day}`;
}

export function loadWorkQueue(userId) {
  try {
    const raw = localStorage.getItem(workQueueStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWorkQueue(userId, items) {
  try {
    localStorage.setItem(workQueueStorageKey(userId), JSON.stringify(items || []));
  } catch {
    // ignore quota
  }
}

/** Remove every sticky work-queue day bucket for this user (Done / In progress list). */
export function clearAllWorkQueues(userId) {
  const uid = Number(userId || 0) || 'anon';
  const prefix = `noteAidWorkQueue:${uid}:`;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
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
  if (
    /consultation/i.test(action)
    || /\b99415\b/.test(action)
    || /supervision/i.test(action)
  ) {
    return { skip: true, reason: 'consultation' };
  }

  let noteKind = 'progress';
  let serviceCode = null;
  const codeMatch = String(action || '').match(/\((\d{5}|[A-Z]\d{4})\)/i);
  if (codeMatch) serviceCode = codeMatch[1].toUpperCase();

  if (/intake/i.test(actionLower)) {
    noteKind = 'intake';
    serviceCode = serviceCode || '90791';
  } else if (/termination/i.test(actionLower)) {
    noteKind = 'termination';
    serviceCode = serviceCode || null;
  } else if (/treatment\s*plan/i.test(actionLower)) {
    noteKind = 'treatment_plan';
    serviceCode = serviceCode || null;
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
 * Skips Consultation / 99415. Keeps progress, intake, termination, treatment-plan renewal.
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
  return pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1];
}

/**
 * Attach a ToDo name to an existing client only on a unique exact (or unique first+last) match.
 * Do not use substring matches — "Ann" must not steal "Joanna" / a prior queue client.
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
  if (exact.length > 1) return null;
  return null;
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
