export const ADMIN_UPDATE_TEMPLATE_TYPE = 'admin_update';

export const ADMIN_UPDATE_ICONS = [
  { key: 'people', label: 'People', emoji: '👥' },
  { key: 'exit', label: 'Departure', emoji: '🚪' },
  { key: 'trophy', label: 'Trophy', emoji: '🏆' },
  { key: 'policy', label: 'Policy', emoji: '📋' },
  { key: 'gear', label: 'Operations', emoji: '⚙️' },
  { key: 'chart', label: 'Finance', emoji: '📊' },
  { key: 'client', label: 'Clients', emoji: '🤝' },
  { key: 'chat', label: 'Collaboration', emoji: '💬' },
  { key: 'target', label: 'Strategy', emoji: '🎯' },
  { key: 'heart', label: 'Wellness', emoji: '💙' },
  { key: 'cap', label: 'Learning', emoji: '🎓' },
  { key: 'star', label: 'Featured', emoji: '⭐' },
  { key: 'spark', label: 'Spark', emoji: '✨' },
  { key: 'calendar', label: 'Calendar', emoji: '📅' },
  { key: 'document', label: 'Document', emoji: '📄' },
  { key: 'megaphone', label: 'Announcement', emoji: '📣' },
  { key: 'handshake', label: 'Partnership', emoji: '🤝' },
  { key: 'lightbulb', label: 'Idea', emoji: '💡' }
];

export const ADMIN_UPDATE_COLORS = [
  '#0f766e',
  '#c2410c',
  '#ca8a04',
  '#7c3aed',
  '#2563eb',
  '#15803d',
  '#0e7490',
  '#ea580c',
  '#4338ca',
  '#0369a1',
  '#be185d',
  '#4f46e5',
  '#0d9488',
  '#b45309'
];

export const ADMIN_UPDATE_BUILTIN_TOPICS = [
  {
    key: 'staffing',
    title: 'Staffing Updates',
    description: 'New hires, role changes, and staff milestones.',
    iconKey: 'people',
    color: '#0f766e',
    autoKind: 'hire'
  },
  {
    key: 'departures',
    title: 'Staff Departures',
    description: 'Notification of any team members leaving the organization.',
    iconKey: 'exit',
    color: '#c2410c',
    autoKind: 'departure'
  },
  {
    key: 'recognition',
    title: 'Recognition & Appreciation',
    description: 'Staff achievements and contributions.',
    iconKey: 'trophy',
    color: '#ca8a04',
    autoKind: null
  },
  {
    key: 'policy',
    title: 'Policy & Procedure Changes',
    description: 'New or revised company policies.',
    iconKey: 'policy',
    color: '#7c3aed',
    autoKind: null
  },
  {
    key: 'operations',
    title: 'Operational Updates',
    description: 'Changes to office operations or systems.',
    iconKey: 'gear',
    color: '#2563eb',
    autoKind: null
  },
  {
    key: 'financial',
    title: 'Financial & Budgetary Updates',
    description: 'Financial status overview and upcoming audits.',
    iconKey: 'chart',
    color: '#15803d',
    autoKind: null
  },
  {
    key: 'clients',
    title: 'Client & Program Updates',
    description: 'Feedback and developments in client programs.',
    iconKey: 'client',
    color: '#0e7490',
    autoKind: null
  },
  {
    key: 'collaboration',
    title: 'Team Collaboration & Communication',
    description: 'Inter-departmental projects and meeting reminders.',
    iconKey: 'chat',
    color: '#ea580c',
    autoKind: null
  },
  {
    key: 'strategy',
    title: 'Strategic Initiatives',
    description: 'Progress on strategic goals and new initiatives.',
    iconKey: 'target',
    color: '#4338ca',
    autoKind: null
  },
  {
    key: 'wellness',
    title: 'Employee Engagement & Wellness',
    description: 'Wellness programs and engagement activities.',
    iconKey: 'heart',
    color: '#0369a1',
    autoKind: null
  },
  {
    key: 'skill_builders',
    title: 'Skill Builders',
    description: 'Any and all updates to our Skill Builder programs.',
    iconKey: 'cap',
    color: '#0d9488',
    autoKind: null
  }
];

export const DEPARTURE_FAREWELL_BLURBS = [
  'We are grateful for every contribution and wish them the very best in what comes next.',
  'Thank you for the care, skill, and heart brought to this team. Go well.',
  'It has been a privilege to work alongside them. We wish them every success ahead.',
  'With appreciation for the years shared here, we send warm wishes for the next chapter.',
  'They leave a mark on this team. We wish them joy, growth, and good people wherever they go.',
  'We will miss their presence and celebrate the path they are choosing next.',
  'Thank you for showing up for colleagues and clients. Wishing them a bright next step.',
  'A sincere thank-you for the work and the relationships built here. All the best ahead.'
];

export const EXCLUDED_STAFF_ROLES = [
  'school_staff',
  'guardian',
  'client_guardian',
  'client',
  'kiosk',
  'parent',
  'student'
];

export function iconByKey(key) {
  return ADMIN_UPDATE_ICONS.find((row) => row.key === key) || ADMIN_UPDATE_ICONS.find((row) => row.key === 'spark');
}

export function farewellBlurbForUserId(userId) {
  const n = Number(userId || 0);
  const idx = Math.abs(n) % DEPARTURE_FAREWELL_BLURBS.length;
  return DEPARTURE_FAREWELL_BLURBS[idx];
}

export function formatTenure(startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : new Date();
  if (!start || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return '';
  }
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 1) return 'less than a month';
  if (months < 12) return months === 1 ? '1 month' : `${months} months`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return years === 1 ? '1 year' : `${years} years`;
  const yearPart = years === 1 ? '1 year' : `${years} years`;
  const monthPart = rem === 1 ? '1 month' : `${rem} months`;
  return `${yearPart}, ${monthPart}`;
}
