/**
 * Shared registry for master digital (+ optional paper) form channels.
 * school / office are live; tutoring / consulting / coaching are framed for future content.
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
    label: 'Master Office Digital Form',
    shortLabel: 'Office',
    scope: 'agency',
    hasPrintable: true,
    status: 'live',
    joinServiceTypes: ['counseling'],
    adminPath: '/admin/master-office-form',
    paperAdminPath: '/admin/master-office-paper'
  },
  tutoring: {
    key: 'tutoring',
    label: 'Master Digital Tutoring',
    shortLabel: 'Tutoring',
    scope: 'agency',
    hasPrintable: false,
    status: 'framed',
    joinServiceTypes: ['tutoring'],
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

export const FRAMED_MASTER_CHANNELS = ['tutoring', 'consulting', 'coaching'];

export function getMasterFormChannel(key) {
  const k = String(key || '').trim().toLowerCase();
  return MASTER_FORM_CHANNELS[k] || null;
}

export function listMasterFormChannels({ includeFramed = true } = {}) {
  return Object.values(MASTER_FORM_CHANNELS).filter((c) => includeFramed || c.status === 'live');
}
