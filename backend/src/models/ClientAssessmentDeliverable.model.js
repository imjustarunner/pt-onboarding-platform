import pool from '../config/database.js';

function mapRow(row) {
  if (!row) return null;
  let scores = row.scores_snapshot_json;
  if (typeof scores === 'string') {
    try {
      scores = JSON.parse(scores);
    } catch {
      scores = null;
    }
  }
  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    clientId: Number(row.client_id),
    assessmentFamily: row.assessment_family,
    assessmentId: Number(row.assessment_id),
    kind: row.kind,
    title: row.title,
    htmlBody: row.html_body,
    plainSummary: row.plain_summary || null,
    scoresSnapshot: scores,
    sharedWithClient: !!row.shared_with_client,
    sharedAt: row.shared_at || null,
    sharedByUserId: row.shared_by_user_id == null ? null : Number(row.shared_by_user_id),
    googleDocId: row.google_doc_id || null,
    googleDocUrl: row.google_doc_url || null,
    storagePath: row.storage_path || null,
    storageMime: row.storage_mime || null,
    version: Number(row.version || 1),
    createdByUserId: row.created_by_user_id == null ? null : Number(row.created_by_user_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default class ClientAssessmentDeliverable {
  static mapRow = mapRow;

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM client_assessment_deliverables WHERE id = ? LIMIT 1`,
      [Number(id)]
    );
    return mapRow(rows?.[0] || null);
  }

  static async listForClient({ clientId, agencyId = null, sharedOnly = false } = {}) {
    const clauses = ['client_id = ?'];
    const params = [Number(clientId)];
    if (agencyId != null) {
      clauses.push('agency_id = ?');
      params.push(Number(agencyId));
    }
    if (sharedOnly) {
      clauses.push('shared_with_client = 1');
    }
    const [rows] = await pool.execute(
      `SELECT * FROM client_assessment_deliverables
       WHERE ${clauses.join(' AND ')}
       ORDER BY updated_at DESC, id DESC`,
      params
    );
    return (rows || []).map(mapRow);
  }

  static async findByAssessmentKind({ family, assessmentId, kind }) {
    const [rows] = await pool.execute(
      `SELECT * FROM client_assessment_deliverables
       WHERE assessment_family = ? AND assessment_id = ? AND kind = ?
       LIMIT 1`,
      [String(family), Number(assessmentId), String(kind)]
    );
    return mapRow(rows?.[0] || null);
  }

  static async upsert({
    agencyId,
    clientId,
    assessmentFamily,
    assessmentId,
    kind,
    title,
    htmlBody,
    plainSummary = null,
    scoresSnapshot = null,
    createdByUserId = null
  }) {
    const existing = await this.findByAssessmentKind({
      family: assessmentFamily,
      assessmentId,
      kind
    });
    const snapshotJson =
      scoresSnapshot == null ? null : JSON.stringify(scoresSnapshot);

    if (existing) {
      await pool.execute(
        `UPDATE client_assessment_deliverables
         SET title = ?,
             html_body = ?,
             plain_summary = ?,
             scores_snapshot_json = ?,
             version = version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [title, htmlBody, plainSummary, snapshotJson, existing.id]
      );
      return this.findById(existing.id);
    }

    const [result] = await pool.execute(
      `INSERT INTO client_assessment_deliverables
        (agency_id, client_id, assessment_family, assessment_id, kind, title,
         html_body, plain_summary, scores_snapshot_json, shared_with_client,
         created_by_user_id, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1)`,
      [
        Number(agencyId),
        Number(clientId),
        String(assessmentFamily),
        Number(assessmentId),
        String(kind),
        title,
        htmlBody,
        plainSummary,
        snapshotJson,
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async updateBody({ id, title = undefined, htmlBody = undefined, plainSummary = undefined }) {
    const row = await this.findById(id);
    if (!row) return null;
    const nextTitle = title !== undefined ? title : row.title;
    const nextHtml = htmlBody !== undefined ? htmlBody : row.htmlBody;
    const nextSummary = plainSummary !== undefined ? plainSummary : row.plainSummary;
    await pool.execute(
      `UPDATE client_assessment_deliverables
       SET title = ?,
           html_body = ?,
           plain_summary = ?,
           version = version + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextTitle, nextHtml, nextSummary, Number(id)]
    );
    return this.findById(id);
  }

  static async setShared({ id, shared, userId = null }) {
    if (shared) {
      await pool.execute(
        `UPDATE client_assessment_deliverables
         SET shared_with_client = 1,
             shared_at = NOW(),
             shared_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId ? Number(userId) : null, Number(id)]
      );
    } else {
      await pool.execute(
        `UPDATE client_assessment_deliverables
         SET shared_with_client = 0,
             shared_at = NULL,
             shared_by_user_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [Number(id)]
      );
    }
    return this.findById(id);
  }

  static async setGoogleDoc({ id, googleDocId, googleDocUrl }) {
    await pool.execute(
      `UPDATE client_assessment_deliverables
       SET google_doc_id = ?,
           google_doc_url = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [googleDocId || null, googleDocUrl || null, Number(id)]
    );
    return this.findById(id);
  }

  static async setStorageReplace({ id, storagePath, storageMime, htmlBody = undefined, title = undefined }) {
    const row = await this.findById(id);
    if (!row) return null;
    await pool.execute(
      `UPDATE client_assessment_deliverables
       SET storage_path = ?,
           storage_mime = ?,
           html_body = COALESCE(?, html_body),
           title = COALESCE(?, title),
           version = version + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        storagePath || null,
        storageMime || null,
        htmlBody !== undefined ? htmlBody : null,
        title !== undefined ? title : null,
        Number(id)
      ]
    );
    return this.findById(id);
  }
}
