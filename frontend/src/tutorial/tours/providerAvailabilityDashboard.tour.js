export default {
  id: 'provider_availability_dashboard',
  version: 1,
  steps: [
    {
      element: '[data-tour="avail-title"]',
      popover: {
        title: 'Provider Availability',
        description: 'Use this dashboard to audit school slots, office availability, and virtual availability templates.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="avail-tabs"]',
      popover: {
        title: 'Tabs',
        description: 'Switch between School, Office, and Virtual availability datasets.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="avail-filters"]',
      popover: {
        title: 'Filters',
        description: 'Filter by provider, organization/office (depending on tab), day of week, search text, and inactive rows.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="avail-school-actions"]',
      popover: {
        title: 'School groups',
        description: 'School rows are grouped; expand/collapse to see detail rows.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="avail-school-table"]',
      popover: {
        title: 'School slots table',
        description: 'Sortable columns help you spot low/negative availability and inactive rows.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="avail-office-table"]',
      popover: {
        title: 'Office availability table',
        description: 'Review office assignments by room/day/time/frequency and mode.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="avail-virtual-table"]',
      popover: {
        title: 'Virtual availability table',
        description: 'Virtual working-hour templates by provider/day/time/session type/frequency.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

