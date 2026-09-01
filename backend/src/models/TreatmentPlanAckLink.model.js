import crypto from 'crypto';
import pool from '../config/database.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const CHANNELS = new Set(['dashboard_share', 'provider_session', 'email_link', 'print_upload']);
const STATUSES = new Set(['issued', 'sent', 'opened', 'viewed', 'signed', 'expired', 'cancelled']);

class TreatmentPlanAckLink {
  static normalize(row) {
    if (!row) return null;
    return {
      ...row,
      id: Number(row.id),
      agency_id: Number(row.agency_id),
      client_id: Number(row.client_id),
      treatment_plan_id: Number(row.treatment_plan_id),
      recipient_user_id: row.recipient_user_id ? Number(row.recipient_user_id) : null,
      issued_by_user_id: row.issued_by_user_id ? Number(row.issued_by_user_id) : null,
      witness_user_id: row.witness_user_id ? Number(row.witness_user_id) : null,
      uploaded_phi_document_id: row.uploaded_phi_document_id
        ? Number(row.uploaded_phi_document_id)
        : null,
      open_count: Number(row.open_count || 0),
      dashboard_visible: !!Number(row.dashboard_visible),
      meta_json: parseJson(row.meta_json)
    };
  }

  static newPublicKey() {
    return crypto.randomBytes(24).toString('hex');
  }

  static async findById(id) {
    const rid = safeInt(id);
    if (!rid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM treatment_plan_ack_links WHERE id = ? LIMIT 1`,
      [rid]
    );
    return this.normalize(rows?.[0] || null);
  }

  static async findByPublicKey(publicKey) {
    const key = String(publicKey || '').trim();
    if (!key) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM treatment_plan_ack_links WHERE public_key = ? LIMIT 1`,
      [key]
    );
    return this.normalize(rows?.[0] || null);
  }

  static async listForPlan({ agencyId, clientId, treatmentPlanId }) {
    const aid = safeInt(agencyId);
    const cid = safeInt(clientId);
    const pid = safeInt(treatmentPlanId);
    if (!aid || !cid || !pid) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM treatment_plan_ack_links
       WHERE agency_id = ? AND client_id = ? AND treatment_plan_id = ?
       ORDER BY created_at DESC`,
      [aid, cid, pid]
    );
    return (rows || []).map((r) => this.normalize(r));
  }

  static async listDashboardForClient({ clientId, recipientUserId = null }) {
    const cid = safeInt(clientId);
    if (!cid) return [];
    const uid = safeInt(recipientUserId);
    const [rows] = await pool.execute(
      `SELECT * FROM treatment_plan_ack_links
       WHERE client_id = ?
         AND dashboard_visible = 1
         AND status NOT IN ('cancelled', 'expired')
         AND (recipient_user_id IS NULL OR recipient_user_id = ? OR ? IS NULL)
       ORDER BY created_at DESC`,
      [cid, uid, uid]
    );
    return (rows || []).map((r) => this.normalize(r));
  }

  static async create({
    agencyId,
    clientId,
    treatmentPlanId,
    channel,
    recipientKind = 'client',
    recipientUserId = null,
    recipientEmail = null,
    recipientName = null,
    issuedByUserId = null,
    dashboardVisible = false,
    expiresAt = null,
    meta = null
  }) {
    const aid = safeInt(agencyId);
    const cid = safeInt(clientId);
    const pid = safeInt(treatmentPlanId);
    const ch = String(channel || '').trim();
    if (!aid || !cid || !pid || !CHANNELS.has(ch)) {
      throw new Error('agencyId, clientId, treatmentPlanId, and valid channel are required');
    }
    const publicKey = this.newPublicKey();
    const [result] = await pool.execute(
      `INSERT INTO treatment_plan_ack_links
       (agency_id, client_id, treatment_plan_id, public_key, channel, status,
        recipient_kind, recipient_user_id, recipient_email, recipient_name,
        issued_by_user_id, dashboard_visible, expires_at, meta_json)
       VALUES (?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        aid,
        cid,
        pid,
        publicKey,
        ch,
        recipientKind === 'guardian' ? 'guardian' : 'client',
        safeInt(recipientUserId),
        recipientEmail ? String(recipientEmail).trim().slice(0, 255) : null,
        recipientName ? String(recipientName).trim().slice(0, 255) : null,
        safeInt(issuedByUserId),
        dashboardVisible ? 1 : 0,
        expiresAt || null,
        meta ? JSON.stringify(meta) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async updateFields(id, fields = {}) {
    const rid = safeInt(id);
    if (!rid) return null;
    const sets = [];
    const vals = [];
    const map = {
      status: 'status',
      sentAt: 'sent_at',
      firstOpenedAt: 'first_opened_at',
      lastOpenedAt: 'last_opened_at',
      openCount: 'open_count',
      signedAt: 'signed_at',
      signedByName: 'signed_by_name',
      signatureImagePath: 'signature_image_path',
      witnessUserId: 'witness_user_id',
      witnessName: 'witness_name',
      witnessSignedAt: 'witness_signed_at',
      uploadedPhiDocumentId: 'uploaded_phi_document_id',
      dashboardVisible: 'dashboard_visible',
      recipientEmail: 'recipient_email',
      recipientName: 'recipient_name',
      recipientUserId: 'recipient_user_id'
    };
    for (const [key, col] of Object.entries(map)) {
      if (fields[key] === undefined) continue;
      sets.push(`${col} = ?`);
      if (key === 'dashboardVisible') vals.push(fields[key] ? 1 : 0);
      else if (key === 'status') {
        const st = String(fields[key] || '');
        vals.push(STATUSES.has(st) ? st : 'issued');
      } else vals.push(fields[key]);
    }
    if (!sets.length) return this.findById(rid);
    vals.push(rid);
    await pool.execute(
      `UPDATE treatment_plan_ack_links SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      vals
    );
    return this.findById(rid);
  }

  static async recordOpen(id) {
    const rid = safeInt(id);
    if (!rid) return null;
    await pool.execute(
      `UPDATE treatment_plan_ack_links
       SET open_count = open_count + 1,
           first_opened_at = COALESCE(first_opened_at, CURRENT_TIMESTAMP),
           last_opened_at = CURRENT_TIMESTAMP,
           status = CASE
             WHEN status IN ('signed', 'cancelled', 'expired') THEN status
             ELSE 'opened'
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [rid]
    );
    return this.findById(rid);
  }
}

class TreatmentPlanAckEvent {
  static async create({
    ackLinkId,
    eventType,
    actorUserId = null,
    actorLabel = null,
    ipHash = null,
    userAgent = null,
    meta = null
  }) {
    const lid = safeInt(ackLinkId);
    const type = String(eventType || '').trim().slice(0, 64);
    if (!lid || !type) return null;
    const [result] = await pool.execute(
      `INSERT INTO treatment_plan_ack_events
       (ack_link_id, event_type, actor_user_id, actor_label, ip_hash, user_agent, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        lid,
        type,
        safeInt(actorUserId),
        actorLabel ? String(actorLabel).slice(0, 255) : null,
        ipHash ? String(ipHash).slice(0, 128) : null,
        userAgent ? String(userAgent).slice(0, 512) : null,
        meta ? JSON.stringify(meta) : null
      ]
    );
    return { id: result.insertId, ack_link_id: lid, event_type: type };
  }

  static async listForLink(ackLinkId, { limit = 100 } = {}) {
    const lid = safeInt(ackLinkId);
    if (!lid) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM treatment_plan_ack_events
       WHERE ack_link_id = ?
       ORDER BY created_at ASC
       LIMIT ${Math.min(200, Math.max(1, Number(limit) || 100))}`,
      [lid]
    );
    return (rows || []).map((r) => ({
      ...r,
      id: Number(r.id),
      ack_link_id: Number(r.ack_link_id),
      actor_user_id: r.actor_user_id ? Number(r.actor_user_id) : null,
      meta_json: parseJson(r.meta_json)
    }));
  }

  static async listForPlanLinks(linkIds = []) {
    const ids = (linkIds || []).map((id) => safeInt(id)).filter(Boolean);
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT * FROM treatment_plan_ack_events
       WHERE ack_link_id IN (${placeholders})
       ORDER BY created_at ASC`,
      ids
    );
    return (rows || []).map((r) => ({
      ...r,
      id: Number(r.id),
      ack_link_id: Number(r.ack_link_id),
      actor_user_id: r.actor_user_id ? Number(r.actor_user_id) : null,
      meta_json: parseJson(r.meta_json)
    }));
  }
}

export { TreatmentPlanAckLink, TreatmentPlanAckEvent };
export default TreatmentPlanAckLink;
