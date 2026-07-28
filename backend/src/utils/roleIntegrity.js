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

    if (/clinician/i.test(colType)) {
      findings.push('users.role ENUM still includes deprecated clinician');
    }
    if (String(colDefault || '').toLowerCase() === 'clinician') {
      findings.push("users.role DEFAULT is clinician (should be provider)");
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
          'Do NOT auto-remap roles. Investigate out-of-band restore/import. ' +
          'Clinician is permanently retired (migrations 1080/1081).'
      );
      return { ok: false, findings, clinicianCount, colDefault };
    }

    return { ok: true, findings: [], clinicianCount: 0, colDefault };
  } catch (err) {
    logger.warn?.(`[role-integrity] check skipped: ${err?.message || err}`);
    return { ok: true, skipped: true, error: err?.message || String(err) };
  }
}
