const PORTAL_DOB_ROLES = new Set(['client_guardian', 'guardian', 'client']);

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Normalize a date-like value to YYYY-MM-DD, or null. */
export function normalizeDobInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }
  const us = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (us) {
    const m = Number(us[1]);
    const d = Number(us[2]);
    const y = Number(us[3]);
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
  }
  return null;
}

function sqlDateToYmd(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  return normalizeDobInput(String(value).slice(0, 10));
}

export async function loadLinkedClientDobs(userId) {
  const uid = Number(userId || 0);
  if (!uid) return [];
  const { default: pool } = await import('../config/database.js');
  const [rows] = await pool.execute(
    `SELECT c.id, c.full_name, c.date_of_birth
     FROM clients c
     INNER JOIN client_guardians cg
       ON cg.client_id = c.id AND cg.guardian_user_id = ?
     WHERE c.date_of_birth IS NOT NULL
     UNION
     SELECT c.id, c.full_name, c.date_of_birth
     FROM clients c
     WHERE c.user_id = ? AND c.date_of_birth IS NOT NULL`,
    [uid, uid]
  );
  return (rows || [])
    .map((r) => ({
      clientId: r.id,
      fullName: r.full_name || null,
      dob: sqlDateToYmd(r.date_of_birth)
    }))
    .filter((r) => r.dob);
}

export function portalRoleNeedsClientDob(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  return PORTAL_DOB_ROLES.has(role);
}

/**
 * When a guardian/client is setting a first password, require the linked client's DOB
 * if one is on file. Missing DOBs on the record do not block setup.
 */
export async function assertClientDobForPortalSetup(user, submittedDob) {
  if (!portalRoleNeedsClientDob(user)) return { required: false, ok: true };
  const linked = await loadLinkedClientDobs(user.id);
  if (!linked.length) return { required: false, ok: true };
  const submitted = normalizeDobInput(submittedDob);
  if (!submitted) {
    const err = new Error("Enter the client's date of birth to finish setting up this portal account.");
    err.status = 400;
    err.code = 'CLIENT_DOB_REQUIRED';
    throw err;
  }
  if (!linked.some((r) => r.dob === submitted)) {
    const err = new Error("That date of birth does not match the client on this account.");
    err.status = 400;
    err.code = 'CLIENT_DOB_MISMATCH';
    throw err;
  }
  return { required: true, ok: true };
}

export async function clientDobSetupMeta(user) {
  if (!portalRoleNeedsClientDob(user)) {
    return { requiresClientDob: false };
  }
  const linked = await loadLinkedClientDobs(user.id);
  return {
    requiresClientDob: linked.length > 0
  };
}
