export function canBrowseTeamSchedules(user) {
  return ['super_admin', 'admin', 'assistant_admin', 'support', 'staff', 'provider', 'provider_plus', 'supervisor', 'clinical_practice_assistant', 'intern', 'intern_plus', 'facilitator', 'tutor', 'clinician'].includes(String(user?.role || '').toLowerCase());
}

export function directoryScheduleOptions(staff, agencyId) {
  return (staff || []).map(person => ({ id: Number(person.id), first_name: person.displayName || '', last_name: '', email: person.workEmail || '', agency_ids: String(agencyId) }));
}

/** Defense in depth: the peer calendar renders only these fixed labels. */
export function peerActivityLabel(block) {
  return { session: 'Session', meeting: 'Meeting' }[block?.activityType] || 'Busy';
}
