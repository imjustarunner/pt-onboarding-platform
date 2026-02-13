/**
 * School Portal tutorial — area by area, card by card.
 * Covers the home dashboard, nav rail, notifications, tickets vs comments,
 * and checklist items.
 */
export default {
  id: 'school_portal',
  version: 1,
  steps: [
    {
      popover: {
        title: 'Welcome to the School Portal',
        description:
          'This tutorial walks you through each area of the portal. Press Enter or Space to advance. Click anywhere on the overlay to continue.',
        side: 'bottom',
        align: 'center'
      }
    },
    {
      element: '[data-tour="school-header-title"]',
      popover: {
        title: 'Portal header',
        description:
          'Your school portal shows schedule and roster information without PHI (protected health information). Use the Tutorial toggle to turn this guide on or off.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-top-actions"]',
      popover: {
        title: 'Top actions',
        description:
          'Settings (for admins), Back to schools, Show codes/initials toggle for client privacy, Contact admin for help, and Logout.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-codes-toggle"]',
      popover: {
        title: 'Codes vs initials',
        description:
          'Client identifiers can show as codes (e.g. ABC123) or initials. Use this toggle to match your privacy needs. Hover over codes to see initials when in code mode.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-snapshot"]',
      popover: {
        title: 'At a glance',
        description:
          'Quick stats: unread notifications, days supported, clients being seen, slots available, pending clients, waitlist, and school staff count. Click any pill to jump to that section.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-providers"]',
      popover: {
        title: 'Providers card',
        description:
          'View provider cards, profiles, and messages. Open to see who is assigned to your school and coordinate with them.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-days"]',
      popover: {
        title: 'Days card',
        description:
          'Choose a weekday and view schedules. See which providers are on-site each day and their soft schedule slots.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-roster"]',
      popover: {
        title: 'Roster card',
        description:
          'View and sort the client roster. See assigned and unassigned clients with restricted fields (codes or initials). Click a client to view details, comments, and messages.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-skills"]',
      popover: {
        title: 'Skills Groups card',
        description:
          'Groups, meetings, providers, and participants. Manage skills-based groups and see who is in each.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-staff"]',
      popover: {
        title: 'School staff card',
        description:
          'Manage linked school staff accounts and requests. See who has portal access and handle new account requests.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-docs"]',
      popover: {
        title: 'Docs / Links card',
        description:
          'Shared calendars and school-wide reference docs/links. Access shared resources without leaving the portal.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-faq"]',
      popover: {
        title: 'FAQ card',
        description:
          'Common questions and answers. Quick reference for how things work.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-notifications"]',
      popover: {
        title: 'Notifications card',
        description:
          'School-wide announcements plus client updates. The badge shows unread count. Notifications include: announcements, tickets, comments, checklist updates, status changes, and more.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-help"]',
      popover: {
        title: 'Contact admin card',
        description:
          'Send a message to agency staff. Creates a support ticket. Use this for questions, scheduling requests, or general help.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-parent-qr"]',
      popover: {
        title: 'Parent QR code',
        description:
          'Share a QR code for parent intake and forms. Parents scan to access the intake link.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-upload"]',
      popover: {
        title: 'Upload packet',
        description:
          'Upload a referral packet. No PHI is exposed on the portal. The system processes the packet and extracts needed info.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-roster"]',
      popover: {
        title: 'School roster (home)',
        description:
          'The roster appears here on the home page. Click a client to open their modal with Comments, Messages (tickets), and the compliance checklist.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-nav-rail"]',
      popover: {
        title: 'Navigation rail',
        description:
          'When you leave home, this rail appears. Use it to switch between Home, Providers, Days, Roster, Skills, Staff, Docs/Links, Notifications, FAQ, and Help.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="school-nav-notifications"]',
      popover: {
        title: 'Notifications in the nav',
        description:
          'The Notifications badge shows unread count. Click to open the full notifications panel with filters and settings.',
        side: 'left',
        align: 'start'
      }
    },
    {
      popover: {
        title: 'Notifications explained',
        description:
          'The Notifications panel shows a unified feed. Filter by: All, Messages, Comments, Announcements, Tickets, or Checklist. Use Settings to choose which notification types you want to see.',
        side: 'bottom',
        align: 'center'
      }
    },
    {
      popover: {
        title: 'Tickets vs Comments',
        description:
          'TICKETS (Messages): For questions and inquiries. Tracked as support tickets. You can reply and get answers from agency staff. Use Contact admin for general questions, or open a client and use Messages for client-specific questions.\n\nCOMMENTS: Brief notes (no PHI) that inform everyone—e.g. "Client on vacation." Comments are for sharing context, not for asking questions.',
        side: 'bottom',
        align: 'center'
      }
    },
    {
      popover: {
        title: 'Checklist items',
        description:
          'The compliance checklist tracks: Parents Contacted (date + successful?), Intake Date, First Service. Updates appear as Checklist notifications. In the client modal, the checklist is read-only—agency staff update it. Checklist notifications tell you when items are completed or changed.',
        side: 'bottom',
        align: 'center'
      }
    },
    {
      popover: {
        title: 'Tutorial complete',
        description:
          'You can revisit any area using the nav rail. Turn off tutorials with the Tutorial toggle in the header. Need help? Use Contact admin.',
        side: 'bottom',
        align: 'center'
      }
    }
  ]
};
