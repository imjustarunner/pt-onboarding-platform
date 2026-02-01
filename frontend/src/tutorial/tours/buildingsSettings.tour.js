export default {
  id: 'buildings_settings',
  version: 2,
  steps: [
    {
      element: '[data-tour="buildings-settings-title"]',
      popover: {
        title: 'Building Settings',
        description: 'Configure building-level settings (maps, kiosk questionnaires, office types, and rooms).',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-settings-svg"]',
      popover: {
        title: 'SVG map link',
        description: 'Store a building SVG URL for map-based experiences.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-settings-questionnaires"]',
      popover: {
        title: 'Kiosk questionnaires',
        description: 'Assign modules/questionnaires that can be used in kiosk flows.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-settings-room-types"]',
      popover: {
        title: 'Office types',
        description: 'Manage office types used for classification and downstream workflows.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-settings-rooms"]',
      popover: {
        title: 'Rooms / offices',
        description: 'Create and edit rooms/offices for this building, including labels and Google resource emails.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '[data-tour="buildings-settings-rooms-create"]',
      popover: {
        title: 'Create a room',
        description: 'Add a new room by number and/or label. After creation you can edit details like Google resource email.',
        side: 'top',
        align: 'start'
      }
    }
  ]
};

