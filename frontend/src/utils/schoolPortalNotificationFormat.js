/**
 * Shared display helpers for school portal notification feed items.
 */

export function formatSchoolNotificationClientLabel(item) {
  const code = String(item?.client_identifier_code || '').trim();
  const initials = String(item?.client_initials || '').trim();
  return code || initials || '';
}

export function formatSchoolNotificationKindLabel(item) {
  const kind = String(item?.kind || '').toLowerCase();
  const category = String(item?.category || '').toLowerCase();
  const labels = {
    ticket: 'Ticket',
    comment: 'Comment',
    message: 'Message',
    announcement: 'Announcement',
    checklist: 'Checklist',
    status: 'Status',
    assignment: 'Assignment',
    client_created: 'New client',
    provider_slots: 'Provider slots',
    provider_day: 'Provider day',
    doc: 'Docs / links',
    intake_packet: 'Intake packet'
  };
  if (kind === 'client_event' && category === 'ticket') return 'Ticket update';
  if (labels[kind]) return labels[kind];
  return kind ? kind.replace(/_/g, ' ') : 'Update';
}

function messageSuffix(item) {
  const raw = String(item?.message || '').trim();
  const label = formatSchoolNotificationClientLabel(item);
  if (!raw) return '';
  if (label && raw.startsWith(`${label}:`)) {
    return raw.slice(label.length + 1).trim();
  }
  const colon = raw.indexOf(':');
  if (colon >= 0) return raw.slice(colon + 1).trim();
  return raw;
}

function messageSubject(item) {
  const raw = String(item?.message || '').trim();
  const label = formatSchoolNotificationClientLabel(item);
  if (label && raw.startsWith(`${label}:`)) return label;
  const colon = raw.indexOf(':');
  if (colon > 0) return raw.slice(0, colon).trim();
  return '';
}

/** What changed — without redundant client prefix when shown separately. */
export function formatSchoolNotificationAction(item) {
  const kind = String(item?.kind || '').toLowerCase();
  if (kind === 'announcement') {
    return String(item?.message || '').trim() || String(item?.title || '').trim();
  }
  const suffix = messageSuffix(item);
  if (suffix) return suffix;
  return String(item?.title || '').trim() || 'Update';
}

/** Person who performed the action (when known). */
export function formatSchoolNotificationActor(item) {
  return String(item?.actor_name || '').trim();
}

/** Subject of the change when different from actor (e.g. provider whose slots changed). */
export function formatSchoolNotificationSubject(item) {
  const kind = String(item?.kind || '').toLowerCase();
  if (['provider_slots', 'provider_day'].includes(kind)) {
    return messageSubject(item);
  }
  return '';
}

/** One-line "who did what" summary for list rows. */
export function formatSchoolNotificationDetailLine(item) {
  const action = formatSchoolNotificationAction(item);
  const actor = formatSchoolNotificationActor(item);
  const subject = formatSchoolNotificationSubject(item);
  const kind = String(item?.kind || '').toLowerCase();

  if (kind === 'announcement' && actor) {
    return action ? `Posted by ${actor} — ${action}` : `Posted by ${actor}`;
  }

  if (['provider_slots', 'provider_day'].includes(kind)) {
    if (subject && action) return `${subject} · ${action}`;
    return subject || action || 'Schedule update';
  }

  if (actor && action) return `${action} — by ${actor}`;
  if (actor) return `By ${actor}`;
  return action || String(item?.title || '').trim() || 'Update';
}
