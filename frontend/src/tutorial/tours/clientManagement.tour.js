export default {
  id: 'client_management',
  version: 1,
  steps: [
    {
      element: '[data-tour="clients-title"]',
      popover: {
        title: 'Client Management',
        description: 'Create clients, bulk import, and manage client records across schools/affiliations.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="clients-actions"]',
      popover: {
        title: 'Actions',
        description: 'Use these actions to import, rollover/reset documentation, and create new clients (availability depends on role).',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="clients-filters"]',
      popover: {
        title: 'Filters',
        description: 'Search and filter by status, school/affiliation, provider, and sort. Use Columns to customize the table.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="clients-table"]',
      popover: {
        title: 'Clients table',
        description: 'Review client rows, use pagination, and use bulk actions when selecting multiple clients.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

