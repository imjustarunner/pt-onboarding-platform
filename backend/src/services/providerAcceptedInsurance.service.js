import pool from '../config/database.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';

function isMissingSchemaError(err) {
  const code = String(err?.code || '');
  return code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR';
}

async function listDirectAcceptedInsurances(userId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT uic.id,
            uic.effective_date,
            uic.submitted_date,
            icd.id AS insurance_definition_id,
            icd.name,
            icd.logo_path
     FROM user_insurance_credentialing uic
     JOIN insurance_credentialing_definitions icd
       ON icd.id = uic.insurance_credentialing_definition_id
     WHERE uic.user_id = ? AND icd.agency_id = ?
     ORDER BY icd.sort_order ASC, icd.name ASC`,
    [userId, agencyId]
  );
  return (rows || []).map((r) => ({
    id: r.id,
    insurance_definition_id: r.insurance_definition_id,
    name: String(r.name || ''),
    label: String(r.name || ''),
    logo_path: r.logo_path || null,
    logo_url: publicUploadsUrlFromStoredPath(r.logo_path || null),
    effective_date: r.effective_date || null,
    submitted_date: r.submitted_date || null
  }));
}

/**
 * Insurances displayed for a provider: their own credentialing rows plus any
 * inherited from their billing supervisor (supervisees bill under billing supervisor).
 */
export async function listProviderAcceptedInsurances({ userId, agencyId }) {
  const uid = parseInt(userId, 10);
  const aid = parseInt(agencyId, 10);
  if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(aid) || aid <= 0) {
    return [];
  }
  try {
    const own = await listDirectAcceptedInsurances(uid, aid);
    const byDefId = new Map();
    for (const row of own) {
      byDefId.set(Number(row.insurance_definition_id), {
        ...row,
        source: 'self'
      });
    }

    const billingSupervisorId = await SupervisorAssignment.getBillingSupervisorId(uid, aid);
    if (billingSupervisorId && billingSupervisorId !== uid) {
      const inherited = await listDirectAcceptedInsurances(billingSupervisorId, aid);
      let billingSupervisorName = '';
      try {
        const [urows] = await pool.execute(
          'SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1',
          [billingSupervisorId]
        );
        const u = urows?.[0];
        if (u) billingSupervisorName = `${u.first_name || ''} ${u.last_name || ''}`.trim();
      } catch {
        // ignore
      }

      for (const row of inherited) {
        const defId = Number(row.insurance_definition_id);
        if (byDefId.has(defId)) continue;
        byDefId.set(defId, {
          ...row,
          id: null,
          source: 'billing_supervisor',
          inherited_from_user_id: billingSupervisorId,
          inherited_from_name: billingSupervisorName
        });
      }
    }

    return Array.from(byDefId.values()).sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''))
    );
  } catch (err) {
    if (isMissingSchemaError(err)) return [];
    throw err;
  }
}

export function mapAcceptedInsuranceForDisplay(row) {
  return {
    insurance_definition_id: row.insurance_definition_id,
    insurance_key: String(row.insurance_definition_id),
    name: row.name,
    label: row.label || row.name,
    logo_path: row.logo_path || null,
    logo_url: row.logo_url || null,
    effective_date: row.effective_date || null,
    source: row.source || 'self',
    inherited_from_name: row.inherited_from_name || null
  };
}

export async function listProviderAcceptedInsurancesForDisplay({ userId, agencyId }) {
  const rows = await listProviderAcceptedInsurances({ userId, agencyId });
  return rows.map(mapAcceptedInsuranceForDisplay);
}

export default { listProviderAcceptedInsurances, listProviderAcceptedInsurancesForDisplay, mapAcceptedInsuranceForDisplay };
