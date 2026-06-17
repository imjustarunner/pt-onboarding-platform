/**
 * My Schedule dashboard — view modes for hub stat cards & nav.
 */

export const SCHEDULE_VIEWS = [
  {
    id: 'self',
    title: 'My schedule',
    navLabel: 'My schedule',
    description: 'Your weekly calendar and availability.',
    statLabel: 'My week',
    statHint: 'Your calendar',
    icon: 'calendar',
    theme: {
      accent: '#166534',
      icon: '#166534',
      iconBg: '#dcfce7',
    },
  },
  {
    id: 'supervisee',
    title: 'Supervisee schedules',
    navLabel: 'Supervisees',
    description: 'Overlay or open a supervisee’s calendar.',
    statLabel: 'Supervisees',
    statHint: 'Team overlay',
    icon: 'users',
    visibleKey: 'supervisee',
    theme: {
      accent: '#2563eb',
      icon: '#1d4ed8',
      iconBg: '#dbeafe',
    },
  },
  {
    id: 'employees',
    title: 'Employee schedules',
    navLabel: 'Employees',
    description: 'Browse the org directory week by week.',
    statLabel: 'Employees',
    statHint: 'Directory',
    icon: 'briefcase',
    visibleKey: 'employees',
    theme: {
      accent: '#9333ea',
      icon: '#7e22ce',
      iconBg: '#f3e8ff',
    },
  },
  {
    id: 'skill_builders',
    title: 'Skill Builders',
    navLabel: 'Skill Builders',
    description: 'Series programs and RSVP on your schedule.',
    statLabel: 'Skill Builders',
    statHint: 'Programs & series',
    icon: 'spark',
    visibleKey: 'skillBuilders',
    isUtility: true,
    theme: {
      accent: '#d97706',
      icon: '#b45309',
      iconBg: '#fef3c7',
    },
  },
  {
    id: 'schedule_list',
    title: 'Schedule list',
    navLabel: 'Schedule list',
    description: 'All office bookings in a sortable list view.',
    statLabel: 'Schedule list',
    statHint: 'All bookings',
    icon: 'list',
    visibleKey: 'scheduleList',
    theme: {
      accent: '#0284c7',
      icon: '#0369a1',
      iconBg: '#e0f2fe',
    },
  },
];

const BY_ID = Object.fromEntries(SCHEDULE_VIEWS.map((v) => [v.id, v]));

export function getScheduleViewMeta(viewId) {
  return BY_ID[viewId] || SCHEDULE_VIEWS[0];
}

export function getScheduleViewThemeStyle(viewId) {
  const t = getScheduleViewMeta(viewId).theme;
  return {
    '--cat-accent': t.accent,
    '--cat-icon': t.icon,
    '--cat-icon-bg': t.iconBg,
  };
}
