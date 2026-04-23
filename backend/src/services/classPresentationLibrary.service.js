import pool from '../config/database.js';

function parsePositiveInt(raw) {
  const value = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function cleanText(raw, maxLength = 65535) {
  if (raw == null) return '';
  return String(raw).trim().slice(0, maxLength);
}

function cleanNullableText(raw, maxLength = 65535) {
  const value = cleanText(raw, maxLength);
  return value || null;
}

function parseJsonObject(raw, fallback = null) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function mapAttachedEventRow(row) {
  const eventId = parsePositiveInt(row.attached_company_event_id);
  if (!eventId) return null;
  return {
    eventId,
    eventTitle: cleanText(row.attached_event_title, 255) || `Event ${eventId}`,
    createdAt: row.attachment_created_at || null,
    updatedAt: row.attachment_updated_at || null
  };
}

function mapSessionRowBase(row) {
  return {
    id: parsePositiveInt(row.session_id ?? row.id),
    seriesId: parsePositiveInt(row.series_id),
    title: cleanText(row.session_title ?? row.title, 255) || 'Untitled session',
    summary: cleanText(row.session_summary ?? row.summary),
    eventLabel: cleanText(row.event_label, 255),
    positionIndex: Number.isFinite(Number(row.position_index)) ? Number(row.position_index) : 0,
    plan: parseJsonObject(row.plan_json, {}) || {},
    createdAt: row.session_created_at || row.created_at || null,
    updatedAt: row.session_updated_at || row.updated_at || null,
    attachedEvents: []
  };
}

function deriveSessionEventLabel(session) {
  const explicit = cleanText(session.eventLabel, 255);
  if (explicit) return explicit;
  if (!Array.isArray(session.attachedEvents) || !session.attachedEvents.length) return '';
  if (session.attachedEvents.length === 1) {
    return session.attachedEvents[0].eventTitle || `Attached to event ${session.attachedEvents[0].eventId}`;
  }
  return `Attached to ${session.attachedEvents.length} events`;
}

function mapSeriesRowBase(row) {
  return {
    id: parsePositiveInt(row.series_id ?? row.id),
    title: cleanText(row.series_title ?? row.title, 255) || 'Untitled class series',
    summary: cleanText(row.series_summary ?? row.summary),
    createdAt: row.series_created_at || row.created_at || null,
    updatedAt: row.series_updated_at || row.updated_at || null,
    sessions: []
  };
}

function groupLibraryRows(rows = []) {
  const seriesMap = new Map();
  for (const row of rows) {
    const seriesId = parsePositiveInt(row.series_id ?? row.id);
    if (!seriesId) continue;
    let series = seriesMap.get(seriesId);
    if (!series) {
      series = mapSeriesRowBase(row);
      seriesMap.set(seriesId, series);
    }

    const sessionId = parsePositiveInt(row.session_id);
    if (!sessionId) continue;
    let session = series.sessions.find((item) => item.id === sessionId);
    if (!session) {
      session = mapSessionRowBase(row);
      series.sessions.push(session);
    }

    const attachedEvent = mapAttachedEventRow(row);
    if (attachedEvent && !session.attachedEvents.some((item) => item.eventId === attachedEvent.eventId)) {
      session.attachedEvents.push(attachedEvent);
    }
  }

  return [...seriesMap.values()].map((series) => ({
    ...series,
    sessions: series.sessions
      .sort((left, right) => left.positionIndex - right.positionIndex || left.id - right.id)
      .map((session) => ({
        ...session,
        eventLabel: deriveSessionEventLabel(session)
      }))
  }));
}

function normalizeSeriesInput(input = {}) {
  return {
    title: cleanText(input.title, 255) || 'Untitled class series',
    summary: cleanText(input.summary)
  };
}

function normalizeSessionInput(input = {}) {
  const positionIndex = Number.parseInt(String(input.positionIndex ?? input.position ?? ''), 10);
  return {
    title: cleanText(input.title, 255) || 'Untitled session',
    summary: cleanText(input.summary),
    eventLabel: cleanNullableText(input.eventLabel, 255),
    positionIndex: Number.isFinite(positionIndex) ? positionIndex : null,
    planJson: JSON.stringify(input.plan && typeof input.plan === 'object' ? input.plan : {})
  };
}

async function loadSeriesRow(conn, seriesId, agencyId, programOrganizationId) {
  const [rows] = await conn.execute(
    `SELECT *
       FROM skill_builders_class_presentation_series
      WHERE id = ? AND agency_id = ? AND program_organization_id = ?
      LIMIT 1`,
    [seriesId, agencyId, programOrganizationId]
  );
  return rows?.[0] || null;
}

async function loadSessionRow(conn, sessionId, agencyId, programOrganizationId) {
  const [rows] = await conn.execute(
    `SELECT s.*, ser.title AS series_title
       FROM skill_builders_class_presentation_sessions s
       INNER JOIN skill_builders_class_presentation_series ser ON ser.id = s.series_id
      WHERE s.id = ? AND s.agency_id = ? AND s.program_organization_id = ?
      LIMIT 1`,
    [sessionId, agencyId, programOrganizationId]
  );
  return rows?.[0] || null;
}

async function nextSessionPositionIndex(conn, seriesId) {
  const [rows] = await conn.execute(
    `SELECT COALESCE(MAX(position_index), -1) AS max_position
       FROM skill_builders_class_presentation_sessions
      WHERE series_id = ?`,
    [seriesId]
  );
  const maxPosition = Number(rows?.[0]?.max_position);
  return Number.isFinite(maxPosition) ? maxPosition + 1 : 0;
}

export async function listClassPresentationSeriesLibrary({
  agencyId,
  programOrganizationId
}) {
  const aid = parsePositiveInt(agencyId);
  const progId = parsePositiveInt(programOrganizationId);
  if (!aid || !progId) return [];

  const [rows] = await pool.execute(
    `SELECT
       ser.id AS series_id,
       ser.title AS series_title,
       ser.summary AS series_summary,
       ser.created_at AS series_created_at,
       ser.updated_at AS series_updated_at,
       sess.id AS session_id,
       sess.series_id,
       sess.title AS session_title,
       sess.summary AS session_summary,
       sess.event_label,
       sess.position_index,
       sess.plan_json,
       sess.created_at AS session_created_at,
       sess.updated_at AS session_updated_at,
       att.company_event_id AS attached_company_event_id,
       ce.title AS attached_event_title,
       att.created_at AS attachment_created_at,
       att.updated_at AS attachment_updated_at
     FROM skill_builders_class_presentation_series ser
     LEFT JOIN skill_builders_class_presentation_sessions sess
       ON sess.series_id = ser.id
     LEFT JOIN skill_builders_class_presentation_event_sessions att
       ON att.presentation_session_id = sess.id
     LEFT JOIN company_events ce
       ON ce.id = att.company_event_id
     WHERE ser.agency_id = ?
       AND ser.program_organization_id = ?
     ORDER BY ser.updated_at DESC, ser.id DESC, sess.position_index ASC, sess.id ASC, att.updated_at DESC, att.id DESC`,
    [aid, progId]
  );

  return groupLibraryRows(rows);
}

export async function createClassPresentationSeriesRecord({
  agencyId,
  programOrganizationId,
  createdByUserId,
  series = {}
}) {
  const aid = parsePositiveInt(agencyId);
  const progId = parsePositiveInt(programOrganizationId);
  const uid = parsePositiveInt(createdByUserId);
  if (!aid || !progId) throw new Error('agencyId and programOrganizationId are required');

  const normalizedSeries = normalizeSeriesInput(series);
  const sessions = Array.isArray(series.sessions) ? series.sessions : [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [insertSeries] = await conn.execute(
      `INSERT INTO skill_builders_class_presentation_series
         (agency_id, program_organization_id, title, summary, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [aid, progId, normalizedSeries.title, normalizedSeries.summary || null, uid, uid]
    );
    const seriesId = Number(insertSeries.insertId);

    for (let index = 0; index < sessions.length; index += 1) {
      const normalizedSession = normalizeSessionInput({
        ...sessions[index],
        positionIndex: sessions[index]?.positionIndex ?? index
      });
      await conn.execute(
        `INSERT INTO skill_builders_class_presentation_sessions
           (series_id, agency_id, program_organization_id, title, summary, event_label, position_index, plan_json, created_by_user_id, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          seriesId,
          aid,
          progId,
          normalizedSession.title,
          normalizedSession.summary || null,
          normalizedSession.eventLabel,
          normalizedSession.positionIndex ?? index,
          normalizedSession.planJson,
          uid,
          uid
        ]
      );
    }

    await conn.commit();
    return seriesId;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateClassPresentationSeriesRecord({
  agencyId,
  programOrganizationId,
  seriesId,
  updatedByUserId,
  updates = {}
}) {
  const aid = parsePositiveInt(agencyId);
  const progId = parsePositiveInt(programOrganizationId);
  const sid = parsePositiveInt(seriesId);
  const uid = parsePositiveInt(updatedByUserId);
  if (!aid || !progId || !sid) throw new Error('agencyId, programOrganizationId, and seriesId are required');

  const normalized = normalizeSeriesInput(updates);
  const [result] = await pool.execute(
    `UPDATE skill_builders_class_presentation_series
        SET title = ?, summary = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND agency_id = ? AND program_organization_id = ?`,
    [normalized.title, normalized.summary || null, uid, sid, aid, progId]
  );
  return result?.affectedRows > 0;
}

export async function deleteClassPresentationSeriesRecord({
  agencyId,
  programOrganizationId,
  seriesId
}) {
  const aid = parsePositiveInt(agencyId);
  const progId = parsePositiveInt(programOrganizationId);
  const sid = parsePositiveInt(seriesId);
  if (!aid || !progId || !sid) throw new Error('agencyId, programOrganizationId, and seriesId are required');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [sessionRows] = await conn.execute(
      `SELECT id FROM skill_builders_class_presentation_sessions
        WHERE series_id = ? AND agency_id = ? AND program_organization_id = ?`,
      [sid, aid, progId]
    );
    const sessionIds = (sessionRows || []).map((row) => Number(row.id)).filter(Boolean);
    if (sessionIds.length) {
      const placeholders = sessionIds.map(() => '?').join(', ');
      await conn.execute(
        `DELETE FROM skill_builders_class_presentation_event_sessions
          WHERE presentation_session_id IN (${placeholders})`,
        sessionIds
      );
      await conn.execute(
        `DELETE FROM skill_builders_class_presentation_sessions
          WHERE id IN (${placeholders})`,
        sessionIds
      );
    }
    const [result] = await conn.execute(
      `DELETE FROM skill_builders_class_presentation_series
        WHERE id = ? AND agency_id = ? AND program_organization_id = ?`,
      [sid, aid, progId]
    );
    await conn.commit();
    return result?.affectedRows > 0;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function duplicateClassPresentationSeriesRecord({
  agencyId,
  programOrganizationId,
  seriesId,
  userId
}) {
  const aid = parsePositiveInt(agencyId);
  const progId = parsePositiveInt(programOrganizationId);
  const sid = parsePositiveInt(seriesId);
  const uid = parsePositiveInt(userId);
  if (!aid || !progId || !sid) throw new Error('agencyId, programOrganizationId, and seriesId are required');

  const conn = await pool.getConnection();
  try {
    const seriesRow = await loadSeriesRow(conn, sid, aid, progId);
    if (!seriesRow) return null;
    const [sessions] = await conn.execute(
      `SELECT *
         FROM skill_builders_class_presentation_sessions
        WHERE series_id = ?
        ORDER BY position_index ASC, id ASC`,
      [sid]
    );
    return createClassPresentationSeriesRecord({
      agencyId: aid,
      programOrganizationId: progId,
      createdByUserId: uid,
      series: {
        title: `${cleanText(seriesRow.title, 240)} Copy`,
        summary: cleanText(seriesRow.summary),
        sessions: (sessions || []).map((row) => ({
          title: cleanText(row.title, 255),
          summary: cleanText(row.summary),
          eventLabel: cleanText(row.event_label, 255),
          positionIndex: Number(row.position_index) || 0,
          plan: parseJsonObject(row.plan_json, {})
        }))
      }
    });
  } finally {
    conn.release();
  }
}

export async function createClassPresentationSessionRecord({
  agencyId,
  programOrganizationId,
  seriesId,
  createdByUserId,
  session = {}
}) {
  const aid = parsePositiveInt(agencyId);
  const progId = parsePositiveInt(programOrganizationId);
  const sid = parsePositiveInt(seriesId);
  const uid = parsePositiveInt(createdByUserId);
  if (!aid || !progId || !sid) throw new Error('agencyId, programOrganizationId, and seriesId are required');

  const conn = await pool.getConnection();
  try {
    const seriesRow = await loadSeriesRow(conn, sid, aid, progId);
    if (!seriesRow) return null;
    const positionIndex =
      session.positionIndex != null ? Number(session.positionIndex) : await nextSessionPositionIndex(conn, sid);
    const normalized = normalizeSessionInput({ ...session, positionIndex });
    const [result] = await conn.execute(
      `INSERT INTO skill_builders_class_presentation_sessions
         (series_id, agency_id, program_organization_id, title, summary, event_label, position_index, plan_json, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sid,
        aid,
        progId,
        normalized.title,
        normalized.summary || null,
        normalized.eventLabel,
        normalized.positionIndex ?? 0,
        normalized.planJson,
        uid,
        uid
      ]
    );
    return Number(result.insertId);
  } finally {
    conn.release();
  }
}

export async function updateClassPresentationSessionRecord({
  agencyId,
  programOrganizationId,
  sessionId,
  updatedByUserId,
  updates = {}
}) {
  const aid = parsePositiveInt(agencyId);
  const progId = parsePositiveInt(programOrganizationId);
  const sessId = parsePositiveInt(sessionId);
  const uid = parsePositiveInt(updatedByUserId);
  if (!aid || !progId || !sessId) throw new Error('agencyId, programOrganizationId, and sessionId are required');

  const normalized = normalizeSessionInput(updates);
  const positionIndex =
    normalized.positionIndex != null ? normalized.positionIndex : Number.isFinite(Number(updates.positionIndex)) ? Number(updates.positionIndex) : 0;
  const [result] = await pool.execute(
    `UPDATE skill_builders_class_presentation_sessions
        SET title = ?, summary = ?, event_label = ?, position_index = ?, plan_json = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND agency_id = ? AND program_organization_id = ?`,
    [
      normalized.title,
      normalized.summary || null,
      normalized.eventLabel,
      positionIndex,
      normalized.planJson,
      uid,
      sessId,
      aid,
      progId
    ]
  );
  return result?.affectedRows > 0;
}

export async function deleteClassPresentationSessionRecord({
  agencyId,
  programOrganizationId,
  sessionId
}) {
  const aid = parsePositiveInt(agencyId);
  const progId = parsePositiveInt(programOrganizationId);
  const sessId = parsePositiveInt(sessionId);
  if (!aid || !progId || !sessId) throw new Error('agencyId, programOrganizationId, and sessionId are required');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `DELETE FROM skill_builders_class_presentation_event_sessions
        WHERE presentation_session_id = ?`,
      [sessId]
    );
    const [result] = await conn.execute(
      `DELETE FROM skill_builders_class_presentation_sessions
        WHERE id = ? AND agency_id = ? AND program_organization_id = ?`,
      [sessId, aid, progId]
    );
    await conn.commit();
    return result?.affectedRows > 0;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function duplicateClassPresentationSessionRecord({
  agencyId,
  programOrganizationId,
  sessionId,
  userId
}) {
  const aid = parsePositiveInt(agencyId);
  const progId = parsePositiveInt(programOrganizationId);
  const sessId = parsePositiveInt(sessionId);
  const uid = parsePositiveInt(userId);
  if (!aid || !progId || !sessId) throw new Error('agencyId, programOrganizationId, and sessionId are required');

  const conn = await pool.getConnection();
  try {
    const sessionRow = await loadSessionRow(conn, sessId, aid, progId);
    if (!sessionRow) return null;
    return createClassPresentationSessionRecord({
      agencyId: aid,
      programOrganizationId: progId,
      seriesId: sessionRow.series_id,
      createdByUserId: uid,
      session: {
        title: `${cleanText(sessionRow.title, 240)} Copy`,
        summary: cleanText(sessionRow.summary),
        eventLabel: cleanText(sessionRow.event_label, 255),
        plan: parseJsonObject(sessionRow.plan_json, {})
      }
    });
  } finally {
    conn.release();
  }
}

export async function getClassPresentationSessionRecord({
  agencyId,
  programOrganizationId,
  sessionId
}) {
  const aid = parsePositiveInt(agencyId);
  const progId = parsePositiveInt(programOrganizationId);
  const sessId = parsePositiveInt(sessionId);
  if (!aid || !progId || !sessId) return null;

  const [rows] = await pool.execute(
    `SELECT
       ser.id AS series_id,
       ser.title AS series_title,
       ser.summary AS series_summary,
       ser.created_at AS series_created_at,
       ser.updated_at AS series_updated_at,
       sess.id AS session_id,
       sess.series_id,
       sess.title AS session_title,
       sess.summary AS session_summary,
       sess.event_label,
       sess.position_index,
       sess.plan_json,
       sess.created_at AS session_created_at,
       sess.updated_at AS session_updated_at,
       att.company_event_id AS attached_company_event_id,
       ce.title AS attached_event_title,
       att.created_at AS attachment_created_at,
       att.updated_at AS attachment_updated_at
     FROM skill_builders_class_presentation_sessions sess
     INNER JOIN skill_builders_class_presentation_series ser
       ON ser.id = sess.series_id
     LEFT JOIN skill_builders_class_presentation_event_sessions att
       ON att.presentation_session_id = sess.id
     LEFT JOIN company_events ce
       ON ce.id = att.company_event_id
     WHERE sess.id = ?
       AND sess.agency_id = ?
       AND sess.program_organization_id = ?
     ORDER BY att.updated_at DESC, att.id DESC`,
    [sessId, aid, progId]
  );
  const grouped = groupLibraryRows(rows || []);
  const series = grouped[0] || null;
  const session = series?.sessions?.[0] || null;
  if (!series || !session) return null;
  return { series, session };
}

export async function attachClassPresentationSessionToEvent({
  agencyId,
  programOrganizationId,
  eventId,
  sessionId,
  userId
}) {
  const aid = parsePositiveInt(agencyId);
  const progId = parsePositiveInt(programOrganizationId);
  const eid = parsePositiveInt(eventId);
  const sessId = parsePositiveInt(sessionId);
  const uid = parsePositiveInt(userId);
  if (!aid || !progId || !eid || !sessId) {
    throw new Error('agencyId, programOrganizationId, eventId, and sessionId are required');
  }

  const conn = await pool.getConnection();
  try {
    const sessionRow = await loadSessionRow(conn, sessId, aid, progId);
    if (!sessionRow) return false;
    await conn.execute(
      `INSERT INTO skill_builders_class_presentation_event_sessions
         (agency_id, program_organization_id, company_event_id, presentation_series_id, presentation_session_id, attached_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         presentation_series_id = VALUES(presentation_series_id),
         presentation_session_id = VALUES(presentation_session_id),
         attached_by_user_id = VALUES(attached_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [aid, progId, eid, Number(sessionRow.series_id), sessId, uid]
    );
    return true;
  } finally {
    conn.release();
  }
}

export async function getClassPresentationForEvent({
  agencyId,
  programOrganizationId,
  eventId
}) {
  const aid = parsePositiveInt(agencyId);
  const progId = parsePositiveInt(programOrganizationId);
  const eid = parsePositiveInt(eventId);
  if (!aid || !progId || !eid) return null;

  const [rows] = await pool.execute(
    `SELECT
       ser.id AS series_id,
       ser.title AS series_title,
       ser.summary AS series_summary,
       ser.created_at AS series_created_at,
       ser.updated_at AS series_updated_at,
       sess.id AS session_id,
       sess.series_id,
       sess.title AS session_title,
       sess.summary AS session_summary,
       sess.event_label,
       sess.position_index,
       sess.plan_json,
       sess.created_at AS session_created_at,
       sess.updated_at AS session_updated_at,
       att.company_event_id AS attached_company_event_id,
       ce.title AS attached_event_title,
       att.created_at AS attachment_created_at,
       att.updated_at AS attachment_updated_at
     FROM skill_builders_class_presentation_event_sessions att
     INNER JOIN skill_builders_class_presentation_sessions sess
       ON sess.id = att.presentation_session_id
     INNER JOIN skill_builders_class_presentation_series ser
       ON ser.id = att.presentation_series_id
     LEFT JOIN company_events ce
       ON ce.id = att.company_event_id
     WHERE att.company_event_id = ?
       AND att.agency_id = ?
       AND att.program_organization_id = ?
     LIMIT 25`,
    [eid, aid, progId]
  );
  const grouped = groupLibraryRows(rows || []);
  const series = grouped[0] || null;
  const session = series?.sessions?.[0] || null;
  if (!series || !session) return null;
  return { series, session };
}
