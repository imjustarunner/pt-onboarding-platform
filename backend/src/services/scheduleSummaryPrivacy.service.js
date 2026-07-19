/**
 * Schedule summary detail levels and create-for-others auth helpers.
 * busy = anonymous intervals only
 * typed = activity type + office + provider identity (no client PII) — default for peer overlays
 * full = current rich payload
 */

export const SCHEDULE_DETAIL_FULL_ROLES = new Set([
  'super_admin',
  'superadmin',
  'admin',
  'support',
  'clinical_practice_assistant'
]);

/** Roles that may create/edit another user's calendar (plus supervisor→supervisee). */
export const SCHEDULE_MANAGE_OTHERS_ROLES = new Set([
  'super_admin',
  'superadmin',
  'admin',
  'support',
  'clinical_practice_assistant',
  'staff',
  'provider_plus'
]);

export function normalizeScheduleRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function canViewFullScheduleDetails(role) {
  return SCHEDULE_DETAIL_FULL_ROLES.has(normalizeScheduleRole(role));
}

export function canManageOthersSchedule(role) {
  return SCHEDULE_MANAGE_OTHERS_ROLES.has(normalizeScheduleRole(role));
}

/**
 * Resolve detailLevel from query + actor privileges.
 * Privileged / supervisor-of-target may request full; peers default to typed (not anonymous busy).
 */
export function resolveScheduleDetailLevel({
  requestedLevel,
  isSelf,
  actorRole,
  isSupervisorOfTarget = false
}) {
  const raw = String(requestedLevel || '').trim().toLowerCase();
  if (isSelf) return raw === 'busy' ? 'busy' : 'full';
  const canFull = canViewFullScheduleDetails(actorRole) || isSupervisorOfTarget;
  if (raw === 'full' && canFull) return 'full';
  if (raw === 'busy') return 'busy';
  if (raw === 'typed') return 'typed';
  // Default: privileged get full, peers get typed activity (type + office + provider, no client PII)
  return canFull ? 'full' : 'typed';
}

function intervalFromRow(row, startKeys = ['startAt', 'start_at', 'start'], endKeys = ['endAt', 'end_at', 'end']) {
  let startAt = null;
  let endAt = null;
  for (const k of startKeys) {
    if (row?.[k] != null && String(row[k]).trim()) {
      startAt = row[k];
      break;
    }
  }
  for (const k of endKeys) {
    if (row?.[k] != null && String(row[k]).trim()) {
      endAt = row[k];
      break;
    }
  }
  if (!startAt || !endAt) return null;
  return { startAt, endAt };
}

function officeLabelFromRow(row = {}) {
  const building = String(row.buildingName || row.building_name || '').trim();
  const roomNumber = String(row.roomNumber || row.room_number || '').trim();
  const roomLabel = String(row.roomLabel || row.room_label || row.roomName || row.room_name || '').trim();
  const roomShort = roomNumber ? `#${roomNumber}` : roomLabel;
  if (building && roomShort) return `${building} ${roomShort}`;
  return building || roomShort || '';
}

function activityFromOfficeRow(row = {}) {
  const slotState = String(row.slotState || row.slot_state || '').toUpperCase();
  const apptType = String(row.appointmentType || row.appointment_type || '').toUpperCase();
  const officeLabel = officeLabelFromRow(row);
  if (slotState === 'ASSIGNED_BOOKED' || apptType === 'SESSION' || apptType.includes('SESSION')) {
    return {
      activityType: 'session',
      title: officeLabel ? `Session · ${officeLabel}` : 'Session',
      officeLabel
    };
  }
  if (slotState === 'ASSIGNED_TEMPORARY') {
    return {
      activityType: 'hold',
      title: officeLabel ? `Temp hold · ${officeLabel}` : 'Temporary hold',
      officeLabel
    };
  }
  if (slotState === 'ASSIGNED_AVAILABLE' || apptType === 'AVAILABLE_SLOT') {
    return {
      activityType: 'opening',
      title: officeLabel ? `Open · ${officeLabel}` : 'Open',
      officeLabel
    };
  }
  if (slotState === 'COMPANY_HOLD') {
    return {
      activityType: 'hold',
      title: officeLabel ? `Hold · ${officeLabel}` : 'Hold',
      officeLabel
    };
  }
  return {
    activityType: 'office',
    title: officeLabel ? `Office · ${officeLabel}` : 'Office',
    officeLabel
  };
}

function activityFromScheduleEvent(row = {}) {
  const kind = String(row.kind || row.eventKind || '').toUpperCase();
  const agencyId = Number(row.agencyId || row._agencyId || row.agency_id || 0) || null;
  if (kind === 'SCHEDULE_HOLD') {
    return { activityType: 'hold', title: 'Schedule hold', agencyId };
  }
  if (kind === 'INDIRECT_SERVICES') {
    return { activityType: 'indirect', title: 'Indirect', agencyId };
  }
  if (kind === 'TEAM_MEETING') {
    return { activityType: 'team_meeting', title: 'Team meeting', agencyId };
  }
  if (kind === 'HUDDLE') {
    return { activityType: 'huddle', title: 'Huddle', agencyId };
  }
  if (kind === 'PERSONAL_EVENT') {
    return { activityType: 'personal', title: 'Personal', agencyId };
  }
  // Program / session-like titles without exposing private client names
  const rawTitle = String(row.title || '').trim().toLowerCase();
  if (rawTitle.includes('session') || rawTitle.includes('virtual')) {
    return { activityType: 'session', title: 'Session', agencyId };
  }
  return { activityType: 'event', title: 'Schedule event', agencyId };
}

function pushTyped(out, {
  startAt,
  endAt,
  source,
  activityType,
  title,
  officeLabel = null,
  roomLabel = null,
  roomNumber = null,
  buildingName = null,
  slotState = null,
  eventKind = null,
  appointmentType = null,
  agencyId = null,
  eventId = null,
  buildingId = null,
  roomId = null
}) {
  if (!startAt || !endAt) return;
  out.push({
    startAt,
    endAt,
    source: source || 'busy',
    activityType: activityType || 'busy',
    title: title || 'Busy',
    displayStatus: activityType === 'opening' ? 'AVAILABLE' : (activityType === 'session' ? 'BOOKED' : 'BUSY'),
    officeLabel: officeLabel || null,
    roomLabel: roomLabel || null,
    roomNumber: roomNumber || null,
    buildingName: buildingName || null,
    slotState: slotState || null,
    eventKind: eventKind || null,
    appointmentType: appointmentType || null,
    agencyId: agencyId || null,
    eventId: eventId || null,
    buildingId: buildingId || null,
    roomId: roomId || null
  });
}

function pushBusy(out, startAt, endAt, source) {
  if (!startAt || !endAt) return;
  out.push({
    startAt,
    endAt,
    source: source || 'busy',
    activityType: 'busy',
    title: 'Busy',
    displayStatus: 'BUSY'
  });
}

/**
 * Peer-safe typed summary: activity type + office labels, no client names/ids.
 */
export function toTypedPeerScheduleSummary(payload = {}) {
  const busyBlocks = [];
  const agencyId = Number(payload.agencyId || 0) || null;

  for (const row of payload.officeEvents || []) {
    const iv = intervalFromRow(row);
    if (!iv) continue;
    const act = activityFromOfficeRow(row);
    pushTyped(busyBlocks, {
      ...iv,
      source: 'office',
      ...act,
      roomLabel: String(row.roomLabel || row.room_label || '').trim() || null,
      roomNumber: String(row.roomNumber || row.room_number || '').trim() || null,
      buildingName: String(row.buildingName || row.building_name || '').trim() || null,
      slotState: String(row.slotState || '').toUpperCase() || null,
      appointmentType: String(row.appointmentType || '').toUpperCase() || null,
      agencyId: Number(row.agencyId || row._agencyId || agencyId || 0) || null,
      eventId: Number(row.id || 0) || null,
      buildingId: Number(row.buildingId || 0) || null,
      roomId: Number(row.roomId || 0) || null
    });
  }

  for (const row of payload.schoolAssignments || []) {
    const iv = intervalFromRow(row);
    if (!iv) continue;
    pushTyped(busyBlocks, {
      ...iv,
      source: 'school',
      activityType: 'school',
      title: 'School',
      agencyId: Number(row.agencyId || row._agencyId || agencyId || 0) || null
    });
  }

  for (const row of payload.schoolRequests || []) {
    const st = String(row?.status || '').toUpperCase();
    if (st && st !== 'APPROVED' && st !== 'ACTIVE') continue;
    const iv = intervalFromRow(row);
    if (!iv) continue;
    pushTyped(busyBlocks, {
      ...iv,
      source: 'school',
      activityType: 'school',
      title: 'School',
      agencyId: Number(row.agencyId || row._agencyId || agencyId || 0) || null
    });
  }

  for (const row of payload.supervisionSessions || []) {
    const iv = intervalFromRow(row);
    if (!iv) continue;
    pushTyped(busyBlocks, {
      ...iv,
      source: 'meeting',
      activityType: 'supervision',
      title: 'Supervision',
      agencyId: Number(row.agencyId || row._agencyId || agencyId || 0) || null,
      eventId: Number(row.id || 0) || null
    });
  }

  for (const row of payload.scheduleEvents || []) {
    const iv = intervalFromRow(row);
    if (!iv) continue;
    const act = activityFromScheduleEvent(row);
    pushTyped(busyBlocks, {
      ...iv,
      source: 'meeting',
      ...act,
      eventKind: String(row.kind || '').toUpperCase() || null,
      agencyId: act.agencyId || Number(row.agencyId || row._agencyId || agencyId || 0) || null,
      eventId: Number(row.id || 0) || null
    });
  }

  for (const row of payload.googleBusy || []) {
    const iv = intervalFromRow(row, ['start', 'startAt'], ['end', 'endAt']);
    if (!iv) continue;
    pushTyped(busyBlocks, { ...iv, source: 'external', activityType: 'external', title: 'External busy' });
  }
  for (const row of payload.googleEvents || []) {
    const startAt = row?.start?.dateTime || row?.start?.date || row?.start || row?.startAt;
    const endAt = row?.end?.dateTime || row?.end?.date || row?.end || row?.endAt;
    if (!startAt || !endAt) continue;
    pushTyped(busyBlocks, {
      startAt,
      endAt,
      source: 'external',
      activityType: 'external',
      title: 'External busy'
    });
  }
  for (const row of payload.externalBusy || []) {
    const iv = intervalFromRow(row, ['start', 'startAt'], ['end', 'endAt']);
    if (!iv) continue;
    pushTyped(busyBlocks, { ...iv, source: 'external', activityType: 'external', title: 'External busy' });
  }
  for (const cal of payload.externalCalendars || []) {
    for (const row of cal?.busy || []) {
      const iv = intervalFromRow(row, ['start', 'startAt'], ['end', 'endAt']);
      if (!iv) continue;
      pushTyped(busyBlocks, { ...iv, source: 'external', activityType: 'external', title: 'External busy' });
    }
  }

  // Office stubs for peers: keep provider identity (who holds/booked the room).
  // Strip client PII only (clientId / client-identifying titles stay out).
  const officeEvents = (payload.officeEvents || []).map((row) => {
    const act = activityFromOfficeRow(row);
    const assignedProviderId = Number(row.assignedProviderId || row.assigned_provider_id || 0) || null;
    const bookedProviderId = Number(row.bookedProviderId || row.booked_provider_id || 0) || null;
    const assignedProviderName = String(
      row.assignedProviderFullName || row.assignedProviderName || row.assigned_provider_name || ''
    ).trim() || null;
    const bookedProviderName = String(
      row.bookedProviderFullName || row.bookedProviderName || row.booked_provider_name || ''
    ).trim() || null;
    return {
      id: Number(row.id || 0) || null,
      startAt: row.startAt || row.start_at || null,
      endAt: row.endAt || row.end_at || null,
      buildingId: Number(row.buildingId || 0) || null,
      buildingName: String(row.buildingName || '').trim() || null,
      roomId: Number(row.roomId || 0) || null,
      roomNumber: String(row.roomNumber || '').trim() || null,
      roomLabel: String(row.roomLabel || '').trim() || null,
      slotState: String(row.slotState || '').toUpperCase() || null,
      appointmentType: String(row.appointmentType || '').toUpperCase() || null,
      agencyId: Number(row.agencyId || row._agencyId || agencyId || 0) || null,
      assignedProviderId,
      bookedProviderId,
      providerId: bookedProviderId || assignedProviderId || Number(row.providerId || 0) || null,
      assignedProviderName,
      bookedProviderName,
      assignedProviderFullName: assignedProviderName,
      bookedProviderFullName: bookedProviderName,
      activityType: act.activityType,
      title: act.title,
      officeLabel: act.officeLabel || null
    };
  });

  const scheduleEvents = (payload.scheduleEvents || []).map((row) => {
    const act = activityFromScheduleEvent(row);
    return {
      id: Number(row.id || 0) || null,
      startAt: row.startAt || row.start_at || null,
      endAt: row.endAt || row.end_at || null,
      kind: String(row.kind || '').toUpperCase() || null,
      agencyId: act.agencyId || Number(row.agencyId || row._agencyId || agencyId || 0) || null,
      activityType: act.activityType,
      title: act.title,
      allDay: !!row.allDay
    };
  });

  return {
    ok: true,
    detailLevel: 'typed',
    providerId: payload.providerId,
    agencyId: payload.agencyId,
    includeAllAgencies: !!payload.includeAllAgencies,
    scheduleAgencyIds: payload.scheduleAgencyIds || [],
    weekStart: payload.weekStart,
    weekEnd: payload.weekEnd,
    windowStart: payload.windowStart,
    windowEnd: payload.windowEnd,
    busyBlocks,
    officeEvents,
    scheduleEvents,
    schoolAssignments: (payload.schoolAssignments || []).map((row) => ({
      startAt: row.startAt || row.start_at || null,
      endAt: row.endAt || row.end_at || null,
      dayOfWeek: row.dayOfWeek || null,
      startTime: row.startTime || null,
      endTime: row.endTime || null,
      agencyId: Number(row.agencyId || row._agencyId || agencyId || 0) || null,
      activityType: 'school',
      title: 'School'
    })),
    supervisionSessions: (payload.supervisionSessions || []).map((row) => ({
      id: Number(row.id || 0) || null,
      startAt: row.startAt || row.start_at || null,
      endAt: row.endAt || row.end_at || null,
      agencyId: Number(row.agencyId || row._agencyId || agencyId || 0) || null,
      activityType: 'supervision',
      title: 'Supervision'
    })),
    officeRequests: [],
    schoolRequests: [],
    virtualWorkingHours: payload.virtualWorkingHours || [],
    externalCalendarsAvailable: [],
    videoConfigured: !!payload.videoConfigured,
    googleBusy: busyBlocks.filter((b) => b.source === 'external').map((b) => ({ start: b.startAt, end: b.endAt })),
    externalBusy: []
  };
}

/**
 * Collapse a full schedule-summary payload into busy-only intervals.
 */
export function toBusyOnlyScheduleSummary(payload = {}) {
  const busyBlocks = [];

  for (const row of payload.officeEvents || []) {
    const iv = intervalFromRow(row);
    if (iv) pushBusy(busyBlocks, iv.startAt, iv.endAt, 'office');
  }
  for (const row of payload.schoolAssignments || []) {
    const iv = intervalFromRow(row);
    if (iv) pushBusy(busyBlocks, iv.startAt, iv.endAt, 'school');
  }
  for (const row of payload.schoolRequests || []) {
    const st = String(row?.status || '').toUpperCase();
    if (st && st !== 'APPROVED' && st !== 'ACTIVE') continue;
    const iv = intervalFromRow(row);
    if (iv) pushBusy(busyBlocks, iv.startAt, iv.endAt, 'school');
  }
  for (const row of payload.supervisionSessions || []) {
    const iv = intervalFromRow(row);
    if (iv) pushBusy(busyBlocks, iv.startAt, iv.endAt, 'meeting');
  }
  for (const row of payload.scheduleEvents || []) {
    const iv = intervalFromRow(row);
    if (iv) pushBusy(busyBlocks, iv.startAt, iv.endAt, 'meeting');
  }
  for (const row of payload.googleBusy || []) {
    const iv = intervalFromRow(row, ['start', 'startAt'], ['end', 'endAt']);
    if (iv) pushBusy(busyBlocks, iv.startAt, iv.endAt, 'external');
  }
  for (const row of payload.googleEvents || []) {
    const startAt = row?.start?.dateTime || row?.start?.date || row?.start || row?.startAt;
    const endAt = row?.end?.dateTime || row?.end?.date || row?.end || row?.endAt;
    if (startAt && endAt) pushBusy(busyBlocks, startAt, endAt, 'external');
  }
  for (const row of payload.externalBusy || []) {
    const iv = intervalFromRow(row, ['start', 'startAt'], ['end', 'endAt']);
    if (iv) pushBusy(busyBlocks, iv.startAt, iv.endAt, 'external');
  }
  for (const cal of payload.externalCalendars || []) {
    for (const row of cal?.busy || []) {
      const iv = intervalFromRow(row, ['start', 'startAt'], ['end', 'endAt']);
      if (iv) pushBusy(busyBlocks, iv.startAt, iv.endAt, 'external');
    }
  }

  return {
    ok: true,
    detailLevel: 'busy',
    providerId: payload.providerId,
    agencyId: payload.agencyId,
    includeAllAgencies: !!payload.includeAllAgencies,
    scheduleAgencyIds: payload.scheduleAgencyIds || [],
    weekStart: payload.weekStart,
    weekEnd: payload.weekEnd,
    windowStart: payload.windowStart,
    windowEnd: payload.windowEnd,
    busyBlocks,
    officeRequests: [],
    schoolRequests: [],
    schoolAssignments: [],
    officeEvents: [],
    supervisionSessions: [],
    scheduleEvents: [],
    virtualWorkingHours: payload.virtualWorkingHours || [],
    externalCalendarsAvailable: [],
    videoConfigured: !!payload.videoConfigured,
    googleBusy: busyBlocks.filter((b) => b.source === 'external').map((b) => ({ start: b.startAt, end: b.endAt })),
    externalBusy: []
  };
}
