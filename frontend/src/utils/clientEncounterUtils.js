export function formatEncounterDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

export function formatEncounterMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export function formatEncounterProvider(row) {
  const last = String(row?.provider_last_name || '').trim();
  const first = String(row?.provider_first_name || '').trim();
  if (last || first) return `${last}${last && first ? ', ' : ''}${first}`;
  return '—';
}

export function formatPlaceOfService(pos) {
  const code = String(pos || '').trim();
  if (!code) return '—';
  if (code === '03') return 'In school (03)';
  return `In office (${code})`;
}

export function noteStatusLabel(row) {
  const s = String(row?.note_status || 'none');
  if (s === 'signed') return 'Signed';
  if (s === 'draft') return 'Draft';
  return 'No note';
}

export function noteActionLabel(row) {
  const s = String(row?.note_status || 'none');
  if (s === 'signed' || s === 'draft') return 'Open note';
  return 'Start note';
}

export function noteStatusClass(row) {
  return `cc-enc-note-pill--${String(row?.note_status || 'none')}`;
}

/** Map imported row balances to a display status for billing claims table. */
export function claimStatusForRow(row) {
  const ptBal = Number(row?.patient_balance);
  const insOwed = Number(row?.insurance_outstanding);
  const pt = Number.isFinite(ptBal) ? ptBal : 0;
  const ins = Number.isFinite(insOwed) ? insOwed : 0;
  if (pt <= 0 && ins <= 0) return 'paid';
  if (ins > 0 && pt <= 0) return 'processed';
  if (pt > 0 && ins > 0) return 'partial';
  if (pt > 0) return 'patient_owed';
  return 'submitted';
}

export const CLAIM_STATUS_LABELS = {
  paid: 'Paid',
  processed: 'Processed',
  partial: 'Partial',
  patient_owed: 'Patient owed',
  submitted: 'Submitted'
};

export function matchesEncounterSearch(row, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row?.service_code,
    row?.diagnosis_text,
    row?.provider_last_name,
    row?.provider_first_name,
    row?.service_date
  ].map((x) => String(x || '').toLowerCase()).join(' ');
  return hay.includes(q);
}
