export const CATEGORY_LEVEL_COMPENSATION_PARAGRAPHS = [
  'The Practice will compensate the {{ROLE_LABEL}} for approved services and activities according to Compensation Category {{COMPENSATION_CATEGORY}}, Level {{COMPENSATION_LEVEL}}, using the rates and applicable conditions in the compensation schedule below.',
  'The assigned compensation category and level remain in effect unless the Practice expressly approves and documents a change. Elapsed time or progression from practicum to internship does not automatically change the compensation model, category, or level.',
  'This agreement continues to govern the ongoing arrangement. A Practice-approved compensation adjustment may be documented in writing without replacing the agreement, subject to the written approval and signature requirements of this agreement’s amendment provisions.',
  'Supervision services and related administrative activities are compensable only when the Practice authorizes the assignment and the services satisfy applicable eligibility, documentation, and supervision requirements. Compensation follows the applicable service rates in the schedule below and any expressly approved written compensation terms.',
  'Payment follows the Practice’s regular payroll schedule. Applicable documentation, supervision, service eligibility, and compensation conditions remain governed by this agreement and the Workplace Handbook.'
];

export const CATEGORY_LEVEL_COMPENSATION_CLAUSE = {
  clause_key: 'COMP_CATEGORY_LEVEL',
  title: 'Ongoing Category and Level Compensation',
  body_html: CATEGORY_LEVEL_COMPENSATION_PARAGRAPHS.map(paragraph => `<p>${paragraph}</p>`).join('\n')
};
