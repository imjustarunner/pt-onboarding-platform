export default {
  id: 'platform_chats',
  version: 1,
  steps: [
    {
      element: '[data-tour="chats-title"]',
      popover: {
        title: 'Platform Chats',
        description: 'Direct messages are organized into threads scoped to an agency.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="chats-actions"]',
      popover: {
        title: 'Agency + refresh',
        description: 'Pick an agency (if available) and refresh to load threads.',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="chats-threads"]',
      popover: {
        title: 'Threads list',
        description: 'Select a thread to load messages. Unread counts appear on the right.',
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '[data-tour="chats-messages"]',
      popover: {
        title: 'Messages',
        description: 'Read the conversation here. Some actions (unsend/delete) depend on message state.',
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '[data-tour="chats-composer"]',
      popover: {
        title: 'Send a message',
        description: 'Type your message and click Send.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

