export default {
  id: 'staff_schedule_compare',
  version: 1,
  steps: [
    {
      element: '[data-tour="sched-compare-title"]',
      popover: {
        title: 'Staff schedules (compare)',
        description: 'Use this tool to compare multiple providers’ schedules either overlaid or stacked.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="sched-compare-controls"]',
      popover: {
        title: 'Week + view controls',
        description: 'Pick a week, switch between Overlay vs Stacked, and jump prev/next week.',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="sched-compare-sidebar"]',
      popover: {
        title: 'Choose providers',
        description: 'Select up to a few providers to compare. Use search and quick picks to move faster.',
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '[data-tour="sched-compare-agency-filter"]',
      popover: {
        title: 'Agency filter',
        description: 'Filter schedule comparisons by agencies you have access to.',
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '[data-tour="sched-compare-provider-list"]',
      popover: {
        title: 'Provider list',
        description: 'Check providers to add them to the comparison. You’ll see the schedule appear on the right.',
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '[data-tour="sched-compare-overlay"]',
      popover: {
        title: 'Overlay view',
        description: 'Overlay shows multiple schedules on one grid so you can spot conflicts and overlaps quickly.',
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '[data-tour="sched-compare-stacked"]',
      popover: {
        title: 'Stacked view',
        description: 'Stacked shows one schedule per provider so you can compare in a scrolling layout (with Up/Down reorder).',
        side: 'left',
        align: 'start'
      }
    }
  ]
};

