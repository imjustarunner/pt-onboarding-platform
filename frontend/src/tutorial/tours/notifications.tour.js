export default {
  id: 'notifications',
  version: 1,
  steps: [
    {
      element: '[data-tour="notifications-title"]',
      popover: {
        title: 'Notifications',
        description: 'Notifications highlight items that need attention (tasks, onboarding, status changes, tickets, etc.).',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="notifications-agency-filter"]',
      popover: {
        title: 'Agency filter',
        description: 'If you have multiple agencies, filter notifications by agency context.',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="notifications-filters"]',
      popover: {
        title: 'Filters',
        description: 'Filter by type/status and choose whether to group by Type or by User.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="notifications-list"]',
      popover: {
        title: 'Notification groups',
        description: 'Notifications are grouped to keep the list readable. Open a notification to view/resolve it.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="notifications-item"]',
      popover: {
        title: 'Actions',
        description: 'Use View to navigate to the source. Mark as Read mutes temporarily. Resolve permanently removes it.',
        side: 'left',
        align: 'start'
      }
    }
  ]
};

