/**
 * Catalog of automated / system emails shown on Email Settings.
 * Notification triggers are loaded from the API and merged at runtime.
 */

export const AUTOMATED_EMAIL_CATALOG = [
  {
    key: 'password_reset',
    kind: 'template',
    category: 'Login & accounts',
    label: 'Forgot password',
    description: 'Sent when a school staff member or guardian clicks Forgot Password on the login page. The email includes a one-time link (48 hours) to set a new password.',
    trigger: 'Someone clicks Forgot Password and submits their email on the login screen.',
    triggerKind: 'Immediate · Event-based',
    sourceLinks: [
      { label: 'Login page', path: '/login' }
    ],
    preferredKeys: ['technology', 'login_recovery', 'notifications'],
    recommendedFromHint: 'For ITSCO this should be Technology@itsco.health (ITSCO Technology Team).',
    junkMailNote: true
  },
  {
    key: 'admin_initiated_password_reset',
    kind: 'template',
    category: 'Login & accounts',
    label: 'Admin-sent password reset',
    description: 'Sent when an admin emails a reset link from a user profile instead of setting a temporary password by hand.',
    trigger: 'Admin clicks send reset-password link on a user profile.',
    triggerKind: 'Immediate · Staff action',
    sourceLinks: [
      { label: 'Users', path: '/admin/users' },
      { label: 'School Staff Accounts', path: '/admin/school-staff-accounts' }
    ],
    preferredKeys: ['technology', 'login_recovery', 'notifications'],
    recommendedFromHint: 'Same From as Forgot Password — Technology@itsco.health for ITSCO.'
  },
  {
    key: 'school_staff_account_recovery',
    kind: 'template',
    category: 'Login & accounts',
    label: 'School staff recovery email',
    description: 'Bulk set-password / recovery link sent from School Staff Accounts to people who still need to log in.',
    trigger: 'Admin selects staff on School Staff Accounts and sends Account Access Email → Recovery.',
    triggerKind: 'Staggered · Staff action',
    sourceLinks: [
      { label: 'School Staff Accounts', path: '/admin/school-staff-accounts' }
    ],
    preferredKeys: ['technology', 'login_recovery', 'notifications'],
    recommendedFromHint: 'Technology@itsco.health for ITSCO.',
    junkMailNote: true
  },
  {
    key: 'school_staff_portal_access',
    kind: 'template',
    category: 'Login & accounts',
    label: 'Access your tenant portal',
    description: 'Bulk “access your portal” email from School Staff Accounts, with a portal login link and a set-password link if they have not logged in yet.',
    trigger: 'Admin selects staff on School Staff Accounts and sends Account Access Email → Portal access.',
    triggerKind: 'Staggered · Staff action',
    sourceLinks: [
      { label: 'School Staff Accounts', path: '/admin/school-staff-accounts' }
    ],
    preferredKeys: ['technology', 'login_recovery', 'notifications'],
    recommendedFromHint: 'Technology@itsco.health for ITSCO.',
    junkMailNote: true
  },
  {
    key: 'school_roi_signing',
    kind: 'template',
    category: 'School ROI',
    label: 'School ROI signing link',
    description: 'Release-of-information signing link emailed to a guardian so they can sign the ROI packet.',
    trigger: 'Staff shares or sends a school ROI / signing link from the client or school portal.',
    triggerKind: 'Immediate · Staff action',
    sourceLinks: [
      { label: 'School Referral Hub', path: '/admin/school-referral-hub' },
      { label: 'Clients', path: '/admin/clients' }
    ],
    preferredKeys: ['school_intake', 'intake']
  },
  {
    key: 'school_roi_signer_completion',
    kind: 'template',
    category: 'School ROI',
    label: 'School ROI completion',
    description: 'Confirmation / download email after a guardian finishes signing the ROI.',
    trigger: 'Guardian completes ROI signing.',
    triggerKind: 'Immediate · Event-based',
    sourceLinks: [
      { label: 'School Referral Hub', path: '/admin/school-referral-hub' }
    ],
    preferredKeys: ['school_intake', 'intake']
  },
  {
    key: 'intake',
    kind: 'template',
    category: 'Intake',
    label: 'Intake & registration',
    description: 'Public intake confirmations and related school intake mail after a family submits a packet or registration form.',
    trigger: 'A public intake or school packet is submitted or completed.',
    triggerKind: 'Immediate · Event-based',
    sourceLinks: [
      { label: 'Office Join', path: '/join' },
      { label: 'School digital intakes', path: '/admin/school-digital-intakes' }
    ],
    preferredKeys: ['school_intake', 'intake']
  },
  {
    key: 'co_guardian_invite',
    kind: 'template',
    category: 'Intake',
    label: 'Secondary Guardian',
    description: 'Invite email to another parent/guardian with medical decision-making rights so they can complete their own consent and intake forms. School sends are queued until this sender identity is configured; office can send immediately.',
    trigger: 'A primary guardian lists another decision-maker on intake, or staff send a secondary-guardian invite.',
    triggerKind: 'Immediate · Event-based (office) · Queued until enabled (school)',
    sourceLinks: [
      { label: 'School digital intakes', path: '/admin/school-digital-intakes' },
      { label: 'Office Join', path: '/join' },
      { label: 'Email Settings', path: '/admin/communications?mode=automation' }
    ],
    preferredKeys: ['school_intake', 'intake', 'notifications'],
    recommendedFromHint: 'Map a From identity (school_intake or intake) before enabling school auto-send.'
  },
  {
    key: 'adaptive_full_intake_invite',
    kind: 'template',
    category: 'Intake',
    label: 'Full intake link (from interest form)',
    description: 'Email from New Intakes that sends a prefilled full intake link to a quick prospective inquiry.',
    trigger: 'Staff clicks Email full intake link on a prospective inquiry.',
    triggerKind: 'Immediate · Staff action',
    sourceLinks: [
      { label: 'New Intakes', path: '/admin/office-intake-queue' }
    ],
    preferredKeys: ['intake', 'notifications']
  },
  {
    key: 'job_applications',
    kind: 'template',
    category: 'Hiring',
    label: 'Job application received',
    description: 'Confirmation to an applicant after they submit a job application.',
    trigger: 'Someone submits an application on the public careers page.',
    triggerKind: 'Immediate · Event-based',
    sourceLinks: [
      { label: 'Careers', path: '/careers' },
      { label: 'Hiring candidates', path: '/admin/hiring-candidates' }
    ],
    preferredKeys: ['job_applications', 'notifications']
  },
  {
    key: 'hiring_references',
    kind: 'template',
    category: 'Hiring',
    label: 'Hiring references',
    description: 'Reference-form invitations and reminders sent during hiring.',
    trigger: 'Hiring staff send or remind a reference contact.',
    triggerKind: 'Immediate · Staff action',
    sourceLinks: [
      { label: 'Hiring candidates', path: '/admin/hiring-candidates' }
    ],
    preferredKeys: ['hiring_references', 'notifications']
  },
  {
    key: 'manual',
    kind: 'template',
    category: 'Staff-composed',
    label: 'Staff-composed / approvals',
    description: 'Manual sends and approved pending emails when no identity is stored on the communication row.',
    trigger: 'Staff compose a message, or approve a queued Automation item that has no stored From.',
    triggerKind: 'Manual',
    sourceLinks: [
      { label: 'Communications › Automation', path: '/admin/communications?mode=automation' }
    ],
    preferredKeys: ['notifications']
  },
  {
    key: 'admin_update',
    kind: 'template',
    category: 'Staff-composed',
    label: 'Admin Update newsletter',
    description: 'Monthly branded HTML newsletter composed in Communications Center and scheduled to internal staff.',
    trigger: 'Staff schedule an Admin Update from Communications Center.',
    triggerKind: 'Scheduled · Staff action',
    sourceLinks: [
      { label: 'Communications › Admin Update', path: '/admin/communications?mode=admin-update' }
    ],
    preferredKeys: ['notifications']
  },
  {
    key: 'default',
    kind: 'template',
    category: 'Defaults',
    label: 'Default outbound',
    description: 'Agency default From used only when a more specific type has no identity assigned. Do not rely on this — assign a From on each email type instead. Sends that still hit this path queue for approval.',
    trigger: 'Any automated email whose type has no assigned sender.',
    triggerKind: 'Fallback (queued for approval)',
    sourceLinks: [
      { label: 'Communications › Automation', path: '/admin/communications?mode=automation&status=pending' }
    ],
    preferredKeys: ['notifications'],
    isFallbackDefault: true
  }
];

export function catalogEntryByKey(key) {
  const k = String(key || '').trim().toLowerCase();
  return AUTOMATED_EMAIL_CATALOG.find((row) => row.key === k) || null;
}
