import pool from '../config/database.js';
import { getProviderClaimBillingMode } from './resolveClaimProviders.service.js';

const key = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10) || null;
const aliases = value => { try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : []; } catch { return []; } };
async function optionalRows(db, sql, params) {
  try { return (await db.execute(sql, params))[0]; }
  catch (e) { if (e.code === 'ER_NO_SUCH_TABLE') return []; throw e; }
}

// Read existing records on refresh so later report imports and credentialing edits
// are reflected without copying clinical rows or creating new claims.
export async function billingSetupEvidence(agencyId, providers, policy, { db = pool, billingMode = getProviderClaimBillingMode } = {}) {
  const [reports, credentials, groups, latest, modes, catalog, links, payroll] = await Promise.all([
    db.execute(`SELECT provider_user_id, primary_payer_name AS payer_name,
      COUNT(*) AS line_count, SUM(insurance_amount_paid > 0) AS paid_line_count,
      MIN(service_date) AS first_service_date, MAX(service_date) AS last_service_date
      FROM billing_report_lines WHERE agency_id = ? AND provider_user_id IS NOT NULL
        AND TRIM(COALESCE(primary_payer_name, '')) <> ''
      GROUP BY provider_user_id, primary_payer_name`, [agencyId]),
    db.execute(`SELECT c.user_id, d.id AS definition_id, d.name AS payer_name, c.effective_date
      FROM user_insurance_credentialing c JOIN insurance_credentialing_definitions d
        ON d.id = c.insurance_credentialing_definition_id WHERE d.agency_id = ?`, [agencyId]),
    db.execute(`SELECT d.id AS definition_id, g.id AS group_id, g.npi_number, g.label,
      g.office_location_id, c.effective_date
      FROM agency_group_npi_payer_credentialing c
      JOIN agency_group_npis g ON g.id = c.agency_group_npi_id
      JOIN insurance_credentialing_definitions d ON d.id = c.insurance_credentialing_definition_id
      WHERE g.agency_id = ? AND d.agency_id = ? AND g.is_active = 1`, [agencyId, agencyId]),
    db.execute(`SELECT MAX(completed_at) AS last_completed_at FROM billing_report_uploads
      WHERE agency_id = ? AND status = 'completed'`, [agencyId]),
    Promise.all(providers.map(async p => [p.id, await billingMode({ agencyId, providerUserId: p.id })])),
    optionalRows(db, `SELECT r.payer_name, d.claimmd_payer_id, d.directory_name, d.source_names_json
      FROM medical_payer_setup_requests r JOIN medical_payer_setup_details d ON d.request_id = r.id
      WHERE r.agency_id = ? AND d.directory_status = 'id_match' AND d.claimmd_payer_id IS NOT NULL`, [agencyId]),
    optionalRows(db, `SELECT insurance_definition_id, payer_id FROM credentialing_payer_links WHERE agency_id = ?`, [agencyId]),
    db.execute(`SELECT user_id AS provider_user_id, service_code, MAX(service_date) AS last_service_date
      FROM payroll_import_rows WHERE agency_id = ? AND user_id IS NOT NULL
      GROUP BY user_id, service_code`, [agencyId])
  ]);
  return buildBillingSetupEvidence({ providers, policy, reports: reports[0], credentials: credentials[0],
    groups: groups[0], modes: new Map(modes), catalog, links, payroll: payroll[0], lastImportAt: latest[0]?.[0]?.last_completed_at || null });
}

export function buildBillingSetupEvidence({ providers, policy, reports, credentials, groups, modes, lastImportAt, catalog = [], links = [], payroll = [] }) {
  const routes = name => catalog.filter(c => [c.payer_name, c.directory_name, ...aliases(c.source_names_json)].some(n => key(n) === key(name)));
  const credentialRoute = credential => links.find(l => Number(l.insurance_definition_id) === Number(credential.definition_id))?.payer_id;
  const pairs = [];
  for (const provider of providers) {
    const mode = modes.get(provider.id) || {};
    const supervisorId = mode.mode === 'billing_supervisor' ? Number(mode.billingSupervisorUserId) || null : null;
    const inherited = supervisorId && providers.some(p => p.id === supervisorId);
    const providerCredentials = credentials.filter(c => Number(c.user_id) === provider.id || (inherited && Number(c.user_id) === supervisorId));
    const providerReports = reports.filter(r => Number(r.provider_user_id) === provider.id);
    const names = new Map();
    for (const source of [...providerCredentials, ...providerReports]) if (key(source.payer_name)) names.set(key(source.payer_name), String(source.payer_name).trim());
    for (const [nameKey, payerName] of names) {
      const history = providerReports.filter(r => key(r.payer_name) === nameKey);
      const nameRoutes = routes(payerName);
      const nameIds = [...new Set(nameRoutes.map(c => c.claimmd_payer_id))];
      const coverage = providerCredentials.filter(c => key(c.payer_name) === nameKey || (nameIds.length === 1 && credentialRoute(c) === nameIds[0]));
      const definitions = new Set(coverage.map(c => Number(c.definition_id)));
      const saved = (policy?.entries || []).filter(e => Number(e.providerUserId) === provider.id && key(e.payerName) === nameKey);
      const ids = [...new Set([...saved.map(e => e.payerId), ...nameIds, ...coverage.map(credentialRoute)].filter(Boolean))];
      const dates = history.flatMap(r => [day(r.first_service_date), day(r.last_service_date)]).filter(Boolean).sort();
      pairs.push({ providerUserId: provider.id, payerName, payerId: ids.length === 1 ? ids[0] : null, payerMappingConflict: ids.length > 1,
        requiresSupervision: mode.mode === 'billing_supervisor', supervisorUserId: supervisorId,
        reportLines: history.reduce((n, r) => n + Number(r.line_count || 0), 0),
        paidReportLines: history.reduce((n, r) => n + Number(r.paid_line_count || 0), 0),
        firstServiceDate: dates[0] || null, lastServiceDate: dates.at(-1) || null,
        credentials: coverage.map(c => ({ providerUserId: Number(c.user_id), definitionId: Number(c.definition_id), effectiveDate: day(c.effective_date), inherited: Number(c.user_id) !== provider.id })),
        billingGroups: groups.filter(g => definitions.has(Number(g.definition_id))).map(g => ({ id: Number(g.group_id), npi: g.npi_number, label: g.label,
          officeId: Number(g.office_location_id) || null, effectiveDate: day(g.effective_date) }))
      });
    }
  }
  const providerActivity = providers.flatMap(p => {
    const rows = payroll.filter(r => Number(r.provider_user_id) === p.id);
    if (!rows.length) return [];
    return [{ providerUserId: p.id, serviceCodes: [...new Set(rows.map(r => String(r.service_code || '').trim()).filter(Boolean))].sort(),
      lastServiceDate: rows.map(r => day(r.last_service_date)).filter(Boolean).sort().at(-1) || null }];
  });
  return { lastImportAt, pairs, providerActivity };
}
