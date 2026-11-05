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
    const blocked = (events || []).filter(event => {
      const kind = String(event.kind || '').toUpperCase();
      const away = ['VACATION', 'AWAY'].includes(kind) || (kind === 'SCHEDULE_HOLD' && Number(event.all_day) === 1);
      return away && !['CANCELLED', 'CANCELED', 'DELETED'].includes(String(event.status || '').toUpperCase())
        && eventBoundary(event, false) <= atDate.getTime() && atDate.getTime() < eventBoundary(event, true);
    });
    if (blocked.length) return { key: `schedule:${blocked.map(event => event.id).sort((a, b) => a - b).join(',')}` };
    try {
      const [planned] = await pool.execute(`SELECT id FROM planned_outs WHERE user_id=? AND agency_id=? AND status='approved' AND availability='unavailable' AND (end_at > UTC_TIMESTAMP() OR end_date >= UTC_DATE()) ORDER BY id DESC LIMIT 20`, [userId, agencyId]);
      if (planned.length) {
        const { activePlannedOut } = await import('./vacationResponder.service.js');
        for (const row of planned) if (await activePlannedOut(agencyId, userId, row.id, atDate)) return { key: `planned:${row.id}` };
      }
      const { isUserAvailable } = await import('./availabilityWindow.service.js');
      const state = await isUserAvailable(userId, atDate, { agencyId });
      if (state?.schedule?.enabled && state.available === false) return { key: `hours:${state.schedule.source || 'schedule'}` };
    } catch (error) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') console.warn('[absence] Planned-out or availability check skipped:', error?.code || 'lookup_failed');
    }
    return null;
  }

  static async isUserOnVacation(userId, agencyId, atDate = new Date()) {
    return !!(await this.getUserAbsence(userId, agencyId, atDate));
  }
}
export default VacationScheduleSyncService;
