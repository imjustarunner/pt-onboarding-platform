export const DASHBOARD_TOUR_ID = 'dashboard';
export const DASHBOARD_TOUR_VERSION = 4;

const dashboardTour = {
  id: DASHBOARD_TOUR_ID,
  version: DASHBOARD_TOUR_VERSION,
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
      element: '[data-tour="dash-rail-card-program_shifts"]',
      popover: {
        title: 'My Shifts',
        description: 'Review program shifts, pick up available shifts, and manage call-offs.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-skill_builders_availability"]',
      popover: {
        title: 'Skill Builders',
        description: 'Review and manage Skill Builder availability submissions.',
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
      element: '[data-tour="dash-rail-card-tools_aids"]',
      popover: {
        title: 'Tools & Aids',
        description: 'Open Note Aid and related helper tools for your documentation workflow.',
        side: 'right',
        align: 'center'
      }
    },
    {
      element: '[data-tour="dash-rail-card-checklist"]',
      popover: {
        title: 'Momentum List',
        description: 'Your focus digest, checklist, and actionable items.',
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
      element: '[data-tour="dash-rail-card-documents"]',
      popover: {
        title: 'Documents',
        description: 'Review and upload required documents here (when applicable).',
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
      element: '[data-tour="dash-rail-card-social_feeds"]',
      popover: {
        title: 'Social feeds',
        description: 'Organization social and school feed content in one place.',
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
      element: '[data-tour="dash-rail-card-chats"]',
      popover: {
        title: 'Chats',
        description: 'Open direct platform chats.',
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
      element: '[data-tour="dash-rail-card-supervision"]',
      popover: {
        title: 'Supervision',
        description: 'View your supervisees and supervision-related workflows.',
        side: 'right',
        align: 'center'
      }
    }
  ]
};

export const getDashboardRailCardDescriptors = () => {
  const out = {};
  for (const step of dashboardTour.steps || []) {
    const el = typeof step?.element === 'string' ? step.element : '';
    const match = el.match(/^\[data-tour="dash-rail-card-(.+)"\]$/);
    if (!match) continue;
    const cardId = String(match[1] || '').trim();
    const title = String(step?.popover?.title || '').trim();
    const description = String(step?.popover?.description || '').trim();
    if (!cardId || !title || !description) continue;
    out[cardId] = {
      title,
      description
    };
  }
  return out;
};

export default dashboardTour;

