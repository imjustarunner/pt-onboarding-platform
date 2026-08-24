/**
 * Build per-job-description contract clauses from posting responsibilities.
 */
const LETTER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function escapeForMd(text = '') {
  return String(text || '').trim();
}

function toLetterItems(bullets = []) {
  return (bullets || [])
    .map((b) => escapeForMd(b))
    .filter(Boolean)
    .map((text, idx) => {
      const letter = LETTER[idx] || String(idx + 1);
      return `**(${letter})** ${text}`;
    });
}

/**
 * @param {object} opts
 * @param {string} opts.clauseKey - e.g. JOB_DESC_JD_15
 * @param {string[]} opts.responsibilityBullets - contract-duty bullets (already condensed)
 * @param {boolean} [opts.includeServiceExpectations] - MHP-style min hours line
 * @param {string} [opts.serviceExpectationsNote]
 */
export function buildJobDescClauseMarkdown({
  responsibilityBullets = [],
  includeServiceExpectations = false,
  serviceExpectationsNote = 'The {{ROLE_LABEL}} is expected to maintain an average of {{MIN_HOURS}} Direct service hours per week, calculated over applicable measurement periods, as an expectation of the role. Failure to meet service expectations may result in review, adjustment of duties, or changes to role status in accordance with Practice policies, but does not eliminate compensation for approved services actually performed.'
} = {}) {
  const items = toLetterItems(responsibilityBullets);
  const handbookLetter = LETTER[items.length] || 'Z';
  items.push(
    `**(${handbookLetter})** Perform additional duties consistent with the **{{JOB_TITLE}}** and reasonably assigned by the Practice, as outlined in the Workplace Handbook or program-specific policies.`
  );
  const closeLetter = LETTER[items.length] || 'Z';
  items.push(
    `**(${closeLetter})** Acknowledge that the Workplace Handbook describes the typical duties, professional standards, and role expectations applicable to this position, which apply in addition to this Agreement and may be updated from time to time.`
  );

  const parts = [
    'The {{ROLE_LABEL}} shall perform the duties of the **{{JOB_TITLE}}** in accordance with the expectations of the Practice and applicable policies. The responsibilities listed below describe the core functions of the role and are not intended to be exhaustive.',
    '',
    '_Primary Responsibilities_:',
    '',
    ...items.flatMap((line) => [line, '']),
  ];

  if (includeServiceExpectations) {
    parts.push('_Service Expectations_:', '', serviceExpectationsNote);
  }

  return parts.join('\n').trim();
}

export function clauseKeyForJobDescriptionId(jobDescriptionId) {
  return `JOB_DESC_JD_${Number(jobDescriptionId)}`;
}

export default {
  buildJobDescClauseMarkdown,
  clauseKeyForJobDescriptionId
};
