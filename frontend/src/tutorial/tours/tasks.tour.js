export default {
  id: 'tasks',
  version: 1,
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
      element: '[data-tour="tasks-list"]',
      popover: {
        title: 'Task list',
        description: 'Open a task to review details and complete required actions.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

