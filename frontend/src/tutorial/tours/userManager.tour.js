export default {
  id: 'user_manager',
  version: 1,
  steps: [
    {
      element: '[data-tour="users-title"]',
      popover: {
        title: 'User Management',
        description: 'Search, filter, and manage users. Use the table to open individual user profiles.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="users-filters-sidebar"]',
      popover: {
        title: 'Filters',
        description: 'Use these filters to narrow the user list quickly (agency/org/status/role).',
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '[data-tour="users-ai-search"]',
      popover: {
        title: 'AI Search',
        description: 'Ask a question across user info fields and get a copyable email list (and provider availability hints when relevant).',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="users-table"]',
      popover: {
        title: 'Users table',
        description: 'Click a user name to open their profile. Use “Expand columns” to see more fields.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

