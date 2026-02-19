/**
 * Notes to sign: supervisor sign-off for supervisee clinical notes.
 * Clinical org agencies only. See docs/CLINICAL_NOTES_SUPERVISOR_SIGNOFF_SPEC.md
 */
import pool from '../config/database.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';

/**
 * GET /api/me/notes-to-sign
 * List notes awaiting current user's supervisor sign-off.
 * Returns empty until signoff flow is implemented (Phase 2).
 */
export const listNotesToSign = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const isSupervisor = await SupervisorAssignment.hasSupervisees(userId);
    if (!isSupervisor) {
      return res.json({ notes: [], count: 0 });
    }

    const [rows] = await pool.execute(
      `SELECT cns.id, cns.clinical_note_id, cns.provider_user_id, cns.supervisor_user_id,
              cns.status, cns.created_at, cns.provider_signed_at,
              u.first_name AS provider_first_name, u.last_name AS provider_last_name
       FROM clinical_note_signoffs cns
       JOIN users u ON u.id = cns.provider_user_id
       WHERE cns.supervisor_user_id = ?
         AND cns.status = 'awaiting_supervisor'
       ORDER BY cns.provider_signed_at DESC, cns.created_at DESC
       LIMIT 50`,
      [userId]
    ).catch(() => [[]]);

    res.json({
      notes: rows || [],
      count: (rows || []).length
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/me/notes-to-sign/count
 * Count for Momentum List badge.
 */
export const getNotesToSignCount = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const isSupervisor = await SupervisorAssignment.hasSupervisees(userId);
    if (!isSupervisor) {
      return res.json({ count: 0 });
    }

    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS c
       FROM clinical_note_signoffs
       WHERE supervisor_user_id = ?
         AND status = 'awaiting_supervisor'`,
      [userId]
    ).catch(() => [[{ c: 0 }]]);

    res.json({ count: Number(row?.c || 0) });
  } catch (err) {
    next(err);
  }
};
