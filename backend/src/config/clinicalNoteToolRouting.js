// Shared service-to-writer routing. Funding is resolved before selecting the clinical service.
export function resolveClinicalToolId({ serviceCode, programId }) {
  const sc = String(serviceCode || '').trim().toUpperCase();
  if (!sc) return 'clinical_code_decider';
  if (sc === 'H2014') return programId ? 'clinical_h2014_group' : 'clinical_h2014_individual';
  if (sc === 'H2015' || sc === 'H2016') return 'clinical_h2014_individual';
  if (sc === 'H0004') return 'clinical_h0004_note';
  if (sc === 'H2011') return 'clinical_h2011_note';
  if (sc === 'H0031') return 'clinical_h0031_intake';
  if (sc === 'H0032') return 'clinical_h0032_plan_development';
  if (sc === 'H0002') return 'clinical_screening_review';
  if (sc === '90791') return 'clinical_90791_intake_plan';
  if (sc === '90832' || sc === '90834' || sc === '90837' || sc === '90839') return 'clinical_psychotherapy_note';
  if (sc === '90846' || sc === '90847') return 'clinical_family_note';
  if (sc === 'H0023') return 'clinical_h0023_full_packet';
  return 'clinical_code_decider';
}

