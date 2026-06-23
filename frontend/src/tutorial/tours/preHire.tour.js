export default {
  id: 'pre_hire',
  version: 1,
  steps: [
    {
      element: '[data-tour="prehire-title"]',
      popover: {
        title: 'Pre-Hire',
        description: 'This tab tracks every candidate from the moment they\'re marked hired through to full onboarding. Candidates progress through three stages: Pending Setup → Pre-Hire Open → Ready for Review.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="prehire-stats"]',
      popover: {
        title: 'Status summary',
        description: 'See counts at a glance — how many candidates are waiting on initial setup, actively completing pre-hire docs, or ready for your review. A yellow badge appears when staff countersignatures are needed.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="prehire-filters"]',
      popover: {
        title: 'Filter by stage',
        description: 'Narrow the list to a specific status or search by name. Use this to quickly find a specific candidate when you have many in the pipeline.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="prehire-list"]',
      popover: {
        title: 'Candidate list',
        description: 'Click any candidate to load their detail panel. The status badge shows where they are in the pre-hire journey and how many days they\'ve been in this stage.',
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '[data-tour="prehire-detail"]',
      popover: {
        title: 'Candidate detail',
        description: 'See the candidate\'s contact info, task progress, and quick-action buttons — resend their setup link, promote to onboarding, or view their full profile.',
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '[data-tour="prehire-stage-banner"]',
      popover: {
        title: 'Stage-specific actions',
        description: 'Each status shows a context-appropriate banner: resend the setup link for candidates who haven\'t started, track progress for active ones, or promote to onboarding when everything is reviewed and approved.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="prehire-tasks"]',
      popover: {
        title: 'Task progress',
        description: 'Candidate-assigned tasks (documents to sign, forms to fill) appear here. Staff countersignature to-dos are highlighted in amber so you know when action is needed from your team.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};
