/**
 * Shared registry for master digital (+ optional paper) form channels.
 * school / office (counseling) / tutoring are live; consulting / coaching stay framed.
 */

export const MASTER_FORM_CHANNELS = {
  school: {
    key: 'school',
    label: 'Master School Form',
    shortLabel: 'School',
    scope: 'school',
    hasPrintable: true,
    status: 'live',
    joinServiceTypes: [],
    adminPath: '/admin/master-school-form',
    paperAdminPath: '/admin/school-referral-hub'
  },
  office: {
    key: 'office',
    label: 'Master Counseling Digital Form',
    shortLabel: 'Counseling',
    scope: 'agency',
    hasPrintable: true,
    status: 'live',
    joinServiceTypes: ['counseling'],
    adminPath: '/admin/master-office-form',
    paperAdminPath: '/admin/master-office-paper'
  },
  tutoring: {
    key: 'tutoring',
    label: 'Master Tutoring',
    shortLabel: 'Tutoring',
    scope: 'agency',
    hasPrintable: false,
    status: 'live',
    joinServiceTypes: ['tutoring', 'assessment', 'evaluation'],
    adminPath: '/admin/master-channel-form/tutoring',
    paperAdminPath: null
  },
  consulting: {
    key: 'consulting',
    label: 'Master Digital Consulting',
    shortLabel: 'Consulting',
    scope: 'agency',
    hasPrintable: false,
    status: 'framed',
    joinServiceTypes: ['consulting'],
    adminPath: '/admin/master-channel-form/consulting',
    paperAdminPath: null
  },
  coaching: {
    key: 'coaching',
    label: 'Master Digital Coaching',
    shortLabel: 'Coaching',
    scope: 'agency',
    hasPrintable: false,
    status: 'framed',
    joinServiceTypes: ['coaching'],
    adminPath: '/admin/master-channel-form/coaching',
    paperAdminPath: null
  }
};

export const TUTORING_MASTER_FORM_TYPES = ['intake', 'assessment', 'evaluation'];
export const TUTORING_JOIN_SERVICE_TYPES = ['tutoring', 'assessment', 'evaluation'];

export function isTutoringMasterServiceType(serviceType = '') {
  return TUTORING_JOIN_SERVICE_TYPES.includes(String(serviceType || '').trim().toLowerCase());
}

export function isTutoringMasterFormType(formType = 'intake') {
  const t = String(formType || 'intake').trim().toLowerCase();
  return !t || TUTORING_MASTER_FORM_TYPES.includes(t) || t === 'public_form';
}

export const FRAMED_MASTER_CHANNELS = ['consulting', 'coaching'];
export const CHANNEL_MASTER_KEYS = ['tutoring', 'consulting', 'coaching'];

export function getMasterFormChannel(key) {
  const k = String(key || '').trim().toLowerCase();
  return MASTER_FORM_CHANNELS[k] || null;
}

export function listMasterFormChannels({ includeFramed = true } = {}) {
  return Object.values(MASTER_FORM_CHANNELS).filter((c) => includeFramed || c.status === 'live');
}
