import pool from '../config/database.js';

class OfficeRoomTypeLink {
  static async setRoomTypes(roomId, roomTypeIds) {
    const ids = [...new Set((roomTypeIds || [])
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n > 0))];

    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      await db.execute('SELECT id FROM office_rooms WHERE id=? FOR UPDATE', [roomId]);
      await db.execute('DELETE FROM office_room_type_links WHERE room_id=?', [roomId]);
      if (ids.length) {
        const values = ids.map(() => '(?, ?)').join(', ');
        await db.execute(`INSERT INTO office_room_type_links (room_id, room_type_id) VALUES ${values}`, ids.flatMap(id => [roomId, id]));
      }
      await db.commit();
    } catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
    return true;
  }

  static async listRoomTypeIds(roomId) {
    const [rows] = await pool.execute(
      `SELECT room_type_id FROM office_room_type_links WHERE room_id = ?`,
      [roomId]
    );
    return (rows || []).map((r) => r.room_type_id);
  }
}

export default OfficeRoomTypeLink;

