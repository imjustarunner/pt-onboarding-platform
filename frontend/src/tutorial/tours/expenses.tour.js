export default {
  id: 'expenses',
  version: 1,
  steps: [
    {
      element: '[data-tour="expenses-title"]',
      popover: {
        title: 'Expenses & reimbursements',
        description: 'Review company card expenses and reimbursements in one place.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="expenses-actions"]',
      popover: {
        title: 'Actions',
        description: 'Export to CSV and refresh the inbox.',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="expenses-filters"]',
      popover: {
        title: 'Filters',
        description: 'Filter by type/status, search by user/vendor/project, and sort by expense date.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="expenses-table"]',
      popover: {
        title: 'Inbox table',
        description: 'Review rows and open receipts. Use “Send” to send a receipt to Drive (when available).',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

