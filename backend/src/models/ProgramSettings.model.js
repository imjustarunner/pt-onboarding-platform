import pool from '../config/database.js';

class ProgramSettings {
  static async findByProgramId(programId) {
    const [rows] = await pool.execute(
      'SELECT * FROM program_settings WHERE program_id = ?',
      [programId]
    );
    return rows[0] || null;
  }

  static async upsert(programId, settings = {}) {
    const existing = await this.findByProgramId(programId);
    const {
      defaultDirectHours = 3,
      onCallPayAmount = null,
      bonusPerfectAttendance = null,
      bonusShiftCoverage = null,
      shiftSchedulingEnabled = true
    } = settings;

    if (existing) {
      await pool.execute(
        `UPDATE program_settings SET
          default_direct_hours = ?,
          on_call_pay_amount = ?,
          bonus_perfect_attendance = ?,
          bonus_shift_coverage = ?,
          shift_scheduling_enabled = ?
         WHERE program_id = ?`,
        [
          defaultDirectHours,
          onCallPayAmount,
          bonusPerfectAttendance,
          bonusShiftCoverage,
          shiftSchedulingEnabled ? 1 : 0,
          programId
        ]
      );
    } else {
      await pool.execute(
        `INSERT INTO program_settings
         (program_id, default_direct_hours, on_call_pay_amount, bonus_perfect_attendance, bonus_shift_coverage, shift_scheduling_enabled)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          programId,
          defaultDirectHours,
          onCallPayAmount,
          bonusPerfectAttendance,
          bonusShiftCoverage,
          shiftSchedulingEnabled ? 1 : 0
        ]
      );
    }
    return this.findByProgramId(programId);
  }
}

export default ProgramSettings;
