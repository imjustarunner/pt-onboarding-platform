export default {
  id: 'communications_feed',
  version: 1,
  steps: [
    {
      element: '[data-tour="comms-title"]',
      popover: {
        title: 'Communications feed',
        description: 'This feed combines SMS, platform chats, and some ticket signals into one place.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="comms-actions"]',
      popover: {
        title: 'Actions',
        description: 'Open the Chats UI or refresh the feed.',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="comms-list"]',
      popover: {
        title: 'Items',
        description: 'Click an item to open the corresponding thread/chat/ticket context.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="comms-row"]',
      popover: {
        title: 'Row details',
        description: 'Badges show the source (CHAT/SMS/TICKET) and the preview shows the latest message.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

