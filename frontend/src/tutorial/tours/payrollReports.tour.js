export default {
  id: 'payroll_reports',
  version: 1,
  steps: [
    {
      element: '[data-tour="payroll-reports-title"]',
      popover: {
        title: 'Payroll Reports',
        description: 'Build and download the exact payroll report you need, driven by the selected period/range and provider filters.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="payroll-reports-filters"]',
      popover: {
        title: 'Period + provider filters',
        description: 'Choose a single pay period or a date range, then select which providers are included.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="payroll-reports-report-tabs"]',
      popover: {
        title: 'Report types',
        description: 'Switch between export, sessions/units, service codes, pay summary, and adjustments. Use “Copy link” to share a pre-filtered view.',
        side: 'bottom',
        align: 'start'
      }
    }
  ]
};

