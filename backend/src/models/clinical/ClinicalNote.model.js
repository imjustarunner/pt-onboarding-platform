import clinicalPool from '../../config/clinicalDatabase.js';

class ClinicalNote {
  static async hasSignedIntakeForClient({ agencyId, clientId }) {
    const [rows] = await clinicalPool.execute(
      `SELECT n.id FROM clinical_notes n
       JOIN clinical_sessions s ON s.id = n.clinical_session_id
       WHERE n.agency_id = ? AND n.client_id = ? AND n.is_deleted = 0
         AND n.provider_signed_at IS NOT NULL
         AND (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json, '$.serviceCode')), s.service_code) = '90791'
           OR (JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json, '$.toolId')) = 'clinical_h0031_intake'
             AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json, '$.serviceCode')), s.service_code) = 'H0031'))
       LIMIT 1`, [agencyId, clientId]
    );
    return !!rows?.length;
  }

  static async create({
    clinicalSessionId,
    agencyId,
    clientId,
    title,
    notePayload = null,
    metadataJson = null,
    createdByUserId
  }, {executor=clinicalPool}={}) {
    if (metadataJson?.amendmentOfNoteId) {
      throw Object.assign(new Error('Add a signed amendment/correction to the original note using Addenda and amendments; do not create a separate note copy.'), { status: 409 });
    }
    const [result] = await executor.execute(
      `INSERT INTO clinical_notes
       (clinical_session_id, agency_id, client_id, title, note_payload, metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        clinicalSessionId,
        agencyId,
        clientId,
        title,
        notePayload,
        metadataJson ? JSON.stringify(metadataJson) : null,
        createdByUserId
      ]
    );
    return this.findById(result.insertId,{executor});
  }

  static async findById(id,{executor=clinicalPool,forUpdate=false}={}) {
    const nid = Number(id || 0);
    if (!nid) return null;
    const [rows] = await executor.execute(
      `SELECT *
       FROM clinical_notes
       WHERE id = ?
       LIMIT 1${forUpdate?' FOR UPDATE':''}`,
      [nid]
    );
    return rows?.[0] || null;
  }

  static async findByDraftId({ clientId, draftId },{executor=clinicalPool,forUpdate=false}={}) {
    const cid = Number(clientId || 0);
    const did = Number(draftId || 0);
    if (!cid || !did) return null;
    try {
      const [rows] = await executor.execute(
        `SELECT *
         FROM clinical_notes
         WHERE client_id = ?
           AND is_deleted = 0
           AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.draftId')) = ?
         ORDER BY id DESC
         LIMIT 1${forUpdate?' FOR UPDATE':''}`,
        [cid, String(did)]
      );
      return rows?.[0] || null;
    } catch(error) {
      if(executor!==clinicalPool || forUpdate)throw error;
      return null;
    }
  }

  static async updatePayload({ noteId, title = undefined, notePayload = undefined, metadataJson = undefined },{executor=clinicalPool}={}) {
    if (metadataJson?.amendmentOfNoteId && (notePayload !== undefined || title != null)) {
      throw Object.assign(new Error('Add a signed amendment/correction to the original note using Addenda and amendments; do not replace an amendment draft.'), { status: 409 });
    }
    const nid = Number(noteId || 0);
    if (nid && notePayload === undefined && title == null && metadataJson !== undefined) {
      const ownsTransaction=executor===clinicalPool;
      const db=ownsTransaction?await clinicalPool.getConnection():executor;
      try {
        if(ownsTransaction)await db.beginTransaction();
        const [[current]]=await db.execute('SELECT * FROM clinical_notes WHERE id=? FOR UPDATE',[nid]);
        if (!current) { if(ownsTransaction)await db.rollback(); return null; }
        if (current.provider_signed_at || current.content_review_source === 'provider_review') {
          const parse=v=>typeof v==='string'?JSON.parse(v || '{}'):v || {};
          const canonical=v=>JSON.stringify(v, function(k,value){return value && typeof value==='object' && !Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value;});
          const incoming=parse(metadataJson), existing=parse(current.metadata_json);
          for (const [key,value] of Object.entries(incoming)) {
            if (!['printUpload','digitalShare'].includes(key) && canonical(value)!==canonical(existing[key])) throw Object.assign(new Error('Signed clinical content and signature history require a linked amendment version.'),{status:409});
          }
          const permitted={};
          if (incoming.printUpload !== undefined) permitted.printUpload=incoming.printUpload;
          if (incoming.digitalShare !== undefined) permitted.digitalShare={...(existing.digitalShare || {}),...incoming.digitalShare};
          if (!Object.keys(permitted).length) throw Object.assign(new Error('Only operational document references may be updated on a signed note.'),{status:409});
          await db.execute('UPDATE clinical_notes SET metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[JSON.stringify({...existing,...permitted}),nid]);
          if(ownsTransaction)await db.commit(); return await this.findById(nid,{executor:db});
        }
        if(ownsTransaction)await db.rollback();
      } catch(error) { if(ownsTransaction)await db.rollback(); throw error; } finally { if(ownsTransaction)db.release(); }
    }
    if (!nid) return null;
    const updates = [];
    const values = [];
    if (title != null) {
      updates.push('title = ?');
      values.push(String(title).slice(0, 255));
    }
    if (notePayload !== undefined) {
      updates.push('note_payload = ?');
      values.push(notePayload);
    }
    if (metadataJson !== undefined) {
      updates.push('metadata_json = ?');
      values.push(metadataJson ? JSON.stringify(metadataJson) : null);
    }
    if (!updates.length) return this.findById(nid,{executor});
    values.push(nid);
    const [result]=await executor.execute(
      `UPDATE clinical_notes SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND provider_signed_at IS NULL AND COALESCE(content_review_source,'') <> 'provider_review'`,
      values
    );
    if(!result.affectedRows)throw Object.assign(new Error('Completed notes must be changed through an amendment/addendum'),{status:409});
    return this.findById(nid,{executor});
  }

  static async listBySession({ clinicalSessionId, includeDeleted = false }) {
    const sid = Number(clinicalSessionId || 0);
    if (!sid) return [];
    const [rows] = await clinicalPool.execute(
      `SELECT id, clinical_session_id, agency_id, client_id, title, metadata_json, created_by_user_id, created_at, updated_at,
              is_deleted, deleted_at, deleted_by_user_id, is_legal_hold, legal_hold_reason, legal_hold_set_at,
              legal_hold_set_by_user_id, legal_hold_released_at, legal_hold_released_by_user_id
       FROM clinical_notes
       WHERE clinical_session_id = ?
         AND (? = 1 OR is_deleted = 0)
       ORDER BY created_at DESC`,
      [sid, includeDeleted ? 1 : 0]
    );
    return rows || [];
  }

  static async softDeleteById(id, actorUserId) {
    const [result] = await clinicalPool.execute(
      `UPDATE clinical_notes
       SET is_deleted = 1,
           deleted_at = NOW(),
           deleted_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND is_deleted = 0
         AND provider_signed_at IS NULL
         AND COALESCE(content_review_source,'') <> 'provider_review'
         AND is_legal_hold = 0`,
      [actorUserId, id]
    );
    return result.affectedRows > 0;
  }

  static async restoreById(id) {
    const [result] = await clinicalPool.execute(
      `UPDATE clinical_notes
       SET is_deleted = 0,
           deleted_at = NULL,
           deleted_by_user_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND is_deleted = 1`,
      [id]
    );
    return result.affectedRows > 0;
  }

  static async setLegalHoldById(id, reason, actorUserId) {
    const [result] = await clinicalPool.execute(
      `UPDATE clinical_notes
       SET is_legal_hold = 1,
           legal_hold_reason = ?,
           legal_hold_set_at = NOW(),
           legal_hold_set_by_user_id = ?,
           legal_hold_released_at = NULL,
           legal_hold_released_by_user_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason, actorUserId, id]
    );
    return result.affectedRows > 0;
  }

  static async releaseLegalHoldById(id, actorUserId) {
    const [result] = await clinicalPool.execute(
      `UPDATE clinical_notes
       SET is_legal_hold = 0,
           legal_hold_released_at = NOW(),
           legal_hold_released_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND is_legal_hold = 1`,
      [actorUserId, id]
    );
    return result.affectedRows > 0;
  }
}

export default ClinicalNote;
