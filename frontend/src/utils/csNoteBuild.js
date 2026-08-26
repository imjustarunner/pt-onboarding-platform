/**
 * CSNoteBuild — Colorado Service Documentation Standards step-by-step pathway.
 * Serializes structured answers into clinician input for Gemini narrative generation.
 */

export const CS_DEFAULT_INTERVENTIONS = [
  'Cognitive Restructuring',
  'Anxiety Management',
  'Emotional Regulation',
  'Psychoeducation',
  'Behavioral Activation',
  'Problem Solving',
  'Mindfulness / Grounding',
  'Motivational Interviewing',
  'Social Skills Practice',
  'Caregiver Coaching'
];

export const CS_INTERVENTION_USE_OPTIONS = [
  'Modeled / demonstrated skill',
  'Guided practice in session',
  'Discussed / processed verbally',
  'Role-play / rehearsal',
  'Assigned between-session practice',
  'Collaborative problem-solving'
];

export const CS_CLIENT_RESPONSE_OPTIONS = [
  'Actively Engaged',
  'Generally Engaged',
  'Needed Prompting',
  'Minimally Engaged',
  'Resistant'
];

export const CS_AFFECT_AREAS = [
  'School / Academic',
  'Home / Family',
  'Relationships / Peers',
  'Daily functioning',
  'Behavior / Impulsivity',
  'Self-care',
  'Safety / Risk',
  'Mood / Anxiety'
];

export const CS_DEFAULT_SYMPTOMS = [
  'Anxiety',
  'Depressed mood',
  'Difficulty concentrating',
  'Irritability',
  'Sleep disturbance',
  'Avoidance',
  'Restlessness',
  'Social withdrawal',
  'Anger outbursts',
  'Low motivation'
];

export const CS_PROGRESS_RATINGS = [
  'Improved',
  'Some Progress',
  'No Change',
  'Worsened',
  'Not Addressed Today'
];

export const CS_MSE_FIELDS = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'behavior', label: 'Behavior' },
  { key: 'speech', label: 'Speech' },
  { key: 'mood', label: 'Mood' },
  { key: 'affect', label: 'Affect' },
  { key: 'thoughtProcess', label: 'Thought Process' },
  { key: 'thoughtContent', label: 'Thought Content' },
  { key: 'orientation', label: 'Orientation' },
  { key: 'attention', label: 'Attention' },
  { key: 'insight', label: 'Insight' },
  { key: 'judgment', label: 'Judgment' }
];

export const CS_MSE_DEFAULTS = {
  appearance: 'Within normal limits',
  behavior: 'Cooperative',
  speech: 'Normal rate/tone',
  mood: 'Anxious',
  affect: 'Congruent',
  thoughtProcess: 'Logical / goal-directed',
  thoughtContent: 'No delusions reported',
  orientation: 'Oriented x3',
  attention: 'Adequate',
  insight: 'Fair',
  judgment: 'Fair'
};

export function createEmptyCsNoteBuildState() {
  return {
    startTime: '',
    endTime: '',
    startConfirmed: false,
    endConfirmed: false,
    participantsMode: 'Client Only',
    participantsDetail: '',
    participantsConfirmed: false,
    sessionFocus: '',
    interventionsProposed: [],
    interventionsSelected: [],
    interventionsCustom: '',
    interventionUse: [],
    interventionUseMore: '',
    clientResponse: '',
    clientResponseMore: '',
    symptomsSelected: [],
    affectAreas: [],
    medicalNecessityNarrative: '',
    mse: { ...CS_MSE_DEFAULTS },
    riskLevel: 'Low Risk',
    riskDetails: '',
    goalProgress: {}, // goalId -> { rating, note }
    telehealthRequired: false,
    telehealthVerification: '',
    planProposed: '',
    planEdited: '',
    planAccepted: false
  };
}

export function csContactMinutes(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const [sh, sm] = String(startTime).split(':').map(Number);
  const [eh, em] = String(endTime).split(':').map(Number);
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return null;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

/**
 * Build structured clinician input for CSNoteBuild generate.
 */
export function serializeCsNoteBuildForGenerate(state, {
  dateOfService = '',
  serviceCode = '',
  locationLabel = '',
  clientInitials = '',
  isTelehealth = false
} = {}) {
  const s = state || createEmptyCsNoteBuildState();
  const mins = csContactMinutes(s.startTime, s.endTime);
  const lines = [
    'CSNoteBuild structured session answers (Colorado Service Documentation Standards).',
    'Write a complete clinical progress note narrative that covers every required area below.',
    'Do NOT use SOAP headers. Use these section titles exactly:',
    'Session Details:',
    'Focus of Session:',
    'Interventions:',
    'Client Response / Benefit:',
    'Medical Necessity:',
    'Mental Status / Risk:',
    'Treatment Plan Progress:',
    'Telehealth:',
    'Plan for Next Service:',
    '',
    `Date of Service: ${dateOfService || '—'}`,
    `Service code: ${serviceCode || '—'}`,
    `Place of service / setting: ${locationLabel || '—'}`,
    `Client initials: ${clientInitials || '—'}`,
    `Start time: ${s.startTime || '—'}`,
    `End time: ${s.endTime || '—'}`,
    `Total contact time (minutes): ${mins != null ? mins : '—'}`,
    `Participants: ${s.participantsMode}${s.participantsDetail ? ` — ${s.participantsDetail}` : ''}`,
    '',
    `Focus of today's session:\n${s.sessionFocus || '(not provided)'}`,
    '',
    `Interventions selected: ${(s.interventionsSelected || []).join(', ') || '(none)'}${s.interventionsCustom ? `; custom: ${s.interventionsCustom}` : ''}`,
    `How interventions were used: ${(s.interventionUse || []).join(', ') || '(not selected)'}`,
    s.interventionUseMore ? `Intervention use details:\n${s.interventionUseMore}` : '',
    '',
    `Client response / engagement: ${s.clientResponse || '(not selected)'}`,
    s.clientResponseMore ? `Client response details:\n${s.clientResponseMore}` : '',
    '',
    `Symptoms / clinical needs addressed today: ${(s.symptomsSelected || []).join(', ') || '(none selected)'}`,
    `Current functional impact areas: ${(s.affectAreas || []).join(', ') || '(none selected)'}`,
    `Medical necessity narrative:\n${s.medicalNecessityNarrative || '(not provided)'}`,
    '',
    'Mental Status Exam:',
    ...Object.entries(s.mse || {}).map(([k, v]) => `- ${k}: ${v}`),
    `Risk / safety: ${s.riskLevel || '—'}`,
    s.riskDetails ? `Risk details:\n${s.riskDetails}` : '',
    '',
    'Treatment plan progress ratings:'
  ];

  const gp = s.goalProgress || {};
  const goalEntries = Object.entries(gp);
  if (!goalEntries.length) {
    lines.push('(no goal ratings provided)');
  } else {
    for (const [id, row] of goalEntries) {
      lines.push(
        `- [${id}] ${row?.goalText || 'Goal'}: ${row?.rating || '—'}${row?.note ? ` — ${row.note}` : ''}`
      );
      if (Array.isArray(row?.objectives)) {
        for (const o of row.objectives) {
          lines.push(
            `  · O${o.objectiveIndex || ''}: ${o.objectiveText || ''} → ${o.rating || '—'}${o.note ? ` (${o.note})` : ''}`
          );
        }
      }
    }
  }

  lines.push('');
  if (isTelehealth || s.telehealthRequired) {
    lines.push(`Telehealth verification:\n${s.telehealthVerification || '(required — not completed)'}`);
  } else {
    lines.push('Telehealth: Not a telehealth session.');
  }

  lines.push('');
  lines.push(
    `Plan for next service (provider-confirmed):\n${s.planEdited || s.planProposed || '(generate a clinically appropriate follow-up plan)'}`
  );

  return lines.filter((l) => l !== '').join('\n').slice(0, 12000);
}

export function csNoteBuildCompletionCount(state, { isTelehealth = false, goalIds = [] } = {}) {
  const s = state || createEmptyCsNoteBuildState();
  const checks = [
    !!s.startConfirmed && !!s.startTime,
    !!s.endConfirmed && !!s.endTime,
    !!s.participantsConfirmed,
    !!String(s.sessionFocus || '').trim(),
    (s.interventionsSelected || []).length > 0 || !!String(s.interventionsCustom || '').trim(),
    (s.interventionUse || []).length > 0 || !!String(s.interventionUseMore || '').trim(),
    !!s.clientResponse,
    (s.symptomsSelected || []).length > 0 && !!String(s.medicalNecessityNarrative || '').trim(),
    !!s.mse?.mood && !!s.riskLevel,
    goalIds.length
      ? goalIds.every((id) => s.goalProgress?.[id]?.rating)
      : true,
    isTelehealth ? !!String(s.telehealthVerification || '').trim() : true,
    !!(s.planAccepted || String(s.planEdited || s.planProposed || '').trim())
  ];
  const done = checks.filter(Boolean).length;
  return { done, total: checks.length, complete: done === checks.length };
}
