/**
 * Modular Provider Update section catalog.
 * All sections default ON for each new push; admins toggle per send.
 */

export const PROVIDER_UPDATE_SECTIONS = [
  {
    key: 'admin_update',
    title: 'Admin Update',
    shortTitle: 'Admin Update',
    description: 'Full administrative update page with announcements and core information.',
    checklist: ['Agency announcements', 'Administrative information', 'Contact and address review', 'Employment details'],
    mode: 'embedded',
    icon: 'admin',
    defaultEnabled: true,
    previewHint: 'Embeds the real Admin Update published page (same HTML as /admin-update/:token).'
  },
  {
    key: 'amendments',
    title: 'Amendment Updates',
    shortTitle: 'Amendments',
    description: 'Review and sign amendment contract updates.',
    checklist: ['Open amendment documents', 'Electronic signature required'],
    mode: 'link',
    icon: 'amendment',
    defaultEnabled: true,
    previewHint: 'Lists unsigned amendment contracts awaiting signature.'
  },
  {
    key: 'handbook',
    title: 'Handbook Updates',
    shortTitle: 'Handbook Updates',
    description: 'Review this month’s digest of workplace handbook changes (not the full handbook).',
    checklist: ['Subject / rationale / changed content per update', 'Optional question to People Ops', 'Acknowledge digest'],
    mode: 'embedded',
    icon: 'handbook',
    defaultEnabled: true,
    previewHint: 'Monthly digest of handbook changes since the last Admin Update. Full handbook stays in Google Docs.'
  },
  {
    key: 'pin',
    title: 'Four-digit PIN',
    shortTitle: 'PIN',
    description: 'Set or confirm your kiosk four-digit PIN.',
    checklist: ['Set four-digit PIN', 'Confirm existing PIN'],
    mode: 'set_confirm_update',
    icon: 'pin',
    defaultEnabled: true,
    previewHint: 'If no PIN: Set. If PIN exists: Confirm or Update.'
  },
  {
    key: 'work_hours',
    title: 'Work Hours',
    shortTitle: 'Work Hours',
    description: 'Set or confirm your weekly work hours.',
    checklist: ['Set work hours', 'Confirm or update schedule'],
    mode: 'set_confirm_update',
    icon: 'hours',
    defaultEnabled: true,
    previewHint: 'Uses the same work-hours editor as My Schedule.'
  },
  {
    key: 'office_schedule',
    title: 'Office Schedule',
    shortTitle: 'Office',
    description: 'Review office schedule and open slots for booking.',
    checklist: ['Review current office schedule', 'Identify slots needing open-for-booking', 'Quick-add openings'],
    mode: 'embedded',
    icon: 'office',
    defaultEnabled: true,
    previewHint: 'Shows office schedule with quick-add for open booking slots.'
  },
  {
    key: 'client_fall_update',
    title: 'Client Fall Update',
    shortTitle: 'Clients',
    description: 'Review school/client-related update items.',
    checklist: ['Client fall update', 'School-related information', 'Required confirmations'],
    mode: 'link',
    icon: 'clients',
    defaultEnabled: true,
    previewHint: 'Deep link into client fall confirmation / Fall Update clients work.'
  },
  {
    key: 'license',
    title: 'License',
    shortTitle: 'License',
    description: 'See and update your professional license.',
    checklist: ['Review license details', 'Update expiration / numbers'],
    mode: 'set_confirm_update',
    icon: 'license',
    defaultEnabled: true,
    previewHint: 'Confirm or update license fields on your profile.'
  },
  {
    key: 'profile_blurb',
    title: 'Profile Blurb',
    shortTitle: 'Blurb',
    description: 'Confirm and refine how you appear to clients.',
    checklist: ['Edit profile blurb', 'Confirm current text'],
    mode: 'set_confirm_update',
    icon: 'blurb',
    defaultEnabled: true,
    previewHint: 'Edits provider_school_info_blurb on your user profile.'
  },
  {
    key: 'specialties',
    title: 'Specialties & Focus Areas',
    shortTitle: 'Specialties',
    description: 'Confirm or edit specialties and focus areas.',
    checklist: ['Confirm specialties', 'Update focus areas'],
    mode: 'set_confirm_update',
    icon: 'specialties',
    defaultEnabled: true,
    previewHint: 'Updates specialty fields in your clinical profile.'
  },
  {
    key: 'contact_info',
    title: 'Contact & Address',
    shortTitle: 'Contact',
    description: 'Confirm contact, address, and emergency contact.',
    checklist: ['Phone and email', 'Mailing address', 'Emergency contact'],
    mode: 'set_confirm_update',
    icon: 'contact',
    defaultEnabled: true,
    previewHint: 'Confirm or update contact info used by People Ops and schools.'
  },
  {
    key: 'credential_display',
    title: 'Credential Display',
    shortTitle: 'Credential',
    description: 'Confirm credential/title as shown to schools and clients.',
    checklist: ['Confirm display credential', 'Update title if needed'],
    mode: 'set_confirm_update',
    icon: 'credential',
    defaultEnabled: true,
    previewHint: 'Confirm how your credential appears on directories and portals.'
  },
  {
    key: 'school_availability',
    title: 'School Availability',
    shortTitle: 'School Days',
    description: 'Review school assignment days and times; request adjustments.',
    checklist: ['Review school days', 'Request schedule adjust if needed'],
    mode: 'embedded',
    icon: 'school',
    defaultEnabled: true,
    previewHint: 'Read-only school assignments with request-adjust path.'
  },
  {
    key: 'preferred_days',
    title: 'Preferred Days',
    shortTitle: 'Preferred Days',
    description: 'Confirm preferred work days.',
    checklist: ['Confirm preferred days'],
    mode: 'set_confirm_update',
    icon: 'preferred',
    defaultEnabled: true,
    previewHint: 'Confirm preferred days used for scheduling.'
  },
  {
    key: 'directory_photo',
    title: 'Directory Photo',
    shortTitle: 'Photo',
    description: 'Confirm or update directory photo and visibility.',
    checklist: ['Review photo', 'Update if needed', 'Confirm visibility'],
    mode: 'set_confirm_update',
    icon: 'photo',
    defaultEnabled: true,
    previewHint: 'Confirm directory photo used for school/client-facing views.'
  },
  {
    key: 'training_ack',
    title: 'Training Acknowledgments',
    shortTitle: 'Training',
    description: 'Complete required training acknowledgments that are due.',
    checklist: ['Open due trainings', 'Acknowledge required modules'],
    mode: 'link',
    icon: 'training',
    defaultEnabled: true,
    previewHint: 'Links to outstanding required training acknowledgments.'
  },
  {
    key: 'pay_portal',
    title: 'Pay Portal Check',
    shortTitle: 'Pay Portal',
    description: 'Confirm direct deposit / pay stub portal access.',
    checklist: ['Open pay portal', 'Confirm access'],
    mode: 'link',
    icon: 'pay',
    defaultEnabled: true,
    previewHint: 'Link-only check that pay/direct-deposit portal works.'
  },
  {
    key: 'notification_prefs',
    title: 'Notification Preferences',
    shortTitle: 'Notifications',
    description: 'Confirm notification preferences.',
    checklist: ['Review email/SMS preferences', 'Confirm or update'],
    mode: 'set_confirm_update',
    icon: 'notify',
    defaultEnabled: true,
    previewHint: 'Confirm notification preferences on your account.'
  }
];


/**
 * Overview pages — one card each. Some are standalone; others bundle sections.
 * Keep in sync with frontend/src/utils/providerUpdate.js
 */
export const PROVIDER_UPDATE_PAGES = [
  {
    key: 'admin_update',
    title: 'Admin Update',
    shortTitle: 'Admin Update',
    description: 'Full administrative update page with announcements and core information.',
    checklist: ['Agency announcements', 'Administrative information', 'Contact and address review', 'Employment details'],
    icon: 'admin',
    sectionKeys: ['admin_update']
  },
  {
    key: 'user_updates',
    title: 'User Updates',
    shortTitle: 'User Updates',
    description: 'Manage your account and scheduling details.',
    checklist: ['Set four-digit PIN', 'Set work hours', 'Review office schedule', 'Update license'],
    icon: 'hours',
    sectionKeys: ['pin', 'work_hours', 'office_schedule', 'license', 'contact_info', 'preferred_days', 'notification_prefs', 'training_ack', 'pay_portal']
  },
  {
    key: 'profile_specialties',
    title: 'Profile & Specialties',
    shortTitle: 'Profile & Specialties',
    description: 'Confirm and refine how you appear to clients.',
    checklist: ['Edit profile blurb', 'Confirm specialties', 'Update focus areas'],
    icon: 'specialties',
    sectionKeys: ['profile_blurb', 'specialties', 'credential_display', 'directory_photo']
  },
  {
    key: 'handbook',
    title: 'Handbook Updates',
    shortTitle: 'Handbook Updates',
    description: 'Review the latest workplace handbook updates.',
    checklist: ['Policy review', 'Acknowledge updates'],
    icon: 'handbook',
    sectionKeys: ['handbook']
  },
  {
    key: 'amendments',
    title: 'Amendment Updates',
    shortTitle: 'Amendment Updates',
    description: 'Review and sign amendment contract updates.',
    checklist: ['Open amendment documents', 'Electronic signature required'],
    icon: 'amendment',
    sectionKeys: ['amendments']
  },
  {
    key: 'school_client',
    title: 'School Client Update',
    shortTitle: 'School Client Update',
    description: 'Review school/client-related update items.',
    checklist: ['Client fall update', 'School-related information', 'Required confirmations'],
    icon: 'clients',
    sectionKeys: ['client_fall_update', 'school_availability']
  }
];

export const PROVIDER_UPDATE_SECTION_KEYS = PROVIDER_UPDATE_SECTIONS.map((s) => s.key);

export const PROVIDER_UPDATE_EMAIL_SUBJECT = 'Provider Update : Response Needed';
export const PROVIDER_UPDATE_FROM_HINT = 'po@itsco.health';
export const PROVIDER_UPDATE_REPLY_TO = 'technology@itsco.health';

export function defaultSectionConfig() {
  const cfg = {};
  for (const s of PROVIDER_UPDATE_SECTIONS) {
    cfg[s.key] = s.defaultEnabled !== false;
  }
  return cfg;
}

export function normalizeSectionConfig(raw) {
  const base = defaultSectionConfig();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  for (const key of PROVIDER_UPDATE_SECTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = !!raw[key];
    }
  }
  return out;
}

export function enabledSectionKeys(config) {
  const cfg = normalizeSectionConfig(config);
  return PROVIDER_UPDATE_SECTION_KEYS.filter((k) => cfg[k]);
}

export function getSectionMeta(key) {
  return PROVIDER_UPDATE_SECTIONS.find((s) => s.key === key) || null;
}
