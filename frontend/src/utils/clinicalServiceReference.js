// Funding arrangements retain their own scheduled/billed code. This choice
// identifies the clinical service whose handbook requirements apply to the note.
export const isProBonoFundingCode = value => /^PRO[\s_-]*BONO(?:[\s_-]*SERVICE)?$/i.test(String(value || '').trim());
const addonCodes = new Set(['90785', '90840', '99051']);
export function underlyingClinicalServiceOptions(rows = []) {
  const found = new Set();
  return rows.map(item => typeof item === 'string' ? { code: item } : item).map(item => ({ ...item, code: String(item.code || item.serviceCode || item.service_code || '').trim().toUpperCase() })).filter(item => {
    if (!/^(?:\d{5}|[A-Z]\d{4})$/.test(item.code) || addonCodes.has(item.code) || item.isAddon === true || found.has(item.code)) return false;
    found.add(item.code); return true;
  });
}
