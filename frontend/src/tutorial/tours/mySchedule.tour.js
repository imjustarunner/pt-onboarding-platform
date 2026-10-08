export default {
  id: 'my_schedule',
  version: 1,
  steps: [
    {
      popover: {
        title: 'My Schedule',
        description: 'This tour explains the schedule controls, office selection, calendar overlays, and the new office layout view.',
        side: 'bottom',
        align: 'center'
      }
    },
    {
      element: '[data-tour="my-schedule-week-nav"]',
      popover: {
        title: 'Week navigation',
        description: 'Use Prev/Next to change weeks. The Today label shows the current date (MM/DD), and the Today button jumps back to the current week.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="my-schedule-view-switch"]',
      popover: {
        title: 'Two views',
        description: 'Open finder shows your personal schedule grid. Office layout shows a room-by-room weekly board for the selected office.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="my-schedule-office-select"]',
      popover: {
        title: 'Office selection',
        description: 'Pick an office building to show office availability overlays and to enable the Office layout view. Use “None” (or the ✕) to clear the selection.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="my-schedule-google-busy-toggle"]',
      popover: {
        title: 'Google busy overlay',
        description: 'This overlay blocks time where Google shows you as busy. If your Google account cannot be validated for busy lookups, the system may automatically turn this off.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="my-schedule-subscription"]',
      popover: {
        title: 'Your personal calendar',
        description: 'Create a private subscription link for Google, Apple, or Outlook. Your calendar shows schedule basics, client initials, and meeting links. You can replace or revoke the link here.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="my-schedule-grid"]',
      popover: {
        title: 'Open finder grid',
        description: 'Click a day/hour cell to request or book time. You can set multi-hour ranges with the End time and choose Weekly / Every 2–4 weeks / Monthly for office requests.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="my-schedule-office-layout-panel"]',
      popover: {
        title: 'Office layout (room-by-room)',
        description: 'Switch to Office layout to see each room’s week. Click a room/time cell to open the booking modal; multi-hour and Weekly / Every 2–4 weeks / Monthly requests are supported.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

