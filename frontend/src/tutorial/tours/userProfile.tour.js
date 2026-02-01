export default {
  id: 'user_profile',
  version: 1,
  steps: [
    {
      element: '[data-tour="user-profile-title"]',
      popover: {
        title: 'User profile',
        description: 'This page is the admin view for a single user. Use tabs to manage account info, credentials, assignments, and more.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="user-profile-header"]',
      popover: {
        title: 'Header',
        description: 'The header shows name, status, and key user controls (varies by role and user type).',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="user-profile-global-availability"]',
      popover: {
        title: 'Global availability (providers)',
        description: 'This toggle reflects whether the provider is accepting new clients globally (not per-school).',
        side: 'bottom',
        align: 'end'
      }
    },
    {
      element: '[data-tour="user-profile-photo-upload"]',
      popover: {
        title: 'Profile photo',
        description: 'Admins can upload a profile photo when permitted.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="user-profile-tabs"]',
      popover: {
        title: 'Tabs',
        description: 'Use tabs to switch between major sections. Some tabs only appear based on role, status, or org settings.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="user-profile-tab-content"]',
      popover: {
        title: 'Current tab',
        description: 'The selected tab’s content loads here. Many sections have their own Save/Edit controls.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

