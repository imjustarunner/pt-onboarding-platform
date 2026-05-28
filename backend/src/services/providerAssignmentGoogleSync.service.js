import pool from '../config/database.js';
import GoogleCalendarService from './googleCalendar.service.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';

const SYNCABLE_OFFICE_SLOT_STATES = ['ASSIGNED_BOOKED', 'ASSIGNED_AVAILABLE'];

export async function syncOfficeEventToGoogleBestEffort(officeEventId) {
  try {
    return await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId });
  } catch {
    return { ok: false, reason: 'exception' };
  }
}

export async function cancelOfficeEventGoogleBestEffort(officeEventId) {
  try {
    return await GoogleCalendarService.cancelBookedOfficeEvent({ officeEventId });
  } catch {
    return { ok: false, reason: 'exception' };
  }
}

export async function syncCompanySessionProviderBestEffort(sessionProviderId) {
  try {
    return await GoogleCalendarService.upsertCompanyEventSessionProviderGoogle({ sessionProviderId });
  } catch {
    return { ok: false, reason: 'exception' };
  }
}

export async function cancelCompanySessionProviderBestEffort(sessionProviderId) {
  try {
    return await GoogleCalendarService.cancelCompanyEventSessionProviderGoogle({ sessionProviderId });
  } catch {
    return { ok: false, reason: 'exception' };
  }
}

export async function syncSkillBuildersSessionProviderBestEffort(sessionProviderId) {
  try {
    return await GoogleCalendarService.upsertSkillBuildersSessionProviderGoogle({ sessionProviderId });
  } catch {
    return { ok: false, reason: 'exception' };
  }
}

export async function cancelSkillBuildersSessionProviderBestEffort(sessionProviderId) {
  try {
    return await GoogleCalendarService.cancelSkillBuildersSessionProviderGoogle({ sessionProviderId });
  } catch {
    return { ok: false, reason: 'exception' };
  }
}

export async function syncOfficeEventsToGoogleBestEffort(officeEventIds = []) {
  const ids = (Array.isArray(officeEventIds) ? officeEventIds : [])
    .map((id) => Number(id || 0))
    .filter((n) => Number.isInteger(n) && n > 0);
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    await syncOfficeEventToGoogleBestEffort(id);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}

export async function syncCompanySessionProvidersForSessionDateBestEffort(sessionDateId) {
  const sdId = Number(sessionDateId || 0);
  if (!sdId) return;
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM company_event_session_providers WHERE session_date_id = ?`,
      [sdId]
    );
    for (const row of rows || []) {
      // eslint-disable-next-line no-await-in-loop
      await syncCompanySessionProviderBestEffort(Number(row.id));
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return;
    throw e;
  }
}

export async function cancelCompanySessionProvidersBeforeDelete({ companyEventId, agencyId, sessionDateId, providerUserId }) {
  try {
    const [rows] = await pool.execute(
      `SELECT id
       FROM company_event_session_providers
       WHERE company_event_id = ? AND agency_id = ? AND session_date_id = ? AND provider_user_id = ?`,
      [companyEventId, agencyId, sessionDateId, providerUserId]
    );
    for (const row of rows || []) {
      // eslint-disable-next-line no-await-in-loop
      await cancelCompanySessionProviderBestEffort(Number(row.id));
    }
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return;
    throw e;
  }
}

export async function cancelSkillBuildersSessionProvidersForSessionBestEffort(sessionId) {
  const sid = Number(sessionId || 0);
  if (!sid) return;
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM skill_builders_event_session_providers WHERE session_id = ?`,
      [sid]
    );
    for (const row of rows || []) {
      // eslint-disable-next-line no-await-in-loop
      await cancelSkillBuildersSessionProviderBestEffort(Number(row.id));
    }
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return;
    throw e;
  }
}

export async function resyncSkillBuildersSessionProvidersBestEffort(sessionId) {
  const sid = Number(sessionId || 0);
  if (!sid) return;
  try {
    const [newRows] = await pool.execute(
      `SELECT id FROM skill_builders_event_session_providers WHERE session_id = ?`,
      [sid]
    );
    for (const row of newRows || []) {
      // eslint-disable-next-line no-await-in-loop
      await syncSkillBuildersSessionProviderBestEffort(Number(row.id));
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return;
    throw e;
  }
}

export async function syncCompanySessionProviderBySlotBestEffort({ sessionDateId, providerUserId }) {
  const sdId = Number(sessionDateId || 0);
  const uid = Number(providerUserId || 0);
  if (!sdId || !uid) return;
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM company_event_session_providers
       WHERE session_date_id = ? AND provider_user_id = ?
       LIMIT 1`,
      [sdId, uid]
    );
    if (rows?.[0]?.id) {
      await syncCompanySessionProviderBestEffort(Number(rows[0].id));
    }
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return;
    throw e;
  }
}

export async function cancelCompanySessionProvidersForEventBestEffort({ companyEventId, agencyId, providerUserId }) {
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM company_event_session_providers
       WHERE company_event_id = ? AND agency_id = ? AND provider_user_id = ?`,
      [companyEventId, agencyId, providerUserId]
    );
    for (const row of rows || []) {
      // eslint-disable-next-line no-await-in-loop
      await cancelCompanySessionProviderBestEffort(Number(row.id));
    }
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return;
    throw e;
  }
}

export async function syncCompanySessionProvidersBestEffort(sessionProviderIds = []) {
  const ids = (Array.isArray(sessionProviderIds) ? sessionProviderIds : [])
    .map((id) => Number(id || 0))
    .filter((n) => n > 0);
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    await syncCompanySessionProviderBestEffort(id);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}

export async function retryFailedProviderAssignmentGoogleSync({ horizonDays = 28 } = {}) {
  if (!GoogleCalendarService.isConfigured()) {
    return { ok: false, reason: 'google_calendar_not_configured' };
  }

  const today = new Date().toISOString().slice(0, 10);
  const end = OfficeScheduleMaterializer.addDays(today, Number(horizonDays || 28));
  const startAt = `${today} 00:00:00`;
  const endAt = `${end} 23:59:59`;

  const slotPlaceholders = SYNCABLE_OFFICE_SLOT_STATES.map(() => '?').join(',');
  let officeIds = [];
  let companyIds = [];
  let skillBuilderIds = [];

  try {
    const [officeRows] = await pool.execute(
      `SELECT id
       FROM office_events
       WHERE slot_state IN (${slotPlaceholders})
         AND (status IS NULL OR UPPER(status) <> 'CANCELLED')
         AND start_at >= ?
         AND start_at <= ?
         AND (
           (slot_state = 'ASSIGNED_BOOKED' AND booked_provider_id IS NOT NULL)
           OR (slot_state = 'ASSIGNED_AVAILABLE' AND assigned_provider_id IS NOT NULL)
         )
         AND (google_provider_event_id IS NULL OR google_sync_status = 'FAILED')`,
      [...SYNCABLE_OFFICE_SLOT_STATES, startAt, endAt]
    );
    officeIds = (officeRows || []).map((r) => Number(r.id)).filter((n) => n > 0);
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  try {
    const [companyRows] = await pool.execute(
      `SELECT cesp.id
       FROM company_event_session_providers cesp
       INNER JOIN company_event_session_dates cesd ON cesd.id = cesp.session_date_id
       WHERE (
         (cesd.starts_at IS NOT NULL AND cesd.starts_at >= ? AND cesd.starts_at <= ?)
         OR (cesd.starts_at IS NULL AND cesd.session_date >= ? AND cesd.session_date <= ?)
       )
         AND (cesp.google_provider_event_id IS NULL OR cesp.google_sync_status = 'FAILED')`,
      [startAt, endAt, today, end]
    );
    companyIds = (companyRows || []).map((r) => Number(r.id)).filter((n) => n > 0);
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  try {
    const [sbRows] = await pool.execute(
      `SELECT sbesp.id
       FROM skill_builders_event_session_providers sbesp
       INNER JOIN skill_builders_event_sessions s ON s.id = sbesp.session_id
       WHERE s.starts_at >= ? AND s.starts_at <= ?
         AND (sbesp.google_provider_event_id IS NULL OR sbesp.google_sync_status = 'FAILED')`,
      [startAt, endAt]
    );
    skillBuilderIds = (sbRows || []).map((r) => Number(r.id)).filter((n) => n > 0);
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  let synced = 0;
  let failed = 0;

  for (const id of officeIds) {
    // eslint-disable-next-line no-await-in-loop
    const r = await syncOfficeEventToGoogleBestEffort(id);
    if (r?.ok) synced += 1;
    else failed += 1;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  for (const id of companyIds) {
    // eslint-disable-next-line no-await-in-loop
    const r = await syncCompanySessionProviderBestEffort(id);
    if (r?.ok) synced += 1;
    else failed += 1;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  for (const id of skillBuilderIds) {
    // eslint-disable-next-line no-await-in-loop
    const r = await syncSkillBuildersSessionProviderBestEffort(id);
    if (r?.ok) synced += 1;
    else failed += 1;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return {
    ok: true,
    horizonDays: Number(horizonDays || 28),
    candidates: officeIds.length + companyIds.length + skillBuilderIds.length,
    officeCandidates: officeIds.length,
    companyCandidates: companyIds.length,
    skillBuilderCandidates: skillBuilderIds.length,
    synced,
    failed
  };
}
