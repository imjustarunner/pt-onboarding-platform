export default {
  id: 'school_provider_profile',
  version: 1,
  steps: [
    {
      element: '[data-tour="school-provider-profile-page"]',
      popover: {
        title: 'Provider profile',
        description: 'This page shows a provider’s profile, day-by-day schedule context, caseload summary, client list, and messaging.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-provider-header"]',
      popover: {
        title: 'Header actions',
        description: 'Use Back to return to the providers list. Use the codes/initials toggle to match your privacy needs.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-provider-hero"]',
      popover: {
        title: 'Provider snapshot',
        description: 'Basic provider info and (when available) day-by-day availability pills.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-provider-actions"]',
      popover: {
        title: 'Message provider',
        description: 'Open the message thread to coordinate (avoid PHI).',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-provider-daybar-panel"]',
      popover: {
        title: 'Pick a day',
        description: 'Choose a weekday to view the soft schedule for that day.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-provider-soft-schedule-panel"]',
      popover: {
        title: 'Soft schedule',
        description: 'View or adjust soft schedule slots for the selected day (if you have access).',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-provider-caseload-summary"]',
      popover: {
        title: 'Caseload summary',
        description: 'See how many slots are assigned vs total per day, and quickly view linked clients.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-provider-clients-panel"]',
      popover: {
        title: 'Clients list',
        description: 'Browse/search clients for this provider (restricted fields by design).',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-provider-messages-panel"]',
      popover: {
        title: 'Messages panel',
        description: 'Messages stay here on the right; when open, some schedule panels may collapse to keep focus.',
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-provider-messages-composer"]',
      popover: {
        title: 'Composer',
        description: 'Write and send a message (no PHI).',
        side: 'left',
        align: 'start'
      }
    }
  ]
};

