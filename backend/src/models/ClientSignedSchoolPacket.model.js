import pool from '../config/database.js';

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

class ClientSignedSchoolPacket {
  static _tableExists = null;

  static async tableExists() {
    if (this._tableExists === true) return true;
    if (this._tableExists === false) return false;
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_signed_school_packets'`
      );
      this._tableExists = Number(rows?.[0]?.cnt || 0) > 0;
      return this._tableExists;
    } catch {
      this._tableExists = false;
      return false;
    }
  }

  static normalize(row) {
    if (!row) return null;
    return {
      ...row,
      contents: parseJson(row.contents_json, []),
      packet_version: row.packet_version != null ? Number(row.packet_version) : null,
      master_form_version: row.master_form_version != null ? Number(row.master_form_version) : null
    };
  }

  static async create({
    clientId,
    intakeSubmissionId = null,
    schoolOrganizationId = null,
    agencyId = null,
    packetVersion = null,
    masterFormVersion = null,
    locale = 'en',
    signedAt = null,
    contents = []
  }) {
    if (!(await this.tableExists())) return null;
    const cid = Number(clientId || 0);
    if (!cid) return null;
    const [result] = await pool.execute(
      `INSERT INTO client_signed_school_packets
         (client_id, intake_submission_id, school_organization_id, agency_id,
          packet_version, master_form_version, locale, signed_at, contents_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)`,
      [
        cid,
        intakeSubmissionId ? Number(intakeSubmissionId) : null,
        schoolOrganizationId ? Number(schoolOrganizationId) : null,
        agencyId ? Number(agencyId) : null,
        packetVersion != null ? Number(packetVersion) : null,
        masterFormVersion != null ? Number(masterFormVersion) : null,
        String(locale || 'en').slice(0, 8),
        signedAt || null,
        JSON.stringify(Array.isArray(contents) ? contents : [])
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    if (!(await this.tableExists())) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM client_signed_school_packets WHERE id = ? LIMIT 1`,
      [Number(id || 0)]
    );
    return this.normalize(rows?.[0] || null);
  }

  static async listByClientId(clientId) {
    if (!(await this.tableExists())) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM client_signed_school_packets
       WHERE client_id = ?
       ORDER BY signed_at DESC, id DESC`,
      [Number(clientId || 0)]
    );
    return (rows || []).map((r) => this.normalize(r));
  }
}

export default ClientSignedSchoolPacket;
