export default {
  id: 'hiring_candidates',
  version: 1,
  steps: [
    {
      element: '[data-tour="hiring-title"]',
      popover: {
        title: 'Applicants (Hiring)',
        description: 'Manage prospective candidates: review profile/resume, add notes, assign tasks, and promote to start onboarding.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="hiring-actions"]',
      popover: {
        title: 'Agency + actions',
        description: 'Choose an agency (if available), refresh, or create a new applicant.',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="hiring-candidates-list"]',
      popover: {
        title: 'Applicants list',
        description: 'Search and select an applicant to load their detail panel.',
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '[data-tour="hiring-detail-panel"]',
      popover: {
        title: 'Applicant details',
        description: 'Details load here for the selected applicant.',
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

