/** Shared helpers for company-event shift requests (dashboard + calendar modal). */

export function isFirstDayOfSchoolCompanyEvent(event) {
  if (!event) return false;
  const eventType = String(event.eventType || event.event_type || '').trim().toLowerCase();
  if (eventType === 'school_first_day') return true;
  const category = String(
    event.schoolEventCategory || event.category || event.school_event_category || ''
  )
    .trim()
    .toLowerCase();
  if (category === 'first_day') return true;
  const title = String(event.title || event.name || '').trim().toLowerCase();
  if (/\bfirst\s*day\s*of\s*school\b/.test(title)) return true;
  if (/\bjump\s*start\b/.test(title) && /\bfirst\s*day\b/.test(title)) return true;
  return false;
}

export function isCalendarOnlyCompanyEvent(event) {
  if (!event) return false;
  const type = String(event.eventType || event.event_type || '').toLowerCase();
  return event.calendarOnly === true || isFirstDayOfSchoolCompanyEvent(event)
    || ['school_holiday', 'school_day_off', 'school_fall_check_in', 'school_spring_event'].includes(type);
}

export function isUpcomingCompanyEvent(event, now = Date.now()) {
  if (!event || event.isActive === false || event.is_active === 0) return false;
  if (['canceled', 'cancelled'].includes(String(event.schoolEventStatus || event.school_event_status || '').toLowerCase())) return false;
  const sessions = Array.isArray(event.sessions) ? event.sessions : [];
  if (sessions.some((session) => new Date(session.endsAt || session.startsAt).getTime() > now)) return true;
  const end = new Date(event.nextOccurrenceEnd || event.endsAt || event.nextOccurrenceStart || event.startsAt).getTime();
  return Number.isFinite(end) && end > now;
}

/** Invitations, current assignments/requests, and shifts that still have room. */
export function shouldShowOnProviderDashboardEvents(event, now = Date.now()) {
  if (!isUpcomingCompanyEvent(event, now) || isCalendarOnlyCompanyEvent(event)) return false;
  const sessions = Array.isArray(event.sessions) ? event.sessions : [];
  const upcoming = sessions.filter((session) => new Date(session.endsAt || session.startsAt).getTime() > now);
  if (upcoming.some((session) => session.myAssignment || ['pending', 'approved'].includes(session.myRequest?.status))) return true;
  if (upcoming.some((session) => canRequestCompanyEventShift(event, session, now))) return true;
  const type = String(event.eventType || event.event_type || '').toLowerCase();
  // School/program events require a staffing opportunity or a personal assignment.
  if (type.startsWith('school_') || type.startsWith('program_') || type === 'guardian_program_class' || type === 'skills_group') return false;
  return !isRequestableCompanyEvent(event);
}

export function primaryCompanyEventSession(event, now = Date.now()) {
  if (!event) return null;
  const sessions = (Array.isArray(event.sessions) ? event.sessions : [])
    .filter((session) => new Date(session.endsAt || session.startsAt).getTime() > now)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  return sessions.find((session) => session.myAssignment || ['pending', 'approved'].includes(session.myRequest?.status))
    || sessions.find((session) => canRequestCompanyEventShift(event, session, now))
    || sessions[0] || null;
}

export function companyEventDisplayWindow(event) {
  const session = primaryCompanyEventSession(event);
  return {
    startsAt: session?.startsAt || event?.nextOccurrenceStart || event?.startsAt,
    endsAt: session?.endsAt || event?.nextOccurrenceEnd || event?.endsAt
  };
}

export function providerEventCategoryLabel(event) {
  if (isCalendarOnlyCompanyEvent(event)) return 'School calendar date';
  const type = String(event?.eventType || '').toLowerCase();
  if (type === 'school_outreach') return 'Outreach';
  if (type.startsWith('school_')) return 'School event';
  if (type.startsWith('program_') || type === 'guardian_program_class') return 'Program event';
  return 'Company event';
}

/** Event allows provider/staff shift requests (school outreach or program staffing blocks). */
export function isRequestableCompanyEvent(event) {
  if (!event || isCalendarOnlyCompanyEvent(event)) return false;
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

export function canRequestCompanyEventShift(event, session = primaryCompanyEventSession(event), now = Date.now()) {
  if (!isRequestableCompanyEvent(event) || !session) return false;
  if (!isUpcomingCompanyEvent(event, now) || !(new Date(session.endsAt || session.startsAt).getTime() > now)) return false;
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
