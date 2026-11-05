/** People who cannot open the client messages window also cannot use client alerts. */
const MESSAGES_WINDOW_EXCLUDED = new Set(['school_staff', 'client_guardian', 'client']);

export function canSeeClientMessagesWindow(role) {
  const roleNorm = String(role || '').toLowerCase();
  return !!roleNorm && !MESSAGES_WINDOW_EXCLUDED.has(roleNorm);
}

export function readClientAlertText(source) {
  const raw = source && typeof source === 'object'
    ? (source.client_alert ?? source.clientAlert ?? '')
    : source;
  const text = String(raw ?? '').trim();
  if (text.length > 2000) {
    return { ok: false, error: 'Client alert must be 2000 characters or fewer' };
  }
  return { ok: true, text };
}

/** Exact assignee-email line. Empty when there is no alert text. */
export function clientAlertLine(alert) {
  const text = String(alert || '').trim();
  return text ? `Client Alert: ${text}` : '';
}

export function prependClientAlertText(body, alert) {
  const line = clientAlertLine(alert);
  if (!line) return String(body || '');
  return `${line}\n\n${body || ''}`;
}

/**
 * Alerts still pending for one person. Dismissing an alert hides it only for
 * that user. A later alert stays visible until that user dismisses it too.
 */
export function visibleClientAlerts(alerts, dismissals, userId) {
  const mine = new Set(
    (dismissals || [])
      .filter((row) => Number(row.user_id) === Number(userId))
      .map((row) => Number(row.alert_id))
  );
  return (alerts || [])
    .filter((row) => !mine.has(Number(row.id)))
    .sort((a, b) => Number(b.id) - Number(a.id));
}
