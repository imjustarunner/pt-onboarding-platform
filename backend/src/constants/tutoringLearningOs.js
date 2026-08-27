/**
 * Staff Client Comfort Preferences taxonomy (hiring + matching).
 * Keys are stored in JSON arrays; labels are UI-facing.
 */

export const ACADEMIC_SUBJECT_OPTIONS = Object.freeze([
  { key: 'early_reading_phonics', label: 'Early Reading / Phonics', publicSubject: 'Reading' },
  { key: 'reading_comprehension', label: 'Reading Comprehension', publicSubject: 'Reading' },
  { key: 'writing_spelling', label: 'Writing / Spelling', publicSubject: 'Writing' },
  { key: 'elementary_math', label: 'Elementary Math', publicSubject: 'Math' },
  { key: 'middle_school_math', label: 'Middle School Math', publicSubject: 'Math' },
  { key: 'algebra', label: 'Algebra', publicSubject: 'Algebra' },
  { key: 'geometry', label: 'Geometry', publicSubject: 'Geometry' },
  { key: 'homework_support', label: 'Homework Support', publicSubject: 'Homework Support' },
  { key: 'study_skills_ef', label: 'Study Skills / Executive Functioning', publicSubject: 'Study Skills' },
  { key: 'test_prep', label: 'Test Prep', publicSubject: 'Test Prep' },
  { key: 'science', label: 'Science', publicSubject: 'Science' },
  { key: 'ms_hs_science', label: 'Middle / High School Science', publicSubject: 'Science' }
]);

export const EMOTIONAL_BEHAVIORAL_OPTIONS = Object.freeze([
  { key: 'anxiety_worry', label: 'Anxiety / Worry' },
  { key: 'school_anxiety', label: 'School Anxiety' },
  { key: 'emotional_regulation', label: 'Emotional Regulation' },
  { key: 'frustration_tolerance', label: 'Frustration Tolerance' },
  { key: 'anger_outbursts', label: 'Anger / Outbursts' },
  { key: 'low_self_esteem', label: 'Low Self-Esteem / Confidence' },
  { key: 'attention_focus', label: 'Attention / Focus Difficulties' },
  { key: 'hyperactivity_impulsivity', label: 'Hyperactivity / Impulsivity' },
  { key: 'low_motivation', label: 'Low Motivation' },
  { key: 'task_refusal', label: 'Task Refusal / Avoidance' },
  { key: 'social_skills', label: 'Social Skills / Peer Conflict' },
  { key: 'coping_skills', label: 'Coping Skills' },
  { key: 'self_advocacy', label: 'Self-Advocacy' },
  { key: 'autism', label: 'Autism' }
]);

export const AGE_RANGE_OPTIONS = Object.freeze([
  { key: '3-5', label: '3–5' },
  { key: '6-8', label: '6–8' },
  { key: '9-11', label: '9–11' },
  { key: '12-14', label: '12–14' },
  { key: '15-17', label: '15–17' },
  { key: '18+', label: '18+' }
]);

export const GRADE_LEVEL_OPTIONS = Object.freeze([
  { key: 'pre_k_k', label: 'Pre-K–K', publicGrade: 'K-2' },
  { key: '1_2', label: '1st–2nd', publicGrade: 'K-2' },
  { key: '3_5', label: '3rd–5th', publicGrade: '3-5' },
  { key: '6_8', label: '6th–8th', publicGrade: '6-8' },
  { key: '9_12', label: '9th–12th', publicGrade: '9-12' }
]);

export const SERVICE_TYPE_OPTIONS = Object.freeze([
  { key: 'tutoring', label: 'Tutoring' },
  { key: 'therapy_tutoring', label: 'Therapy + Tutoring' },
  { key: 'group_sessions', label: 'Group Sessions' }
]);

/** Assessment tools staff may mark comfort administering (expand in Phase 4). */
export const ASSESSMENT_TOOL_OPTIONS = Object.freeze([
  { key: 'internal_quick_baseline', label: 'Internal Quick Baseline', licensed: false },
  { key: 'internal_full_eval', label: 'Internal Full Evaluation', licensed: false },
  { key: 'internal_progress_probe', label: 'Internal Progress Probe', licensed: false },
  { key: 'oral_reading_probe', label: 'Oral Reading Probe (tutor-verified)', licensed: false },
  { key: 'external_imported', label: 'External / Imported Results', licensed: false }
]);

export const STUDENT_SUBJECT_KEYS = Object.freeze([
  { key: 'reading', label: 'Reading' },
  { key: 'writing', label: 'Writing' },
  { key: 'mathematics', label: 'Mathematics' },
  { key: 'algebra', label: 'Algebra' },
  { key: 'study_skills', label: 'Study Skills' },
  { key: 'science', label: 'Science' },
  { key: 'test_prep', label: 'Test Prep' },
  { key: 'homework_support', label: 'Homework Support' }
]);

export const STUDENT_SUBJECT_STATUSES = Object.freeze([
  'enrollment_started',
  'baseline_needed',
  'baseline_in_progress',
  'learning_plan_draft',
  'learning_plan_review',
  'active_tutoring',
  'plan_review_due',
  'reassessment',
  'goals_met',
  'maintenance',
  'completed',
  'discharged'
]);

export const PLAN_GOAL_STATUSES = Object.freeze([
  'not_assessed',
  'emerging',
  'developing',
  'nearly_secure',
  'secure',
  'generalized',
  'needs_review',
  'mastered'
]);

/**
 * Map comfort academic keys → public tutoring profile subject_areas strings.
 */
export function publicSubjectsFromAcademicKeys(keys = []) {
  const map = new Map(ACADEMIC_SUBJECT_OPTIONS.map((o) => [o.key, o.publicSubject]));
  const out = [];
  const seen = new Set();
  for (const key of keys || []) {
    const label = map.get(key);
    if (label && !seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

/**
 * Map comfort grade keys → public tutoring profile grade_levels strings.
 */
export function publicGradesFromGradeKeys(keys = []) {
  const map = new Map(GRADE_LEVEL_OPTIONS.map((o) => [o.key, o.publicGrade]));
  const out = [];
  const seen = new Set();
  for (const key of keys || []) {
    const label = map.get(key);
    if (label && !seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

export function comfortTaxonomyPayload() {
  return {
    academicSubjects: ACADEMIC_SUBJECT_OPTIONS,
    emotionalBehavioral: EMOTIONAL_BEHAVIORAL_OPTIONS,
    ageRanges: AGE_RANGE_OPTIONS,
    gradeLevels: GRADE_LEVEL_OPTIONS,
    serviceTypes: SERVICE_TYPE_OPTIONS,
    assessmentTools: ASSESSMENT_TOOL_OPTIONS,
    studentSubjects: STUDENT_SUBJECT_KEYS
  };
}
