export default {
  id: 'team_notifications',
  version: 1,
  steps: [
    {
      element: '[data-tour="teamnotif-title"]',
      popover: {
        title: 'Team notifications',
        description: 'This page groups operational notifications for supervisors and CPAs.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="teamnotif-agency-filter"]',
      popover: {
        title: 'Agency filter',
        description: 'Filter by agency when you have multiple.',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="teamnotif-list"]',
      popover: {
        title: 'Grouped notifications',
        description: 'Notifications are grouped by type. Click an item to open the related user profile.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="teamnotif-item"]',
      popover: {
        title: 'View details',
        description: 'Click to navigate to the target user profile (when available).',
        side: 'left',
        align: 'start'
      }
    }
  ]
};

