export default {
  id: 'schedule_hub',
  version: 1,
  steps: [
    {
      element: '[data-tour="schedule-hub-title"]',
      popover: {
        title: 'Schedule Hub',
        description: 'This page is a launcher for the different schedule views in the system.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="schedule-hub-grid"]',
      popover: {
        title: 'Choose a view',
        description: 'Pick the schedule view you want to open.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="schedule-hub-card-full"]',
      popover: {
        title: 'Full schedule',
        description: 'Opens your personal schedule grid (requests, assignments, overlays).',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="schedule-hub-card-staff"]',
      popover: {
        title: 'Staff schedules (compare)',
        description: 'Compare multiple providers’ schedules side-by-side.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="schedule-hub-card-buildings-schedule"]',
      popover: {
        title: 'Buildings schedule',
        description: 'Master schedule grid for rooms/offices with booking actions.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="schedule-hub-card-buildings-admin"]',
      popover: {
        title: 'Buildings admin',
        description: 'Manage buildings/offices, reviews, and settings.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

