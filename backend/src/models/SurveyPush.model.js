import pool from '../config/database.js';

class SurveyPush {
  static async createMany(surveyId, userIds = []) {
    const sid = Number(surveyId || 0);
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [])
      .map((id) => Number(id))
      .filter((id) => id > 0))];
    if (!sid || !ids.length) return [];
    const valuesSql = ids.map(() => '(?, ?, ?, NOW(), NOW())').join(', ');
    const params = [];
    ids.forEach((uid) => {
      params.push(sid, uid, 'pending');
    });
    await pool.execute(
      `INSERT INTO survey_pushes (survey_id, user_id, status, created_at, updated_at)
       VALUES ${valuesSql}
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         updated_at = NOW()`,
      params
    );
    return this.listBySurvey(sid);
  }

  static async listBySurvey(surveyId) {
    const [rows] = await pool.execute(
      `SELECT sp.*, u.first_name, u.last_name, u.email, u.role
       FROM survey_pushes sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.survey_id = ?
       ORDER BY sp.created_at DESC, sp.id DESC`,
      [Number(surveyId)]
    );
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM survey_pushes WHERE id = ? LIMIT 1', [Number(id)]);
    return rows?.[0] || null;
  }

  static async updateStatus(id, status) {
    const normalized = ['pending', 'seen', 'accepted', 'dismissed'].includes(String(status || '').toLowerCase())
      ? String(status).toLowerCase()
      : 'pending';
    const stampCol = normalized === 'seen'
      ? 'seen_at'
      : (normalized === 'accepted' ? 'responded_at' : null);
    if (stampCol) {
      await pool.execute(
        `UPDATE survey_pushes
         SET status = ?, ${stampCol} = IFNULL(${stampCol}, NOW()), updated_at = NOW()
         WHERE id = ?`,
        [normalized, Number(id)]
      );
    } else {
      await pool.execute(
        'UPDATE survey_pushes SET status = ?, updated_at = NOW() WHERE id = ?',
        [normalized, Number(id)]
      );
    }
    return this.findById(id);
  }

  static async findPendingForUser(userId) {
    const [rows] = await pool.execute(
      `SELECT
         sp.*,
         s.title AS survey_title,
         s.description AS survey_description,
         s.questions_json AS survey_questions_json,
         s.is_anonymous AS survey_is_anonymous,
         s.is_scored AS survey_is_scored
       FROM survey_pushes sp
       JOIN surveys s ON s.id = sp.survey_id
       WHERE sp.user_id = ?
         AND sp.status IN ('pending', 'seen')
         AND s.is_active = 1
       ORDER BY sp.created_at DESC`,
      [Number(userId)]
    );
    return rows;
  }
}

export default SurveyPush;
