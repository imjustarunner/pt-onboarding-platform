/**
 * Model for client_paper_packet_disclosures.
 * One row per paper-packet confirmation that records:
 * - which version label was on the printed packet the family signed
 * - the provider snapshot from that version (so we can flag provider mismatches later)
 */
import pool from '../config/database.js';

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

class ClientPaperPacketDisclosure {
  static _tableExists = null;

  static async tableExists() {
    if (this._tableExists === true) return true;
    if (this._tableExists === false) return false;
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_paper_packet_disclosures'`
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
      providers_snapshot: parseJson(row.providers_snapshot, [])
    };
  }

  static async create({
    clientId,
    schoolOrganizationId,
    packetVersionLabel,
    schoolPacketOrgVersionId = null,
    providersSnapshot = null,
    confirmedByUserId = null
  }) {
    if (!(await this.tableExists())) return null;
    const cid = Number(clientId || 0);
    const sid = Number(schoolOrganizationId || 0);
    if (!cid || !sid) return null;
    const snapshotJson = Array.isArray(providersSnapshot)
      ? JSON.stringify(providersSnapshot)
      : null;
    const [result] = await pool.execute(
      `INSERT INTO client_paper_packet_disclosures
         (client_id, school_organization_id, packet_version_label,
          school_packet_org_version_id, providers_snapshot, confirmed_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        cid, sid,
        String(packetVersionLabel || '').slice(0, 32),
        schoolPacketOrgVersionId ? Number(schoolPacketOrgVersionId) : null,
        snapshotJson,
        confirmedByUserId ? Number(confirmedByUserId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    if (!(await this.tableExists())) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM client_paper_packet_disclosures WHERE id = ? LIMIT 1`,
      [Number(id || 0)]
    );
    return this.normalize(rows?.[0] || null);
  }

  /** Returns the most recent disclosure record for a client. */
  static async findLatestForClient(clientId) {
    if (!(await this.tableExists())) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM client_paper_packet_disclosures
       WHERE client_id = ?
       ORDER BY confirmed_at DESC, id DESC
       LIMIT 1`,
      [Number(clientId || 0)]
    );
    return this.normalize(rows?.[0] || null);
  }
}

export default ClientPaperPacketDisclosure;
