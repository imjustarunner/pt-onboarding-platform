import pool from '../config/database.js';

/**
 * Map a free-text carrier name from intake onto agency insurance_types.
 * Exact label match wins; otherwise bucket into Self Pay / None / Commercial.
 * Specific carrier text stays on clients.primary_insurer_name.
 */
export async function resolveInsuranceTypeIdForAgency(agencyId, insurerName) {
  const aid = Number(agencyId || 0);
  const name = String(insurerName || '').trim();
  if (!aid || !name) return null;

  try {
    const [exact] = await pool.execute(
      `SELECT id FROM insurance_types
        WHERE agency_id = ? AND LOWER(TRIM(label)) = LOWER(TRIM(?))
        LIMIT 1`,
      [aid, name]
    );
    if (exact?.[0]?.id) return Number(exact[0].id);

    const [byKey] = await pool.execute(
      `SELECT id, insurance_key, label FROM insurance_types
        WHERE agency_id = ? AND (is_active IS NULL OR is_active = 1)
        ORDER BY label ASC`,
      [aid]
    );
    const rows = byKey || [];
    const lower = name.toLowerCase();
    const findByKeyOrLabel = (...needles) => {
      for (const row of rows) {
        const key = String(row.insurance_key || '').toLowerCase();
        const label = String(row.label || '').toLowerCase();
        for (const n of needles) {
          if (key === n || label === n || label.includes(n)) return Number(row.id);
        }
      }
      return null;
    };

    if (/\bself[-\s]?pay\b|\bcash\b|\bprivate\s*pay\b/.test(lower)) {
      return findByKeyOrLabel('self_pay', 'self pay', 'selfpay') || null;
    }
    if (/\bnone\b|\bn\/a\b|\bnot\s*applicable\b/.test(lower)) {
      return findByKeyOrLabel('none') || null;
    }
    if (/\bmedicaid\b|\bchp\+\b|\bchip\b/.test(lower)) {
      return findByKeyOrLabel('medicaid', 'chp') || findByKeyOrLabel('commercial', 'other') || null;
    }
    if (/\btricare\b/.test(lower)) {
      return findByKeyOrLabel('tricare') || null;
    }

    // Named commercial carriers (Aetna, UHC, etc.) → Commercial / Other when present.
    return (
      findByKeyOrLabel('commercial_other', 'commercial / other', 'commercial')
      || findByKeyOrLabel('other', 'unknown')
      || null
    );
  } catch {
    return null;
  }
}
