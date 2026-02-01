export default {
  id: 'support_tickets_queue',
  version: 1,
  steps: [
    {
      element: '[data-tour="tickets-title"]',
      popover: {
        title: 'Support tickets queue',
        description: 'This is the queue for school staff requests. Use filters to narrow, then claim and answer tickets.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="tickets-filters"]',
      popover: {
        title: 'Filters',
        description: 'Filter by search text, school id, status, and “mine vs all”.',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="tickets-list"]',
      popover: {
        title: 'Ticket list',
        description: 'Each ticket shows the school and the question. Use Claim to assign it to yourself.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="tickets-answer-box"]',
      popover: {
        title: 'Answer + status',
        description: 'Write an answer, set status, and submit. If someone else claimed the ticket, you can view but not answer.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

