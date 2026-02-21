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

/**
 * POST /api/me/notes-to-sign/:id/sign
 * Supervisor signs off on a note.
 */
export const signNote = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const signoffId = parseInt(req.params.id, 10);
    if (!signoffId) return res.status(400).json({ error: { message: 'Signoff ID required' } });

    const [[row]] = await pool.execute(
      `SELECT id, clinical_note_id, supervisor_user_id, status
       FROM clinical_note_signoffs
       WHERE id = ?`,
      [signoffId]
    ).catch(() => [[]]);

    const signoff = row || null;
    if (!signoff) return res.status(404).json({ error: { message: 'Sign-off record not found' } });
    if (Number(signoff.supervisor_user_id) !== Number(userId)) {
      return res.status(403).json({ error: { message: 'You are not the assigned supervisor for this note' } });
    }
    if (String(signoff.status) !== 'awaiting_supervisor') {
      return res.status(400).json({ error: { message: 'Note is not awaiting your sign-off' } });
    }

    await pool.execute(
      `UPDATE clinical_note_signoffs
       SET supervisor_signed_at = NOW(), status = 'signed', updated_at = NOW()
       WHERE id = ?`,
      [signoffId]
    );

    res.json({ ok: true, message: 'Note signed successfully' });
  } catch (err) {
    next(err);
  }
};
