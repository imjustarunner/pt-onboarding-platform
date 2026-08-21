export default {
  id: 'hiring_candidates',
  version: 1,
  steps: [
    {
      element: '[data-tour="hiring-title"]',
      popover: {
        title: 'Applications (Hiring)',
        description: 'Manage job applications: review profile/resume, add notes, assign tasks, and promote to start onboarding.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="hiring-actions"]',
      popover: {
        title: 'Agency + actions',
        description: 'Choose an agency (if available), refresh, or create a new application.',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="hiring-candidates-list"]',
      popover: {
        title: 'Applications list',
        description: 'Search and select an application to load their detail panel.',
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '[data-tour="hiring-detail-panel"]',
      popover: {
        title: 'Application details',
        description: 'Details load here for the selected application.',
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '[data-tour="hiring-detail-actions"]',
      popover: {
        title: 'Key actions',
        description: 'Generate pre-screen, mark hired (start setup), archive, or delete (if allowed).',
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '[data-tour="hiring-detail-tabs"]',
      popover: {
        title: 'Detail tabs',
        description: 'Switch between profile, resume + summary, notes, tasks, and pre-screen.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

