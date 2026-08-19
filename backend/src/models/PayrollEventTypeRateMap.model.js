import pool from '../config/database.js';

const VALID_SLOTS = new Set(['direct', 'indirect', 'other_1', 'other_2', 'other_3']);

function normalizeSlot(raw, fallback = 'indirect') {
  const s = String(raw || '').trim().toLowerCase();
  return VALID_SLOTS.has(s) ? s : fallback;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    eventType: String(row.event_type || '').trim().toLowerCase(),
    rateSlot: normalizeSlot(row.rate_slot),
    useDirectIndirectSplit: Number(row.use_direct_indirect_split || 0) === 1
  };
}

class PayrollEventTypeRateMap {
  static validSlots() {
    return [...VALID_SLOTS];
  }

  static async listForAgency(agencyId) {
    const aid = Number(agencyId);
    if (!aid) return [];
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM payroll_event_type_rate_maps WHERE agency_id = ? ORDER BY event_type ASC`,
        [aid]
      );
      return (rows || []).map(mapRow).filter(Boolean);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return [];
      throw e;
    }
  }

  static async getForEventType(agencyId, eventType) {
    const aid = Number(agencyId);
    const t = String(eventType || '').trim().toLowerCase();
    if (!aid || !t) return null;
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM payroll_event_type_rate_maps
         WHERE agency_id = ? AND event_type = ?
         LIMIT 1`,
        [aid, t]
      );
      return mapRow(rows?.[0] || null);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return null;
      throw e;
    }
  }

  static async upsert(agencyId, eventType, { rateSlot = 'indirect', useDirectIndirectSplit = false } = {}) {
    const aid = Number(agencyId);
    const t = String(eventType || '').trim().toLowerCase().slice(0, 64);
    if (!aid || !t) return null;
    const slot = normalizeSlot(rateSlot);
    const split = useDirectIndirectSplit ? 1 : 0;
    await pool.execute(
      `INSERT INTO payroll_event_type_rate_maps
         (agency_id, event_type, rate_slot, use_direct_indirect_split)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         rate_slot = VALUES(rate_slot),
         use_direct_indirect_split = VALUES(use_direct_indirect_split),
         updated_at = CURRENT_TIMESTAMP`,
      [aid, t, slot, split]
    );
    return this.getForEventType(aid, t);
  }

  static async replaceAll(agencyId, rows = []) {
    const aid = Number(agencyId);
    if (!aid) return [];
    const seen = new Set();
    for (const row of rows || []) {
      const t = String(row.eventType || row.event_type || '').trim().toLowerCase();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      await this.upsert(aid, t, {
        rateSlot: row.rateSlot || row.rate_slot,
        useDirectIndirectSplit: !!(row.useDirectIndirectSplit ?? row.use_direct_indirect_split)
      });
    }
    return this.listForAgency(aid);
  }
}

export default PayrollEventTypeRateMap;
