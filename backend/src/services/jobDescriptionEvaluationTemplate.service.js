/**
 * Generate employee-evaluation rubrics from hiring job description responsibilities.
 */
import {
  RATING_SCALE,
  DEFAULT_REFLECTION_PROMPTS
} from '../seeds/itscoEmployeeEvaluationRubrics.js';

function slugify(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64) || 'criterion';
}

function parseResponsibilities(jobDescription = {}) {
  let sections = jobDescription.description_sections_json;
  if (typeof sections === 'string') {
    try {
      sections = JSON.parse(sections);
    } catch {
      sections = null;
    }
  }
  const bullets = Array.isArray(sections?.responsibilities)
    ? sections.responsibilities.map((b) => String(b || '').trim()).filter(Boolean)
    : [];
  if (bullets.length) return bullets;

  const text = String(jobDescription.description_text || '');
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•\-\*\d.)]+/, '').trim())
    .filter((line) => line.length > 24 && line.length < 280)
    .slice(0, 12);
}

function defaultAnchors(label) {
  const short = String(label || 'this responsibility').replace(/\.$/, '');
  return {
    1: `Rarely demonstrates effectiveness with: ${short}`,
    2: `Inconsistently demonstrates: ${short}`,
    3: `Consistently and effectively demonstrates: ${short}`,
    4: `Exemplifies excellence and leadership with: ${short}`
  };
}

/**
 * Build a rubric JSON object from JD responsibilities.
 */
export function generateRubricFromJobDescription(jobDescription = {}) {
  const title = String(jobDescription.title || 'Role').trim() || 'Role';
  const bullets = parseResponsibilities(jobDescription);
  const criteria = (bullets.length ? bullets : [
    `Performs the core duties of ${title}`,
    'Collaborates professionally with colleagues, families, and partners',
    'Maintains accurate documentation and follows Practice policies',
    'Engages in professional development and continuous improvement'
  ]).map((label, idx) => ({
    key: `c${idx + 1}_${slugify(label).slice(0, 40)}`,
    label,
    anchors: defaultAnchors(label)
  }));

  return {
    title: `${title} Employee Self-Assessment & Evaluation Rubric`,
    ratingScale: RATING_SCALE,
    sections: [
      {
        key: 'core_responsibilities',
        title: '1. Core Responsibilities',
        hasActionItems: true,
        criteria
      }
    ],
    reflectionPrompts: DEFAULT_REFLECTION_PROMPTS
  };
}

export function templateSlugForJobDescription(jobDescription = {}) {
  const title = String(jobDescription.title || 'role').trim();
  return `jd_${slugify(title)}_${Number(jobDescription.id) || 0}`.slice(0, 80);
}

export default {
  generateRubricFromJobDescription,
  templateSlugForJobDescription
};
