import pool from '../config/database.js';

class OfficeRoomTypeLink {
  static async setRoomTypes(roomId, roomTypeIds) {
    const ids = (roomTypeIds || [])
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    await pool.execute(`DELETE FROM office_room_type_links WHERE room_id = ?`, [roomId]);
    if (ids.length === 0) return true;

    const values = ids.map(() => '(?, ?)').join(', ');
    const params = ids.flatMap((id) => [roomId, id]);
    await pool.execute(`INSERT INTO office_room_type_links (room_id, room_type_id) VALUES ${values}`, params);
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

