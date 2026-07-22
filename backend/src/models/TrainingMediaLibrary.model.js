import pool from '../config/database.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    agencyId: row.agency_id,
    title: row.title,
    mediaKind: row.media_kind,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    gcsPath: row.gcs_path,
    publicUrl: row.public_url,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    sourceKind: row.source_kind,
    externalUrl: row.external_url,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

class TrainingMediaLibrary {
  static async findAll({ agencyId = null, mediaKind = null } = {}) {
    const conditions = [];
    const params = [];
    if (agencyId != null && agencyId !== '' && agencyId !== 'null') {
      conditions.push('(agency_id IS NULL OR agency_id = ?)');
      params.push(Number(agencyId));
    }
    if (mediaKind) {
      conditions.push('media_kind = ?');
      params.push(mediaKind);
    }
    let sql = 'SELECT * FROM training_media_library';
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY created_at DESC, title ASC';
    const [rows] = await pool.execute(sql, params);
    return rows.map(mapRow);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM training_media_library WHERE id = ? LIMIT 1',
      [id]
    );
    return mapRow(rows[0]);
  }

  static async create(data) {
    const [result] = await pool.execute(
      `INSERT INTO training_media_library
        (agency_id, title, media_kind, mime_type, original_filename, gcs_path, public_url,
         size_bytes, duration_seconds, source_kind, external_url, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.agencyId ?? null,
        data.title,
        data.mediaKind,
        data.mimeType ?? null,
        data.originalFilename ?? null,
        data.gcsPath,
        data.publicUrl ?? null,
        data.sizeBytes ?? null,
        data.durationSeconds ?? null,
        data.sourceKind || 'upload',
        data.externalUrl ?? null,
        data.createdByUserId ?? null
      ]
    );
    return this.findById(result.insertId);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM training_media_library WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default TrainingMediaLibrary;
