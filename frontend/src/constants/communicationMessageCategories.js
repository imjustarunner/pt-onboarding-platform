/** Message-type filter labels — keys must match backend communicationMessageCategories.js */
export const COMMUNICATION_MESSAGE_CATEGORIES = [
  { key: 'roi', label: 'School ROI signing', group: 'School' },
  { key: 'roi_completion', label: 'School ROI completion', group: 'School' },
  { key: 'applications', label: 'Job applications', group: 'Hiring' },
  { key: 'onboarding', label: 'Onboarding & welcome', group: 'Hiring' },
  { key: 'intake', label: 'Intake & paperwork', group: 'Clients' },
  { key: 'client', label: 'Client notifications', group: 'Clients' },
  { key: 'events', label: 'Events & invitations', group: 'Programs' },
  { key: 'meetings', label: 'Meetings & sessions', group: 'Programs' },
  { key: 'reminders', label: 'Reminders & digests', group: 'Programs' },
  { key: 'triggers', label: 'Automated triggers', group: 'System' },
  { key: 'account', label: 'Password & account', group: 'System' },
  { key: 'manual', label: 'Manual / identity sends', group: 'System' },
  { key: 'transactional', label: 'Other transactional', group: 'System' },
  { key: 'quality', label: 'Quality issues', group: 'Review' }
];

export const MESSAGE_CATEGORY_GROUPS = [...new Set(COMMUNICATION_MESSAGE_CATEGORIES.map((c) => c.group))];

export function categoriesForGroup(group) {
  return COMMUNICATION_MESSAGE_CATEGORIES.filter((c) => c.group === group);
}

export function getCategoryLabel(key) {
  return COMMUNICATION_MESSAGE_CATEGORIES.find((c) => c.key === key)?.label || key;
}
