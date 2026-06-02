/**
 * Submit dashboard — grouped actions (hub panel UI).
 */

export const SUBMIT_ROOT_GROUPS = [
  {
    id: 'payroll',
    title: 'Payroll & reimbursements',
    tag: 'Payroll',
    tagSecondary: 'Claims & PTO',
    icon: 'wallet',
    theme: {
      accent: '#0d9488',
      icon: '#0f766e',
      iconBg: '#ccfbf1',
      tagBg: '#f0fdfa',
      tagColor: '#115e59',
      tagMutedBg: '#e0f2fe',
      tagMutedColor: '#0369a1',
    },
    actions: [
      { id: 'mileage', title: 'Mileage', description: 'Submit other mileage for reimbursement.', event: 'mileage', icon: 'car' },
      { id: 'reimbursement', title: 'Reimbursement', description: 'Upload a receipt and submit for approval.', event: 'reimbursement', icon: 'receipt' },
      { id: 'pto', title: 'PTO', description: 'Request Sick Leave or Training PTO.', event: 'pto', icon: 'calendar' },
      { id: 'company_card', title: 'Company card expense', description: 'Submit company card purchases for review.', event: 'company-card', icon: 'card', visibleKey: 'companyCardEnabled' },
      { id: 'budget', title: 'Budget expenses', description: 'Department, account, category, and receipt OCR.', event: 'budget-expenses', icon: 'receipt', visibleKey: 'budgetExpenses' },
    ],
  },
  {
    id: 'time',
    title: 'Time & attendance',
    tag: 'Hours',
    tagSecondary: 'Claims & schedule',
    icon: 'clock',
    theme: {
      accent: '#9333ea',
      icon: '#7e22ce',
      iconBg: '#f3e8ff',
      tagBg: '#faf5ff',
      tagColor: '#6b21a8',
      tagMutedBg: '#ede9fe',
      tagMutedColor: '#5b21b6',
    },
    actions: [
      { id: 'time_menu', title: 'Time claims', description: 'Meeting, excess time, corrections, overtime.', event: 'open-time', icon: 'clock' },
      { id: 'availability', title: 'Additional availability', description: 'Office or school availability + confirmations.', event: 'availability', icon: 'calendar' },
      { id: 'virtual_hours', title: 'Virtual working hours', description: 'Weekly virtual hours (not tied to a room).', event: 'virtual-hours', icon: 'video' },
    ],
  },
  {
    id: 'in_school',
    title: 'In-school',
    tag: 'School',
    tagSecondary: 'Clinical',
    icon: 'school',
    theme: {
      accent: '#2563eb',
      icon: '#1d4ed8',
      iconBg: '#dbeafe',
      tagBg: '#eff6ff',
      tagColor: '#1e40af',
      tagMutedBg: '#e0e7ff',
      tagMutedColor: '#4338ca',
    },
    actions: [
      { id: 'in_school_menu', title: 'In-school claims', description: 'School mileage and Med Cancel.', event: 'open-in-school', icon: 'school', visibleKey: 'inSchoolGroup' },
    ],
  },
  {
    id: 'vehicle',
    title: 'Vehicle & travel',
    tag: 'Fleet',
    tagSecondary: 'Company car',
    icon: 'car',
    theme: {
      accent: '#d97706',
      icon: '#b45309',
      iconBg: '#fef3c7',
      tagBg: '#fffbeb',
      tagColor: '#92400e',
      tagMutedBg: '#ffedd5',
      tagMutedColor: '#c2410c',
    },
    actions: [
      { id: 'company_car', title: 'Company car mileage', description: 'Log business vehicle trips and track mileage.', event: 'company-car', icon: 'car', visibleKey: 'companyCar' },
    ],
  },
];

export const SUBMIT_TIME_ACTIONS = [
  { id: 'meeting', title: 'Meeting / training / outreach', description: 'Log meeting, training, or outreach minutes.', event: 'time-meeting', icon: 'users' },
  { id: 'excess', title: 'Excess time', description: 'Service codes and direct/indirect minutes beyond included span.', event: 'time-excess', icon: 'clock', visibleKey: 'timeExcess' },
  { id: 'correction', title: 'Service correction', description: 'Request correction review for a service.', event: 'time-correction', icon: 'clipboard', visibleKey: 'timeCorrection' },
  { id: 'overtime', title: 'Overtime evaluation', description: 'Overtime details and optional holiday pay.', event: 'time-overtime', icon: 'clock', titleKey: 'overtimeTitle', descKey: 'overtimeDesc' },
];

export const SUBMIT_IN_SCHOOL_ACTIONS = [
  { id: 'school_mileage', title: 'School mileage', description: 'Home ↔ School minus Home ↔ Office (auto).', event: 'school-mileage', icon: 'car', visibleKey: 'hasSchools' },
  { id: 'medcancel', title: 'Med Cancel', description: 'Missed Medicaid sessions.', event: 'medcancel', icon: 'clipboard', visibleKey: 'medcancel' },
];

const BY_GROUP = Object.fromEntries(SUBMIT_ROOT_GROUPS.map((g) => [g.id, g]));

export function getSubmitGroupMeta(groupId) {
  return BY_GROUP[groupId] || SUBMIT_ROOT_GROUPS[0];
}

export function getSubmitGroupThemeStyle(groupId) {
  const t = getSubmitGroupMeta(groupId).theme;
  return {
    '--cat-accent': t.accent,
    '--cat-icon': t.icon,
    '--cat-icon-bg': t.iconBg,
    '--cat-tag-bg': t.tagBg,
    '--cat-tag-color': t.tagColor,
    '--cat-tag-muted-bg': t.tagMutedBg,
    '--cat-tag-muted-color': t.tagMutedColor,
  };
}
