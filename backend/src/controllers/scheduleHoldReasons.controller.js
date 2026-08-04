import pool from '../config/database.js';
import {
  PLATFORM_HOLD_REASON_OPTIONS,
  holdReasonLabelToCode
} from '../constants/scheduleHoldReasons.js';

export const listHoldReasons = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    let agencyRows = [];
    if (agencyId) {
      const [rows] = await pool.execute(
        `SELECT id, code, label, sort_order FROM agency_schedule_hold_reasons
         WHERE agency_id = ? AND is_active = 1 ORDER BY sort_order ASC, label ASC`,
        [agencyId]
      );
      agencyRows = rows || [];
    }

    const [prefs] = await pool.execute(
      `SELECT reason_code, source, is_hidden, custom_label FROM user_schedule_hold_reason_prefs WHERE user_id = ?`,
      [userId]
    );
    const hidden = new Set(
      (prefs || []).filter((p) => p.is_hidden).map((p) => `${p.source}:${p.reason_code}`)
    );
    const customUser = (prefs || [])
      .filter((p) => p.source === 'custom' && !p.is_hidden)
      .map((p) => ({
        code: p.reason_code,
        label: p.custom_label || p.reason_code,
        source: 'custom',
        custom: true
      }));

    const platform = PLATFORM_HOLD_REASON_OPTIONS
      .filter((o) => !hidden.has(`platform:${o.code}`))
      .map((o) => ({ ...o, source: 'platform', custom: false }));

    const agency = agencyRows
      .filter((o) => !hidden.has(`agency:${o.code}`))
      .map((o) => ({ code: o.code, label: o.label, source: 'agency', custom: false }));

    // Agency codes override platform same code
    const byCode = new Map();
    for (const o of platform) byCode.set(o.code, o);
    for (const o of agency) byCode.set(o.code, o);
    for (const o of customUser) byCode.set(o.code, o);

    res.json([...byCode.values()]);
  } catch (err) {
    next(err);
  }
};

export const hideHoldReason = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { code, source = 'platform', isHidden = true } = req.body || {};
    const c = String(code || '').toUpperCase();
    if (!c) return res.status(400).json({ error: { message: 'code required' } });
    await pool.execute(
      `INSERT INTO user_schedule_hold_reason_prefs (user_id, reason_code, source, is_hidden)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_hidden = VALUES(is_hidden)`,
      [userId, c, source, isHidden ? 1 : 0]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const addCustomHoldReason = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const label = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ error: { message: 'label required' } });
    const code = holdReasonLabelToCode(label);
    await pool.execute(
      `INSERT INTO user_schedule_hold_reason_prefs (user_id, reason_code, source, is_hidden, custom_label)
       VALUES (?, ?, 'custom', 0, ?)
       ON DUPLICATE KEY UPDATE custom_label = VALUES(custom_label), is_hidden = 0`,
      [userId, code, label]
    );
    res.status(201).json({ code, label, source: 'custom', custom: true });
  } catch (err) {
    next(err);
  }
};

export const saveHoldReasonToAgency = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Admin, support, or superadmin required' } });
    }
    const agencyId = parseInt(req.body?.agencyId, 10);
    const label = String(req.body?.label || '').trim();
    if (!agencyId || !label) {
      return res.status(400).json({ error: { message: 'agencyId and label required' } });
    }
    const code = holdReasonLabelToCode(req.body?.code || label);
    await pool.execute(
      `INSERT INTO agency_schedule_hold_reasons (agency_id, code, label, created_by_user_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = 1`,
      [agencyId, code, label, userId]
    );
    res.status(201).json({ code, label, source: 'agency', custom: false });
  } catch (err) {
    next(err);
  }
};
