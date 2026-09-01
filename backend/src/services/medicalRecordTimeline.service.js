/**
 * Merge billing encounters, clinical sessions, and office appointments
 * into one medical-record timeline. Same client + date + service code
 * collapse to a single row so billing import attaches instead of duplicating.
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

/**
 * @param {{
 *   billing?: Array<object>,
 *   sessions?: Array<object>,
 *   officeEvents?: Array<object>
 * }} sources
 * @returns {Array<object>}
 */
export function mergeMedicalRecordSources({ billing = [], sessions = [], officeEvents = [] } = {}) {
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
    const row = {
      ...be,
      id,
      record_key: recordKey,
      billing_encounter_id: id,
      clinical_session_id: cs || null,
      office_event_id: Number(be.office_event_id || 0) || null,
      service_date: date || be.service_date,
      billing_attached: true,
      source: 'billing'
    };
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
    const code = codeKey(cs.service_code || cs.effective_service_code);
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
      byKey.set(`cs:${sid}`, existing);
      if (oeId) byKey.set(`oe:${oeId}`, existing);
      continue;
    }
    if (!date || !code) continue;
    const recordKey = `cs:${sid}`;
    const row = {
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
    };
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
    const code = codeKey(oe.service_code);
    if (!date || !code) continue;
    const csid = Number(oe.clinical_session_id || 0);
    const existing = byKey.get(`oe:${eid}`)
      || (csid ? byKey.get(`cs:${csid}`) : null)
      || byKey.get(dateCodeKey(oe.client_id, date, code));
    if (existing) {
      existing.office_event_id = existing.office_event_id || eid;
      existing.clinical_session_id = existing.clinical_session_id || csid || null;
      existing.provider_first_name = existing.provider_first_name || oe.provider_first_name || oe.first_name || null;
      existing.provider_last_name = existing.provider_last_name || oe.provider_last_name || oe.last_name || null;
      byKey.set(`oe:${eid}`, existing);
      continue;
    }
    const recordKey = `oe:${eid}`;
    const row = {
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
      source: 'appointment'
    };
    rememberAliases(row, [recordKey, csid ? `cs:${csid}` : null, dateCodeKey(oe.client_id, date, code)]);
  }

  const unique = [];
  const seen = new Set();
  for (const row of byKey.values()) {
    const k = row.record_key;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(row);
  }
  unique.sort((a, b) => String(b.service_date || '').localeCompare(String(a.service_date || '')));
  return unique;
}

export default { mergeMedicalRecordSources };
