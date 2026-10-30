export const ADVANCED_CATEGORY_LABEL = 'Licensed & Advanced Professionals';
export const ADVANCED_CATEGORY_DESCRIPTION = 'Independently licensed professionals and other approved professionals whose combination of graduate education, substantial relevant experience, or specialized expertise supports Category 3 placement for their assigned role.';
export const ADVANCED_CATEGORY_PLACEMENT = 'Category 2 remains the standard placement for pre-licensed or unlicensed master’s-level staff unless the Practice expressly approves and documents a different placement. Education, experience, or additional training alone does not automatically qualify an employee for Category 3. Compensation placement does not change authorized services or supervision requirements.';
export const ADVANCED_CATEGORY_RATIONALE = 'Recognize advanced professional qualifications and specialized expertise relevant to assigned responsibilities, while preserving Category 2 as the standard placement for pre-licensed and unlicensed master’s-level staff. Category 3 placement requires documented approval and does not independently expand service authorization or supervisory authority.';

// Editorial only: no credential inference, employee assignment or rate changes.
export function advancedCategoryWording(value = '') {
  return String(value)
    .replace(/Category 3(\s*[·—–-]\s*)(?:Fully licensed|Licensed Professionals|Licensed)(?!\s*&)/gi, `Category 3$1${ADVANCED_CATEGORY_LABEL.replace('&', '&amp;')}`)
    .replace(/(?:Fully licensed professionals|Licensed Professionals)\.(?=\s|<|$)/g, ADVANCED_CATEGORY_DESCRIPTION);
}

export function advancedCategoryPolicyHtml() {
  return `<h4>Category 3 · Licensed &amp; Advanced Professionals</h4><p>${ADVANCED_CATEGORY_DESCRIPTION}</p><p>${ADVANCED_CATEGORY_PLACEMENT}</p>`;
}
