import pool from '../config/database.js';

class UserTrack {
  static async assignUserToTrack(userId, trackId, agencyId, assignedByUserId = null) {
    await pool.execute(
      'INSERT INTO user_tracks (user_id, track_id, agency_id, assigned_by_user_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE assigned_at = CURRENT_TIMESTAMP',
      [userId, trackId, agencyId, assignedByUserId]
    );
    return this.getUserTrack(userId, trackId, agencyId);
  }

  static async getUserTrack(userId, trackId, agencyId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_tracks WHERE user_id = ? AND track_id = ? AND agency_id = ?',
      [userId, trackId, agencyId]
    );
    return rows[0] || null;
  }

  static async getUserTracks(userId, agencyId = null) {
    let query = 'SELECT ut.*, t.name as track_name, t.description as track_description FROM user_tracks ut JOIN training_tracks t ON ut.track_id = t.id WHERE ut.user_id = ?';
    const params = [userId];
    
    if (agencyId) {
      query += ' AND ut.agency_id = ?';
      params.push(agencyId);
    }
    
    query += ' ORDER BY ut.assigned_at DESC';
    
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async removeUserFromTrack(userId, trackId, agencyId) {
    const [result] = await pool.execute(
      'DELETE FROM user_tracks WHERE user_id = ? AND track_id = ? AND agency_id = ?',
      [userId, trackId, agencyId]
    );
    return result.affectedRows > 0;
  }

  static async getUsersByTrack(trackId, agencyId) {
    const [rows] = await pool.execute(
      `SELECT ut.*, u.id as user_id, u.email, u.first_name, u.last_name, u.role 
       FROM user_tracks ut 
       JOIN users u ON ut.user_id = u.id 
       WHERE ut.track_id = ? AND ut.agency_id = ? 
       ORDER BY u.last_name, u.first_name`,
      [trackId, agencyId]
    );
    return rows;
  }

  static async getTracksByAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT t.*, COUNT(DISTINCT ut.user_id) as user_count 
       FROM training_tracks t 
       LEFT JOIN user_tracks ut ON t.id = ut.track_id AND ut.agency_id = ?
       WHERE t.agency_id = ? OR t.agency_id IS NULL
       GROUP BY t.id
       ORDER BY t.name`,
      [agencyId, agencyId]
    );
    return rows;
  }
}

export default UserTrack;

