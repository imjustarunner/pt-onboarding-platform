export function supervisionCoFacilitatorIds(session = {}) {
  let settings = session.meeting_settings_json || session.meetingSettings || {};
  if (typeof settings === 'string') {
    try { settings = JSON.parse(settings); } catch { settings = {}; }
  }
  const extra = session.coFacilitatorUserIds || settings?.coFacilitatorUserIds;
  const ids = [session.co_facilitator_user_id, session.coFacilitatorUserId, ...(Array.isArray(extra) ? extra : [])];
  const supervisorId = Number(session.supervisor_user_id || session.supervisorUserId);
  return [...new Set(ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0 && id !== supervisorId))];
}

export function supervisionFacilitatorIds(session = {}) {
  return [...new Set([Number(session.supervisor_user_id || session.supervisorUserId), ...supervisionCoFacilitatorIds(session)])].filter(id => Number.isSafeInteger(id) && id > 0);
}

export function isSupervisionFacilitator(session, userId) {
  return supervisionFacilitatorIds(session).includes(Number(userId));
}
