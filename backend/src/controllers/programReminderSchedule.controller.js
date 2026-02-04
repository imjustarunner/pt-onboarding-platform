import pool from '../config/database.js';
import User from '../models/User.model.js';
import ProgramReminderService from '../services/programReminder.service.js';

function parseJsonMaybe(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

async function userHasAgencyAccess(req, agencyId) {
  if (req.user?.role === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user.id);
  return (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
}

function parseTimeOfDay(raw) {
  const v = String(raw || '').trim();
  const match = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hh = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return { hh, mm, value: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}

function parseLocalDateTime(raw) {
  const v = String(raw || '').trim();
  const match = v.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    day: parseInt(match[3], 10),
    hour: parseInt(match[4], 10),
    minute: parseInt(match[5], 10)
  };
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second')
  };
}

function getTimeZoneOffset(date, timeZone) {
  const zoned = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second
  );
  return asUtc - date.getTime();
}

function zonedTimeToUtc({ year, month, day, hour, minute }, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = getTimeZoneOffset(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

function computeNextRunAt({ scheduleType, scheduleJson, timeZone = 'UTC', now = new Date() }) {
  const n = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(n.getTime())) return null;
  const type = String(scheduleType || '').toLowerCase();
  const cfg = scheduleJson || {};

  if (type === 'once') {
    const runAtLocalRaw = cfg.runAtLocal || cfg.run_at_local || cfg.runAt || cfg.run_at;
    const localParts = parseLocalDateTime(runAtLocalRaw);
    if (localParts) {
      const runAt = zonedTimeToUtc(localParts, timeZone);
      return runAt > n ? runAt : null;
    }
    const runAt = new Date(runAtLocalRaw);
    if (!Number.isFinite(runAt.getTime())) return null;
    return runAt > n ? runAt : null;
  }

  const time = parseTimeOfDay(cfg.timeOfDay || cfg.time_of_day);
  if (!time) return null;

  const zonedNow = getZonedParts(n, timeZone);
  const baseLocalDate = new Date(Date.UTC(zonedNow.year, zonedNow.month - 1, zonedNow.day));
  const baseLocalParts = {
    year: baseLocalDate.getUTCFullYear(),
    month: baseLocalDate.getUTCMonth() + 1,
    day: baseLocalDate.getUTCDate()
  };
  const baseCandidate = zonedTimeToUtc(
    { ...baseLocalParts, hour: time.hh, minute: time.mm },
    timeZone
  );

  if (type === 'daily') {
    if (baseCandidate > n) return baseCandidate;
    const nextLocal = new Date(baseLocalDate.getTime());
    nextLocal.setUTCDate(nextLocal.getUTCDate() + 1);
    return zonedTimeToUtc(
      {
        year: nextLocal.getUTCFullYear(),
        month: nextLocal.getUTCMonth() + 1,
        day: nextLocal.getUTCDate(),
        hour: time.hh,
        minute: time.mm
      },
      timeZone
    );
  }

  if (type === 'weekly') {
    const days = Array.isArray(cfg.daysOfWeek || cfg.days_of_week) ? (cfg.daysOfWeek || cfg.days_of_week) : [];
    const daySet = new Set(days.map((d) => Number(d)).filter((d) => Number.isFinite(d) && d >= 0 && d <= 6));
    if (!daySet.size) return null;
    for (let offset = 0; offset < 7; offset += 1) {
      const localDate = new Date(baseLocalDate.getTime());
      localDate.setUTCDate(localDate.getUTCDate() + offset);
      const day = localDate.getUTCDay();
      if (!daySet.has(day)) continue;
      const candidate = zonedTimeToUtc(
        {
          year: localDate.getUTCFullYear(),
          month: localDate.getUTCMonth() + 1,
          day: localDate.getUTCDate(),
          hour: time.hh,
          minute: time.mm
        },
        timeZone
      );
      if (candidate > n) return candidate;
    }
    const fallbackLocal = new Date(baseLocalDate.getTime());
    fallbackLocal.setUTCDate(fallbackLocal.getUTCDate() + 7);
    return zonedTimeToUtc(
      {
        year: fallbackLocal.getUTCFullYear(),
        month: fallbackLocal.getUTCMonth() + 1,
        day: fallbackLocal.getUTCDate(),
        hour: time.hh,
        minute: time.mm
      },
      timeZone
    );
  }

  return null;
}

export const listProgramReminderSchedules = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    const [rows] = await pool.execute(
      `SELECT *
       FROM program_reminder_schedules
       WHERE agency_id = ?
       ORDER BY created_at DESC`,
      [agencyId]
    );
    const out = (rows || []).map((r) => ({
      id: r.id,
      agencyId: r.agency_id,
      title: r.title,
      message: r.message,
      scheduleType: r.schedule_type,
      scheduleJson: parseJsonMaybe(r.schedule_json),
      recipients: parseJsonMaybe(r.recipients_json),
      channels: parseJsonMaybe(r.channels_json),
      timezone: r.timezone || 'UTC',
      nextRunAt: r.next_run_at,
      lastRunAt: r.last_run_at,
      isActive: !!r.is_active,
      createdByUserId: r.created_by_user_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const createProgramReminderSchedule = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    const title = String(req.body?.title || '').trim() || 'Program reminder';
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'message is required' } });

    const scheduleType = String(req.body?.scheduleType || req.body?.schedule_type || '').trim().toLowerCase();
    const scheduleJson = req.body?.scheduleJson || req.body?.schedule_json || null;
    const timezone = String(req.body?.timezone || 'UTC');
    const nextRunAt = computeNextRunAt({ scheduleType, scheduleJson, timeZone: timezone, now: new Date() });
    if (!nextRunAt) return res.status(400).json({ error: { message: 'Invalid schedule configuration' } });

    const recipients = req.body?.recipients && typeof req.body.recipients === 'object' ? req.body.recipients : null;
    const channels = req.body?.channels && typeof req.body.channels === 'object' ? req.body.channels : null;

    const [result] = await pool.execute(
      `INSERT INTO program_reminder_schedules
        (agency_id, created_by_user_id, title, message, schedule_type, schedule_json, recipients_json, channels_json, timezone, next_run_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        agencyId,
        req.user?.id || null,
        title,
        message,
        scheduleType,
        scheduleJson ? JSON.stringify(scheduleJson) : null,
        recipients ? JSON.stringify(recipients) : null,
        channels ? JSON.stringify(channels) : null,
        timezone,
        nextRunAt
      ]
    );

    const [rows] = await pool.execute('SELECT * FROM program_reminder_schedules WHERE id = ?', [result.insertId]);
    res.status(201).json(rows?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const updateProgramReminderSchedule = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.id);
    const scheduleId = Number(req.params.scheduleId);
    if (!agencyId || !scheduleId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }

    const [existingRows] = await pool.execute(
      `SELECT * FROM program_reminder_schedules WHERE id = ? AND agency_id = ? LIMIT 1`,
      [scheduleId, agencyId]
    );
    const existing = existingRows?.[0];
    if (!existing) return res.status(404).json({ error: { message: 'Schedule not found' } });

    const title = req.body?.title !== undefined ? String(req.body.title || '').trim() || 'Program reminder' : existing.title;
    const message = req.body?.message !== undefined ? String(req.body.message || '').trim() : existing.message;
    if (!message) return res.status(400).json({ error: { message: 'message is required' } });

    const scheduleType = req.body?.scheduleType || req.body?.schedule_type || existing.schedule_type;
    const scheduleJson = req.body?.scheduleJson || req.body?.schedule_json || parseJsonMaybe(existing.schedule_json);
    const timezone = req.body?.timezone ? String(req.body.timezone) : existing.timezone || 'UTC';
    const nextRunAt = computeNextRunAt({ scheduleType, scheduleJson, timeZone: timezone, now: new Date() });
    if (!nextRunAt) return res.status(400).json({ error: { message: 'Invalid schedule configuration' } });

    const recipients = req.body?.recipients && typeof req.body.recipients === 'object' ? req.body.recipients : parseJsonMaybe(existing.recipients_json);
    const channels = req.body?.channels && typeof req.body.channels === 'object' ? req.body.channels : parseJsonMaybe(existing.channels_json);
    const isActive = req.body?.isActive === undefined ? existing.is_active : (req.body.isActive ? 1 : 0);

    await pool.execute(
      `UPDATE program_reminder_schedules
       SET title = ?, message = ?, schedule_type = ?, schedule_json = ?, recipients_json = ?, channels_json = ?, timezone = ?, next_run_at = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title,
        message,
        scheduleType,
        scheduleJson ? JSON.stringify(scheduleJson) : null,
        recipients ? JSON.stringify(recipients) : null,
        channels ? JSON.stringify(channels) : null,
        timezone,
        nextRunAt,
        isActive,
        scheduleId
      ]
    );

    const [rows] = await pool.execute('SELECT * FROM program_reminder_schedules WHERE id = ?', [scheduleId]);
    res.json(rows?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const deleteProgramReminderSchedule = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.id);
    const scheduleId = Number(req.params.scheduleId);
    if (!agencyId || !scheduleId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    await pool.execute('DELETE FROM program_reminder_schedules WHERE id = ? AND agency_id = ?', [scheduleId, agencyId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export async function processProgramReminderSchedules() {
  const [rows] = await pool.execute(
    `SELECT *
     FROM program_reminder_schedules
     WHERE is_active = TRUE AND next_run_at <= NOW()
     ORDER BY next_run_at ASC
     LIMIT 50`
  );
  for (const r of rows || []) {
    const scheduleJson = parseJsonMaybe(r.schedule_json);
    const recipients = parseJsonMaybe(r.recipients_json);
    const channels = parseJsonMaybe(r.channels_json);
    try {
      await ProgramReminderService.dispatchReminder({
        agencyId: r.agency_id,
        title: r.title || 'Program reminder',
        message: r.message,
        recipientsOverride: recipients,
        channelsOverride: channels
      });
    } catch (e) {
      console.warn('Program reminder dispatch failed:', e.message);
    }

    const next = computeNextRunAt({ scheduleType: r.schedule_type, scheduleJson, timeZone: r.timezone || 'UTC', now: new Date() });
    if (!next) {
      await pool.execute(
        `UPDATE program_reminder_schedules
         SET is_active = FALSE, last_run_at = NOW(), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [r.id]
      );
    } else {
      await pool.execute(
        `UPDATE program_reminder_schedules
         SET next_run_at = ?, last_run_at = NOW(), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [next, r.id]
      );
    }
  }
}
