export default {
  id: 'schools_overview',
  version: 1,
  steps: [
    {
      element: '[data-tour="schools-overview-title"]',
      popover: {
        title: 'School Overview',
        description: 'This dashboard summarizes schools (or programs/learning orgs) with key capacity and operational metrics.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="schools-overview-controls"]',
      popover: {
        title: 'Controls',
        description: 'Filter by agency (super admin), search by name, and sort the cards list.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="schools-overview-cards"]',
      popover: {
        title: 'School cards',
        description: 'Each card shows metrics like students, providers, slots available, waitlist, and docs/needs. Click a card to open the School Portal.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="schools-overview-card"]',
      popover: {
        title: 'Open a school',
        description: 'Open a school to jump into its School Portal context.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

