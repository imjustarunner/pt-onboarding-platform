/** Mirrors backend/src/constants/masterFormChannels.js for admin nav. */

export const MASTER_FORM_CHANNELS = {
  school: {
    key: 'school',
    label: 'Master School Form',
    shortLabel: 'School',
    hasPrintable: true,
    status: 'live',
    adminPath: '/admin/master-school-form',
    paperAdminPath: '/library?section=enrollment&setting=school&service=counseling'
  },
  office: {
    key: 'office',
    label: 'Master Counseling Digital Form',
    shortLabel: 'Counseling',
    hasPrintable: true,
    status: 'live',
    adminPath: '/admin/master-office-form',
    paperAdminPath: '/library?section=enrollment&setting=office&service=counseling'
  },
  tutoring: {
    key: 'tutoring',
    label: 'Master Tutoring',
    shortLabel: 'Tutoring',
    hasPrintable: true,
    status: 'live',
    adminPath: '/admin/master-channel-form/tutoring',
    paperAdminPath: '/library?section=enrollment&setting=office&service=tutoring'
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

export const FRAMED_MASTER_CHANNELS = ['consulting', 'coaching'];
export const CHANNEL_MASTER_KEYS = ['tutoring', 'consulting', 'coaching'];

export function getMasterFormChannel(key) {
  return MASTER_FORM_CHANNELS[String(key || '').trim().toLowerCase()] || null;
}
