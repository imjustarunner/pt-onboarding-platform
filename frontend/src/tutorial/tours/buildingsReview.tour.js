export default {
  id: 'buildings_review',
  version: 2,
  steps: [
    {
      element: '[data-tour="buildings-review-title"]',
      popover: {
        title: 'Building Review',
        description: 'Review assigned office slots for biweekly review and periodic booking confirmations.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-review-summary"]',
      popover: {
        title: 'Summary counts',
        description: 'Quick snapshot of how many items need review/confirmation.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-review-list"]',
      popover: {
        title: 'Items to review',
        description: 'Use actions like Keep available / Temporary / Forfeit / Confirm booked, then open the schedule for context.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-review-row-actions"]',
      popover: {
        title: 'Row actions',
        description: 'These actions update availability/booking state. If you’re unsure, open schedule to verify the slot context first.',
        side: 'left',
        align: 'start'
      }
    }
  ]
};

