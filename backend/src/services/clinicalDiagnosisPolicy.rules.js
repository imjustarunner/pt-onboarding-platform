import { isBillableDiagnosisCode, isUnspecifiedDiagnosisCode, diagnosisCatalogForDate } from './clinicalDiagnosisCatalog.js';
// Organization diagnosis controls. Coverage depends on service and age, not code alone.
// HCPF: https://hcpf.colorado.gov/bh-policies (reviewed 2026-11-03).
export const PRIMARY_DIAGNOSIS_RANGES = [['F20.0','F69'],['F90.0','F98.4'],['F98.8','F99'],['R45.1','R45.2'],['R45.5','R45.82'],['F10.10','F19.99']];
export const SDOH_DIAGNOSIS_RANGES = [['R45.0','R45.75'],['R45.81','R45.84'],['R45.850','R45.89'],['Z55.0','Z55.9'],['Z56.0','Z56.6'],['Z56.81','Z56.9'],['Z58.81','Z58.9'],['Z59.00','Z59.02'],['Z59.10','Z59.3'],['Z59.41','Z59.7'],['Z59.811','Z59.9'],['Z60.0','Z60.9'],['Z62.0','Z62.1'],['Z62.21','Z62.6'],['Z62.810','Z62.819'],['Z62.820','Z62.823'],['Z62.831','Z62.833'],['Z62.890','Z62.9'],['Z63.0','Z63.1'],['Z63.31','Z63.6'],['Z63.71','Z63.9'],['Z64.0','Z64.4'],['Z65.0','Z65.9']];
export const AUTISM_PSYCHOTHERAPY_CODES = new Set(['90785','90791','90792','90832','90833','90834','90836','90837','90838','90846','90847','90849','90853']);
export const normalizeDiagnosisCode = value => String(value || '').trim().toUpperCase();
export const validDiagnosisCode = (value, date) => isBillableDiagnosisCode(normalizeDiagnosisCode(value), date);
// HCPF SB23-174 Annual Report, Appendix A; checked 2026-11-03.
export const SDOH_SERVICE_CODES = new Set(['90785','90791','90832','90834','90837','90846','90847','90849','90853','90875','90876','H0004','H0005','H0038','H2014','H2017','H2023','H2027','S9445','T1017']);
const key = value => normalizeDiagnosisCode(value).replace('.', '');
export const inDiagnosisRange = (value, start, end) => key(value).padEnd(7,'0') >= key(start).padEnd(7,'0') && key(value).padEnd(7,'0') <= key(end).padEnd(7,'Z');
export const requiresDiagnosisEvidence = code => /^F(?:84|90)\./.test(normalizeDiagnosisCode(code));
export const isAdjustmentDiagnosis = code => /^F43\.2/.test(normalizeDiagnosisCode(code));
const dateValue = value => { const s = value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10); return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) ? s : null; };
export function ageOnDate(dob, asOfDate) {
  const birth = dateValue(dob), date = dateValue(asOfDate);
  if (!birth || !date || birth > date) return null;
  return Number(date.slice(0,4))-Number(birth.slice(0,4))-(date.slice(5)<birth.slice(5)?1:0);
}
export function primaryDiagnosisAllowed(code, { age, serviceCode, sdohServiceEligible, asOfDate } = {}) {
  const normalized = normalizeDiagnosisCode(code), service = String(serviceCode || '').toUpperCase();
  if (!validDiagnosisCode(normalized, asOfDate)) return false;
  const sdohEligible = sdohServiceEligible ?? (SDOH_SERVICE_CODES.has(service) || ['H0002','H0031','90791','90792'].includes(service));
  if (PRIMARY_DIAGNOSIS_RANGES.some(([a,b])=>inDiagnosisRange(normalized,a,b))) return true;
  // Documented screening/assessment exceptions; never invent a disorder to bill a screening.
  if (['R69','Z03.89'].includes(normalized) && ['H0002','H0031','90791','90792'].includes(service)) return true;
  if (inDiagnosisRange(normalized,'F84.0','F84.9')) return age != null && age < 21 && AUTISM_PSYCHOTHERAPY_CODES.has(service);
  return age != null && age < 21 && sdohEligible && (SDOH_DIAGNOSIS_RANGES.some(([a,b])=>inDiagnosisRange(normalized,a,b)) || ['R69','Z03.89'].includes(normalized));
}
export function diagnosisAlerts(diagnoses, { asOfDate = new Date().toISOString().slice(0,10) } = {}) {
  const today = dateValue(asOfDate), alerts = [];
  if (!today) return alerts;
  for (const diagnosis of diagnoses || []) {
    const code = normalizeDiagnosisCode(diagnosis.icd10_code || diagnosis.icd10Code || diagnosis.code), evidence = diagnosis.review || diagnosis;
    const add = (type,message,blocking=false)=>alerts.push({code:type,message,diagnosisId:diagnosis.id || null,icd10Code:code,requiresReview:true,blocking,source:'diagnosis'});
    const first = dateValue(diagnosis.created_at || diagnosis.createdAt);
    if ((isUnspecifiedDiagnosisCode(code, today) || /\bunspecified\b/i.test(diagnosis.description || '')) && first && (Date.parse(today)-Date.parse(first))/86400000 > 90) add('diagnosis_unspecified_90_days',`${code}: unspecified diagnosis has continued for more than 90 days. The provider and supervisor must review its supporting evidence and specificity.`);
    if (isAdjustmentDiagnosis(code)) {
      const month = String(evidence.stressor_event_month || evidence.stressorEventMonth || '').slice(0,7);
      if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) add('adjustment_event_month_required',`${code}: record at least the month and year of the precipitating event.`,true);
      else { const end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth()+6); if (today >= end.toISOString().slice(0,10)) add('adjustment_six_month_review',`${code}: the recorded event is at least six months old. Review the diagnosis before further billing under the organization policy.`,true); }
    }
    if ((diagnosis.is_primary === 1 || diagnosis.isPrimary === true) && requiresDiagnosisEvidence(code) && !evidence.evidenceVerified) add('diagnosis_supporting_evidence_required',`${code}: supporting medical records or a documented qualified clinician evaluation must be reviewed before this primary diagnosis is signed or billed.`,true);
  }
  return alerts;
}
export function evaluateDiagnosisRules({ diagnoses = [], credentialTier, supervised = false, nonFAllowed = false, age, serviceCode, sdohServiceEligible, asOfDate } = {}) {
  const blockers=[], warnings=[], ordered=diagnoses.filter(d=>d.concern_kind !== 'learning_concern');
  const primaryIndex=Math.max(0,ordered.findIndex(d=>d.is_primary===1 || d.isPrimary===true));
  if(asOfDate && !diagnosisCatalogForDate(asOfDate)) blockers.push('The ICD-10-CM catalog for this date of service must be verified before billing.');
  const screening=String(serviceCode || '').toUpperCase()==='H0002';
  for(const [index,d] of ordered.entries()) {
    const code=normalizeDiagnosisCode(d.icd10_code || d.icd10Code || d.code);
    if(!validDiagnosisCode(code, asOfDate)) blockers.push(`${code || 'Diagnosis'}: enter a valid ICD-10-CM code.`);
    if(['bachelors','qbha'].includes(credentialTier) && code.startsWith('F')) blockers.push(`${code}: bachelor's-level and QBHA providers cannot document or bill F diagnoses.`);
    if(!String(d.justification || '').trim() && !(screening && code==='R69')) blockers.push(`${code}: a separate clinical justification is required.`);
    if(index===primaryIndex) {
      if(!primaryDiagnosisAllowed(code,{age,serviceCode,sdohServiceEligible,asOfDate})) blockers.push(`${code}: this primary diagnosis is outside the approved coverage ranges or age/service conditions.`);
      if(supervised && !code.startsWith('F') && !nonFAllowed && !(screening && code==='R69')) blockers.push(`${code}: the responsible supervisor must authorize non-F primary diagnoses for this supervisee.`);
    }
  }
  const alerts=diagnosisAlerts(ordered.map((d,i)=>({...d,is_primary:i===primaryIndex?1:0})),{asOfDate});
  for(const alert of alerts) (alert.blocking?blockers:warnings).push(alert.message);
  return {ready:blockers.length===0,blockers:[...new Set(blockers)],warnings:[...new Set(warnings)],alerts};
}
