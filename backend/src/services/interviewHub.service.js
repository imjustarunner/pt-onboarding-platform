import InterviewHubTemplate from '../models/InterviewHubTemplate.model.js';
import HiringInterviewArtifact from '../models/HiringInterviewArtifact.model.js';
import HiringInterview from '../models/HiringInterview.model.js';

/** Fun openers — never "how are you". */
export const DEFAULT_SALUTATIONS = [
  'Welcome in — coffee, tea, or straight to the good stories?',
  'Great to meet you! What’s the best thing that happened in your week so far?',
  'Thanks for joining us — what’s lighting you up outside of work lately?',
  'Hello! If today had a soundtrack, what song would open the credits?',
  'Glad you’re here — what’s one win you’re quietly proud of this month?',
  'Welcome! What’s something fun you’ve been geeking out about recently?',
  'Hi there — what’s the most interesting place you’ve been in the last year?',
  'Appreciate you making the time — what’s your go-to fuel for a busy day?'
];

/** Unique travel / life-style icebreakers. */
export const DEFAULT_ICEBREAKERS = [
  'What’s the most unexpected place you’ve ever spent a night?',
  'If you could teleport for one weekend trip tomorrow, where would you go and why?',
  'What’s a local spot you’d take a first-time visitor that isn’t on the tourist map?',
  'What’s the best meal you’ve had while traveling — and what made it memorable?',
  'Do you pack light or “just in case,” and what’s the one item you never leave behind?',
  'What’s a tradition from your hometown (or family) that still shapes how you travel or celebrate?',
  'What’s the longest journey you’ve taken for something you loved — concert, reunion, hike, anything?',
  'If your life had a “passport stamp wall,” which stamp would you show off first?'
];

/** 4 criteria + overall fit; intended for 4-star ratings. */
export const DEFAULT_SCORECARD_CRITERIA = [
  { key: 'communication', label: 'Communication', weight: 1 },
  { key: 'relevant_experience', label: 'Relevant Experience', weight: 1 },
  { key: 'problem_solving', label: 'Problem Solving', weight: 1 },
  { key: 'culture_collaboration', label: 'Culture & Collaboration', weight: 1 },
  { key: 'overall_fit', label: 'Overall Fit', weight: 1 }
];

export const DEFAULT_STANDARD_QUESTIONS = [
  { key: 'motivation', text: 'What drew you to this role and our organization?' },
  { key: 'strengths', text: 'What strengths do you bring that would show up in the first 90 days?' },
  { key: 'challenge', text: 'Tell us about a challenging situation you navigated — what did you do, and what did you learn?' },
  { key: 'collaboration', text: 'How do you prefer to collaborate with teammates and leaders when priorities shift?' },
  { key: 'growth', text: 'Where are you hoping to grow next, and how can this role support that?' }
];

export const DEFAULT_FLOW_SECTIONS = [
  { key: 'salutation', label: 'Salutation' },
  { key: 'icebreaker', label: 'Icebreaker' },
  { key: 'job_specific', label: 'Job-Specific Questions' },
  { key: 'standard', label: 'Standard Questions' },
  { key: 'candidate_questions', label: 'Candidate Questions' }
];

export const DEFAULT_CANDIDATE_QUESTIONS_PROMPT =
  'Invite the candidate to ask anything about the role, team, schedule, growth path, or culture.';

export function pickRandom(arr) {
  const list = Array.isArray(arr) ? arr.filter((x) => x != null && String(x).trim() !== '') : [];
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function normalizeQuestionList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q, idx) => {
      if (typeof q === 'string') {
        const text = q.trim();
        return text ? { key: `q_${idx + 1}`, text } : null;
      }
      if (!q || typeof q !== 'object') return null;
      const text = String(q.text || q.question || q.prompt || '').trim();
      if (!text) return null;
      const key = String(q.key || `q_${idx + 1}`).trim() || `q_${idx + 1}`;
      return { key, text, ...(q.label ? { label: String(q.label) } : {}) };
    })
    .filter(Boolean);
}

function poolFromTemplate(template, field, fallback) {
  const raw = template?.[field];
  if (Array.isArray(raw) && raw.length) return raw;
  return fallback;
}

export async function ensureDefaultTemplate(agencyId, userId = null) {
  const existing = await InterviewHubTemplate.findDefaultByAgencyId(agencyId);
  if (existing) return existing;

  return InterviewHubTemplate.create({
    agencyId,
    name: 'Default Interview',
    isDefault: true,
    flowSectionsJson: DEFAULT_FLOW_SECTIONS,
    standardQuestionsJson: DEFAULT_STANDARD_QUESTIONS,
    scorecardCriteriaJson: DEFAULT_SCORECARD_CRITERIA,
    salutationPoolJson: DEFAULT_SALUTATIONS,
    icebreakerPoolJson: DEFAULT_ICEBREAKERS,
    candidateQuestionsPrompt: DEFAULT_CANDIDATE_QUESTIONS_PROMPT,
    createdByUserId: userId,
    updatedByUserId: userId
  });
}

/**
 * Build an ordered interview flow from template + optional job question set.
 * When regenerate* is true (default), picks a fresh random salutation/icebreaker.
 */
export function buildInterviewFlow({
  template,
  jobQuestionSet = null,
  regenerateSalutation = true,
  regenerateIcebreaker = true,
  previousFlow = null
} = {}) {
  const sections = Array.isArray(template?.flow_sections_json) && template.flow_sections_json.length
    ? template.flow_sections_json
    : DEFAULT_FLOW_SECTIONS;

  const salutationPool = poolFromTemplate(template, 'salutation_pool_json', DEFAULT_SALUTATIONS);
  const icebreakerPool = poolFromTemplate(template, 'icebreaker_pool_json', DEFAULT_ICEBREAKERS);
  const standardQuestions = normalizeQuestionList(
    template?.standard_questions_json?.length ? template.standard_questions_json : DEFAULT_STANDARD_QUESTIONS
  );
  const jobQuestions = normalizeQuestionList(jobQuestionSet?.questions_json);
  const candidatePrompt =
    template?.candidate_questions_prompt || DEFAULT_CANDIDATE_QUESTIONS_PROMPT;

  const prevSalutation = previousFlow?.salutation || null;
  const prevIcebreaker = previousFlow?.icebreaker || null;

  const salutation = regenerateSalutation
    ? pickRandom(salutationPool)
    : prevSalutation || pickRandom(salutationPool);
  const icebreaker = regenerateIcebreaker
    ? pickRandom(icebreakerPool)
    : prevIcebreaker || pickRandom(icebreakerPool);

  const builtSections = sections.map((section) => {
    const key = String(section?.key || section || '').trim();
    const label = String(section?.label || key).trim();
    if (key === 'salutation') {
      return { key, label, item: salutation };
    }
    if (key === 'icebreaker') {
      return { key, label, item: icebreaker };
    }
    if (key === 'job_specific') {
      return { key, label, questions: jobQuestions };
    }
    if (key === 'standard') {
      return { key, label, questions: standardQuestions };
    }
    if (key === 'candidate_questions') {
      return { key, label, prompt: candidatePrompt };
    }
    return { key, label, ...(section || {}) };
  });

  return {
    salutation,
    icebreaker,
    sections: builtSections,
    scorecardCriteria:
      Array.isArray(template?.scorecard_criteria_json) && template.scorecard_criteria_json.length
        ? template.scorecard_criteria_json
        : DEFAULT_SCORECARD_CRITERIA,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Average numeric scores from scorecard_json.
 * Accepts { ratings: { key: number } }, { criteria: [{ key, score }] }, or flat { key: number }.
 */
export function computeAverageScore(scorecardJson) {
  if (!scorecardJson || typeof scorecardJson !== 'object') return null;

  let scores = [];
  if (scorecardJson.ratings && typeof scorecardJson.ratings === 'object') {
    scores = Object.values(scorecardJson.ratings);
  } else if (Array.isArray(scorecardJson.criteria)) {
    scores = scorecardJson.criteria.map((c) => c?.score ?? c?.rating);
  } else {
    scores = Object.entries(scorecardJson)
      .filter(([k]) => !['notes', 'comment', 'comments', 'raterUserId', 'rater_user_id'].includes(k))
      .map(([, v]) => v);
  }

  const nums = scores
    .map((v) => (typeof v === 'number' ? v : parseFloat(v)))
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.round(avg * 100) / 100;
}

export async function finalizeInterview(interviewId, { transcriptSummary = undefined } = {}) {
  const interview = await HiringInterview.findById(interviewId);
  if (!interview) return null;

  const artifact = await HiringInterviewArtifact.findByInterviewId(interviewId);
  const averageScore = computeAverageScore(artifact?.scorecard_json);
  const now = new Date();

  const updatedArtifact = await HiringInterviewArtifact.upsertByInterviewId(interviewId, {
    ...(transcriptSummary !== undefined ? { transcriptSummary } : {}),
    averageScore,
    finalizedAt: now
  });

  const updatedInterview = await HiringInterview.updateById(interviewId, {
    status: 'completed'
  });

  return { interview: updatedInterview, artifact: updatedArtifact };
}

export default {
  DEFAULT_SALUTATIONS,
  DEFAULT_ICEBREAKERS,
  DEFAULT_SCORECARD_CRITERIA,
  DEFAULT_STANDARD_QUESTIONS,
  DEFAULT_FLOW_SECTIONS,
  pickRandom,
  ensureDefaultTemplate,
  buildInterviewFlow,
  computeAverageScore,
  finalizeInterview
};
