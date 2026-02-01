export default {
  id: 'payroll',
  version: 1,
  steps: [
    {
      element: '[data-tour="payroll-title"]',
      popover: {
        title: 'Payroll',
        description: 'This page is used to run payroll workflows, driven by the selected pay period.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="payroll-org-bar"]',
      popover: {
        title: 'Organization context',
        description: 'Payroll is scoped to the selected organization/agency.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="payroll-period-picker"]',
      popover: {
        title: 'Pick a pay period',
        description: 'Select the pay period you want to work on; the rest of the page follows this selection.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="payroll-open-wizard"]',
      popover: {
        title: 'Payroll Wizard',
        description: 'Open the wizard to follow step-by-step guidance and save progress as you go.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

