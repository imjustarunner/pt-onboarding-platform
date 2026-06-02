/**
 * My Payroll hub sections — themes aligned with MODERN_HUB_PANEL_UI_GUIDE.md
 */

export const PAYROLL_DISPLAY_SECTIONS = [
  {
    id: 'pay_stubs',
    title: 'Pay History',
    tag: 'Posted',
    tagSecondary: 'Pay periods',
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
  },
  {
    id: 'pto',
    title: 'PTO Balances',
    tag: 'Time off',
    tagSecondary: 'Sick & training',
    icon: 'calendar',
    theme: {
      accent: '#16a34a',
      icon: '#15803d',
      iconBg: '#dcfce7',
      tagBg: '#ecfdf5',
      tagColor: '#166534',
      tagMutedBg: '#dbeafe',
      tagMutedColor: '#1d4ed8',
    },
  },
  {
    id: 'mileage',
    title: 'Mileage',
    tag: 'Submissions',
    tagSecondary: 'Reimbursement',
    icon: 'car',
    theme: {
      accent: '#2563eb',
      icon: '#1d4ed8',
      iconBg: '#dbeafe',
      tagBg: '#eff6ff',
      tagColor: '#1e40af',
      tagMutedBg: '#e0e7ff',
      tagMutedColor: '#4338ca',
    },
  },
  {
    id: 'medcancel',
    title: 'Med Cancel',
    tag: 'Clinical',
    tagSecondary: 'Missed sessions',
    icon: 'clipboard',
    theme: {
      accent: '#db2777',
      icon: '#be185d',
      iconBg: '#fce7f3',
      tagBg: '#fdf2f8',
      tagColor: '#9d174d',
      tagMutedBg: '#ffe4e6',
      tagMutedColor: '#be123c',
    },
  },
  {
    id: 'reimbursements',
    title: 'Reimbursements',
    tag: 'Expenses',
    tagSecondary: 'Receipts',
    icon: 'receipt',
    theme: {
      accent: '#d97706',
      icon: '#b45309',
      iconBg: '#fef3c7',
      tagBg: '#fffbeb',
      tagColor: '#92400e',
      tagMutedBg: '#ffedd5',
      tagMutedColor: '#c2410c',
    },
  },
  {
    id: 'company_card',
    title: 'Company Card',
    tag: 'Card',
    tagSecondary: 'Expenses',
    icon: 'card',
    theme: {
      accent: '#4f46e5',
      icon: '#4338ca',
      iconBg: '#e0e7ff',
      tagBg: '#eef2ff',
      tagColor: '#3730a3',
      tagMutedBg: '#f1f5f9',
      tagMutedColor: '#475569',
    },
  },
  {
    id: 'time_claims',
    title: 'Time Claims',
    tag: 'Submissions',
    tagSecondary: 'Hours & corrections',
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
  },
  {
    id: 'event_time',
    title: 'Event Time',
    tag: 'Kiosk',
    tagSecondary: 'Program events',
    icon: 'users',
    theme: {
      accent: '#0891b2',
      icon: '#0e7490',
      iconBg: '#cffafe',
      tagBg: '#ecfeff',
      tagColor: '#155e75',
      tagMutedBg: '#e0f2fe',
      tagMutedColor: '#0369a1',
    },
  },
];

const BY_ID = Object.fromEntries(PAYROLL_DISPLAY_SECTIONS.map((s) => [s.id, s]));

export function getPayrollSectionMeta(sectionId) {
  return BY_ID[sectionId] || BY_ID.pay_stubs;
}

export function getPayrollSectionThemeStyle(sectionId) {
  const t = getPayrollSectionMeta(sectionId).theme;
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
