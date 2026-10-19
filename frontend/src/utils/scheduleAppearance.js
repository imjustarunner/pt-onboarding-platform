// Shared by the calendar and personal preferences. Fill opacity is intentionally
// fixed below 1, even when a user chooses an opaque color in the color picker.
export const SCHEDULE_COLOR_OPTIONS = [
  ['client_session', 'Client session', '#1D4ED8'],
  ['supervision', 'Individual supervision', '#7C3AED'],
  ['supervision_group', 'Group supervision', '#A21CAF'],
  ['supervision_triadic', 'Triadic supervision', '#C026D3'],
  ['supervision_open', 'Open group supervision · signup required', '#C2410C'],
  ['training', 'Training', '#9A3412'],
  ['interview', 'Interview', '#BE185D'],
  ['evaluation', 'Employee evaluation', '#65A30D'],
  ['cpa_meeting', 'CPA meeting', '#B7791F'],
  ['mentorship_meeting', 'Mentorship meeting', '#0E7490'],
  ['huddle', 'Huddle', '#0891B2'],
  ['group_huddle', 'Group huddle', '#0F766E'],
  ['team_meeting', 'Meeting', '#2563EB'],
  ['group_meeting', 'Group meeting', '#4338CA'],
  ['admin_meeting', 'Admin meeting', '#D97706'],
  ['town_hall', 'Town hall', '#9333EA'],
  ['leadership_circle', 'Leadership circle', '#7E22CE'],
  ['supervisors_meeting', 'Supervisors meeting', '#4F46E5'],
  ['personal_event', 'Personal event', '#DB2777'],
  ['schedule_hold', 'Schedule block', '#64748B'],
  ['indirect_services', 'Indirect services', '#84A30C'],
  ['school_visit', 'School visit', '#15803D'],
  ['school_visit_hold', 'School visit opening', '#94A3B8'],
  ['school', 'School assignment', '#2D9CDB'],
  ['office_assigned', 'Office assigned', '#A16207'],
  ['office_temporary', 'Temporary office hold', '#EA580C'],
  ['office_booked', 'Office booked', '#334155'],
  ['intake_in_person', 'In-person intake', '#B45309'],
  ['intake_virtual', 'Virtual intake', '#0284C7'],
  ['availability', 'Virtual opening', '#06B6D4'],
  ['request', 'Pending request', '#CA8A04'],
  ['google_event', 'Google event', '#4285F4'],
  ['google_busy', 'Google busy', '#475569'],
  ['ehr_busy', 'External appointment', '#F2994A']
].map(([key, label, color]) => ({ key, label, color }));

export const defaultScheduleColors = () => Object.fromEntries(SCHEDULE_COLOR_OPTIONS.map(o => [o.key, o.color]));

// Earlier saves included the entire default palette. Upgrade those defaults
// without discarding colors someone actually customized.
export function resolveScheduleColors(saved = {}, version = 0) {
  const colors = {...defaultScheduleColors(), ...(saved || {})};
  const legacy = {client_session:'#059669',supervision_group:'#E11D48',supervision_open:'#0D9488',office_assigned:'#27AE60',office_booked:'#EB5757',availability:'#16A34A'};
  if (Number(version) < 2) for (const [key,color] of Object.entries(legacy)) {
    if (String(saved?.[key] || '').toLowerCase() === color.toLowerCase()) colors[key] = defaultScheduleColors()[key];
  }
  return colors;
}

export function scheduleBlockColorKey(block = {}) {
  if (block.kind === 'supv-signup') return 'supervision_open';
  if (block.kind === 'supv') return { group:'supervision_group', triadic:'supervision_triadic' }[block.sessionType] || 'supervision';
  if (block.kind === 'sevt') {
    const kind = String(block.eventKind || '').toUpperCase();
    if (kind === 'TEAM_MEETING') {
      const subtype = { training:'training', admin:'admin_meeting', interview:'interview', evaluation:'evaluation', town_hall:'town_hall', leadership_circle:'leadership_circle', supervisors_meeting:'supervisors_meeting' }[block.meetingSubtype];
      return subtype || (block.isGroupMeeting || block.attendeeCount >= 2 ? 'group_meeting' : 'team_meeting');
    }
    if (kind === 'HUDDLE') return { cpa:'cpa_meeting', mentorship:'mentorship_meeting' }[block.meetingSubtype] || (block.isGroupMeeting || block.attendeeCount >= 2 ? 'group_huddle' : 'huddle');
    if (block.isClientSession || block.appointmentId) return 'client_session';
    return { FALL_CHECKIN_PRESLOT:'school_visit_hold', FALL_CHECKIN_BOOKED:'school_visit', SCHEDULE_HOLD:'schedule_hold', INDIRECT_SERVICES:'indirect_services' }[kind] || 'personal_event';
  }
  return { oa:'office_assigned', ot:'office_temporary', ob:'office_booked', school:'school', request:'request', gevt:'google_event', gbusy:'google_busy', ebusy:'ehr_busy', portal:'availability', 'intake-ip':'intake_in_person', 'intake-vi':'intake_virtual' }[block.kind] || null;
}

export function scheduleTypePalette(block, colors = {}, dark = false) {
  const key = scheduleBlockColorKey(block);
  const fallback = SCHEDULE_COLOR_OPTIONS.find(option => option.key === key)?.color;
  if (!fallback) return null;
  const color = /^#[\da-f]{6}$/i.test(colors[key]) ? colors[key] : fallback;
  const rgb = [1,3,5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  const rgba = alpha => `rgba(${rgb.join(', ')}, ${alpha})`;
  const text = rgb.map(channel => Math.round(dark ? channel * 0.2 + 255 * 0.8 : channel * 0.4));
  return {
    fill:rgba(dark ? 0.32 : 0.22), border:rgba(0.65), stripe:rgba(0.85), text:`rgb(${text.join(', ')})`,
    borderStyle:block.eventKind === 'FALL_CHECKIN_PRESLOT' || (block.kind === 'supv-signup' && !block.viewerSignedUp && !block.sessionLive) ? 'dashed' : 'solid'
  };
}

export function isExactHourAppointment(block = {}) {
  if (block.allDay || !['sevt','supv','supv-signup','gevt'].includes(block.kind)) return false;
  const start = new Date(String(block.startAt || '').replace(' ', 'T'));
  const end = new Date(String(block.endAt || '').replace(' ', 'T'));
  return end - start === 60 * 60 * 1000
    && start.getMinutes() === 0 && start.getSeconds() === 0 && start.getMilliseconds() === 0
    && end.getMinutes() === 0 && end.getHours() === (start.getHours() + 1) % 24;
}
