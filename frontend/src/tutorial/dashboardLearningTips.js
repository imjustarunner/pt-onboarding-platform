export const dashboardLearningTips = [
  { id: 'schedule-settings', selector: '[data-tour="my-schedule-settings"]', title: 'Make room for your week', description: 'Open Settings → Layout to show weekends, change row height, or place overlapping appointments side by side. Office-room display and calendar options are in Settings too.', demo: 'weekend' },
  { id: 'schedule-fullscreen', selector: '[data-tour="my-schedule-fullscreen"]', title: 'Give your calendar more room', description: 'Choose Full screen to expand your calendar. Choose Exit full screen or press Escape whenever you want to return.', demo: 'fullscreen' },
  { id: 'schedule-color-key', selector: '[data-tour="my-schedule-color-key"]', title: 'What do the colors mean?', description: 'Open Color key to see each appointment type. Select it again to tuck it away. You can change your colors in Settings.', demo: 'colors' },
  { id: 'schedule-view-as', selector: '[data-tour="my-schedule-view-as"]', title: 'Find a coworker’s availability', description: 'Search for a team member to see their schedule. Coworker views show Meeting, Session, or Busy without appointment details. People with management permissions keep their existing access. Choose My schedule to return.' },
  { id: 'schedule-today', selector: '[data-tour="my-schedule-today-btn"]', title: 'Back to today', description: 'Today brings you to the current day or the week containing today. The arrows move one day in Day or Agenda view, and one week in Week view.' },
  { id: 'schedule-previous', selector: '[data-tour="my-schedule-previous"]', title: 'Go back in your calendar', description: 'Move to the previous day in Day or Agenda view, or the previous week in Week view. Today brings you back.' },
  { id: 'schedule-next', selector: '[data-tour="my-schedule-next"]', title: 'Look ahead', description: 'Move to the next day in Day or Agenda view, or the next week in Week view. To jump further, choose a date under Settings → Layout.' },
  { id: 'schedule-refresh', selector: '[data-tour="my-schedule-refresh"]', title: 'Refresh your calendar', description: 'Reload the dates you are viewing to see the latest schedule updates.' },
  { id: 'schedule-room', selector: '[data-tour="my-schedule-my-room"]', title: 'Your meeting room', description: 'Open My Room to see and admit guests waiting in your lobby.' },
  { id: 'schedule-availability', selector: '[data-tour="my-schedule-availability-btn"]', title: 'Set your availability', description: 'Open Availability to manage your available hours, split days, and planned time away.' },
  { id: 'schedule-help', selector: '[data-tour="my-schedule-help"]', title: 'Help beside your calendar', description: 'Find quick instructions for scheduling, cancellations, settings, and more without leaving your calendar.' },
  { id: 'library-quick-links', selector: '[data-tour="dash-rail-card-tools_library"], [data-tour="dash-library-links"]', title: 'Keep useful documents close', description: 'Click Library to browse everything, or hover for a moment to reveal quick links. My Files is for your own documents; Workplace Handbook opens your organization’s policies.', demo: 'library' },
  { id: 'edit-layout', selector: '[data-tour="dash-edit-layout"]', title: 'Make the navigation yours', description: 'Choose Edit layout to move icons up or down based on where you want them. You can also choose a highlight color for a section. Save when you are finished.', demo: 'move' },
  { id: 'customize', selector: '[data-tour="dash-customize"]', title: 'Customize your dashboard', description: 'Reorder your cards or hide the ones you do not need. Your dashboard remembers your choices.', demo: 'move' },
  { id: 'search', selector: '[data-tour="dash-search"]', title: 'Search My Dashboard', description: 'Search for a setting, document, or section. Try “credentials” to jump directly to My Credentials in My Account.', demo: 'search' },
  { id: 'focus', selector: '.ov-focus-slot', title: 'Expand Today’s Focus', description: 'Open Today’s Focus to see your priorities. Collapse it again to keep a small summary at the top.', demo: 'collapse' },
  { id: 'work', selector: '[data-tour="dash-section-work"] .section-collapse', title: 'Keep a summary of My Work', description: 'Collapse this card to move its summary to the top row. Select the summary to expand it. Scroll inside My Work to see more notes, or select a note to open it.', demo: 'collapse' },
  { id: 'collapse', selector: '.overview-section:not([data-tour="dash-section-work"]) .section-collapse', title: 'Collapse a dashboard card', description: 'Move a card into the top row as a small summary. Select its summary whenever you want to expand it again.', demo: 'collapse' },
  { id: 'notifications', selector: '[data-tour="dash-overview-notifications"]', title: 'Your notifications', description: 'Open notifications to review updates that need your attention. The badge shows unread updates.' },
  { id: 'schedule', selector: '[data-tour="dash-overview-schedule"]', title: 'Your schedule', description: 'Open My Schedule to see appointments, meetings, and availability in one place.' },
  { id: 'submit', selector: '[data-tour="dash-overview-submit"]', title: 'Submit', description: 'Go directly to Submit for time, mileage, reimbursements, and other available requests.' },
  { id: 'quicknav', selector: '[data-tour="nav-quicknav"]', title: 'Find your way with QuickNav', description: 'Search the pages available to you here. You can also press Command K on a Mac or Control K on Windows.' }
];
export function learningTipsEligible(user) {
  return !!user?.id && ['provider', 'provider_plus', 'supervisor', 'intern', 'intern_plus', 'clinician', 'staff', 'support', 'admin', 'assistant_admin', 'clinical_practice_assistant', 'facilitator', 'tutor'].includes(user.role);
}
export function learningWindowOpen(user, firstSeen, now = Date.now()) {
  const created = Date.parse(user?.created_at || user?.createdAt || '');
  const start = Number.isFinite(created) ? created : firstSeen;
  return Number.isFinite(start) && now >= start && now - start < 60 * 86400000;
}
