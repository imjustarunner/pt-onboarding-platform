import pool from '../config/database.js';

export const HIRING_INTERVIEW_CAPSULE_SUBJECT = 'hiring_interview';

/**
 * Sealed predictions past reveal_at: shown in-app on next login (splash), not email.
 * Product rule: anchor/reveal_at still computed from interview_starts_at at write time (see submitInterviewSplashCapsule).
 */
export async function listPendingTimeCapsuleRevealsForUser(userId) {
  const uid = parseInt(userId, 10);
  if (!Number.isFinite(uid)) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT
         tce.id,
         tce.author_user_id,
         tce.horizon_months,
         tce.reveal_at,
         tce.anchor_at,
         tce.created_at,
         hp.id AS hiring_profile_id,
         hp.candidate_user_id,
         u.first_name AS candidate_first_name,
         u.last_name AS candidate_last_name
       FROM time_capsule_entries tce
       INNER JOIN hiring_profiles hp ON hp.id = tce.subject_id AND tce.subject_type = ?
       INNER JOIN users u ON u.id = hp.candidate_user_id
       WHERE tce.author_user_id = ?
         AND tce.reveal_at <= UTC_TIMESTAMP()
         AND tce.splash_acknowledged_at IS NULL
         AND (tce.splash_snooze_until IS NULL OR tce.splash_snooze_until <= UTC_TIMESTAMP())
       ORDER BY tce.reveal_at ASC, tce.id ASC`,
      [HIRING_INTERVIEW_CAPSULE_SUBJECT, uid]
    );
    return rows || [];
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') {
      return [];
    }
    throw e;
  }
}

/** Returns this author's row plus every interviewer's sealed text for the same applicant + horizon (reveal date passed). */
export async function openTimeCapsuleReveal(entryId, authorUserId) {
  const eid = parseInt(entryId, 10);
  const uid = parseInt(authorUserId, 10);
  if (!Number.isFinite(eid) || !Number.isFinite(uid)) {
    const err = new Error('Invalid entry');
    err.status = 400;
    throw err;
  }
  try {
    const [mineRows] = await pool.execute(
      `SELECT id, body_text, subject_id, horizon_months
       FROM time_capsule_entries
       WHERE id = ? AND author_user_id = ? AND subject_type = ?
         AND reveal_at <= UTC_TIMESTAMP()
         AND splash_acknowledged_at IS NULL
         AND (splash_snooze_until IS NULL OR splash_snooze_until <= UTC_TIMESTAMP())
       LIMIT 1`,
      [eid, uid, HIRING_INTERVIEW_CAPSULE_SUBJECT]
    );
    const mine = mineRows[0] || null;
    if (!mine) {
      const err = new Error('Reveal not available');
      err.status = 404;
      throw err;
    }
    const subjectId = parseInt(mine.subject_id, 10);
    const horizonMonths = parseInt(mine.horizon_months, 10);
    const bodyMine = String(mine.body_text || '').trim();

    const [allRows] = await pool.execute(
      `SELECT tce.author_user_id AS author_user_id,
              u.first_name AS author_first_name,
              u.last_name AS author_last_name,
              tce.body_text AS body_text
       FROM time_capsule_entries tce
       INNER JOIN users u ON u.id = tce.author_user_id
       WHERE tce.subject_type = ?
         AND tce.subject_id = ?
         AND tce.horizon_months = ?
         AND tce.reveal_at <= UTC_TIMESTAMP()
       ORDER BY u.last_name ASC, u.first_name ASC, tce.author_user_id ASC`,
      [HIRING_INTERVIEW_CAPSULE_SUBJECT, subjectId, horizonMonths]
    );

    const predictions = (allRows || []).map((r) => ({
      authorUserId: r.author_user_id,
      authorFirstName: String(r.author_first_name || '').trim(),
      authorLastName: String(r.author_last_name || '').trim(),
      bodyText: String(r.body_text || '').trim()
    }));

    return {
      bodyText: bodyMine,
      horizonMonths: Number.isFinite(horizonMonths) ? horizonMonths : null,
      predictions
    };
  } catch (e) {
    if (e?.status) throw e;
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') {
      const err = new Error('Time capsule reveal requires migration 706');
      err.status = 503;
      throw err;
    }
    throw e;
  }
}

export async function acknowledgeTimeCapsuleReveal(entryId, authorUserId) {
  const eid = parseInt(entryId, 10);
  const uid = parseInt(authorUserId, 10);
  if (!Number.isFinite(eid) || !Number.isFinite(uid)) {
    const err = new Error('Invalid entry');
    err.status = 400;
    throw err;
  }
  try {
    const [result] = await pool.execute(
      `UPDATE time_capsule_entries
       SET splash_acknowledged_at = UTC_TIMESTAMP()
       WHERE id = ? AND author_user_id = ? AND subject_type = ? AND splash_acknowledged_at IS NULL
       LIMIT 1`,
      [eid, uid, HIRING_INTERVIEW_CAPSULE_SUBJECT]
    );
    if (!result.affectedRows) {
      const err = new Error('Reveal not found or already acknowledged');
      err.status = 404;
      throw err;
    }
    return { ok: true };
  } catch (e) {
    if (e?.status) throw e;
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') {
      const err = new Error('Time capsule reveal requires migration 706');
      err.status = 503;
      throw err;
    }
    throw e;
  }
}

export async function snoozeTimeCapsuleReveal(entryId, authorUserId, daysRaw) {
  const eid = parseInt(entryId, 10);
  const uid = parseInt(authorUserId, 10);
  let days = parseInt(daysRaw, 10);
  if (!Number.isFinite(days) || days < 1) days = 1;
  if (days > 30) days = 30;
  if (!Number.isFinite(eid) || !Number.isFinite(uid)) {
    const err = new Error('Invalid entry');
    err.status = 400;
    throw err;
  }
  try {
    const [result] = await pool.execute(
      `UPDATE time_capsule_entries
       SET splash_snooze_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY)
       WHERE id = ? AND author_user_id = ? AND subject_type = ?
         AND splash_acknowledged_at IS NULL
       LIMIT 1`,
      [days, eid, uid, HIRING_INTERVIEW_CAPSULE_SUBJECT]
    );
    if (!result.affectedRows) {
      const err = new Error('Reveal not found or already acknowledged');
      err.status = 404;
      throw err;
    }
    return { ok: true, snoozeDays: days };
  } catch (e) {
    if (e?.status) throw e;
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') {
      const err = new Error('Time capsule reveal requires migration 706');
      err.status = 503;
      throw err;
    }
    throw e;
  }
}

/**
 * Interviewers who must complete post-interview splash + time capsule predictions.
 */
export async function listPendingInterviewSplashesForUser(userId) {
  const uid = parseInt(userId, 10);
  if (!Number.isFinite(uid)) return [];

  const [agRows] = await pool.execute(`SELECT agency_id FROM user_agencies WHERE user_id = ?`, [uid]);
  const agencyIds = (agRows || []).map((r) => r.agency_id).filter((id) => id != null);
  if (!agencyIds.length) return [];

  const placeholders = agencyIds.map(() => '?').join(',');
  const params = [...agencyIds, uid, uid];

  const [rows] = await pool.execute(
    `SELECT
       hp.id AS hiring_profile_id,
       hp.candidate_user_id,
       ua.agency_id,
       u.first_name AS candidate_first_name,
       u.last_name AS candidate_last_name,
       hp.interview_starts_at,
       s.attendance AS splash_attendance,
       s.impression,
       s.rating AS splash_rating,
       s.prediction_6m,
       s.prediction_12m,
       s.completed_at AS splash_completed_at
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id IN (${placeholders})
     JOIN hiring_profiles hp
       ON hp.candidate_user_id = u.id
      AND hp.id = (
        SELECT hp_latest.id
        FROM hiring_profiles hp_latest
        WHERE hp_latest.candidate_user_id = u.id
        ORDER BY hp_latest.updated_at DESC, hp_latest.id DESC
        LIMIT 1
      )
     LEFT JOIN hiring_interview_splash_state s
       ON s.hiring_profile_id = hp.id AND s.interviewer_user_id = ?
     WHERE (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL))
       AND hp.interview_starts_at IS NOT NULL
       AND hp.interview_starts_at < UTC_TIMESTAMP()
       AND (hp.interview_status IS NULL OR hp.interview_status = 'scheduled')
       AND hp.interview_interviewer_user_ids IS NOT NULL
       AND JSON_CONTAINS(COALESCE(hp.interview_interviewer_user_ids, JSON_ARRAY()), CAST(? AS JSON), '$')
       AND (
         s.id IS NULL
         OR (
           s.completed_at IS NULL
           AND s.attendance != 'did_not_attend'
           AND (
             s.attendance = 'pending'
             OR s.impression IS NULL OR TRIM(COALESCE(s.impression, '')) = ''
             OR s.rating IS NULL
             OR s.prediction_6m IS NULL OR TRIM(COALESCE(s.prediction_6m, '')) = ''
             OR s.prediction_12m IS NULL OR TRIM(COALESCE(s.prediction_12m, '')) = ''
           )
         )
       )`,
    params
  );

  return rows || [];
}

async function assertInterviewerForProfile({ hiringProfileId, interviewerUserId }) {
  const hpId = parseInt(hiringProfileId, 10);
  const uid = parseInt(interviewerUserId, 10);
  if (!Number.isFinite(hpId) || !Number.isFinite(uid)) {
    const err = new Error('Invalid hiring profile or user');
    err.status = 400;
    throw err;
  }
  const [rows] = await pool.execute(
    `SELECT id, candidate_user_id, interview_interviewer_user_ids, interview_starts_at, interview_status
     FROM hiring_profiles WHERE id = ? LIMIT 1`,
    [hpId]
  );
  const hp = rows[0] || null;
  if (!hp) {
    const err = new Error('Hiring profile not found');
    err.status = 404;
    throw err;
  }
  let ids = hp.interview_interviewer_user_ids;
  if (typeof ids === 'string') {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = [];
    }
  }
  if (!Array.isArray(ids) || !ids.map((x) => Number(x)).includes(uid)) {
    const err = new Error('You are not listed as an interviewer for this applicant');
    err.status = 403;
    throw err;
  }
  return hp;
}

/**
 * Mark did not attend (permanent dismiss) or start attended path.
 */
export async function submitInterviewSplashAttendance({
  hiringProfileId,
  interviewerUserId,
  attended
}) {
  const hp = await assertInterviewerForProfile({ hiringProfileId, interviewerUserId });
  if (!hp.interview_starts_at) {
    const err = new Error('Interview is not scheduled');
    err.status = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (!attended) {
      await conn.execute(
        `INSERT INTO hiring_interview_splash_state (
           hiring_profile_id, interviewer_user_id, attendance, completed_at
         ) VALUES (?, ?, 'did_not_attend', UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           attendance = 'did_not_attend',
           impression = NULL,
           rating = NULL,
           prediction_6m = NULL,
           prediction_12m = NULL,
           completed_at = UTC_TIMESTAMP(),
           updated_at = UTC_TIMESTAMP()`,
        [hiringProfileId, interviewerUserId]
      );
    } else {
      await conn.execute(
        `INSERT INTO hiring_interview_splash_state (
           hiring_profile_id, interviewer_user_id, attendance
         ) VALUES (?, ?, 'attended')
         ON DUPLICATE KEY UPDATE
           attendance = 'attended',
           updated_at = UTC_TIMESTAMP()`,
        [hiringProfileId, interviewerUserId]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * After attendance=attended: impression, rating, 6m and 12m predictions; writes time_capsule_entries.
 * Anchor for reveal: interview_starts_at on profile (documented product rule).
 */
export async function submitInterviewSplashCapsule({
  hiringProfileId,
  interviewerUserId,
  impression,
  rating,
  prediction6m,
  prediction12m
}) {
  const hp = await assertInterviewerForProfile({ hiringProfileId, interviewerUserId });
  if (!hp.interview_starts_at) {
    const err = new Error('Interview is not scheduled');
    err.status = 400;
    throw err;
  }

  const imp = String(impression || '').trim();
  const p6 = String(prediction6m || '').trim();
  const p12 = String(prediction12m || '').trim();
  const r = parseInt(rating, 10);
  if (!imp) {
    const err = new Error('impression is required');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(r) || r < 1 || r > 5) {
    const err = new Error('rating must be between 1 and 5');
    err.status = 400;
    throw err;
  }
  if (!p6 || !p12) {
    const err = new Error('prediction6m and prediction12m are required');
    err.status = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO hiring_interview_splash_state (
         hiring_profile_id, interviewer_user_id, attendance, impression, rating,
         prediction_6m, prediction_12m, completed_at
       ) VALUES (?, ?, 'attended', ?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         attendance = 'attended',
         impression = VALUES(impression),
         rating = VALUES(rating),
         prediction_6m = VALUES(prediction_6m),
         prediction_12m = VALUES(prediction_12m),
         completed_at = UTC_TIMESTAMP(),
         updated_at = UTC_TIMESTAMP()`,
      [hiringProfileId, interviewerUserId, imp, r, p6, p12]
    );

    await conn.execute(
      `INSERT INTO time_capsule_entries (
         subject_type, subject_id, author_user_id, horizon_months, body_text, anchor_at, reveal_at
       ) VALUES (?, ?, ?, 6, ?, ?, DATE_ADD(?, INTERVAL 6 MONTH))`,
      [HIRING_INTERVIEW_CAPSULE_SUBJECT, hiringProfileId, interviewerUserId, p6, hp.interview_starts_at, hp.interview_starts_at]
    );
    await conn.execute(
      `INSERT INTO time_capsule_entries (
         subject_type, subject_id, author_user_id, horizon_months, body_text, anchor_at, reveal_at
       ) VALUES (?, ?, ?, 12, ?, ?, DATE_ADD(?, INTERVAL 12 MONTH))`,
      [HIRING_INTERVIEW_CAPSULE_SUBJECT, hiringProfileId, interviewerUserId, p12, hp.interview_starts_at, hp.interview_starts_at]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
