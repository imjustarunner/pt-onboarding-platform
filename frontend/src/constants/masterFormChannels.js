/** Mirrors backend/src/constants/masterFormChannels.js for admin nav. */

export const MASTER_FORM_CHANNELS = {
  school: {
    key: 'school',
    label: 'Master School Form',
    shortLabel: 'School',
    hasPrintable: true,
    status: 'live',
    adminPath: '/admin/master-school-form',
    paperAdminPath: '/admin/school-referral-hub'
  },
  office: {
    key: 'office',
    label: 'Master Office Digital Form',
    shortLabel: 'Office',
    hasPrintable: true,
    status: 'live',
    adminPath: '/admin/master-office-form',
    paperAdminPath: '/admin/master-office-paper'
  },
  tutoring: {
    key: 'tutoring',
    label: 'Master Digital Tutoring',
    shortLabel: 'Tutoring',
    hasPrintable: false,
    status: 'framed',
    adminPath: '/admin/master-channel-form/tutoring',
    paperAdminPath: null
  },
  consulting: {
    key: 'consulting',
    label: 'Master Digital Consulting',
    shortLabel: 'Consulting',
    hasPrintable: false,
    status: 'framed',
    adminPath: '/admin/master-channel-form/consulting',
    paperAdminPath: null
  },
  coaching: {
    key: 'coaching',
    label: 'Master Digital Coaching',
    shortLabel: 'Coaching',
    hasPrintable: false,
    status: 'framed',
    adminPath: '/admin/master-channel-form/coaching',
    paperAdminPath: null
  }
};

export const FRAMED_MASTER_CHANNELS = ['tutoring', 'consulting', 'coaching'];

export function getMasterFormChannel(key) {
  return MASTER_FORM_CHANNELS[String(key || '').trim().toLowerCase()] || null;
}
