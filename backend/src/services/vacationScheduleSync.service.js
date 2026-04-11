import pool from '../config/database.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';

class VacationScheduleSyncService {
  /**
   * Checks if a provider is currently on vacation based on their schedule.
   * Kinds can be 'VACATION' or 'AWAY'.
   * @param {number} userId
   * @param {number} agencyId
   * @returns {Promise<boolean>}
   */
  static async isUserOnVacation(userId, agencyId, atDate = new Date()) {
    if (!userId) return false;

    // Check if user has explicit vacation mode toggle ON in settings
    const [settings] = await pool.execute(
      `SELECT vacation_mode_enabled FROM user_call_settings WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    if (settings?.[0]?.vacation_mode_enabled) return true;

    // Check schedule for current active vacation/away events
    const windowStart = new Date(atDate.getTime() - 60000); // 1 minute ago
    const windowEnd = new Date(atDate.getTime() + 60000);   // 1 minute from now
    
    const events = await ProviderScheduleEvent.listForUserInWindow({
      agencyId,
      providerId: userId,
      windowStart,
      windowEnd
    });

    const isVacation = (events || []).some(ev => {
      const kind = String(ev.kind || '').toUpperCase();
      return kind === 'VACATION' || kind === 'AWAY';
    });

    return isVacation;
  }
}

export default VacationScheduleSyncService;
