import pool from '../config/database.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';

function utcMillis(value) {
  if (value instanceof Date) return value.getTime();
  const raw = String(value || '').replace(' ', 'T');
  return Date.parse(/[Zz]|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`);
}
function eventBoundary(event, end) {
  const instant = end ? event.end_at : event.start_at;
  if (instant) return utcMillis(instant);
  const date = end ? event.end_date : event.start_date;
  if (!date || Number(event.all_day) !== 1) return NaN;
  const day = date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
  return utcMillis(wallMysqlToUtcMysql(`${day} 00:00:00`, event.event_timezone || 'America/Denver'));
}

class VacationScheduleSyncService {
  static async getUserAbsence(userId, agencyId, atDate = new Date()) {
    if (!userId) return null;
    const [settings] = await pool.execute(
      'SELECT vacation_mode_enabled, vacation_mode_started_at FROM user_call_settings WHERE user_id = ? LIMIT 1', [userId]);
    if (Number(settings?.[0]?.vacation_mode_enabled) === 1) {
      const started = settings[0].vacation_mode_started_at;
      return { key: `manual:${started instanceof Date ? started.toISOString() : started || 'legacy'}` };
    }
    // Widen discovery for legacy all-day rows, then enforce exact boundaries below.
    const events = await ProviderScheduleEvent.listForUserInWindow({ agencyId, providerId: userId,
      windowStart: new Date(atDate.getTime() - 86400000), windowEnd: new Date(atDate.getTime() + 86400000) });
    const active = (events || []).filter(event =>
      ['VACATION', 'AWAY'].includes(String(event.kind || '').toUpperCase()) &&
      !['CANCELLED', 'CANCELED', 'DELETED'].includes(String(event.status || '').toUpperCase()) &&
      eventBoundary(event, false) <= atDate.getTime() && atDate.getTime() < eventBoundary(event, true));
    if (!active.length) return null;
    return { key: `schedule:${active.map(event => event.id).sort((a, b) => a - b).join(',')}` };
  }

  static async isUserOnVacation(userId, agencyId, atDate = new Date()) {
    return !!(await this.getUserAbsence(userId, agencyId, atDate));
  }
}
export default VacationScheduleSyncService;
