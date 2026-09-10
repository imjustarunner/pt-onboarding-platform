/**
 * Merge billing encounters, clinical sessions, office appointments, and
 * signed clinical notes into one medical-record timeline. Same client + date +
 * service code collapse to a single row so billing import attaches instead of
 * duplicating. Signed notes without a session appear as documentation rows.
 */

function ymd(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function codeKey(code) {
  return String(code || '').trim().toUpperCase();
}

function dateCodeKey(clientId, date, code) {
  return `dc:${Number(clientId) || 0}:${ymd(date)}:${codeKey(code)}`;
}

function startOfTodayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function displayStateForDate(date) {
  const d = ymd(date);
  if (!d) return 'past';
  return d >= startOfTodayYmd() ? 'planned' : 'past';
}

function applyDisplayState(row) {
  if (!row) return row;
  row.display_state = displayStateForDate(row.service_date || row.start_at);
  if (row.display_state === 'planned' && !row.note_status) {
    row.note_status = 'planned';
  }
  return row;
}

/**
 * @param {{
 *   billing?: Array<object>,
 *   sessions?: Array<object>,
 *   officeEvents?: Array<object>,
 *   appointments?: Array<object>,
 *   scheduleEvents?: Array<object>,
 *   signedNotes?: Array<object>,
 *   claims?: Array<object>
 * }} sources
 * @returns {Array<object>}
 */
export function mergeMedicalRecordSources({
  billing = [],
  sessions = [],
  officeEvents = [],
  appointments = [],
  scheduleEvents = [],
  signedNotes = [],
  claims = []
} = {}) {
  const byKey = new Map();

  const rememberAliases = (row, aliases) => {
    for (const a of aliases) {
      if (a) byKey.set(a, row);
    }
  };

  for (const be of billing || []) {
    const id = Number(be.id || 0);
    if (!id) continue;
    const cs = Number(be.clinical_session_id || 0);
    const date = ymd(be.service_date);
    const code = codeKey(be.service_code);
    const recordKey = `be:${id}`;
    const row = applyDisplayState({
      ...be,
      id,
      record_key: recordKey,
      billing_encounter_id: id,
      clinical_session_id: cs || null,
      office_event_id: Number(be.office_event_id || 0) || null,
      service_date: date || be.service_date,
      billing_attached: true,
      source: 'billing'
    });
    rememberAliases(row, [
      recordKey,
      cs ? `cs:${cs}` : null,
      date && code ? dateCodeKey(be.client_id, date, code) : null
    ]);
  }

  for (const cs of sessions || []) {
    const sid = Number(cs.id || 0);
    if (!sid) continue;
    const date = ymd(cs.scheduled_start_at);
    const code = codeKey(cs.service_code || cs.effective_service_code) || 'SESSION';
    const beId = Number(cs.billing_encounter_id || 0);
    const oeId = Number(cs.office_event_id || 0);
    const existing = byKey.get(`cs:${sid}`)
      || (beId ? byKey.get(`be:${beId}`) : null)
      || (date && code ? byKey.get(dateCodeKey(cs.client_id, date, code)) : null);
    if (existing) {
      existing.clinical_session_id = existing.clinical_session_id || sid;
      existing.office_event_id = existing.office_event_id || oeId || null;
      if (beId) existing.billing_encounter_id = existing.billing_encounter_id || beId;
      if (existing.billing_encounter_id) existing.billing_attached = true;
      applyDisplayState(existing);
      byKey.set(`cs:${sid}`, existing);
      if (oeId) byKey.set(`oe:${oeId}`, existing);
      continue;
    }
    if (!date) continue;
    const recordKey = `cs:${sid}`;
    const row = applyDisplayState({
      id: sid,
      record_key: recordKey,
      billing_encounter_id: beId || null,
      clinical_session_id: sid,
      office_event_id: oeId || null,
      agency_id: cs.agency_id,
      client_id: cs.client_id,
      provider_user_id: cs.provider_user_id || cs.rendering_provider_user_id || null,
      provider_first_name: cs.provider_first_name || null,
      provider_last_name: cs.provider_last_name || null,
      service_date: date,
      service_code: code,
      place_of_service: cs.place_of_service || null,
      diagnosis_text: null,
      billing_attached: !!beId,
      source: 'session'
    });
    rememberAliases(row, [
      recordKey,
      oeId ? `oe:${oeId}` : null,
      dateCodeKey(cs.client_id, date, code)
    ]);
  }

  for (const oe of officeEvents || []) {
    const eid = Number(oe.id || oe.office_event_id || 0);
    if (!eid) continue;
    const date = ymd(oe.start_at || oe.scheduled_start_at);
    const code = codeKey(oe.service_code) || 'SESSION';
    if (!date) continue;
    const csid = Number(oe.clinical_session_id || 0);
    const existing = byKey.get(`oe:${eid}`)
      || (csid ? byKey.get(`cs:${csid}`) : null)
      || byKey.get(dateCodeKey(oe.client_id, date, code));
    if (existing) {
      existing.office_event_id = existing.office_event_id || eid;
      existing.clinical_session_id = existing.clinical_session_id || csid || null;
      existing.provider_first_name = existing.provider_first_name || oe.provider_first_name || oe.first_name || null;
      existing.provider_last_name = existing.provider_last_name || oe.provider_last_name || oe.last_name || null;
      if (oe.recurrence_group_id || oe.booking_plan_id || oe.standing_assignment_id) {
        existing.is_recurring = true;
      }
      applyDisplayState(existing);
      byKey.set(`oe:${eid}`, existing);
      continue;
    }
    const recordKey = `oe:${eid}`;
    const row = applyDisplayState({
      id: eid,
      record_key: recordKey,
      billing_encounter_id: null,
      clinical_session_id: csid || null,
      office_event_id: eid,
      agency_id: oe.agency_id,
      client_id: oe.client_id,
      provider_user_id: oe.booked_provider_id || oe.assigned_provider_id || oe.provider_user_id || null,
      provider_first_name: oe.provider_first_name || oe.first_name || null,
      provider_last_name: oe.provider_last_name || oe.last_name || null,
      service_date: date,
      service_code: code,
      place_of_service: null,
      diagnosis_text: null,
      billing_attached: false,
      is_recurring: !!(oe.recurrence_group_id || oe.booking_plan_id || oe.standing_assignment_id),
      source: 'appointment'
    });
    rememberAliases(row, [recordKey, csid ? `cs:${csid}` : null, dateCodeKey(oe.client_id, date, code)]);
  }

  for (const appt of appointments || []) {
    const aid = Number(appt.id || 0);
    if (!aid) continue;
    const date = ymd(appt.start_at);
    const code = codeKey(appt.service_code) || 'SESSION';
    if (!date) continue;
    const oeId = Number(appt.office_event_id || 0);
    const csId = Number(appt.clinical_session_id || 0);
    const pseId = Number(appt.provider_schedule_event_id || 0);
    const existing = (oeId ? byKey.get(`oe:${oeId}`) : null)
      || (csId ? byKey.get(`cs:${csId}`) : null)
      || (pseId ? byKey.get(`pse:${pseId}`) : null)
      || byKey.get(dateCodeKey(appt.client_id, date, code));
    if (existing) {
      existing.appointment_id = existing.appointment_id || aid;
      existing.office_event_id = existing.office_event_id || oeId || null;
      existing.clinical_session_id = existing.clinical_session_id || csId || null;
      existing.provider_schedule_event_id = existing.provider_schedule_event_id || pseId || null;
      existing.provider_first_name = existing.provider_first_name || appt.provider_first_name || null;
      existing.provider_last_name = existing.provider_last_name || appt.provider_last_name || null;
      if (!existing.service_code || existing.service_code === 'SESSION') {
        existing.service_code = code;
      }
      applyDisplayState(existing);
      byKey.set(`appt:${aid}`, existing);
      continue;
    }
    const recordKey = `appt:${aid}`;
    const row = applyDisplayState({
      id: aid,
      record_key: recordKey,
      appointment_id: aid,
      billing_encounter_id: null,
      clinical_session_id: csId || null,
      office_event_id: oeId || null,
      provider_schedule_event_id: pseId || null,
      agency_id: appt.agency_id,
      client_id: appt.client_id,
      provider_user_id: appt.provider_user_id || null,
      provider_first_name: appt.provider_first_name || null,
      provider_last_name: appt.provider_last_name || null,
      service_date: date,
      service_code: code,
      place_of_service: null,
      diagnosis_text: null,
      billing_attached: false,
      source: 'appointment'
    });
    rememberAliases(row, [
      recordKey,
      oeId ? `oe:${oeId}` : null,
      csId ? `cs:${csId}` : null,
      pseId ? `pse:${pseId}` : null,
      dateCodeKey(appt.client_id, date, code)
    ]);
  }

  for (const pse of scheduleEvents || []) {
    const pid = Number(pse.id || 0);
    if (!pid) continue;
    const date = ymd(pse.start_at);
    if (!date) continue;
    const code = codeKey(pse.service_code) || 'SESSION';
    let existing = byKey.get(`pse:${pid}`)
      || byKey.get(dateCodeKey(pse.client_id, date, code));
    // Virtual schedule rows often lack a service code — attach to same-day appointment.
    if (!existing && (!pse.service_code || code === 'SESSION')) {
      for (const row of byKey.values()) {
        if (
          Number(row.client_id) === Number(pse.client_id)
          && ymd(row.service_date) === date
          && (row.appointment_id || row.source === 'appointment' || row.source === 'schedule_event')
        ) {
          existing = row;
          break;
        }
      }
    }
    if (existing) {
      existing.provider_schedule_event_id = existing.provider_schedule_event_id || pid;
      existing.provider_first_name = existing.provider_first_name || pse.provider_first_name || null;
      existing.provider_last_name = existing.provider_last_name || pse.provider_last_name || null;
      if (!existing.service_code || existing.service_code === 'SESSION') {
        existing.service_code = code !== 'SESSION' ? code : existing.service_code;
      }
      applyDisplayState(existing);
      byKey.set(`pse:${pid}`, existing);
      continue;
    }
    const recordKey = `pse:${pid}`;
    const row = applyDisplayState({
      id: pid,
      record_key: recordKey,
      provider_schedule_event_id: pid,
      billing_encounter_id: null,
      clinical_session_id: null,
      office_event_id: null,
      agency_id: pse.agency_id,
      client_id: pse.client_id,
      provider_user_id: pse.provider_user_id || null,
      provider_first_name: pse.provider_first_name || null,
      provider_last_name: pse.provider_last_name || null,
      service_date: date,
      service_code: code,
      place_of_service: null,
      diagnosis_text: null,
      billing_attached: false,
      title: pse.title || null,
      source: 'schedule_event'
    });
    rememberAliases(row, [recordKey, dateCodeKey(pse.client_id, date, code)]);
  }

  for (const note of signedNotes || []) {
    const nid = Number(note.id || 0);
    if (!nid || !note.provider_signed_at) continue;
    const sid = Number(note.clinical_session_id || 0);
    const date = ymd(note.service_date || note.provider_signed_at || note.created_at);
    const code = codeKey(note.service_code || note.session_service_code || note.note_type) || 'DOC';
    if (sid) {
      const existing = byKey.get(`cs:${sid}`);
      if (existing) {
        existing.clinical_note_id = nid;
        existing.note_status = 'signed';
        existing.note_title = note.title || existing.note_title || null;
        existing.provider_signed_at = note.provider_signed_at;
        applyDisplayState(existing);
        byKey.set(`cn:${nid}`, existing);
        continue;
      }
    }
    if (!date) continue;
    const dc = dateCodeKey(note.client_id, date, code);
    const existingDc = code !== 'DOC' ? byKey.get(dc) : null;
    if (existingDc && !existingDc.clinical_note_id) {
      existingDc.clinical_note_id = nid;
      existingDc.note_status = 'signed';
      existingDc.note_title = note.title || null;
      existingDc.provider_signed_at = note.provider_signed_at;
      applyDisplayState(existingDc);
      byKey.set(`cn:${nid}`, existingDc);
      continue;
    }
    const recordKey = `cn:${nid}`;
    const row = applyDisplayState({
      id: nid,
      record_key: recordKey,
      billing_encounter_id: null,
      clinical_session_id: sid || null,
      clinical_note_id: nid,
      office_event_id: null,
      agency_id: note.agency_id,
      client_id: note.client_id,
      provider_user_id: note.provider_signed_by_user_id || note.created_by_user_id || null,
      provider_first_name: note.provider_first_name || null,
      provider_last_name: note.provider_last_name || null,
      service_date: date,
      service_code: code,
      place_of_service: null,
      diagnosis_text: null,
      billing_attached: false,
      note_status: 'signed',
      note_title: note.title || null,
      provider_signed_at: note.provider_signed_at,
      source: 'signed_note'
    });
    rememberAliases(row, [recordKey, sid ? `cs:${sid}` : null]);
  }

  for (const claim of claims || []) {
    const claimId = Number(claim.id || 0);
    if (!claimId) continue;
    const sid = Number(claim.clinical_session_id || 0);
    const noteId = Number(claim.clinical_note_id || 0);
    const existing = (sid ? byKey.get(`cs:${sid}`) : null)
      || (noteId ? byKey.get(`cn:${noteId}`) : null);
    if (existing) {
      existing.billing_attached = true;
      existing.clinical_claim_id = existing.clinical_claim_id || claimId;
    }
  }

  const unique = [];
  const seen = new Set();
  for (const row of byKey.values()) {
    const k = row.record_key;
    if (seen.has(k)) continue;
    seen.add(k);
    applyDisplayState(row);
    unique.push(row);
  }
  unique.sort((a, b) => String(b.service_date || '').localeCompare(String(a.service_date || '')));
  return unique;
}

export default { mergeMedicalRecordSources };
