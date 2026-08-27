import { callGeminiText } from './geminiText.service.js';

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Call Gemini for tutoring drafts. Falls back to null so callers can use rules-v1.
 * Never diagnoses disabilities; returns structured JSON only.
 */
export async function callTutoringAiJson({ prompt, temperature = 0.3, maxOutputTokens = 1400 }) {
  const guarded = [
    'You assist tutors with instructional planning for a private tutoring program in Colorado.',
    'Hard rules:',
    '- Do NOT diagnose disabilities, ADHD, autism, learning disabilities, or special education eligibility.',
    '- Do NOT claim READ Act approval or state diagnostic status.',
    '- AI drafts require human tutor approval before becoming official records.',
    '- Return ONLY valid JSON (no markdown fences).',
    '',
    prompt
  ].join('\n');

  try {
    const generated = await callGeminiText({
      prompt: guarded,
      temperature,
      maxOutputTokens
    });
    const parsed = extractJsonObject(generated.text);
    if (!parsed || typeof parsed !== 'object') {
      return {
        ok: false,
        modelName: generated.modelName || 'gemini',
        provider: generated.provider || 'gemini',
        rawText: generated.text,
        draft: null
      };
    }
    return {
      ok: true,
      modelName: generated.modelName || 'gemini',
      provider: generated.provider || 'gemini',
      latencyMs: generated.latencyMs,
      draft: parsed
    };
  } catch (err) {
    console.warn('[tutoringAi] Gemini unavailable, using rules fallback:', err?.message || err);
    return { ok: false, error: err?.message || String(err), draft: null };
  }
}

export function buildLearningPlanPrompt({ subject, summary, standards }) {
  return [
    'Draft a Learning Plan JSON for tutor review.',
    `Subject: ${subject.subject_label} (${subject.subject_key})`,
    `School grade: ${subject.school_grade || 'unknown'}`,
    `Reason: ${subject.reason_for_tutoring || 'not provided'}`,
    `Baseline strengths: ${JSON.stringify(summary?.strengths_json || [])}`,
    `Baseline needs: ${JSON.stringify(summary?.needs_json || [])}`,
    `Narrative: ${summary?.narrative_summary || 'n/a'}`,
    `Relevant CAS standards: ${JSON.stringify(
      (standards || []).slice(0, 8).map((s) => ({
        code: s.standard_code,
        title: s.title,
        versionKey: s.version_key
      }))
    )}`,
    'Return JSON keys:',
    'title, strengths[], priorityNeeds[], instructionalStrategies[], goals[{title,baselineText,successCriteria,measurementMethod,standardsRefs[{code,title,versionKey}]}], parentSummary, disclaimer',
    'Include 2-4 goals. Parent summary must be plain language for families.'
  ].join('\n');
}

export function buildSessionBriefPrompt({ subject, goals, priorNote, standards }) {
  return [
    'Draft a tutoring Session Brief JSON for tutor review.',
    `Subject: ${subject.subject_label}`,
    `Active goals: ${JSON.stringify(
      (goals || []).map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        successCriteria: g.success_criteria
      }))
    )}`,
    `Prior session: ${priorNote?.summary || priorNote?.next_steps || 'none'}`,
    `Relevant Colorado Academic Standards (CAS/CDE): ${JSON.stringify(
      (standards || []).slice(0, 6).map((s) => ({
        code: s.standard_code,
        title: s.title,
        description: s.description
      }))
    )}`,
    'Return JSON keys:',
    'objective, standardsAlignment[{code,title}], teachingSequence[{label,minutes,focus}],',
    'plannedActivities[{goalId,title,skillKey,suggestedFocus}], materials[],',
    'tutorPrompts[], workedExampleNotes, misconceptions[], checkForUnderstanding[], interventionStrategies[],',
    'tutorPrepNotes, priorSessionRecap',
    'teachingSequence should total about 45 minutes (warm-up, review, teach, guided practice, check).'
  ].join('\n');
}

export function buildParentUpdatePrompt({ subject, summary, nextSteps, strengths, challenges, homework }) {
  return [
    'Draft a short parent/guardian update after a tutoring session.',
    `Subject: ${subject.subject_label}`,
    `Summary: ${summary || ''}`,
    `Strengths: ${strengths || ''}`,
    `Challenges: ${challenges || ''}`,
    `Next steps: ${nextSteps || ''}`,
    `Homework: ${homework || ''}`,
    'Return JSON: { parentUpdate: string, homeworkItems: string[] }',
    'Tone: warm, clear, no jargon, no diagnostic claims.'
  ].join('\n');
}

export function buildPracticePrompt({ subject, goal, count = 5, standards = [] }) {
  return [
    'Generate at-home practice items linked to one tutoring goal for a parent to do with their child.',
    `Subject: ${subject.subject_label}`,
    `Goal: ${goal?.title || 'general practice'}`,
    `Success criteria: ${goal?.success_criteria || 'n/a'}`,
    `Item count: ${count}`,
    `Aligned CAS standards: ${JSON.stringify(
      (standards || []).slice(0, 4).map((s) => ({ code: s.standard_code, title: s.title }))
    )}`,
    'Return JSON: { title, instructions, practiceItems:[{prompt,hint,answerNote}] }',
    'Keep items age-appropriate and brief (5-10 minutes total). Write instructions for a parent/caregiver.'
  ].join('\n');
}

export function buildTutorAssistPrompt({ action, subject, goal, observation, standards }) {
  const actionHints = {
    explain: 'Generate a short tutor-facing explanation script and a simpler alternate explanation.',
    intervene: 'Suggest one concrete intervention/scaffold the tutor can try in the next 2 minutes.',
    recap: 'Draft a plain-language family recap (2-4 sentences) and 1-3 at-home practice bullets.'
  };
  return [
    `Tutor AI assist action: ${action}.`,
    actionHints[action] || 'Help the tutor with the next instructional move.',
    `Subject: ${subject?.subject_label || 'tutoring'}`,
    `Focus goal: ${goal?.title || 'current skill'}`,
    `Tutor observation: ${observation || 'n/a'}`,
    `CAS context: ${JSON.stringify(
      (standards || []).slice(0, 4).map((s) => ({ code: s.standard_code, title: s.title }))
    )}`,
    'Return JSON: { title, coachText, familyText, practiceBullets[], standardCodes[] }'
  ].join('\n');
}
