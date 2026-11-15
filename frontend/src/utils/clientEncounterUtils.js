export function formatEncounterDate(value) {
  if (!value) return '—';
  // A service date is a calendar date, not midnight UTC.
  const raw = String(value);
  const day = /^(\d{4})-(\d{2})-(\d{2})(?:$|T00:00:00(?:\.000)?Z$)/.exec(raw);
  const d = day ? new Date(Number(day[1]), Number(day[2])-1, Number(day[3]), 12) : new Date(value);
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
  const labels = {'02':'Telehealth outside patient’s home','10':'Telehealth in patient’s home','03':'School','11':'Office','12':'Home','99':'Other location'};
  return `${labels[code] || 'Place of service'} (${code})`;
}

export function isUnsignedEncounter(row) {
  const status = String(row?.note_status || '').toLowerCase();
  return !['planned', 'not_held'].includes(row?.display_state)
    && ['draft', 'unsigned', 'awaiting_signature'].includes(status);
}

export function isUnsignedClinicalNote(note, sessions = [], now = new Date()) {
  if (note.provider_signed_at || note.review_only || /CONTACT|TERMINATION|MISSED_APPOINTMENT|NO_SHOW/i.test(note.note_type || '')) return false;
  const session = sessions.find(s => Number(s.id) === Number(note.clinical_session_id));
  if (session && /cancel|no_show|no-show|missed/i.test(session.encounter_status || '')) return false;
  const start = session?.scheduled_end_at || session?.scheduled_start_at;
  const raw = start instanceof Date ? start.toISOString() : String(start || '').replace(' ', 'T');
  const instant = raw ? new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`).getTime() : NaN;
  return !Number.isFinite(instant) || instant <= new Date(now).getTime();
}

export function encounterNeedsNote(row) {
  return row?.display_state === 'past' && !['signed'].includes(String(row?.note_status || '').toLowerCase());
}

export function encounterScheduleLabel(row) {
  if (row?.display_state === 'planned') return 'Upcoming appointment';
  if (row?.display_state === 'today') return 'Scheduled today · attendance not recorded';
  if (row?.display_state === 'not_held') return 'Canceled / missed appointment';
  if (['completed', 'complete', 'attended', 'occurred'].includes(String(row?.appointment_status || '').toLowerCase())) return 'Attendance recorded';
  if (row?.source !== 'signed_note' && !row?.clinical_note_id && !row?.billing_attached) return 'Past appointment · attendance not confirmed';
  return '';
}

export function noteStatusLabel(row) {
  const s = String(row?.note_status || 'none');
  if (s === 'signed') return 'Signed';
  if (s === 'draft') return 'Draft';
  if (s === 'planned' || String(row?.display_state || '') === 'planned') return 'Planned';
  return 'Note not started';
}

export function noteActionLabel(row) {
  const s = String(row?.note_status || 'none');
  if (s === 'signed' || s === 'draft') return 'Open note';
  if (s === 'planned' || String(row?.display_state || '') === 'planned') return 'Prepare note';
  return 'Start note';
}

export function noteStatusClass(row) {
  const planned = String(row?.note_status || '') === 'planned'
    || String(row?.display_state || '') === 'planned';
  if (planned && String(row?.note_status || '') !== 'signed' && String(row?.note_status || '') !== 'draft') {
    return 'cc-enc-note-pill--planned';
  }
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
