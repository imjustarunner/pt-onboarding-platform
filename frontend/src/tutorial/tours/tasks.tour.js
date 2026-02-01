export default {
  id: 'tasks',
  version: 2,
  steps: [
    {
      element: '[data-tour="tasks-title"]',
      popover: {
        title: 'My Tasks',
        description: 'This page shows your assigned tasks. Press Enter or Space to continue.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="tasks-filters"]',
      popover: {
        title: 'Filters',
        description: 'Use these filters to narrow down tasks by type (training/documents) and status.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="tasks-grid"]',
      popover: {
        title: 'Task cards',
        description: 'Each card represents a task. Click a card to open it.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="tasks-card"]',
      popover: {
        title: 'Open a task',
        description: 'Training tasks take you to a module. Document tasks take you to the signing flow.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="tasks-print"]',
      popover: {
        title: 'Print (documents)',
        description: 'For document tasks, you can open a print-friendly view from here.',
        side: 'left',
        align: 'center'
      }
    }
  ]
};

