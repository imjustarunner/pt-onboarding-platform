/** Workflow status takes precedence over a separate paperwork checklist. */
export function clientSummaryTone(client) {
  const workflow=String(client?.status || '').toUpperCase();
  const statusKey=String(client?.client_status_key || '').toLowerCase();
  const paperworkKey=String(client?.paperwork_status_key || '').toLowerCase();
  const rawNeeded=client?.paperwork_needed_count;
  const needed=rawNeeded == null || rawNeeded === '' ? NaN : Number(rawNeeded);
  if (['pending','packet','prospective','waitlist','screener'].includes(statusKey)
    || ['PENDING','PACKET','SCREENER','PENDING_REVIEW','RETURNING','PROSPECTIVE','WAITLIST'].includes(workflow)) return 'pending';
  if (workflow === 'ON_HOLD' || statusKey === 'on_hold' || paperworkKey === 'all_needed'
    || (Number.isFinite(needed) && needed > 1)) return 'attention';
  if (statusKey === 'current' || workflow === 'ACTIVE' || paperworkKey === 'completed'
    || (Number.isFinite(needed) && needed === 0)) return 'completed';
  return 'neutral';
}
