/**
 * Frontend mirror of Provider Update section catalog.
 * Keep in sync with backend/src/constants/providerUpdateSections.js
 */

export const PROVIDER_UPDATE_SECTIONS = [
  {key:'spanish_intake',title:'Spanish-Language Intake',shortTitle:'Spanish Intake',description:'Coordinate intake and follow-up for Spanish-speaking clients and parents.',checklist:['Identify the preferred language','Coordinate the intake handoff','Document the next steps'],mode:'ack',icon:'clients',defaultEnabled:false},
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
    title: 'Amendment Agreement',
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
    previewHint: 'Monthly digest of handbook changes since the last Admin Update. Keep the change digest with the full handbook.'
  },
  {
    key: 'pin',
    title: 'Security and passwords',
    shortTitle: 'Security',
    description: 'Review app sign-in, optional passkeys, and your six-digit Quick View code.',
    checklist: ['Create a missing six-digit code', 'Store your new code safely'],
    mode: 'set_confirm_update',
    icon: 'pin',
    defaultEnabled: true,
    previewHint: 'Initial setup uses your invitation without an account password. Existing codes are never shown or reset here.'
  },
  {
    key: 'work_hours',
    title: 'Typical Availability',
    shortTitle: 'Availability',
    description: 'Review the typical availability shown on your profile.',
    checklist: ['Review typical availability', 'Confirm or update schedule'],
    mode: 'set_confirm_update',
    icon: 'hours',
    defaultEnabled: true,
    previewHint: 'Uses the same work-hours editor as My Schedule.'
  },
  {key:'office_review',title:'Confirm Office Reservations',shortTitle:'Office Reservations',description:'Confirm each current office reservation or release incorrect room bookings.',checklist:['Review each reservation','Keep or release office time'],mode:'embedded',icon:'office',defaultEnabled:true},
  {key:'public_availability',title:'Public Profile Availability',shortTitle:'Public Availability',description:'Choose Open, Waitlist, or Closed separately for in-person and virtual appointments.',checklist:['In-person status','Virtual status','Waitlist and typical availability'],mode:'embedded',icon:'office',defaultEnabled:true},
  {
    key: 'office_schedule',
    title: 'Set Availability',
    shortTitle: 'Availability',
    description: 'Review your week and publish recurring client openings.',
    checklist: ['Review your weekly calendar', 'Open virtual or reserved office hours', 'Weekly, every-other-week, or monthly availability'],
    mode: 'embedded',
    icon: 'office',
    defaultEnabled: true,
    previewHint: 'Shows office schedule with quick-add for open booking slots.'
  },
  {key:'public_profile_review',title:'My Public Profile',shortTitle:'My Profile',description:'Review your completed profile, availability, and shareable link.',checklist:['Open your public profile','Review information and appointment statuses','Copy your link or create a QR code'],mode:'embedded',icon:'photo',defaultEnabled:true},
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
    key: 'supervision_hours', title: 'Supervision Hours', shortTitle: 'Supervision',
    description: 'Confirm credited supervision hours or submit a correction with a reason and supporting evidence.',
    checklist: ['Review credited hours', 'Confirm or request correction', 'Upload supporting records if needed'],
    mode: 'embedded', icon: 'hours', defaultEnabled: true,
    previewHint: 'Shows the supervision ledger for assigned supervisees. Corrections require review and do not automatically change credited hours.'
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
    previewHint: 'Edits provider school info blurb on your profile.'
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
    description: 'Review current school hours and client spots, and submit changes here for approval.',
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
    title: 'Texting & Communication Choices',
    shortTitle: 'Texting Choices',
    description: 'Request in-app client texting or future forwarding, and sign separate choices for reminders, message alerts and voting. All choices may be No.',
    checklist: ['In-app texting access', 'Future forwarding request', 'Reminders and message alerts', 'Optional voting', 'Sign Yes/No choices'],
    mode: 'set_confirm_update',
    icon: 'notify',
    defaultEnabled: true,
    previewHint: 'Separate access requests and signed personal-phone preferences. Forwarding stays off until separately launched.'
  }
];

export const PROVIDER_UPDATE_SECTION_KEYS = PROVIDER_UPDATE_SECTIONS.map((s) => s.key);
export {PROVIDER_UPDATE_EMAIL_SUBJECT} from '../navigation/providerUpdateInvitation.js';

/**
 * Overview / hub “pages”. Each page is one card in the Update Overview.
 * Some pages are a single full-screen step (Admin Update); others bundle a few
 * related sections onto one interface.
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
    checklist: ['Set or confirm six-digit Quick View PIN', 'Review typical availability', 'Review office schedule', 'Update license'],
    icon: 'hours',
    sectionKeys: [
      'pin',
      'work_hours',
      'office_review',
      'public_availability',
      'office_schedule',
      'supervision_hours',
      'license',
      'contact_info',

    ]
  },
  {
    key: 'texting_choices',
    title: 'Texting & Communication Choices',
    shortTitle: 'Texting Choices',
    description: 'Review client texting access, future forwarding, and optional texts to your phone.',
    checklist: ['In-app texting access', 'Future forwarding request', 'Staff reminders and message alerts', 'Optional voting', 'Sign Yes/No choices'],
    icon: 'notify',
    sectionKeys: ['notification_prefs']
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
  {key:'public_profile_review',title:'My Public Profile',shortTitle:'My Profile',description:'Check how your profile and availability look to clients.',checklist:['Review your live profile','Copy your link or create a QR code'],icon:'photo',sectionKeys:['public_profile_review']},
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
    title: 'Amendment Agreement',
    shortTitle: 'Amendment Updates',
    description: 'Review and sign amendment contract updates.',
    checklist: ['Open amendment documents', 'Electronic signature required'],
    icon: 'amendment',
    sectionKeys: ['amendments']
  },
  {
    key: 'school_client',
    title: 'Client Updates',
    shortTitle: 'Client Updates',
    description: 'Review client care, Spanish-language coordination, and any assigned school updates.',
    checklist: ['Client fall update', 'School-related information', 'Required confirmations'],
    icon: 'clients',
    sectionKeys: ['client_fall_update', 'school_availability', 'spanish_intake']
  }
];

export function defaultSectionConfig() {
  const cfg = {};
  for (const s of PROVIDER_UPDATE_SECTIONS) cfg[s.key] = !['pay_portal','training_ack','preferred_days'].includes(s.key) && s.defaultEnabled !== false;
  return cfg;
}

export function normalizeSectionConfig(raw) {
  const base = defaultSectionConfig();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  for(const key of ['office_review','public_availability','public_profile_review'])if(!Object.hasOwn(raw,key)&&Object.hasOwn(raw,'office_schedule'))out[key]=!!raw.office_schedule;
  for (const key of PROVIDER_UPDATE_SECTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) out[key] = !['pay_portal','training_ack','preferred_days'].includes(key) && !!raw[key];
  }
  return out;
}

export function enabledSections(config) {
  const cfg = normalizeSectionConfig(config);
  return PROVIDER_UPDATE_SECTIONS.filter((s) => cfg[s.key] && !['pay_portal','training_ack','preferred_days'].includes(s.key));
}

export function getSectionMeta(key) {
  return PROVIDER_UPDATE_SECTIONS.find((s) => s.key === key) || null;
}

export function getPageMeta(key) {
  return PROVIDER_UPDATE_PAGES.find((p) => p.key === key) || null;
}

/** Build overview pages from the recipient’s enabled section progress rows. */
export function buildPagesFromSections(sections = []) {
  const byKey = new Map((sections || []).map((s) => [s.key, s]));
  const pages = [];
  for (const page of PROVIDER_UPDATE_PAGES) {
    const pageSections = page.sectionKeys.map((k) => byKey.get(k)).filter(Boolean);
    if (!pageSections.length) continue;
    const completed = pageSections.every((s) => s.completed);
    const anyStarted = pageSections.some(
      (s) => s.completed || s.status === 'in_progress' || s.status === 'completed'
    );
    const status = completed ? 'completed' : anyStarted ? 'in_progress' : 'not_started';
    const checklistFromLive = pageSections
      .map((s) => s.meta?.shortTitle || s.meta?.title || s.key)
      .filter(Boolean);
    pages.push({
      key: page.key,
      title: page.title,
      shortTitle: page.shortTitle,
      description: page.description,
      icon: page.icon,
      checklist: page.checklist?.length ? page.checklist : checklistFromLive,
      sections: pageSections,
      completed,
      status,
      sectionsCompleted: pageSections.filter((s) => s.completed).length,
      sectionsTotal: pageSections.length,
      alone: page.sectionKeys.length === 1
    });
  }
  return pages;
}

export function publicProviderUpdateUrl(token, orgSlug = '') {
  if (!token) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const slug = String(orgSlug || '').trim().replace(/^\/+|\/+$/g, '');
  const path = slug ? `/${slug}/provider-update/${token}` : `/provider-update/${token}`;
  return `${origin}${path}`;
}
