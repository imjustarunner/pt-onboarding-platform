/** Shared schedule-hold reason catalog (matches My Schedule hold blocks). */
export const SCHEDULE_HOLD_REASONS = [
  { code: 'FOCUS_TIME', label: 'Focus Time' },
  { code: 'DEEP_WORK', label: 'Deep Work' },
  { code: 'DOCUMENTATION', label: 'Documentation' },
  { code: 'OFFICE_WORK', label: 'Office Work' },
  { code: 'ADMINISTRATIVE_WORK', label: 'Administrative Work' },
  { code: 'EMAIL_MANAGEMENT', label: 'Email Management' },
  { code: 'PROJECT_PLANNING', label: 'Project Planning' },
  { code: 'PROJECT_MANAGEMENT', label: 'Project Management' },
  { code: 'STRATEGIC_PLANNING', label: 'Strategic Planning' },
  { code: 'RESEARCH', label: 'Research' },
  { code: 'MEETING_PREP', label: 'Meeting Prep' },
  { code: 'PHONE_CALLS', label: 'Phone Calls' },
  { code: 'CUSTOMER_SUPPORT', label: 'Customer Support' },
  { code: 'CONTENT_CREATION', label: 'Content Creation' },
  { code: 'SOFTWARE_DEVELOPMENT', label: 'Software Development' },
  { code: 'STUDY_TIME', label: 'Study Time' },
  { code: 'WEEKLY_REVIEW', label: 'Weekly Review' },
  { code: 'END_OF_DAY_WRAP_UP', label: 'End-of-Day Wrap-up' }
];

export function holdReasonLabelToCode(label) {
  const trimmed = String(label || '').trim();
  if (!trimmed) return 'FOCUS_TIME';
  const match = SCHEDULE_HOLD_REASONS.find(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return match.code;
  return trimmed
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'CUSTOM';
}

export function holdReasonTitleForCode(code) {
  const match = SCHEDULE_HOLD_REASONS.find((o) => o.code === String(code || '').toUpperCase());
  return match?.label || null;
}
