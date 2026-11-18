import { buildPhq9Fields, buildPhqAFields, buildGad7Fields, buildPsc17Fields } from '../data/validatedClinicalScreens.en.js';

const instruments = [{ key: 'phq9', label: 'PHQ-9', fields: buildPhq9Fields, max: 3 },
 { key: 'phqa', label: 'PHQ-A', fields: buildPhqAFields, max: 3 },
 { key: 'gad7', label: 'GAD-7', fields: buildGad7Fields, max: 3 },
 { key: 'psc17', label: 'PSC-17', fields: buildPsc17Fields, max: 2 }];
export function intakeAssessmentResponses(data = {}, link = {}) {
 const bags = [data.clinicalResponses,data.clinical_responses,data.submission?.clinicalResponses,data.responses?.submission?.clinicalResponses,
  data.submission,data.responses?.submission,data.responses?.clients?.[0]?.clinicalResponses,data.responses?.clients?.[0],data.clients?.[0]?.clinicalResponses];
 const fieldDefinitions = [...(link.intake_fields || []), ...(link.intake_steps || []).flatMap(step=>step.fields || [])];
 const pscOptions = fieldDefinitions.find(field=>field.key==='psc_1')?.options || [];
 const legacyPsc = pscOptions.some(option=>String(option.value)==='3' && /often/i.test(option.label || ''));
 const answers = Object.assign({}, ...bags.filter(bag => bag && typeof bag === 'object' && !Array.isArray(bag)));
 return instruments.flatMap(instrument => {
  if (answers[`skip_${instrument.key}`] === true || answers[`skip_${instrument.key}`] === 'true') return [];
  const items = instrument.fields().map(field => {
   const raw = answers[field.key];
   const sourceValue = typeof raw === 'number' || typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
   const value = instrument.key === 'psc17' && legacyPsc ? sourceValue - 1 : sourceValue;
   return { key: field.key, question: field.label, value: Number.isInteger(value) && value >= 0 && value <= instrument.max ? value : null };
  });
  if (!items.some(item => item.value != null)) return [];
  const complete = items.every(item => item.value != null), total = complete ? items.reduce((sum,item) => sum + item.value,0) : null;
  const text = `${instrument.label}: ${complete ? `total ${total}; ${items.length} of ${items.length} items answered` : `incomplete; ${items.filter(item=>item.value!=null).length} of ${items.length} items answered; no valid total`}\n` + items.map(item => `${item.question}: ${item.value == null ? 'Not answered / invalid response' : item.value}`).join('\n');
  return [{ instrumentKey: instrument.key, complete, total, items, text,
   ...(instrument.key === 'phq9' || instrument.key === 'phqa' ? { selfHarmItem: items[8]?.value ?? null } : {}) }];
 });
}
