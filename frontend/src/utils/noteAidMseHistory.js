import { MSE_DOMAIN_DEFS, domainSelectionLabel, buildAllNormalMse, buildAllNotAssessedMse } from './noteAidMseCatalog.js';
import { CS_MSE_FIELDS } from './csNoteBuild.js';

const parse = value => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
};

export function normalizeHistoricalMse(input) {
  const raw = parse(input);
  if (raw.allNormal === true) return buildAllNormalMse();
  if (raw.allNotAssessed === true) return buildAllNotAssessedMse();
  const domains = {};
  for (const def of MSE_DOMAIN_DEFS) {
    const field = CS_MSE_FIELDS.find(item => item.domainKey === def.key);
    const value = raw.domains?.[def.key] ?? raw[def.key] ?? raw[field.key];
    if (!value) continue;
    const label = typeof value === 'string' ? value.trim() : domainSelectionLabel(value);
    if (!label) continue;
    domains[def.key] = typeof value === 'string'
      ? { status:label === 'Not assessed'?'not_assessed':'selected', option:label === 'Not assessed'?'':label, detail:'' }
      : { status:value.status || 'selected', option:value.option || label, detail:value.detail || '' };
  }
  return { allNormal:false, allNotAssessed:false, domains };
}

export function mseHistoryRows(history = []) {
  return history.map((row,index) => {
    const sourceDate = String(row.sourceDate || row.dateOfService || row.date_of_service || row.date || row.createdAt || row.created_at || '').slice(0,10);
    const mse = normalizeHistoricalMse(row.mse || row.mentalStatusExam || row.mental_status_exam || row);
    return { key:String(row.id || row.noteId || `history_${index}`), noteId:row.noteId || row.id || null, sourceDate, mse };
  }).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.sourceDate) && Object.keys(row.mse.domains).length)
    .sort((a,b) => b.sourceDate.localeCompare(a.sourceDate));
}

export function smartMseValues(mse) {
  return Object.fromEntries(CS_MSE_FIELDS.map(field => [field.key,domainSelectionLabel(mse?.domains?.[field.domainKey])]));
}
