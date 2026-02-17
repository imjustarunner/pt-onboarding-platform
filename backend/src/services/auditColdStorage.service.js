import { gzipSync } from 'zlib';
import pool from '../config/database.js';
import StorageService from './storage.service.js';

const TABLES = [
  { name: 'user_activity_log', idCol: 'id', tsCol: 'created_at' },
  { name: 'admin_audit_log', idCol: 'id', tsCol: 'created_at' },
  { name: 'client_access_logs', idCol: 'id', tsCol: 'created_at' },
  { name: 'phi_document_audit_logs', idCol: 'id', tsCol: 'created_at' },
  { name: 'message_logs', idCol: 'id', tsCol: 'created_at' },
  { name: 'call_logs', idCol: 'id', tsCol: 'created_at' },
  { name: 'support_tickets', idCol: 'id', tsCol: 'created_at' },
  { name: 'support_ticket_messages', idCol: 'id', tsCol: 'created_at' }
];

function getQuarter(dateLike) {
  const d = new Date(dateLike);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return { year: d.getUTCFullYear(), quarter: q };
}

function toIso(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

class AuditColdStorageService {
  static isEnabled() {
    const flag = String(process.env.AUDIT_LOG_COLD_STORAGE_ENABLED || 'true').toLowerCase();
    return flag !== 'false' && flag !== '0' && flag !== 'no';
  }

  static hotDays() {
    const n = parseInt(process.env.AUDIT_LOG_HOT_DAYS || '120', 10);
    return Number.isFinite(n) && n >= 30 ? n : 120;
  }

  static batchSize() {
    const n = parseInt(process.env.AUDIT_LOG_COLD_STORAGE_BATCH_SIZE || '5000', 10);
    return Number.isFinite(n) ? Math.max(100, Math.min(n, 20000)) : 5000;
  }

  static keyPrefix() {
    return String(process.env.AUDIT_LOG_COLD_STORAGE_PREFIX || 'cold/audit').trim().replace(/\/+$/, '');
  }

  static deleteAfterExport() {
    const flag = String(process.env.AUDIT_LOG_DELETE_AFTER_EXPORT || 'true').toLowerCase();
    return flag !== 'false' && flag !== '0' && flag !== 'no';
  }

  static async exportTableChunk({ table, cutoff, batchSize, dryRun = false }) {
    const { name, idCol, tsCol } = table;
    const [rows] = await pool.execute(
      `SELECT * FROM ${name}
       WHERE ${tsCol} < ?
       ORDER BY ${tsCol} ASC, ${idCol} ASC
       LIMIT ${batchSize}`,
      [cutoff]
    );
    if (!rows?.length) {
      return { table: name, exported: 0, deleted: 0, skipped: true };
    }

    const firstId = Number(rows[0]?.[idCol] || 0) || null;
    const lastId = Number(rows[rows.length - 1]?.[idCol] || 0) || null;
    const oldestCreatedAt = toIso(rows[0]?.[tsCol]);
    const newestCreatedAt = toIso(rows[rows.length - 1]?.[tsCol]);
    const { year, quarter } = getQuarter(rows[0]?.[tsCol] || new Date());
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const objectKey = `${this.keyPrefix()}/${name}/year=${year}/q=${quarter}/${stamp}-${firstId || 'na'}-${lastId || 'na'}.ndjson.gz`;

    if (!dryRun) {
      const payload = rows.map((r) => JSON.stringify(r)).join('\n');
      const gz = gzipSync(Buffer.from(payload, 'utf8'));
      await StorageService.writeObject(
        objectKey,
        gz,
        'application/gzip',
        {
          table: name,
          rows: String(rows.length),
          oldestCreatedAt: oldestCreatedAt || '',
          newestCreatedAt: newestCreatedAt || ''
        }
      );
    }

    let deleted = 0;
    let deleteApplied = 0;
    if (!dryRun && this.deleteAfterExport()) {
      const ids = rows.map((r) => r[idCol]).filter(Boolean);
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        const [del] = await pool.execute(`DELETE FROM ${name} WHERE ${idCol} IN (${placeholders})`, ids);
        deleted = Number(del?.affectedRows || 0);
        deleteApplied = 1;
      }
    }

    if (!dryRun) {
      await pool.execute(
        `INSERT INTO audit_log_cold_storage_exports
         (table_name, object_key, rows_exported, first_row_id, last_row_id, oldest_created_at, newest_created_at, delete_applied, delete_applied_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          objectKey,
          rows.length,
          firstId,
          lastId,
          oldestCreatedAt ? oldestCreatedAt.slice(0, 19).replace('T', ' ') : null,
          newestCreatedAt ? newestCreatedAt.slice(0, 19).replace('T', ' ') : null,
          deleteApplied,
          deleteApplied ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
          dryRun ? 'dry-run' : null
        ]
      );
    }

    return {
      table: name,
      exported: rows.length,
      deleted,
      objectKey,
      firstId,
      lastId,
      oldestCreatedAt,
      newestCreatedAt
    };
  }

  static async run({ dryRun = false } = {}) {
    if (!this.isEnabled()) return { enabled: false, chunks: [] };
    const hotDays = this.hotDays();
    const batchSize = this.batchSize();
    const cutoff = new Date(Date.now() - (hotDays * 24 * 60 * 60 * 1000));
    const cutoffSql = cutoff.toISOString().slice(0, 19).replace('T', ' ');

    const chunks = [];
    for (const table of TABLES) {
      try {
        const out = await this.exportTableChunk({ table, cutoff: cutoffSql, batchSize, dryRun });
        chunks.push(out);
      } catch (error) {
        chunks.push({
          table: table.name,
          exported: 0,
          deleted: 0,
          error: error?.message || 'Unknown export error'
        });
      }
    }
    const exported = chunks.reduce((sum, c) => sum + Number(c.exported || 0), 0);
    const deleted = chunks.reduce((sum, c) => sum + Number(c.deleted || 0), 0);
    return { enabled: true, hotDays, batchSize, cutoff: cutoffSql, exported, deleted, chunks };
  }
}

export default AuditColdStorageService;
