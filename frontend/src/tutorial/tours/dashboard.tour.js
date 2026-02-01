export default {
  id: 'dashboard',
  version: 2,
  steps: [
    {
      popover: {
        title: 'Welcome',
        description: 'Press Enter or Space to move through the tutorial. Click anywhere on the overlay to advance.',
        side: 'bottom',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-header-title"]',
      popover: {
        title: 'My Dashboard',
        description: 'This see-it-all hub is where you’ll manage onboarding items, documents, training, and (for providers) scheduling + submissions.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="dash-onboarding-card"]',
      popover: {
        title: 'Onboarding checklist',
        description: 'If you still have onboarding tasks, this card shows your completion percent and a quick link to your checklist.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="dash-snapshot"]',
      popover: {
        title: 'My Snapshot (providers)',
        description: 'This quick snapshot summarizes key provider metrics at a glance. You can collapse/expand it anytime.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="dash-rail"]',
      popover: {
        title: 'Sections',
        description: 'Use the left rail to switch sections. Tip: if something “seems missing”, it may be in a different card here.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-checklist"]',
      popover: {
        title: 'Checklist',
        description: 'Start here to view required items and track completion.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-clients"]',
      popover: {
        title: 'Clients (providers)',
        description: 'View your caseload by school and related client workflow surfaces.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-payroll"]',
      popover: {
        title: 'Payroll',
        description: 'View payroll history by pay period.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-on_demand_training"]',
      popover: {
        title: 'On-Demand Training',
        description: 'Always-available training library (post-onboarding).',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-communications"]',
      popover: {
        title: 'Communications',
        description: 'Opens the unified communications feed (texts + platform chats).',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-notifications"]',
      popover: {
        title: 'Notifications',
        description: 'Quick link to your recent notifications.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-documents"]',
      popover: {
        title: 'Documents',
        description: 'Review and upload required documents here (when applicable).',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-training"]',
      popover: {
        title: 'Training',
        description: 'Complete assigned training modules and keep your training focus up to date.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-my_schedule"]',
      popover: {
        title: 'My Schedule (providers)',
        description: 'Open this to see your week and availability. If you don’t see it, scheduling may be disabled for your organization.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-submit"]',
      popover: {
        title: 'Submit (providers)',
        description: 'Mileage, reimbursement, PTO, time claims, and availability submissions live here.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-submit-panel"]',
      popover: {
        title: 'Submit panel',
        description: 'Once you open “Submit”, choose what you’re submitting. Many submission types have a Back button to return to the main submit menu.',
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '[data-tour="dash-rail-card-my"]',
      popover: {
        title: 'My Account',
        description: 'This is where you manage your account info, credentials, and other personal settings.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-my-subnav"]',
      popover: {
        title: 'My Account tabs',
        description: 'Use these subtabs to switch between Account Info, Credentials, Preferences, etc.',
        side: 'bottom',
        align: 'start'
      }
    },

    // --- School portal (OrganizationDashboard when organizationType === 'school') ---
    {
      element: '[data-tour="school-header-title"]',
      popover: {
        title: 'School Portal',
        description: 'This portal is designed for scheduling + roster workflows while avoiding PHI exposure.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-top-actions"]',
      popover: {
        title: 'Top actions',
        description: 'Quick actions live up here (settings, privacy toggle for codes/initials, contact admin, logout for school staff).',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="school-codes-toggle"]',
      popover: {
        title: 'Codes vs initials',
        description: 'Use this toggle to switch how roster labels display (based on your organization’s privacy expectations).',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="school-home-snapshot"]',
      popover: {
        title: 'At a glance',
        description: 'This snapshot summarizes current activity: supported days, clients being seen, available slots, pending + waitlist counts.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-cards"]',
      popover: {
        title: 'Choose a section',
        description: 'Use these cards to navigate. After you open a section, a left-side navigation rail appears so you can switch quickly.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-providers"]',
      popover: {
        title: 'Providers',
        description: 'Browse provider cards, open profiles, and message providers (based on your role/permissions).',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-days"]',
      popover: {
        title: 'Days',
        description: 'Choose a weekday to view schedules, slots, and requests for availability.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-roster"]',
      popover: {
        title: 'Roster',
        description: 'Search and sort the roster. Providers typically see their own roster; school staff may see broader views.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-staff"]',
      popover: {
        title: 'School staff',
        description: 'Manage linked school staff accounts and requests (availability depends on your role).',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-home-card-docs"]',
      popover: {
        title: 'Docs / Links',
        description: 'Shared reference documents and links for the school organization.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-nav-rail"]',
      popover: {
        title: 'Navigation rail',
        description: 'After you open a section, use the left rail to switch between Home, Providers, Days, Roster, Staff, and Docs quickly.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="school-providers-panel"]',
      popover: {
        title: 'Providers panel',
        description: 'Browse providers, open profiles, and message them (as permitted).',
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-days-daybar"]',
      popover: {
        title: 'Pick a day',
        description: 'Choose a weekday to load the schedules for that day.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-days-panel"]',
      popover: {
        title: 'Day schedules',
        description: 'This panel shows the schedules/slots for the selected day, and tools to request availability updates.',
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-roster-header"]',
      popover: {
        title: 'Roster header',
        description: 'Providers see “My roster”; school staff may see a broader roster view, depending on role.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-roster-panel"]',
      popover: {
        title: 'Roster grid',
        description: 'Search and interact with the roster list (restricted fields by design).',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-staff-panel"]',
      popover: {
        title: 'School staff',
        description: 'Manage linked school staff accounts and requests (based on role/permissions).',
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '[data-tour="school-docs-panel"]',
      popover: {
        title: 'Docs / Links',
        description: 'Reference docs and links that are shared for the school organization.',
        side: 'left',
        align: 'start'
      }
    }
  ]
};

