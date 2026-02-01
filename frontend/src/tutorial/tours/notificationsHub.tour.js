export default {
  id: 'notifications_hub',
  version: 1,
  steps: [
    {
      element: '[data-tour="notifhub-title"]',
      popover: {
        title: 'Notifications hub',
        description: 'This page aggregates personal notifications and routes you to agency/team feeds based on role.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="notifhub-card-mine"]',
      popover: {
        title: 'My notifications',
        description: 'These are notifications where you are the target user.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="notifhub-card-agency"]',
      popover: {
        title: 'Agency notifications (admins/support)',
        description: 'Pick an agency to manage the full admin feed.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="notifhub-card-team"]',
      popover: {
        title: 'Team notifications (supervisor/CPA)',
        description: 'Open supervisee/operational notifications for your team scope.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

