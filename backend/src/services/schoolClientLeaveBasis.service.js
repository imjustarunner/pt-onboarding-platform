import pool from '../config/database.js';
import { computeLineAmount, loadUserPaySystemContext } from './paySystem.service.js';
import { classifySchoolServiceEvidence, isPayableSchoolReportRow, schoolBasisFromApprovedLine } from '../utils/schoolClientLeaveBasis.js';

export { classifySchoolServiceEvidence } from '../utils/schoolClientLeaveBasis.js';
const date = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const code = value => String(value || '').trim().toUpperCase();
const safeMethod = value => /^[a-z0-9_:-]{1,64}$/i.test(String(value || '')) ? String(value) : null;
const placeholder = values => values.map(() => '?').join(',');

/** Persist only identity outcomes and non-PHI service-location evidence; never create a clinical record. */
export async function resolveSchoolClientRowEvidence({ agencyId, payrollImportId, rows = [], matches = [], actorId = null, db = pool }) {
  const [stored] = await db.execute('SELECT id,agency_id,payroll_import_id,payroll_period_id,source_row_number,user_id,service_date,location,place_of_service FROM payroll_import_rows WHERE agency_id=? AND payroll_import_id=? ORDER BY id', [agencyId, payrollImportId]);
  const matchesBySource = new Map(matches.map(m => [Number(m.sourceRowNumber), m]));
  const inputsBySource = new Map(rows.map(r => [Number(r.sourceRowNumber ?? r.source_row_number), r]));
  const clientIds = [...new Set(matches.filter(m => m.matchStatus === 'matched' && Number(m.clientId) > 0).map(m => Number(m.clientId)))];
  const [organizations] = await db.execute("SELECT a.id,a.name FROM agencies a WHERE a.organization_type='school' AND (a.id=? OR EXISTS(SELECT 1 FROM organization_affiliations oa WHERE oa.agency_id=? AND oa.organization_id=a.id AND oa.is_active=1))", [agencyId, agencyId]);
  const [locations] = await db.execute('SELECT id,name,school_organization_id,place_of_service,location_kind FROM agency_service_locations WHERE agency_id=?', [agencyId]);
  let clients = [];
  if (clientIds.length) {
    [clients] = await db.execute(`SELECT id,agency_id,organization_id,client_type FROM clients WHERE agency_id=? AND id IN (${placeholder(clientIds)})`, [agencyId, ...clientIds]);
    const [affiliations] = await db.execute(`SELECT client_id,organization_id FROM client_organization_assignments WHERE is_active=1 AND client_id IN (${placeholder(clientIds)}) UNION SELECT client_id,organization_id FROM client_provider_assignments WHERE is_active=1 AND client_id IN (${placeholder(clientIds)})`, [...clientIds, ...clientIds]);
    for (const client of clients) client.schoolOrganizationIds = affiliations.filter(a => Number(a.client_id) === Number(client.id)).map(a => Number(a.organization_id));
  }
  const clientsById = new Map(clients.map(c => [Number(c.id), c]));
  const outcomes = [];
  for (const row of stored) {
    const sourceRowNumber = Number(row.source_row_number);
    const input = inputsBySource.get(sourceRowNumber) || {};
    const match = matchesBySource.get(sourceRowNumber);
    const client = match?.matchStatus === 'matched' ? clientsById.get(Number(match.clientId)) : null;
    const classification = classifySchoolServiceEvidence({ client, placeOfService: input.placeOfService ?? input.profileFields?.placeOfService ?? row.place_of_service, location: input.location ?? row.location, schoolLocations: locations, schoolOrganizations: organizations });
    const matchStatus = client ? 'matched' : ['review', 'unmatched'].includes(match?.matchStatus) ? match.matchStatus : 'unmatched';
    const reportedPos = String(input.placeOfService ?? input.profileFields?.placeOfService ?? row.place_of_service ?? '').trim();
    await db.execute(`INSERT INTO payroll_school_client_evidence
      (payroll_import_row_id,agency_id,payroll_import_id,payroll_period_id,source_row_number,user_id,service_date,client_id,match_status,match_method,school_service,school_organization_id,service_location_id,reported_place_of_service,evidence_status,reason_codes_json,classified_by_user_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
      client_id=VALUES(client_id),match_status=VALUES(match_status),match_method=VALUES(match_method),school_service=VALUES(school_service),school_organization_id=VALUES(school_organization_id),service_location_id=VALUES(service_location_id),reported_place_of_service=VALUES(reported_place_of_service),evidence_status=VALUES(evidence_status),reason_codes_json=VALUES(reason_codes_json),classified_by_user_id=VALUES(classified_by_user_id),classified_at=CURRENT_TIMESTAMP`,
    [row.id, agencyId, payrollImportId, row.payroll_period_id, Number.isFinite(sourceRowNumber) && sourceRowNumber > 0 ? sourceRowNumber : null, row.user_id || null, date(row.service_date) || null, client?.id || null, matchStatus, safeMethod(match?.matchMethod), classification.schoolService ? 1 : 0, classification.schoolOrganizationId, classification.locationId, /^\d{1,2}$/.test(reportedPos) ? reportedPos.padStart(2, '0') : null, classification.evidenceStatus, JSON.stringify(classification.reasonCodes), actorId]);
    outcomes.push({ payrollImportRowId: row.id, sourceRowNumber: sourceRowNumber || null, clientId: client?.id || null, matchStatus, ...classification });
  }
  return { rows: outcomes, verifiedSchoolRows: outcomes.filter(r => r.schoolService).length, excludedRows: outcomes.filter(r => r.evidenceStatus === 'excluded').length, reviewRows: outcomes.filter(r => r.evidenceStatus === 'review').length };
}

/** Only the latest report snapshot contributes. Missing evidence remains a visible review, not a zero accrual. */
export async function computeSchoolClientLeaveBasis({ agencyId, userId, payrollPeriodId, periodStart, periodEnd, db = pool, loadContext = loadUserPaySystemContext, calculateLine = computeLineAmount }) {
  const [[latestImport]] = await db.execute('SELECT id FROM payroll_imports WHERE agency_id=? AND payroll_period_id=? ORDER BY created_at DESC,id DESC LIMIT 1', [agencyId, payrollPeriodId]);
  const coverage = { importId: latestImport?.id || null, reportRows: 0, payableRows: 0, schoolRows: 0, excludedRows: 0, nonpayableRows: 0, reviewRows: 0 };
  const totals = { basisHours: 0, directServiceHours: 0, clinicalAdministrativeEquivalentHours: 0, automaticIndirectHours: 0 };
  const reviewReasons = [];
  if (!latestImport) return { ...totals, complete: false, coverage, reviewReasons: [{ code: 'billing_import_missing' }], provenance: 'verified_school_client_service_rows_v1' };
  const [rows] = await db.execute(`SELECT r.id,r.service_code,r.service_date,r.note_status,r.draft_payable,r.unit_count,r.requires_processing,r.processed_at,
      e.client_id,e.match_status,e.school_service,e.evidence_status,e.reason_codes_json
    FROM payroll_import_rows r LEFT JOIN payroll_school_client_evidence e ON e.payroll_import_row_id=r.id AND e.agency_id=r.agency_id
    WHERE r.agency_id=? AND r.payroll_period_id=? AND r.payroll_import_id=? AND r.user_id=? AND r.service_date BETWEEN ? AND ? ORDER BY r.service_date,r.id`, [agencyId, payrollPeriodId, latestImport.id, userId, date(periodStart), date(periodEnd)]);
  const [rules] = await db.execute('SELECT * FROM payroll_service_code_rules WHERE agency_id=?', [agencyId]);
  const rulesByCode = new Map(rules.map(rule => [code(rule.service_code), rule]));
  const contexts = new Map();
  for (const row of rows) {
    coverage.reportRows++;
    if (!isPayableSchoolReportRow(row)) { coverage.nonpayableRows++; continue; }
    coverage.payableRows++;
    if (row.evidence_status === 'excluded') { coverage.excludedRows++; continue; }
    if (Number(row.requires_processing) === 1 && !row.processed_at) {
      coverage.reviewRows++;
      reviewReasons.push({ payrollImportRowId: row.id, code: 'school_service_quantity_processing_pending' });
      continue;
    }
    if (Number(row.school_service) !== 1 || row.match_status !== 'matched' || !row.client_id || row.evidence_status !== 'verified_school') {
      coverage.reviewRows++;
      let reasons;
      try { reasons = typeof row.reason_codes_json === 'string' ? JSON.parse(row.reason_codes_json) : row.reason_codes_json; } catch { reasons = null; }
      reviewReasons.push({ payrollImportRowId: row.id, code: 'school_client_evidence_incomplete', reasons: Array.isArray(reasons) ? reasons : ['row_evidence_missing'] });
      continue;
    }
    const rule = rulesByCode.get(code(row.service_code));
    try {
      if (!rule) throw new Error('approved_code_mapping_missing');
      const quantity = Number(row.unit_count);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('approved_quantity_invalid');
      const day = date(row.service_date);
      if (!contexts.has(day)) contexts.set(day, await loadContext({ agencyId, userId, periodStart: day, periodEnd: day }));
      const context = contexts.get(day);
      if (!context?.enabled || !context.rateProfile) throw new Error('dated_compensation_context_missing');
      const line = calculateLine({ serviceCode: row.service_code, quantity, rule, rateProfile: context.rateProfile, status: { ...context.status, asOfDate: day } });
      const basis = schoolBasisFromApprovedLine(line);
      for (const key of Object.keys(totals)) totals[key] += basis[key];
      coverage.schoolRows++;
    } catch (error) {
      coverage.reviewRows++;
      reviewReasons.push({ payrollImportRowId: row.id, code: /^[a-z_]+$/.test(String(error.message)) ? error.message : 'school_service_mapping_review_required' });
    }
  }
  for (const key of Object.keys(totals)) totals[key] = Math.round(totals[key] * 1e6) / 1e6;
  return { ...totals, complete: coverage.reviewRows === 0, coverage, reviewReasons, provenance: 'verified_school_client_service_rows_v1' };
}

// Future app-native adapter: provide the same confirmed client + actual service-site evidence
// from existing appointments. This module deliberately never creates appointments or sessions.
