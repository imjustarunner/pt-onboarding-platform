export default {
  id: 'dashboard',
  version: 1,
  steps: [
    {
      element: '[data-tour="dash-header-title"]',
      popover: {
        title: 'Welcome',
        description: 'This is your dashboard. Press Enter or Space to move through the tutorial.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="dash-rail"]',
      popover: {
        title: 'Sections',
        description: 'Use these cards to switch between checklist, documents, training, and other areas.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-checklist"]',
      popover: {
        title: 'Checklist',
        description: 'Start here to view required items and track completion.',
        side: 'right',
        align: 'center'
      }
    }
  ]
};

