export default {
  id: 'buildings_schedule',
  version: 1,
  steps: [
    {
      element: '[data-tour="buildings-schedule-title"]',
      popover: {
        title: 'Building schedule',
        description: 'This grid shows office/room availability by day and hour.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-schedule-controls"]',
      popover: {
        title: 'Week controls',
        description: 'Change the week and refresh the grid.',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="buildings-schedule-legend"]',
      popover: {
        title: 'Legend',
        description: 'Slot colors indicate state (open, assigned available/temporary/booked).',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-schedule-avail-search"]',
      popover: {
        title: 'Find availability (staff/admin)',
        description: 'Search for open or assigned-available offices at a specific day/time.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-schedule-room-nav"]',
      popover: {
        title: 'Room navigation',
        description: 'Switch rooms, jump prev/next, or focus on a single room.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-schedule-week-table"]',
      popover: {
        title: 'Schedule grid',
        description: 'Click a slot to open actions (booking/assigning depends on your role and slot state).',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

