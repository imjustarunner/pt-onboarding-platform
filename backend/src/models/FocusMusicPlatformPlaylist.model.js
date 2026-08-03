import pool from '../config/database.js';

class FocusMusicPlatformPlaylist {
  static mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug || null,
      description: row.description || '',
      sort_order: row.sort_order,
      created_by_user_id: row.created_by_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  static async listAll() {
    const [rows] = await pool.execute(
      `SELECT id, name, slug, description, sort_order, created_by_user_id, created_at, updated_at
       FROM focus_music_platform_playlists
       ORDER BY sort_order ASC, id ASC`
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async listTracksForPlaylists(playlistIds = []) {
    const ids = (playlistIds || []).map((id) => Number(id)).filter((id) => id > 0);
    if (!ids.length) return new Map();
    const ph = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT playlist_id, track_id, sort_order
       FROM focus_music_platform_playlist_tracks
       WHERE playlist_id IN (${ph})
       ORDER BY sort_order ASC, id ASC`,
      ids
    );
    const map = new Map();
    for (const row of rows || []) {
      const pid = Number(row.playlist_id);
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid).push(String(row.track_id));
    }
    return map;
  }

  static async findById(id) {
    const pid = Number(id);
    if (!pid) return null;
    const [rows] = await pool.execute(
      `SELECT id, name, slug, description, sort_order, created_by_user_id, created_at, updated_at
       FROM focus_music_platform_playlists WHERE id = ? LIMIT 1`,
      [pid]
    );
    return this.mapRow(rows?.[0]);
  }

  static async findBySlug(slug) {
    const key = String(slug || '').trim();
    if (!key) return null;
    const [rows] = await pool.execute(
      `SELECT id, name, slug, description, sort_order, created_by_user_id, created_at, updated_at
       FROM focus_music_platform_playlists WHERE slug = ? LIMIT 1`,
      [key]
    );
    return this.mapRow(rows?.[0]);
  }

  static async create({ name, slug = null, description = null, sortOrder = 0, createdByUserId = null }) {
    const [result] = await pool.execute(
      `INSERT INTO focus_music_platform_playlists (name, slug, description, sort_order, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        String(name || 'Playlist').slice(0, 120),
        slug ? String(slug).slice(0, 64) : null,
        description ? String(description).slice(0, 500) : null,
        Number(sortOrder) || 0,
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, { name, slug, description, sortOrder }) {
    const pid = Number(id);
    if (!pid) return null;
    const sets = [];
    const params = [];
    if (name != null) {
      sets.push('name = ?');
      params.push(String(name).slice(0, 120));
    }
    if (slug !== undefined) {
      sets.push('slug = ?');
      params.push(slug ? String(slug).slice(0, 64) : null);
    }
    if (description !== undefined) {
      sets.push('description = ?');
      params.push(description ? String(description).slice(0, 500) : null);
    }
    if (sortOrder != null) {
      sets.push('sort_order = ?');
      params.push(Number(sortOrder) || 0);
    }
    if (!sets.length) return this.findById(pid);
    params.push(pid);
    await pool.execute(
      `UPDATE focus_music_platform_playlists SET ${sets.join(', ')} WHERE id = ?`,
      params
    );
    return this.findById(pid);
  }

  static async delete(id) {
    const pid = Number(id);
    if (!pid) return false;
    const [result] = await pool.execute(
      `DELETE FROM focus_music_platform_playlists WHERE id = ?`,
      [pid]
    );
    return result.affectedRows > 0;
  }

  static async setTracks(playlistId, trackIds = []) {
    const pid = Number(playlistId);
    if (!pid) return [];
    const unique = [];
    const seen = new Set();
    for (const raw of trackIds || []) {
      const tid = String(raw || '').trim();
      if (!tid || seen.has(tid)) continue;
      seen.add(tid);
      unique.push(tid);
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `DELETE FROM focus_music_platform_playlist_tracks WHERE playlist_id = ?`,
        [pid]
      );
      let order = 0;
      for (const trackId of unique) {
        await conn.execute(
          `INSERT INTO focus_music_platform_playlist_tracks (playlist_id, track_id, sort_order)
           VALUES (?, ?, ?)`,
          [pid, trackId, order++]
        );
      }
      await conn.commit();
      return unique;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async addTrack(playlistId, trackId) {
    const pid = Number(playlistId);
    const tid = String(trackId || '').trim();
    if (!pid || !tid) return false;
    const [existing] = await pool.execute(
      `SELECT id FROM focus_music_platform_playlist_tracks
       WHERE playlist_id = ? AND track_id = ? LIMIT 1`,
      [pid, tid]
    );
    if (existing?.length) return true;
    const [maxRow] = await pool.execute(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order
       FROM focus_music_platform_playlist_tracks WHERE playlist_id = ?`,
      [pid]
    );
    const nextOrder = Number(maxRow?.[0]?.max_order ?? -1) + 1;
    await pool.execute(
      `INSERT INTO focus_music_platform_playlist_tracks (playlist_id, track_id, sort_order)
       VALUES (?, ?, ?)`,
      [pid, tid, nextOrder]
    );
    return true;
  }

  static async removeTrack(playlistId, trackId) {
    const pid = Number(playlistId);
    const tid = String(trackId || '').trim();
    if (!pid || !tid) return false;
    const [result] = await pool.execute(
      `DELETE FROM focus_music_platform_playlist_tracks
       WHERE playlist_id = ? AND track_id = ?`,
      [pid, tid]
    );
    return result.affectedRows > 0;
  }
}

export default FocusMusicPlatformPlaylist;
