import crypto from 'crypto';
import pool from '../config/database.js';
import { generateJoinToken } from '../utils/joinToken.js';

function randomSlugSuffix(len = 6) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len).toLowerCase();
}

function mapRoom(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    agencyId: r.agency_id == null ? null : Number(r.agency_id),
    slug: String(r.slug || ''),
    joinToken: String(r.join_token || ''),
    displayName: r.display_name != null ? String(r.display_name) : null,
    isActive: Number(r.is_active) === 1,
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null
  };
}

function mapLobby(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    myRoomId: Number(r.my_room_id),
    guestDisplayName: String(r.guest_display_name || ''),
    guestPhotoUrl: r.guest_photo_url != null ? String(r.guest_photo_url) : null,
    clientId: r.client_id == null ? null : Number(r.client_id),
    appointmentId: r.appointment_id == null ? null : Number(r.appointment_id),
    status: String(r.status || 'waiting'),
    photoRequiredAck: Number(r.photo_required_ack || 0) === 1,
    createdAt: r.created_at || null,
    admittedAt: r.admitted_at || null,
    admittedByUserId: r.admitted_by_user_id == null ? null : Number(r.admitted_by_user_id)
  };
}

class ProviderMyRoom {
  static async findByUserId(userId) {
    const uid = Number(userId || 0);
    if (!uid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM provider_my_rooms WHERE user_id = ? LIMIT 1`,
      [uid]
    );
    return mapRoom(rows?.[0]);
  }

  static async findBySlug(slug) {
    const key = String(slug || '').trim().toLowerCase();
    if (!key) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM provider_my_rooms WHERE slug = ? LIMIT 1`,
      [key]
    );
    return mapRoom(rows?.[0]);
  }

  static async findByToken(joinToken) {
    const token = String(joinToken || '').trim();
    if (!token) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM provider_my_rooms WHERE join_token = ? LIMIT 1`,
      [token]
    );
    return mapRoom(rows?.[0]);
  }

  static async getOrCreateForUser(userId, agencyId = null) {
    const uid = Number(userId || 0);
    if (!uid) throw Object.assign(new Error('userId is required'), { status: 400 });

    const existing = await this.findByUserId(uid);
    if (existing) {
      if (agencyId && !existing.agencyId) {
        try {
          await pool.execute(
            `UPDATE provider_my_rooms SET agency_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [Number(agencyId), existing.id]
          );
          return this.findByUserId(uid);
        } catch {
          return existing;
        }
      }
      return existing;
    }

    const slug = `u-${uid}-${randomSlugSuffix(6)}`.toLowerCase();
    const joinToken = generateJoinToken().slice(0, 64);
    let displayName = null;
    try {
      const [users] = await pool.execute(
        `SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1`,
        [uid]
      );
      const u = users?.[0];
      if (u) {
        const first = String(u.first_name || '').trim();
        const last = String(u.last_name || '').trim();
        displayName = [first, last].filter(Boolean).join(' ') || null;
      }
    } catch {
      /* optional */
    }

    try {
      const [result] = await pool.execute(
        `INSERT INTO provider_my_rooms
           (user_id, agency_id, slug, join_token, display_name, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [uid, agencyId ? Number(agencyId) : null, slug, joinToken, displayName]
      );
      return mapRoom({
        id: result.insertId,
        user_id: uid,
        agency_id: agencyId ? Number(agencyId) : null,
        slug,
        join_token: joinToken,
        display_name: displayName,
        is_active: 1,
        created_at: new Date(),
        updated_at: new Date()
      });
    } catch (e) {
      // Race: another request created the room
      if (e?.code === 'ER_DUP_ENTRY') {
        return this.findByUserId(uid);
      }
      throw e;
    }
  }

  static async listLobbyWaiting(myRoomId) {
    const rid = Number(myRoomId || 0);
    if (!rid) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM provider_my_room_lobby
       WHERE my_room_id = ? AND status = 'waiting'
       ORDER BY created_at ASC`,
      [rid]
    );
    return (rows || []).map(mapLobby);
  }

  static async addLobbyGuest({
    myRoomId,
    guestDisplayName,
    guestPhotoUrl = null,
    clientId = null,
    appointmentId = null,
    photoRequiredAck = true
  } = {}) {
    const rid = Number(myRoomId || 0);
    const name = String(guestDisplayName || '').trim().slice(0, 255);
    if (!rid) throw Object.assign(new Error('myRoomId is required'), { status: 400 });
    if (!name) throw Object.assign(new Error('guestDisplayName is required'), { status: 400 });
    const photo = guestPhotoUrl ? String(guestPhotoUrl).trim().slice(0, 1024) : null;
    if (!photo) {
      throw Object.assign(new Error('Photo is required to join the waiting lobby'), { status: 400 });
    }

    // Never auto-admit — always insert as waiting
    const [result] = await pool.execute(
      `INSERT INTO provider_my_room_lobby
         (my_room_id, guest_display_name, guest_photo_url, client_id, appointment_id, status, photo_required_ack)
       VALUES (?, ?, ?, ?, ?, 'waiting', ?)`,
      [
        rid,
        name,
        photo,
        clientId ? Number(clientId) : null,
        appointmentId ? Number(appointmentId) : null,
        photoRequiredAck ? 1 : 0
      ]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM provider_my_room_lobby WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return mapLobby(rows?.[0]);
  }

  static async findLobbyById(lobbyId) {
    const id = Number(lobbyId || 0);
    if (!id) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM provider_my_room_lobby WHERE id = ? LIMIT 1`,
      [id]
    );
    return mapLobby(rows?.[0]);
  }

  static async admitGuest(lobbyId, admittedByUserId) {
    const id = Number(lobbyId || 0);
    if (!id) throw Object.assign(new Error('lobbyId is required'), { status: 400 });
    const guest = await this.findLobbyById(id);
    if (!guest) throw Object.assign(new Error('Lobby guest not found'), { status: 404 });
    if (guest.status !== 'waiting') {
      throw Object.assign(new Error('Guest is not waiting'), { status: 409 });
    }
    await pool.execute(
      `UPDATE provider_my_room_lobby
       SET status = 'admitted',
           admitted_at = CURRENT_TIMESTAMP,
           admitted_by_user_id = ?
       WHERE id = ? AND status = 'waiting'`,
      [admittedByUserId ? Number(admittedByUserId) : null, id]
    );
    return this.findLobbyById(id);
  }

  static async dismissGuest(lobbyId) {
    const id = Number(lobbyId || 0);
    if (!id) throw Object.assign(new Error('lobbyId is required'), { status: 400 });
    const guest = await this.findLobbyById(id);
    if (!guest) throw Object.assign(new Error('Lobby guest not found'), { status: 404 });
    await pool.execute(
      `UPDATE provider_my_room_lobby
       SET status = 'dismissed'
       WHERE id = ?`,
      [id]
    );
    return this.findLobbyById(id);
  }
}

export default ProviderMyRoom;
