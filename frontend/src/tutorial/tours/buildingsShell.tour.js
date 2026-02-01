export default {
  id: 'buildings_shell',
  version: 1,
  steps: [
    {
      element: '[data-tour="buildings-title"]',
      popover: {
        title: 'Office locations',
        description: 'This area manages office/building scheduling, review workflows, and settings.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-office-select"]',
      popover: {
        title: 'Select a building',
        description: 'Choose an office location to load its schedule and related tools.',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="buildings-tabs"]',
      popover: {
        title: 'Sections',
        description: 'Use Schedule / Review / Settings to switch between building workflows.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-content"]',
      popover: {
        title: 'Content',
        description: 'The selected tab’s content loads here.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

