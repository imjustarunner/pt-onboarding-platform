/**
 * School Portal tutorial steps — guided walkthrough with page navigation.
 * `portalMode`: panel to open before highlighting (home = portal home).
 * `selector`: data-tour anchor; omit for centered intro/outro cards.
 */
export const SCHOOL_PORTAL_TUTORIAL_ID = 'school_portal';
export const SCHOOL_PORTAL_TUTORIAL_VERSION = 4;

export const schoolPortalGuidedSteps = [
  {
    id: 'welcome',
    popover: {
      title: 'Welcome to the School Portal',
        description:
          'This walkthrough visits each main area. Press Space or → to advance, or use Jump to step to skip ahead. Hover highlighted areas later for quick tips while Tutorial is on.',
      side: 'bottom',
      align: 'center'
    }
  },
  {
    id: 'header',
    portalMode: 'home',
    selector: '[data-tour="school-header-title"]',
    popover: {
      title: 'Portal header',
      description:
        'Your school name appears here. Use the Tutorial toggle anytime to turn this guide on or off.',
      side: 'bottom',
      align: 'start'
    }
  },
  {
    id: 'top-actions',
    portalMode: 'home',
    selector: '[data-tour="school-top-actions"]',
    popover: {
      title: 'Top actions',
      description:
        'Settings (admins) and Logout. Use the codes/initials toggle (next step) for privacy, or Contact admin from the sidebar when you need agency help.',
      side: 'bottom',
      align: 'start'
    }
  },
  {
    id: 'privacy-codes',
    portalMode: 'home',
    selector: '[data-tour="school-codes-toggle"]',
    popover: {
      title: 'Codes vs initials',
      description:
        'Use Show codes or Show initials to protect student anonymity. Codes hide identities more; initials are easier to recognize at a glance. Switch anytime from here.',
      side: 'bottom',
      align: 'start'
    }
  },
  {
    id: 'home-snapshot',
    portalMode: 'home',
    selector: '[data-tour="school-home-snapshot"]',
    popover: {
      title: 'At a glance',
      description:
        'Quick stats for notifications, days supported, clients, slots, waitlist, and staff. Click a pill to jump to that section.',
      side: 'bottom',
      align: 'start'
    }
  },
  {
    id: 'nav-rail',
    portalMode: 'home',
    selector: '[data-tour="school-nav-rail"]',
    popover: {
      title: 'Sidebar navigation',
      description:
        'Switch between Home, Days, Providers, Roster, Events, Calendar, Staff, Docs, FAQ, Notifications, Messages, Digital forms, Upload packet, and Contact admin.',
      side: 'right',
      align: 'center'
    }
  },
  {
    id: 'nav-days',
    portalMode: 'days',
    selector: '[data-tour="school-days-daybar"]',
    popover: {
      title: 'Pick a weekday',
      description:
        'Use these day buttons (Mon–Fri) to switch which day you are viewing. Provider lists and schedules update for the day you select.',
      side: 'bottom',
      align: 'center'
    }
  },
  {
    id: 'nav-days-capacity',
    portalMode: 'days',
    selector: '[data-tour="school-days-capacity"]',
    popover: {
      title: 'Provider capacity at a glance',
      description:
        'Each card shows assigned vs total slots, open spots (green / yellow / full), and on-site hours. Click a card to jump to that provider’s schedule below.',
      side: 'bottom',
      align: 'start'
    }
  },
  {
    id: 'nav-days-soft-schedule',
    portalMode: 'days',
    selector: '[data-tour="school-soft-schedule"]',
    popover: {
      title: 'Soft schedule',
      description:
        'Optional and not mandatory — use this at your discretion to aid communication with providers. Share order, times, and pickup/location notes (no PHI). It does not replace official records.',
      side: 'top',
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
        'See assigned providers, open profiles, and send messages.',
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
        'View clients with codes or initials. Click any client to open their profile.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'client-profile-actions',
    portalMode: 'roster',
    selector: '[data-tour="school-roster-panel"]',
    popover: {
      title: 'Comments & support tickets',
      description:
        'In a client profile, add brief comments for the team (no PHI), or send a message that opens a tracked support ticket for agency staff. Use comments for notes; use messages when you need a reply.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-events',
    portalMode: 'events',
    selector: '[data-tour="school-events-panel"], [data-tour="school-nav-events"]',
    popover: {
      title: 'Events',
      description:
        'School events appear here and on the calendar. Post back-to-school or spring events when prompted.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-calendar',
    portalMode: 'calendar',
    selector: '[data-tour="school-nav-calendar"]',
    popover: {
      title: 'School calendar',
      description: 'Holidays, days off, and posted school events in one calendar view.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-staff',
    portalMode: 'school_staff',
    selector: '[data-tour="school-staff-panel"], [data-tour="school-nav-staff"]',
    popover: {
      title: 'School staff',
      description: 'Manage linked staff accounts and new access requests.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-docs',
    portalMode: 'documents',
    selector: '[data-tour="school-docs-panel"], [data-tour="school-staff-docs-panel"], [data-tour="school-nav-docs"]',
    popover: {
      title: 'Docs / Links',
      description:
        'School staff packets and reference documents live here. The same intake/referral packets are also on the Home dashboard (Digital forms and Upload packet cards) for quick access.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-digital-forms',
    portalMode: 'digital_forms',
    selector: '[data-tour="school-digital-forms-panel"], [data-tour="school-nav-digital-forms"], [data-tour="school-home-card-digital-intake"]',
    popover: {
      title: 'Digital forms',
      description:
        'Share the digital intake packet with parents — copy a link or show a QR code. This replaces the paper packet workflow and is also available from Docs / Links.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-upload-packet',
    portalMode: 'upload_packet',
    selector: '[data-tour="school-upload-packet-panel"], [data-tour="school-nav-upload"], [data-tour="school-home-card-upload"]',
    popover: {
      title: 'Upload packet',
      description:
        'Upload a scanned paper referral packet (PDF or images). Use this when parents return a physical packet instead of completing digital forms.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-contact-admin',
    portalMode: 'contact_admin',
    selector: '[data-tour="school-contact-admin-panel"], [data-tour="school-nav-help"], [data-tour="school-home-card-help"]',
    popover: {
      title: 'Contact admin',
      description:
        'Send an email-style message to agency staff when you need help. Pick a topic, write your question, and track replies here or in Notifications.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-faq',
    portalMode: 'faq',
    selector: '[data-tour="school-faq-panel"], [data-tour="school-nav-faq"]',
    popover: {
      title: 'FAQ',
      description: 'Quick answers to common portal questions.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'nav-notifications',
    portalMode: 'notifications',
    selector: '[data-tour="school-nav-notifications"]',
    popover: {
      title: 'Notifications',
      description:
        'Announcements, tickets, comments, and checklist updates. Filter by type in the panel.',
      side: 'left',
      align: 'start'
    }
  },
  {
    id: 'nav-messages',
    portalMode: 'messages',
    selector: '[data-tour="school-messages-panel"], [data-tour="school-nav-messages"], [data-tour="school-home-card-messages"]',
    popover: {
      title: 'Messages',
      description:
        'Read and reply to conversations from providers, other school staff, or agency admin. Direct provider messages and school threads appear here so you can respond in one place.',
      side: 'right',
      align: 'start'
    }
  },
  {
    id: 'tickets-vs-comments',
    popover: {
      title: 'Tickets vs Comments',
      description:
        'Messages create tracked tickets for agency staff. Comments are brief notes for everyone (no PHI) — not for questions.',
      side: 'bottom',
      align: 'center'
    }
  },
  {
    id: 'complete',
    portalMode: 'home',
    popover: {
      title: 'You are all set',
      description:
        'Hover any sidebar item or home card while Tutorial is on for quick reminders. Turn Tutorial off from the header anytime.',
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
    description: 'Weekday schedules and on-site providers.'
  },
  'school-days-daybar': {
    title: 'Weekday picker',
    description: 'Tap Mon–Fri to view providers and schedules for that day.'
  },
  'school-days-capacity': {
    title: 'Provider capacity',
    description: 'See who has open slots vs full for the selected day. Click a card to jump to their schedule.'
  },
  'school-soft-schedule': {
    title: 'Soft schedule',
    description:
      'Optional — not mandatory. Use at your discretion to aid communication with providers (times, order, pickup notes; no PHI).'
  },
  'school-nav-providers': {
    title: 'Providers',
    description: 'Provider directory for your school.'
  },
  'school-nav-roster': {
    title: 'Roster',
    description: 'Full client list — click a student to open their profile.'
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
    description: 'Staff accounts linked to this portal.'
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
    title: 'Digital forms',
    description: 'Open the digital intake packet link or QR code for parents.'
  },
  'school-home-card-digital-intake': {
    title: 'Digital forms card',
    description: 'Same digital intake packet as the sidebar — share link or QR from Home.'
  },
  'school-digital-forms-panel': {
    title: 'Digital intake packet',
    description: 'Copy the parent link, show a QR code, or launch a staff-assisted session.'
  },
  'school-nav-upload': {
    title: 'Upload packet',
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
  'school-client-modal': 'client-profile-actions',
  'school-client-modal-comments': 'client-profile-actions',
  'school-client-modal-messages': 'client-profile-actions',
  'school-home-roster': 'nav-roster',
  'school-nav-home': 'home-snapshot'
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
