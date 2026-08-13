export const SCHOOL_STAFF_OPEN_STATES = ['limited', 'roi', 'roi_docs', 'expired'];

const LABELS = {
  none: {
    label: 'No ROI on file',
    hover: 'No ROI on file for this staff member. They cannot open this client in the school portal.'
  },
  packet: {
    label: 'No ROI on file',
    hover: 'No ROI on file for this staff member. They cannot open this client in the school portal.'
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
    hover: 'ROI is expired. Schedule and comments remain available. Referral documents are paused until renewed. They may still upload and view documents they added themselves.'
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
  return SCHOOL_STAFF_OPEN_STATES.includes(key) && key !== 'roi_docs';
}

/** ROI (Speak) cannot see referral packets, even ones they uploaded. */
export function schoolStaffHidesReferralPackets(state) {
  return String(state || '').trim().toLowerCase() === 'roi';
}
