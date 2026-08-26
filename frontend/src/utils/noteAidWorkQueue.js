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

export function newWorkQueueItemId() {
  return `wq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Parse pasted clinician ToDo list.
 * Skips Consultation / 99415. Keeps progress, intake, termination, treatment-plan renewal.
 */
export function parseNoteAidTodoList(rawText) {
  const raw = String(rawText || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return { items: [], skipped: [] };

  const lines = raw.split('\n').map((l) => l.trim());
  const items = [];
  const skipped = [];

  let i = 0;
  while (i < lines.length) {
    const dateLine = lines[i];
    if (!dateLine) {
      i += 1;
      continue;
    }

    const dateMatch = dateLine.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*$/);
    if (!dateMatch) {
      i += 1;
      continue;
    }

    const mm = String(dateMatch[1]).padStart(2, '0');
    const dd = String(dateMatch[2]).padStart(2, '0');
    let yyyy = dateMatch[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    const date = `${yyyy}-${mm}-${dd}`;

    i += 1;
    while (i < lines.length && !lines[i]) i += 1;
    const name = lines[i] || '';
    i += 1;
    while (i < lines.length && !lines[i]) i += 1;
    const action = lines[i] || '';
    i += 1;

    if (!name || !action) continue;

    const actionLower = action.toLowerCase();
    if (
      /consultation/i.test(action)
      || /\b99415\b/.test(action)
      || /supervision/i.test(action)
    ) {
      skipped.push({ date, name, action, reason: 'consultation' });
      continue;
    }

    let noteKind = 'progress';
    let serviceCode = null;
    const codeMatch = action.match(/\((\d{5}|[A-Z]\d{4})\)/i);
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

    const timeMatch = action.match(/\bat\s+(\d{1,2})\s*(AM|PM)\b/i);
    let timeLabel = null;
    if (timeMatch) {
      timeLabel = `${timeMatch[1]} ${timeMatch[2].toUpperCase()}`;
    }

    items.push({
      id: newWorkQueueItemId(),
      date,
      clientName: name,
      action,
      noteKind,
      serviceCode,
      timeLabel,
      status: 'not_started',
      clientId: null,
      agencyId: null,
      organizationId: null
    });
  }

  return { items, skipped };
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
