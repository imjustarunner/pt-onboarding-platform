/**
 * School Portal tutorial steps — condensed first-login walkthrough with page navigation.
 * `portalMode`: panel to open before highlighting (home = portal home).
 * `selector`: data-tour anchor; omit for centered intro/outro cards.
 *
 * Version stays at 4 so staff who already finished the longer tour are not forced to replay.
 * First-login school staff start this condensed tour via session flag instead of a version bump.
 */
export const SCHOOL_PORTAL_TUTORIAL_ID = 'school_portal';
export const SCHOOL_PORTAL_TUTORIAL_VERSION = 4;

export const schoolPortalGuidedSteps = [
  {
    id: 'welcome',
    popover: {
      title: 'Welcome to the School Portal',
      description:
        'This short tour lights up the areas you will use most. Press Space or → to advance, or Jump to skip ahead.',
      side: 'bottom',
      align: 'center'
    }
  },
  {
    id: 'nav-digital-forms',
    portalMode: 'digital_forms',
    selector: '[data-tour="school-digital-forms-panel"], [data-tour="school-nav-digital-forms"], [data-tour="school-home-card-digital-intake"]',
    popover: {
      title: 'Digital packet link',
      description:
        'This is where you access the digital packet link for parents — copy a URL or show a QR code so they can complete intake online.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-printable-forms',
    portalMode: 'printable_forms',
    selector: '[data-tour="school-printable-forms-panel"], [data-tour="school-nav-printable-forms"]',
    popover: {
      title: 'Printable packets',
      description:
        'This is where you access printable packets when a parent needs a paper copy. Print from here; do not email this link.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-upload-packet',
    portalMode: 'upload_packet',
    selector: '[data-tour="school-upload-packet-panel"], [data-tour="school-nav-upload"], [data-tour="school-home-card-upload"]',
    popover: {
      title: 'Upload paper packets',
      description:
        'This is where you upload paper packets after a parent returns a completed packet in person.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-roster',
    portalMode: 'roster',
    selector: '[data-tour="school-roster-panel"], [data-tour="school-nav-roster"]',
    popover: {
      title: 'Roster',
      description:
        'New clients show up in the roster after their packet is in. Once they are Ready to Schedule, add them to the soft schedule. After your provider’s first session they change to Being Seen.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-waitlist',
    portalMode: 'roster',
    selector: '[data-tour="school-roster-waitlist"], [data-tour="school-roster-panel"]',
    popover: {
      title: 'Waitlist',
        description:
          'You’ll see waitlisted clients in this status column. Hover or click Waitlist to read why they are waiting.',
      side: 'bottom',
      align: 'start'
    }
  },
  {
    id: 'nav-staff',
    portalMode: 'school_staff',
    selector: '[data-tour="school-staff-panel"], [data-tour="school-nav-staff"]',
    popover: {
      title: 'School staff',
      description:
        'School staff live here. This is where accounts can be added and access can be managed for your school.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-providers',
    portalMode: 'providers',
    selector: '[data-tour="school-providers-panel"], [data-tour="school-nav-providers"]',
    popover: {
      title: 'Providers',
      description:
        'Open the Providers link to see who is assigned to your school and to message them.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-days',
    portalMode: 'days',
    selector: '[data-tour="school-days-daybar"], [data-tour="school-nav-days"]',
    popover: {
      title: 'Days',
      description:
        'Use Days to see each weekday your providers are on site. This is where you set the soft schedule once a client is ready.',
      side: 'bottom',
      align: 'center'
    }
  },
  {
    id: 'nav-days-soft-schedule',
    portalMode: 'days',
    selector: '[data-tour="school-soft-schedule"], [data-tour="school-days-capacity"]',
    popover: {
      title: 'Soft schedule',
      description:
        'Place Ready to Schedule clients into open slots here. After the provider’s first session that year, the client moves to Being Seen.',
      side: 'top',
      align: 'start'
    }
  },
  {
    id: 'complete',
    portalMode: 'home',
    popover: {
      title: 'You are all set',
      description:
        'Hover any sidebar item while Tutorial is on for a quick reminder. Turn Tutorial off from the header anytime.',
      side: 'bottom',
      align: 'center'
    }
  }
];

/** Hover tips keyed by data-tour attribute value. */
export const schoolPortalHoverTips = {
  'school-header-title': {
    title: 'Portal header',
    description: 'Shows your school portal name and confirms you are in the right place.'
  },
  'school-top-actions': {
    title: 'Top actions',
    description: 'Privacy toggle, help, and logout live here.'
  },
  'school-codes-toggle': {
    title: 'Codes vs initials',
    description: 'Switch between anonymous codes and initials to protect student privacy in the portal.'
  },
  'school-home-snapshot': {
    title: 'At a glance',
    description: 'Tap any stat pill to jump straight to that section.'
  },
  'school-nav-rail': {
    title: 'Sidebar',
    description: 'Main navigation — each section has its own page.'
  },
  'school-nav-home': {
    title: 'Portal Home',
    description: 'Dashboard with cards, roster preview, and quick stats.'
  },
  'school-nav-days': {
    title: 'Days / Schedule',
    description: 'Weekday schedules, on-site providers, and the soft schedule.'
  },
  'school-days-daybar': {
    title: 'Weekday picker',
    description: 'Tap Mon–Fri to view providers and set the soft schedule for that day.'
  },
  'school-days-capacity': {
    title: 'Provider capacity',
    description: 'See who has open slots vs full for the selected day. Click a card to jump to their schedule.'
  },
  'school-soft-schedule': {
    title: 'Soft schedule',
    description:
      'Add Ready to Schedule clients to open slots. After the first session they change to Being Seen.'
  },
  'school-nav-providers': {
    title: 'Providers',
    description: 'See assigned providers for your school.'
  },
  'school-nav-roster': {
    title: 'Roster',
    description: 'New clients appear here. Click a student to open their profile.'
  },
  'school-roster-waitlist': {
    title: 'Waitlist',
    description: 'Filter waitlisted clients and hover a waitlist mark to see why.'
  },
  'school-client-modal': {
    title: 'Client profile',
    description: 'View details, add comments, send ticketed messages, and update checklist items.'
  },
  'school-client-modal-comments': {
    title: 'Comments',
    description: 'Brief team notes visible on the client profile — not for questions (no PHI).'
  },
  'school-client-modal-messages': {
    title: 'Messages (ticketed)',
    description: 'Ask agency staff a question; creates a tracked support ticket.'
  },
  'school-nav-skills': {
    title: 'Skill Builders',
    description: 'Groups, meetings, and participants when enabled for your school.'
  },
  'school-nav-events': {
    title: 'Events',
    description: 'Post and manage school events.'
  },
  'school-nav-calendar': {
    title: 'School calendar',
    description: 'Calendar view of holidays and events.'
  },
  'school-nav-staff': {
    title: 'School staff',
    description: 'Staff accounts linked to this portal — add people from this page.'
  },
  'school-nav-docs': {
    title: 'Docs / Links',
    description: 'School staff packets and shared reference documents. Intake packets are also on Home via Digital forms and Upload packet.'
  },
  'school-staff-docs-panel': {
    title: 'School staff documents',
    description: 'Your signed waivers and school staff document packets are stored here.'
  },
  'school-home-card-docs': {
    title: 'Docs / Links card',
    description: 'Jump to school documents and shared links from the home dashboard.'
  },
  'school-nav-digital-forms': {
    title: 'Digital packet link',
    description: 'Share the digital intake packet link or QR code with parents.'
  },
  'school-home-card-digital-intake': {
    title: 'Digital forms card',
    description: 'Same digital intake packet as the sidebar — share link or QR from Home.'
  },
  'school-digital-forms-panel': {
    title: 'Digital intake packet',
    description: 'Copy the parent link, show a QR code, or launch a staff-assisted session.'
  },
  'school-nav-printable-forms': {
    title: 'Printable packets',
    description: 'Open printable referral packets for parents who need a paper copy.'
  },
  'school-printable-forms-panel': {
    title: 'Printable packets',
    description: 'View, print, or download the English and Spanish paper packets.'
  },
  'school-nav-upload': {
    title: 'Upload paper packets',
    description: 'Upload a scanned paper referral packet when parents do not use digital forms.'
  },
  'school-home-card-upload': {
    title: 'Upload packet card',
    description: 'Same paper packet upload as the sidebar — available from Home for quick access.'
  },
  'school-upload-packet-panel': {
    title: 'Upload referral packet',
    description: 'Submit PDF or image files from a completed paper intake packet.'
  },
  'school-contact-admin-panel': {
    title: 'Contact admin',
    description: 'Email agency staff with a question and follow the ticket here.'
  },
  'school-nav-faq': {
    title: 'FAQ',
    description: 'Common questions and answers.'
  },
  'school-nav-notifications': {
    title: 'Notifications',
    description: 'School-wide feed with filters.'
  },
  'school-nav-help': {
    title: 'Contact admin',
    description: 'Opens a support ticket to agency staff.'
  },
  'school-nav-messages': {
    title: 'Messages',
    description: 'Conversations with providers, school staff, and agency admin.'
  },
  'school-messages-panel': {
    title: 'Messages inbox',
    description: 'Reply to threads from providers or staff; agency questions may appear here too.'
  },
  'school-home-card-messages': {
    title: 'Messages card',
    description: 'Jump to your message threads from the home dashboard.'
  },
  'school-home-card-notifications': {
    title: 'Notifications card',
    description: 'Unread count and quick access to the feed.'
  },
  'school-home-card-help': {
    title: 'Contact admin card',
    description: 'Send a message without leaving the home page.'
  },
  'school-home-roster': {
    title: 'Home roster',
    description: 'Roster preview — click a client for details.'
  }
};

/** When a hover tip has no direct guided-step selector, jump to this step id. */
const schoolPortalHoverTipStepIds = {
  'school-client-modal': 'nav-roster',
  'school-client-modal-comments': 'nav-roster',
  'school-client-modal-messages': 'nav-roster',
  'school-home-roster': 'nav-roster',
  'school-nav-home': 'welcome',
  'school-home-card-digital-intake': 'nav-digital-forms',
  'school-home-card-upload': 'nav-upload-packet',
  'school-nav-printable-forms': 'nav-printable-forms'
};

/** Best guided-walkthrough step index for a hovered data-tour id, or -1. */
export function findGuidedStepIndexForTip(tipId) {
  const id = String(tipId || '').trim();
  if (!id) return -1;

  const needle = `[data-tour="${id}"]`;
  const directIdx = schoolPortalGuidedSteps.findIndex((step) =>
    String(step.selector || '').includes(needle)
  );
  if (directIdx >= 0) return directIdx;

  const stepId = schoolPortalHoverTipStepIds[id];
  if (!stepId) return -1;
  return schoolPortalGuidedSteps.findIndex((step) => step.id === stepId);
}
