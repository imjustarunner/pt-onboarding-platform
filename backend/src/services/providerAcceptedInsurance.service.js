import { credentialPayerRows } from './credentialPayerEligibility.service.js';
import { superviseeBillingAllowed, defaultSuperviseeBillingAllowed } from '../utils/superviseePayerEligibility.js';
import pool from '../config/database.js';
import {restrictPublicInsurances} from '../utils/publicProviderPresentation.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';

function isMissingSchemaError(err) {
  const code = String(err?.code || '');
  return code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR';
}

async function listDirectAcceptedInsurances(userId, agencyId) {
  const rows = await credentialPayerRows(userId, agencyId);
  return (rows || []).map((r) => ({
    id: r.id,
    insurance_definition_id: r.insurance_definition_id,
    allow_supervisee_billing: superviseeBillingAllowed(r),
    aliases: [r.name, r.parent_name, r.billing_payer_name, r.directory_name].filter(Boolean),
    billing_payer_id: r.billing_payer_name ? r.billing_payer_id : null,
    name: String(r.billing_payer_name || r.name || ''),
    label: String(r.billing_payer_name || r.name || ''),
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
export async function listProviderAcceptedInsurances({ userId, agencyId, includeIneligible = false }) {
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

    const billingSupervisorId = await SupervisorAssignment.resolveClaimBillingSupervisorId(uid, aid);
    if (billingSupervisorId && billingSupervisorId !== uid) {
      const inherited = await listDirectAcceptedInsurances(billingSupervisorId, aid);
      const payerKey = row => row.billing_payer_id || String(row.name).trim().toLowerCase();
      const excludedPayers = new Set(inherited.filter(row => !row.allow_supervisee_billing).map(payerKey));
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
        const ineligible = excludedPayers.has(payerKey(row));
        if (ineligible && !includeIneligible) continue;
        byDefId.set(defId, {
          ...row,
          id: null,
          ineligible_for_supervisee: ineligible,
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
    insurance_key: row.insurance_key || String(row.insurance_definition_id),
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
  const allRows = await listProviderAcceptedInsurances({ userId, agencyId, includeIneligible: true });
  const rows = allRows.filter(row => !row.ineligible_for_supervisee);
  const excluded = allRows.filter(row => row.ineligible_for_supervisee);
  // Agency acceptance is distinct from payer credentialing. Never manufacture a
  // credentialing record or effective date merely to publish accepted coverage.
  let overrides = [];
  try {
    [overrides] = await pool.execute(
      `SELECT i.id, i.label, o.is_allowed FROM provider_insurance_overrides o
       JOIN insurance_types i ON i.id = o.insurance_type_id
       WHERE o.provider_user_id = ? AND i.agency_id = ? AND i.is_active = 1
         AND i.insurance_key NOT IN ('unknown', 'none', 'self_pay')`,
      [Number(userId), Number(agencyId)]
    );
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
  }
  const merged = mergeAgencyInsuranceAcceptance(rows, overrides, excluded);
  const [people] = await pool.execute('SELECT credential, title FROM users WHERE id = ? LIMIT 1', [Number(userId)]);
  return restrictPublicInsurances(merged, people[0] || {}).map(mapAcceptedInsuranceForDisplay);
}

export function mergeAgencyInsuranceAcceptance(rows, overrides, excluded = []) {
  const key = value => String(value || '').trim().toLowerCase();
  const excludedNames = new Set(excluded.flatMap(row => [row.name, ...(row.aliases || [])]).map(key));
  const byName = new Map(rows.map(row => [key(row.name), row]));
  for (const override of overrides) {
    const name = key(override.label);
    if (!name) continue;
    if (!Number(override.is_allowed)) {
      for (const [entryName, row] of byName) {
        if (entryName === name || (row.aliases || []).some(alias => key(alias) === name)) byName.delete(entryName);
      }
    }
    else if (!byName.has(name) && !excludedNames.has(name)
      && defaultSuperviseeBillingAllowed(override.label)
      && !rows.some(row => (row.aliases || []).some(alias => key(alias) === name))) byName.set(name, {
      insurance_definition_id: null,
      insurance_key: `type:${override.id}`,
      name: override.label,
      label: override.label,
      source: 'agency_acceptance'
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default { listProviderAcceptedInsurances, listProviderAcceptedInsurancesForDisplay, mapAcceptedInsuranceForDisplay };
