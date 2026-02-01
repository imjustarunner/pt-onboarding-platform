export default {
  id: 'communication_thread',
  version: 1,
  steps: [
    {
      element: '[data-tour="thread-title"]',
      popover: {
        title: 'Conversation thread',
        description: 'This page shows a single SMS conversation thread for a client.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="thread-actions"]',
      popover: {
        title: 'Thread actions',
        description: 'Refresh to reload messages. Delete conversation permanently removes the thread from this app (cannot recall already-delivered SMS).',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="thread-bubble-list"]',
      popover: {
        title: 'Message history',
        description: 'Inbound/outbound messages appear here in chronological order.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="thread-composer"]',
      popover: {
        title: 'Send a message',
        description: 'Write your message and click Send.',
        side: 'left',
        align: 'start'
      }
    }
  ]
};

