/** Shared helpers for company-event shift requests (dashboard + calendar modal). */

export function primaryCompanyEventSession(event) {
  if (!event) return null;
  return (Array.isArray(event.sessions) && event.sessions[0]) || null;
}

/** Event allows provider/staff shift requests (school outreach or program staffing blocks). */
export function isRequestableCompanyEvent(event) {
  if (!event) return false;
  if (event.canRequestOutreachShift) return true;
  const cfg = event.staffingConfig;
  const t = String(event.eventType || '').toLowerCase();
  if (t === 'skills_group') return false;
  return !!cfg?.enabled && cfg?.providerSignup?.enabled !== false;
}

export function requiredProvidersForSession(session, event) {
  const fromSession = Number(session?.requiredProviders);
  if (Number.isFinite(fromSession) && fromSession > 0) return fromSession;
  const fromCfg = Number(event?.staffingConfig?.minProvidersPerSession);
  if (Number.isFinite(fromCfg) && fromCfg > 0) return fromCfg;
  if (isRequestableCompanyEvent(event)) return 1;
  return 0;
}

export function isSessionStaffingFull(session, event) {
  if (!session) return false;
  const required = requiredProvidersForSession(session, event);
  if (required <= 0) return false;
  const approved = Number(session.approvedProvidersCount ?? 0);
  return approved >= required;
}

export function companyEventRequestStatusLabel(event, session = primaryCompanyEventSession(event)) {
  if (!session) return '';
  if (session.myAssignment) {
    const s = String(session.myAssignment.assignmentStatus || 'draft');
    return s === 'finalized' ? 'Confirmed' : `Assigned (${s})`;
  }
  if (session.myRequest) {
    const st = String(session.myRequest.status || 'pending');
    return `Request ${st}`;
  }
  if (isSessionStaffingFull(session, event)) return 'Staffing full';
  return '';
}

export function canRequestCompanyEventShift(event, session = primaryCompanyEventSession(event)) {
  if (!isRequestableCompanyEvent(event) || !session) return false;
  if (session.myAssignment) return false;
  const st = String(session.myRequest?.status || '').toLowerCase();
  if (st === 'pending' || st === 'approved') return false;
  if (isSessionStaffingFull(session, event)) return false;
  return true;
}

export function companyEventRequestKey(event, session = primaryCompanyEventSession(event)) {
  if (!event?.id || !session?.sessionDateId) return '';
  return `${event.id}:${session.sessionDateId}`;
}
