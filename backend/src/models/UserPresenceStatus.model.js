import pool from '../config/database.js';

const STATUS_ENUM = [
  'in_available',
  'in_heads_down',
  'in_available_for_phone',
  'out_quick',
  'out_am',
  'out_pm',
  'out_full_day',
  'traveling_offsite'
];

export default class UserPresenceStatus {
  static STATUS_ENUM = STATUS_ENUM;

  static isValidStatus(status) {
    return STATUS_ENUM.includes(String(status || '').trim());
  }

  static async findByUserId(userId) {
    const id = parseInt(userId, 10);
    if (!id) return null;
    const [rows] = await pool.execute(
      'SELECT * FROM user_presence_status WHERE user_id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }

  static async upsertForUser(userId, data) {
    const id = parseInt(userId, 10);
    if (!id) return null;
    const { status, note, started_at, ends_at, expected_return_at } = data;
    if (!status || !this.isValidStatus(status)) return null;

    const startedAt = started_at ? new Date(started_at) : new Date();
    const endsAt = ends_at ? new Date(ends_at) : null;
    const expectedReturnAt = expected_return_at ? new Date(expected_return_at) : null;

    await pool.execute(
      `INSERT INTO user_presence_status
        (user_id, status, note, started_at, ends_at, expected_return_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         note = VALUES(note),
         started_at = VALUES(started_at),
         ends_at = VALUES(ends_at),
         expected_return_at = VALUES(expected_return_at)`,
      [
        id,
        status,
        note || null,
        startedAt.toISOString().slice(0, 19).replace('T', ' '),
        endsAt ? endsAt.toISOString().slice(0, 19).replace('T', ' ') : null,
        expectedReturnAt ? expectedReturnAt.toISOString().slice(0, 19).replace('T', ' ') : null
      ]
    );
    return this.findByUserId(id);
  }

  /**
   * Fetch all users with staff-like roles and their presence status.
   * Used for SuperAdmin Team Board.
   */
  static async findAllWithUsers() {
    const STAFF_ROLES = [
      'staff',
      'admin',
      'support',
      'provider',
      'supervisor',
      'clinical_practice_assistant',
      'intern',
      'school_staff',
      'facilitator',
      'super_admin'
    ];

    let profilePhotoField = '';
    let preferredNameField = '';
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('profile_photo_path', 'preferred_name')",
        [dbName]
      );
      const names = (cols || []).map((c) => c.COLUMN_NAME);
      if (names.includes('profile_photo_path')) profilePhotoField = ', u.profile_photo_path';
      if (names.includes('preferred_name')) preferredNameField = ', u.preferred_name';
    } catch {
      /* best-effort */
    }

    const placeholders = STAFF_ROLES.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.role${profilePhotoField}${preferredNameField},
              ps.status AS presence_status,
              ps.note AS presence_note,
              ps.started_at AS presence_started_at,
              ps.ends_at AS presence_ends_at,
              ps.expected_return_at AS presence_expected_return_at,
              (SELECT GROUP_CONCAT(agency_id ORDER BY agency_id SEPARATOR ',') FROM user_agencies WHERE user_id = u.id) AS agency_ids
       FROM users u
       LEFT JOIN user_presence_status ps ON ps.user_id = u.id
       WHERE u.role IN (${placeholders})
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       ORDER BY u.first_name ASC, u.last_name ASC`,
      STAFF_ROLES
    );
    return rows || [];
  }
}
