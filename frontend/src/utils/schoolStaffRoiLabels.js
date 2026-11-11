export const SCHOOL_STAFF_OPEN_STATES = ['none', 'packet', 'denied', 'limited', 'roi', 'roi_docs', 'expired'];

const LABELS = {
  denied: { label: 'Denied by guardian', hover: 'A guardian denied clinical sharing for this staff member. Basic scheduling, logistics, comments, and messages remain available; treatment details and referral documents stay closed until that guardian changes their signed decision.' },
  none: {
    label: 'No ROI on file',
    hover: 'No ROI on file. The overview, comments, and tickets are available. Clinical notes and referral documents stay closed.'
  },
  packet: {
    label: 'No ROI on file',
    hover: 'No ROI on file. The overview, comments, and tickets are available. Clinical notes and referral documents stay closed.'
  },
  limited: {
    label: 'ROI Active',
    hover: 'ROI Active: full school-portal access for this client (schedule, comments, messages) except referral documents other people uploaded. If they uploaded a printed referral packet, they can still see that packet. Documents other staff upload stay hidden.'
  },
  roi: {
    label: 'ROI (Speak)',
    hover: 'ROI (Speak): same portal access as ROI Active, and they may speak with the provider about treatment goals and progress. Referral documents stay hidden, including a printed packet they uploaded. They may still upload and view other files they add themselves.'
  },
  roi_docs: {
    label: 'ROI All Active',
    hover: 'ROI All Active: they may speak about treatment goals and progress and can access this client’s referral documents, including files other staff uploaded.'
  },
  expired: {
    label: 'ROI expired',
    hover: 'ROI is expired. The client overview and schedule remain available. Collaboration, comments, messages, and all documents are unavailable until ROI is renewed.'
  }
};

export function schoolStaffRoiLabel(state, fallback = 'No ROI on file') {
  const key = String(state || '').trim().toLowerCase();
  return LABELS[key]?.label || fallback;
}

export function schoolStaffRoiHover(state) {
  const key = String(state || '').trim().toLowerCase();
  return LABELS[key]?.hover || LABELS.none.hover;
}

export function schoolStaffCanOpenFromState(state) {
  return SCHOOL_STAFF_OPEN_STATES.includes(String(state || '').trim().toLowerCase());
}

export function schoolStaffHasReferralDocs(state) {
  return String(state || '').trim().toLowerCase() === 'roi_docs';
}

export function schoolStaffOwnDocumentsOnly(state) {
  const key = String(state || '').trim().toLowerCase();
  return key === 'limited' || key === 'roi';
}

/** ROI (Speak) cannot see referral packets, even ones they uploaded. */
export function schoolStaffHidesReferralPackets(state) {
  return String(state || '').trim().toLowerCase() === 'roi';
}

export const SCHOOL_STAFF_ROI_SELECT_OPTIONS = ['packet', 'limited', 'roi', 'roi_docs'].map((value) => ({
  value,
  label: LABELS[value].label,
  hover: LABELS[value].hover
}));

/** Days / soft-schedule greying: only No ROI stays locked. Open states stay full color even if API flags lag. */
export function isSchoolScheduleClientLocked(client) {
  const state = String(
    client?.school_staff_effective_access_state || client?.school_staff_access_level || ''
  ).trim().toLowerCase();
  if (schoolStaffCanOpenFromState(state)) return false;
  if (client?.school_portal_can_open === true) return false;
  return client?.school_portal_force_placeholder === true || client?.school_portal_can_open === false;
}

/** Comments and tickets stay available without a personal ROI grant. Documents do not. */
export function schoolStaffCanInterfaceFromState(state) {
  return ['none', 'packet', 'denied', 'limited', 'roi', 'roi_docs'].includes(String(state || '').trim().toLowerCase());
}

/** Clinical notes and referral documents require a current personal ROI grant. */
export function schoolStaffCanCollaborateFromState(state) {
  return ['limited', 'roi', 'roi_docs'].includes(String(state || '').trim().toLowerCase());
}
