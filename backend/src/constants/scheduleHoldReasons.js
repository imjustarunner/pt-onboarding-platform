/** Platform default schedule-hold block reasons (title = label). */
export const PLATFORM_HOLD_REASON_OPTIONS = [
  { code: 'OFFICE_WORK', label: 'Office Work' },
  { code: 'ADMINISTRATIVE_WORK', label: 'Administrative Work' },
  { code: 'DOCUMENTATION', label: 'Documentation' },
  { code: 'RESEARCH', label: 'Research' },
  { code: 'EMAIL_MANAGEMENT', label: 'Email Management' },
  { code: 'PROJECT_PLANNING', label: 'Project Planning' },
  { code: 'STRATEGIC_PLANNING', label: 'Strategic Planning' },
  { code: 'DEEP_WORK', label: 'Deep Work' },
  { code: 'FOCUS_TIME', label: 'Focus Time' },
  { code: 'PROJECT_MANAGEMENT', label: 'Project Management' },
  { code: 'CUSTOMER_SUPPORT', label: 'Customer Support' },
  { code: 'SALES', label: 'Sales' },
  { code: 'BUDGET_PLANNING', label: 'Budget Planning' },
  { code: 'FINANCIAL_REVIEW', label: 'Financial Review' },
  { code: 'CONTRACT_REVIEW', label: 'Contract Review' },
  { code: 'POLICY_REVIEW', label: 'Policy Review' },
  { code: 'LEGAL_REVIEW', label: 'Legal Review' },
  { code: 'RISK_ASSESSMENT', label: 'Risk Assessment' },
  { code: 'QUALITY_ASSURANCE', label: 'Quality Assurance' },
  { code: 'SOFTWARE_DEVELOPMENT', label: 'Software Development' },
  { code: 'SYSTEM_MAINTENANCE', label: 'System Maintenance' },
  { code: 'IT_SUPPORT', label: 'IT Support' },
  { code: 'PRODUCT_DEVELOPMENT', label: 'Product Development' },
  { code: 'DESIGN_WORK', label: 'Design Work' },
  { code: 'CONTENT_CREATION', label: 'Content Creation' },
  { code: 'MARKETING', label: 'Marketing' },
  { code: 'WEBSITE_MANAGEMENT', label: 'Website Management' },
  { code: 'KNOWLEDGE_BASE_MANAGEMENT', label: 'Knowledge Base Management' },
  { code: 'TRAVEL', label: 'Travel' },
  { code: 'FIELD_WORK', label: 'Field Work' },
  { code: 'PHONE_CALLS', label: 'Phone Calls' },
  { code: 'BUSINESS_DEVELOPMENT', label: 'Business Development' },
  { code: 'ACCOUNT_MANAGEMENT', label: 'Account Management' },
  { code: 'PERFORMANCE_REVIEW', label: 'Performance Review' },
  { code: 'DECISION_MAKING', label: 'Decision Making' },
  { code: 'PROBLEM_SOLVING', label: 'Problem Solving' },
  { code: 'DOCUMENT_REVIEW', label: 'Document Review' },
  { code: 'FILE_ORGANIZATION', label: 'File Organization' },
  { code: 'INBOX_MANAGEMENT', label: 'Inbox Management' },
  { code: 'FOLLOW_UP', label: 'Follow-up' },
  { code: 'STUDY_TIME', label: 'Study Time' },
  { code: 'OPERATIONAL_PLANNING', label: 'Operational Planning' },
  { code: 'INNOVATION', label: 'Innovation' },
  { code: 'MARKET_RESEARCH', label: 'Market Research' },
  { code: 'COMPLIANCE', label: 'Compliance' },
  { code: 'END_OF_DAY_WRAP_UP', label: 'End-of-Day Wrap-up' },
  { code: 'WEEKLY_REVIEW', label: 'Weekly Review' },
  { code: 'MONTHLY_REVIEW', label: 'Monthly Review' }
];

export function holdReasonLabelToCode(label) {
  return String(label || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}
