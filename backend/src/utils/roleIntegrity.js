/**
 * Role integrity checks — ALERT ONLY.
 * Never remaps or auto-switches user roles. Bulk role mutation is the failure mode
 * we are trying to prevent (clinician collapse / blanket provider rewrites).
 */
export async function checkUsersRoleIntegrity(pool, { logger = console } = {}) {
  if (!pool) return { ok: true, skipped: true };

  const findings = [];

  try {
    const [cols] = await pool.execute(
      `SELECT COLUMN_TYPE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'role'
       LIMIT 1`
    );
    const col = cols?.[0] || null;
    const colType = String(col?.COLUMN_TYPE || '');
    const colDefault = col?.COLUMN_DEFAULT == null ? null : String(col.COLUMN_DEFAULT);
    const colTypeLower = colType.toLowerCase();

    if (/clinician/i.test(colType)) {
      findings.push('users.role ENUM still includes deprecated clinician');
    }
    if (String(colDefault || '').toLowerCase() === 'clinician') {
      findings.push("users.role DEFAULT is clinician (should be provider)");
    }
    // Ancient 5-value ENUM from migration 007 / 000_consolidated — this is the collapse signature.
    if (
      colTypeLower.includes("'clinician'")
      && !colTypeLower.includes("'provider'")
    ) {
      findings.push(
        "users.role ENUM collapsed to pre-portal set (missing provider) — likely 000_consolidated/007 ALTER or restore"
      );
    }
    for (const required of ['provider', 'school_staff', 'client_guardian', 'super_admin', 'athlete']) {
      if (!colTypeLower.includes(`'${required}'`)) {
        findings.push(`users.role ENUM missing required value '${required}'`);
      }
    }
    if (String(colDefault || '').toLowerCase() !== 'provider') {
      findings.push(`users.role DEFAULT is '${colDefault}' (should be provider)`);
    }

    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS c FROM users WHERE LOWER(COALESCE(role, '')) = 'clinician'`
    );
    const clinicianCount = Number(rows?.[0]?.c || 0);
    if (clinicianCount > 0) {
      findings.push(`${clinicianCount} user row(s) still have role=clinician`);
    }

    if (findings.length) {
      logger.error?.(
        `[role-integrity] CRITICAL: ${findings.join('; ')}. ` +
          'Do NOT auto-remap roles from app code. Apply migration 1180 (or investigate out-of-band restore/import). ' +
          'Clinician is permanently retired (migrations 1080/1081/1180). Never re-run 000_consolidated_fresh_database.sql against a live DB.'
      );
      return { ok: false, findings, clinicianCount, colDefault, colType };
    }

    return { ok: true, findings: [], clinicianCount: 0, colDefault, colType };
  } catch (err) {
    logger.warn?.(`[role-integrity] check skipped: ${err?.message || err}`);
    return { ok: true, skipped: true, error: err?.message || String(err) };
  }
}
