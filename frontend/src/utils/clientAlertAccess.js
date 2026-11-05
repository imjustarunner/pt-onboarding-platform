/** Same exclusion as the client chart messages window. */
const MESSAGES_WINDOW_EXCLUDED = new Set(['school_staff', 'client_guardian', 'client']);

export function canSeeClientMessagesWindow(role) {
  const roleNorm = String(role || '').toLowerCase();
  return !!roleNorm && !MESSAGES_WINDOW_EXCLUDED.has(roleNorm);
}
