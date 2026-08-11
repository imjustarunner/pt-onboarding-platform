const STEP_TYPE_LABELS = {
  spanish_clarification: 'Spanish Clarification',
  questions: 'Questions',
  clinical_questions: 'Clinical Questions',
  registration: 'Registration',
  document: 'Document',
  school_roi: 'School ROI',
  packet_informed_group_consent: 'Informed + Group Consent',
  packet_policy_services: 'Policy & Services',
  packet_hipaa_notice: 'HIPAA Notice',
  upload: 'Upload',
  guardian_waiver: 'Guardian waivers',
  insurance_info: 'Insurance info',
  payment_collection: 'Payment collection',
  communications: 'Communications',
  demographics: 'Demographics',
  references: 'References',
  smart_disclosure: 'Disclosure',
  disclosure: 'Disclosure'
};

function stepLabel(step) {
  const type = String(step?.type || '').trim();
  const custom = String(step?.label || step?.title || '').trim();
  const base = STEP_TYPE_LABELS[type] || type || 'Step';
  return custom && custom !== base ? `${base} — ${custom}` : base;
}

function collectQuestionFields(steps) {
  const fields = [];
  (Array.isArray(steps) ? steps : []).forEach((step) => {
    const type = String(step?.type || '').trim();
    if (!['questions', 'clinical_questions'].includes(type)) return;
    (Array.isArray(step?.fields) ? step.fields : []).forEach((field) => {
      const key = String(field?.key || '').trim();
      if (!key) return;
      fields.push({
        key,
        label: String(field?.label || key).trim(),
        stepType: type
      });
    });
  });
  return fields;
}

function stepSummaries(steps) {
  return (Array.isArray(steps) ? steps : []).map((step, index) => ({
    index: index + 1,
    type: String(step?.type || '').trim(),
    label: stepLabel(step)
  }));
}

/**
 * Compare EN and ES school master step lists for admin review.
 */
export function compareSchoolMasterSteps(enSteps, esSteps) {
  const enList = stepSummaries(enSteps);
  const esList = stepSummaries(esSteps);
  const maxLen = Math.max(enList.length, esList.length);
  const paired = [];

  for (let i = 0; i < maxLen; i += 1) {
    const en = enList[i] || null;
    const es = esList[i] || null;
    const mismatch = Boolean(
      (en && !es)
      || (!en && es)
      || (en && es && (en.type !== es.type || en.label !== es.label))
    );
    paired.push({ en, es, mismatch });
  }

  const enFields = collectQuestionFields(enSteps);
  const esFields = collectQuestionFields(esSteps);
  const enKeys = new Set(enFields.map((f) => f.key));
  const esKeys = new Set(esFields.map((f) => f.key));

  return {
    paired,
    onlyInEnglish: enFields.filter((f) => !esKeys.has(f.key)),
    onlyInSpanish: esFields.filter((f) => !enKeys.has(f.key)),
    enStepCount: enList.length,
    esStepCount: esList.length
  };
}
