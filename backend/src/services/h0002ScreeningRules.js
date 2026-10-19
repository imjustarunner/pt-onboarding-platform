// PSC forms use different item orders and sometimes encode Never/Sometimes/Often
// as 1/2/3. Score the option meaning and item wording, never the stored ordinal.
const plain = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export const SCREENING_OUTCOMES = {
  meets: 'Does meet criteria for admission to the treatment program',
  does_not_meet: 'Does not meet criteria for admission to the treatment program',
  further_evaluation: 'Requires further evaluation before a final admission decision'
};
export function parsePscScore(value, field) {
  if (value == null || !['number', 'string'].includes(typeof value) || !String(value).trim()) return null;
  const option = field?.options?.find(o => String(o.value ?? o.label) === String(value));
  const label = plain(option?.label ?? value);
  if (/^(never|nunca|not at all)$/.test(label)) return 0;
  if (/^(sometimes|a veces|somewhat)$/.test(label)) return 1;
  if (/^(often|a menudo|con frecuencia|very)$/.test(label)) return 2;
  // A schema with explicit 0/1/2 values is also unambiguous.
  const values = field?.options?.map(o => String(o.value));
  if (values?.length === 3 && ['0', '1', '2'].every(v => values.includes(v))) {
    return /^[0-2]$/.test(String(value).trim()) ? Number(value) : null;
  }
  return null;
}
function domain(field) {
  const label = plain(field?.label);
  if (/fidget|sit still|motor|daydream|distract|concentrat|inquiet|quieto|fantasea|distrae|concentrarse/.test(label)) return 'attention';
  if (/sad|unhappy|hopeless|down on|worr|less fun|trist|infeliz|desesperanz|menosprecia|preocupa|divertirse menos/.test(label)) return 'internalizing';
  if (/fight|rules|feelings|teas|blames|belong|share|pelea|reglas|sentimientos|molesta|culpa|pertenecen|compartir/.test(label)) return 'externalizing';
  return null;
}
export function scorePsc17(items, byKey) {
  const unique = new Map(items.map(i => [i.key, i]));
  const valid = [...unique.values()].filter(i => Number.isInteger(i.score) && i.score >= 0 && i.score <= 2);
  const answered = valid.length;
  const result = { answered, missing: 17 - answered, complete: answered === 17, invalid: answered < 14, total: null, subscales: {} };
  if (!result.complete) return result;
  result.total = valid.reduce((sum, i) => sum + i.score, 0);
  for (const [name, count, cutoff] of [['attention', 5, 7], ['internalizing', 5, 5], ['externalizing', 7, 7]]) {
    const group = valid.filter(i => domain(byKey.get(i.key)) === name);
    result.subscales[name] = { score: group.length === count ? group.reduce((sum, i) => sum + i.score, 0) : null, cutoff };
  }
  return result;
}
export function formatPsc17(result) {
  if (!result.complete) return `PSC-17: ${result.answered}/17 valid answers. ${result.invalid ? 'Invalid screening: too many missing items (4 or more).' : 'Incomplete screening: obtain missing answers.'} No total or subscale interpretation assigned; missing answers were not scored as zero.`;
  return [`PSC-17: ${result.total}/34; 17/17 valid answers; total cutoff ≥15.`, ...Object.entries(result.subscales).map(([name, value]) => `${name}: ${value.score == null ? 'Item mapping needs review; no score assigned' : `${value.score} (cutoff ≥${value.cutoff})`}.`), 'These are screening findings, not a disorder diagnosis.'].join('\n');
}
export function suggestScreeningOutcome(psc, { noConcernsReported = false } = {}) {
  if (!psc.complete || Object.values(psc.subscales).some(s => s.score == null)) return 'further_evaluation';
  if (psc.total === 0 && noConcernsReported) return 'does_not_meet';
  // A subscale elevation below the total cutoff still calls for evaluation;
  // it must not be dismissed as a negative screen.
  if (psc.total >= 15) return 'meets';
  return 'further_evaluation';
}
export function validateScreeningReview(review, source) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!source.psc.complete) fail(source.psc.invalid ? 'Invalid screening: too many missing items. Obtain a complete PSC-17 before signing this screening.' : 'Complete the missing PSC-17 items before signing this screening.');
  if (Object.values(source.psc.subscales).some(s => s.score == null)) fail('PSC-17 item mapping requires review before signing.');
  if (!SCREENING_OUTCOMES[review?.outcome]) fail('Choose an admission determination.');
  if (review.outcome === 'does_not_meet' && (source.psc.total !== 0 || source.reportedConcerns || review.noConcernsConfirmed !== true)) fail('A negative admission determination requires all-zero PSC-17 responses and confirmation that no concerns were reported.');
  for (const [key, label] of [['assessment', 'Clinical assessment'], ['followUp', 'Treatment options and follow-up'], ['setting', 'Review setting']]) {
    if (typeof review?.[key] !== 'string' || review[key].trim().length < 3 || review[key].length > 10000) fail(`${label} is required (3–10,000 characters).`);
  }
  if (review.reviewConfirmed !== true) fail('Confirm review of the screening and supplemental intake information.');
  if (source.safetyFlag && review.safetyReviewed !== true) fail('Document and confirm the safety follow-up before signing.');
  return { outcome: review.outcome, assessment: review.assessment.trim(), followUp: review.followUp.trim(), setting: review.setting.trim(), noConcernsConfirmed: review.noConcernsConfirmed === true, reviewConfirmed: true, safetyReviewed: review.safetyReviewed === true };
}

export function screeningClaimBlockers(note,claim,lines) {
  const meta=typeof note?.metadata_json==='string'?JSON.parse(note.metadata_json):note?.metadata_json;
  if(meta?.source!=='h0002_digital_screening')return [];
  const blockers=[];
  let diagnoses=typeof claim.diagnosis_codes_json==='string'?JSON.parse(claim.diagnosis_codes_json):claim.diagnosis_codes_json;
  diagnoses=Array.isArray(diagnoses)?diagnoses:Object.values(diagnoses||{});
  if(diagnoses.length!==1||diagnoses[0]!=='R69')blockers.push('Digital H0002 screenings must use only deferred R69 for billing.');
  const date=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
  if(!meta.screeningReview?.reviewConfirmed||!meta.dateOfService||date(claim.date_of_service)!==meta.dateOfService||lines.some(l=>date(l.service_date)!==meta.dateOfService))blockers.push('The claim service date must match the documented professional screening determination.');
  if(lines.length!==1||lines.some(l=>l.procedure_code!=='H0002'||Number(l.units)!==1))blockers.push('This digital screening is one H0002 encounter; review any additional services separately.');
  return blockers;
}
