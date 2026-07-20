import clinicalPool from '../config/clinicalDatabase.js';
import pool from '../config/database.js';

const REPORT_CATALOG = [
  {
    type: 'claims',
    label: 'Claims',
    description: 'Claim amounts, lifecycle, payer, procedures, and Claim.MD status.',
    filters: ['dateRange', 'clientId', 'status', 'serviceCode', 'payer', 'placeOfService', 'search'],
    columns: [
      ['id', 'Claim ID', 'number'], ['claim_number', 'Claim number', 'text'],
      ['date_of_service', 'Service date', 'date'], ['client_display', 'Client', 'text'],
      ['client_id', 'Client ID', 'number'], ['payer_name', 'Payer', 'text'],
      ['procedure_codes', 'Service codes', 'text'], ['place_of_service', 'POS', 'text'],
      ['claim_lifecycle', 'Lifecycle', 'status'], ['claim_status', 'Claim status', 'status'],
      ['line_count', 'Lines', 'number'], ['total_units', 'Units', 'number'],
      ['amount_cents', 'Amount', 'currency'], ['claimmd_last_status', 'Claim.MD status', 'text'],
      ['created_at', 'Created', 'datetime']
    ]
  },
  {
    type: 'claim_lines',
    label: 'Claim Lines',
    description: 'Procedure-level units and charges for every claim line.',
    filters: ['dateRange', 'clientId', 'status', 'serviceCode', 'payer', 'placeOfService', 'search'],
    columns: [
      ['id', 'Line ID', 'number'], ['clinical_claim_id', 'Claim ID', 'number'],
      ['service_date', 'Service date', 'date'], ['client_display', 'Client', 'text'],
      ['client_id', 'Client ID', 'number'], ['payer_name', 'Payer', 'text'],
      ['procedure_code', 'Service code', 'text'], ['modifiers', 'Modifiers', 'text'],
      ['place_of_service', 'POS', 'text'], ['claim_lifecycle', 'Lifecycle', 'status'],
      ['units', 'Units', 'number'], ['charge_cents', 'Charge', 'currency'],
      ['diagnosis_pointers', 'Diagnosis pointers', 'text']
    ]
  },
  {
    type: 'encounters',
    label: 'Encounters',
    description: 'Scheduled clinical encounters, service coding, units, and billing blockers.',
    filters: ['dateRange', 'clientId', 'providerId', 'status', 'serviceCode', 'placeOfService', 'search'],
    columns: [
      ['id', 'Encounter ID', 'number'], ['scheduled_start_at', 'Scheduled start', 'datetime'],
      ['client_display', 'Client', 'text'], ['client_id', 'Client ID', 'number'],
      ['provider_display', 'Provider', 'text'], ['encounter_status', 'Status', 'status'],
      ['service_code', 'Service code', 'text'], ['effective_service_code', 'Effective code', 'text'],
      ['place_of_service', 'POS', 'text'], ['duration_minutes', 'Minutes', 'number'],
      ['billed_units', 'Units', 'number'], ['is_telehealth', 'Telehealth', 'boolean'],
      ['claim_blocked_reason', 'Billing blocker', 'text']
    ]
  },
  {
    type: 'notes',
    label: 'Clinical Notes',
    description: 'Note signing, cosigning, billable status, type, and version.',
    filters: ['dateRange', 'clientId', 'providerId', 'status', 'search'],
    columns: [
      ['id', 'Note ID', 'number'], ['created_at', 'Created', 'datetime'],
      ['client_display', 'Client', 'text'], ['client_id', 'Client ID', 'number'],
      ['title', 'Title', 'text'], ['note_type', 'Note type', 'text'],
      ['version_number', 'Version', 'number'], ['provider_signed_at', 'Provider signed', 'datetime'],
      ['supervisor_cosigned_at', 'Supervisor cosigned', 'datetime'],
      ['is_billable', 'Billable', 'boolean'], ['created_by_display', 'Created by', 'text']
    ]
  },
  {
    type: 'diagnoses',
    label: 'Diagnoses',
    description: 'Active, inactive, and primary diagnosis records by client.',
    filters: ['dateRange', 'clientId', 'status', 'search'],
    columns: [
      ['id', 'Diagnosis ID', 'number'], ['created_at', 'Created', 'datetime'],
      ['client_display', 'Client', 'text'], ['client_id', 'Client ID', 'number'],
      ['icd10_code', 'ICD-10', 'text'], ['description', 'Description', 'text'],
      ['is_primary', 'Primary', 'boolean'], ['is_active', 'Active', 'boolean'],
      ['onset_date', 'Onset date', 'date'], ['created_by_display', 'Created by', 'text']
    ]
  },
  {
    type: 'treatment_plans',
    label: 'Treatment Plans',
    description: 'Treatment plan status and goal/objective counts.',
    filters: ['dateRange', 'clientId', 'providerId', 'status', 'search'],
    columns: [
      ['id', 'Plan ID', 'number'], ['created_at', 'Created', 'datetime'],
      ['client_display', 'Client', 'text'], ['client_id', 'Client ID', 'number'],
      ['title', 'Title', 'text'], ['status', 'Status', 'status'],
      ['goal_count', 'Goals', 'number'], ['objective_count', 'Objectives', 'number'],
      ['source_tool_id', 'Source', 'text'], ['created_by_display', 'Created by', 'text'],
      ['updated_at', 'Updated', 'datetime']
    ]
  },
  {
    type: 'fee_schedule',
    label: 'Fee Schedule',
    description: 'Payer and procedure pricing configuration.',
    filters: ['dateRange', 'status', 'serviceCode', 'payer', 'search'],
    columns: [
      ['id', 'Item ID', 'number'], ['payer_label', 'Payer', 'text'],
      ['procedure_code', 'Procedure code', 'text'], ['modifier', 'Modifier', 'text'],
      ['description', 'Description', 'text'], ['unit_price_cents', 'Unit price', 'currency'],
      ['unit_minutes', 'Unit minutes', 'number'], ['is_active', 'Active', 'boolean'],
      ['updated_at', 'Updated', 'datetime']
    ]
  },
  {
    type: 'service_codes',
    label: 'Service Codes',
    description: 'Medical service-code unit rules, limits, and overflow configuration.',
    filters: ['dateRange', 'status', 'serviceCode', 'placeOfService', 'search'],
    columns: [
      ['id', 'Code ID', 'number'], ['service_code', 'Service code', 'text'],
      ['description', 'Description', 'text'], ['unit_calc_mode', 'Unit calculation', 'text'],
      ['unit_minutes', 'Unit minutes', 'number'], ['min_minutes', 'Min minutes', 'number'],
      ['max_minutes', 'Max minutes', 'number'], ['max_units_per_session', 'Max/session', 'number'],
      ['max_units_per_day', 'Max/day', 'number'], ['default_place_of_service', 'Default POS', 'text'],
      ['overflow_service_code', 'Overflow code', 'text'], ['is_active', 'Active', 'boolean'],
      ['updated_at', 'Updated', 'datetime']
    ]
  },
  {
    type: 'service_locations',
    label: 'Service Locations',
    description: 'Places of service and their linked billing offices.',
    filters: ['dateRange', 'status', 'placeOfService', 'search'],
    columns: [
      ['id', 'Location ID', 'number'], ['name', 'Location', 'text'],
      ['place_of_service', 'POS', 'text'], ['billing_office_name', 'Billing office', 'text'],
      ['city', 'City', 'text'], ['state', 'State', 'text'],
      ['requires_credentialing', 'Credentialing required', 'boolean'],
      ['is_active', 'Active', 'boolean'], ['updated_at', 'Updated', 'datetime']
    ]
  }
].map((report) => ({
  ...report,
  columns: report.columns.map(([key, label, format]) => ({ key, label, format }))
}));

const catalogByType = new Map(REPORT_CATALOG.map((report) => [report.type, report]));
const CLINICAL_TABLES = [
  'clinical_sessions', 'clinical_notes', 'clinical_claims', 'clinical_claim_lines',
  'clinical_diagnoses', 'clinical_treatment_plans', 'clinical_treatment_plan_goals',
  'clinical_treatment_plan_objectives', 'medical_fee_schedule_items'
];
const MAIN_TABLES = ['agency_medical_service_codes', 'agency_service_locations', 'office_locations'];
const REQUIRED_TABLE_BY_REPORT = {
  claims: ['clinical', 'clinical_claims'],
  claim_lines: ['clinical', 'clinical_claim_lines'],
  encounters: ['clinical', 'clinical_sessions'],
  notes: ['clinical', 'clinical_notes'],
  diagnoses: ['clinical', 'clinical_diagnoses'],
  treatment_plans: ['clinical', 'clinical_treatment_plans'],
  fee_schedule: ['clinical', 'medical_fee_schedule_items'],
  service_codes: ['main', 'agency_medical_service_codes'],
  service_locations: ['main', 'agency_service_locations']
};

const clean = (value) => String(value || '').trim();
const positiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const activeValue = (status) => {
  const value = clean(status).toLowerCase();
  if (value === 'active') return 1;
  if (value === 'inactive') return 0;
  return null;
};

async function loadSchemaMap(db, tables) {
  const placeholders = tables.map(() => '?').join(',');
  const [rows] = await db.execute(
    `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`,
    tables
  );
  const map = new Map();
  for (const row of rows || []) {
    const table = String(row.TABLE_NAME || row.table_name || '');
    const column = String(row.COLUMN_NAME || row.column_name || '');
    if (!map.has(table)) map.set(table, new Set());
    map.get(table).add(column);
  }
  return map;
}

async function loadReportSchema() {
  const [clinical, main] = await Promise.all([
    loadSchemaMap(clinicalPool, CLINICAL_TABLES),
    loadSchemaMap(pool, MAIN_TABLES)
  ]);
  return { clinical, main };
}

const hasColumn = (schema, plane, table, column) => !!schema?.[plane]?.get(table)?.has(column);
const selectColumn = (schema, plane, table, column, expression, alias = column, fallback = 'NULL') =>
  `${hasColumn(schema, plane, table, column) ? expression : fallback} AS ${alias}`;

function reportAvailability(report, schema) {
  const [plane, table] = REQUIRED_TABLE_BY_REPORT[report.type] || [];
  const available = !!schema?.[plane]?.has(table);
  return {
    ...report,
    available,
    unavailableReason: available ? null : `Required table ${table} is not available. Apply the latest ${plane === 'clinical' ? 'clinical ' : ''}database migrations.`
  };
}

function addDateFilters(where, params, expression, filters) {
  if (clean(filters.startDate)) {
    where.push(`${expression} >= ?`);
    params.push(clean(filters.startDate));
  }
  if (clean(filters.endDate)) {
    where.push(`${expression} < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(clean(filters.endDate));
  }
}

function addLike(where, params, fields, search) {
  const value = clean(search);
  if (!value || !fields.length) return;
  const like = `%${value}%`;
  where.push(`(${fields.map((field) => `COALESCE(${field}, '') LIKE ?`).join(' OR ')})`);
  params.push(...fields.map(() => like));
}

function baseFilters(alias, agencyId, filters, { dateExpression = `${alias}.created_at` } = {}) {
  const where = [`${alias}.agency_id = ?`];
  const params = [agencyId];
  addDateFilters(where, params, dateExpression, filters);
  if (positiveInt(filters.clientId)) {
    where.push(`${alias}.client_id = ?`);
    params.push(positiveInt(filters.clientId));
  }
  return { where, params };
}

async function fetchPaged({ db, select, from, where, params, orderBy, limit, offset, summarySelect }) {
  const whereSql = where.join(' AND ');
  const [rows] = await db.execute(
    `SELECT ${select} FROM ${from} WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM ${from} WHERE ${whereSql}`, params);
  const [summaryRows] = await db.execute(
    `SELECT ${summarySelect || 'COUNT(*) AS record_count'} FROM ${from} WHERE ${whereSql}`,
    params
  );
  return { rows: rows || [], total: Number(countRows?.[0]?.total || 0), summary: summaryRows?.[0] || {} };
}

async function queryClaims(agencyId, filters, page, schema) {
  const hasBillingFoundations = hasColumn(schema, 'clinical', 'clinical_claims', 'claim_lifecycle');
  const hasClaimLines = schema.clinical.has('clinical_claim_lines');
  const dateExpression = hasColumn(schema, 'clinical', 'clinical_claims', 'date_of_service')
    ? 'COALESCE(c.date_of_service, c.created_at)'
    : 'c.created_at';
  const { where, params } = baseFilters('c', agencyId, filters, {
    dateExpression
  });
  where.push('c.is_deleted = 0');
  if (clean(filters.status)) {
    if (hasBillingFoundations) {
      where.push('(LOWER(c.claim_lifecycle) = LOWER(?) OR LOWER(c.claim_status) = LOWER(?))');
      params.push(clean(filters.status), clean(filters.status));
    } else {
      where.push('LOWER(c.claim_status) = LOWER(?)');
      params.push(clean(filters.status));
    }
  }
  if (positiveInt(filters.clientId)) { /* already applied */ }
  if (clean(filters.payer)) {
    if (hasColumn(schema, 'clinical', 'clinical_claims', 'payer_name')) { where.push('c.payer_name LIKE ?'); params.push(`%${clean(filters.payer)}%`); }
    else where.push('1 = 0');
  }
  if (clean(filters.placeOfService)) {
    if (hasColumn(schema, 'clinical', 'clinical_claims', 'place_of_service')) { where.push('c.place_of_service = ?'); params.push(clean(filters.placeOfService)); }
    else where.push('1 = 0');
  }
  if (clean(filters.serviceCode)) {
    if (hasClaimLines) {
      where.push('EXISTS (SELECT 1 FROM clinical_claim_lines fl WHERE fl.clinical_claim_id = c.id AND fl.procedure_code = ?)');
      params.push(clean(filters.serviceCode).toUpperCase());
    } else where.push('1 = 0');
  }
  const searchFields = ['c.claim_number', 'c.claim_status'];
  for (const column of ['payer_name', 'claim_lifecycle', 'claimmd_claim_id', 'claimmd_last_status']) {
    if (hasColumn(schema, 'clinical', 'clinical_claims', column)) searchFields.push(`c.${column}`);
  }
  addLike(where, params, searchFields, filters.search);
  const providerColumn = hasColumn(schema, 'clinical', 'clinical_sessions', 'rendering_provider_user_id')
    ? 'COALESCE(s.rendering_provider_user_id, s.provider_user_id)'
    : 's.provider_user_id';
  const claimLineSelect = hasClaimLines
    ? `(SELECT GROUP_CONCAT(DISTINCT l.procedure_code ORDER BY l.procedure_code SEPARATOR ', ')
         FROM clinical_claim_lines l WHERE l.clinical_claim_id = c.id) AS procedure_codes,
      (SELECT COUNT(*) FROM clinical_claim_lines l WHERE l.clinical_claim_id = c.id) AS line_count,
      (SELECT COALESCE(SUM(l.units), 0) FROM clinical_claim_lines l WHERE l.clinical_claim_id = c.id) AS total_units`
    : `NULL AS procedure_codes, 0 AS line_count, 0 AS total_units`;
  return fetchPaged({
    db: clinicalPool,
    select: `c.id, c.clinical_session_id, c.client_id, c.claim_number, c.claim_status, c.amount_cents,
      c.currency_code, ${selectColumn(schema, 'clinical', 'clinical_claims', 'payer_name', 'c.payer_name')},
      ${selectColumn(schema, 'clinical', 'clinical_claims', 'place_of_service', 'c.place_of_service')},
      ${selectColumn(schema, 'clinical', 'clinical_claims', 'date_of_service', 'c.date_of_service')},
      ${selectColumn(schema, 'clinical', 'clinical_claims', 'claim_lifecycle', 'c.claim_lifecycle', 'claim_lifecycle', 'c.claim_status')},
      ${selectColumn(schema, 'clinical', 'clinical_claims', 'claimmd_claim_id', 'c.claimmd_claim_id')},
      ${selectColumn(schema, 'clinical', 'clinical_claims', 'claimmd_last_status', 'c.claimmd_last_status')},
      c.created_by_user_id, c.created_at, c.updated_at,
      (SELECT ${providerColumn} FROM clinical_sessions s WHERE s.id = c.clinical_session_id LIMIT 1) AS provider_user_id,
      ${claimLineSelect}`,
    from: 'clinical_claims c', where, params, orderBy: `${dateExpression} DESC, c.id DESC`, ...page,
    summarySelect: `COUNT(*) AS record_count, COUNT(DISTINCT c.client_id) AS client_count,
      COALESCE(SUM(c.amount_cents), 0) AS total_amount_cents,
      SUM(CASE WHEN LOWER(${hasBillingFoundations ? 'c.claim_lifecycle' : 'c.claim_status'}) = 'paid' THEN 1 ELSE 0 END) AS paid_count,
      SUM(CASE WHEN LOWER(${hasBillingFoundations ? 'c.claim_lifecycle' : 'c.claim_status'}) IN ('rejected', 'denied') THEN 1 ELSE 0 END) AS exception_count`
  });
}

async function queryClaimLines(agencyId, filters, page) {
  const from = 'clinical_claim_lines l JOIN clinical_claims c ON c.id = l.clinical_claim_id';
  const { where, params } = baseFilters('c', agencyId, filters, {
    dateExpression: 'COALESCE(l.service_date, c.date_of_service, c.created_at)'
  });
  where.push('c.is_deleted = 0');
  if (clean(filters.status)) { where.push('LOWER(c.claim_lifecycle) = LOWER(?)'); params.push(clean(filters.status)); }
  if (clean(filters.serviceCode)) { where.push('l.procedure_code = ?'); params.push(clean(filters.serviceCode).toUpperCase()); }
  if (clean(filters.payer)) { where.push('c.payer_name LIKE ?'); params.push(`%${clean(filters.payer)}%`); }
  if (clean(filters.placeOfService)) { where.push('c.place_of_service = ?'); params.push(clean(filters.placeOfService)); }
  addLike(where, params, ['c.claim_number', 'c.payer_name', 'c.claim_lifecycle', 'l.procedure_code', 'l.diagnosis_pointers'], filters.search);
  return fetchPaged({
    db: clinicalPool,
    select: `l.id, l.clinical_claim_id, c.client_id, c.claim_number, c.payer_name, c.place_of_service,
      c.claim_lifecycle, l.service_date, l.procedure_code,
      CASE WHEN l.modifiers_json IS NULL THEN NULL ELSE JSON_UNQUOTE(JSON_EXTRACT(l.modifiers_json, '$')) END AS modifiers,
      l.units, l.charge_cents, l.diagnosis_pointers, l.created_at`,
    from, where, params, orderBy: 'COALESCE(l.service_date, c.date_of_service, c.created_at) DESC, l.id DESC', ...page,
    summarySelect: `COUNT(*) AS record_count, COUNT(DISTINCT c.client_id) AS client_count,
      COUNT(DISTINCT c.id) AS claim_count, COALESCE(SUM(l.units), 0) AS total_units,
      COALESCE(SUM(l.charge_cents), 0) AS total_amount_cents`
  });
}

async function queryEncounters(agencyId, filters, page, schema) {
  const { where, params } = baseFilters('s', agencyId, filters, {
    dateExpression: 'COALESCE(s.scheduled_start_at, s.created_at)'
  });
  if (positiveInt(filters.providerId)) {
    where.push(`${hasColumn(schema, 'clinical', 'clinical_sessions', 'rendering_provider_user_id') ? 'COALESCE(s.rendering_provider_user_id, s.provider_user_id)' : 's.provider_user_id'} = ?`);
    params.push(positiveInt(filters.providerId));
  }
  if (clean(filters.status)) {
    if (hasColumn(schema, 'clinical', 'clinical_sessions', 'encounter_status')) { where.push('LOWER(s.encounter_status) = LOWER(?)'); params.push(clean(filters.status)); }
    else if (clean(filters.status).toLowerCase() !== 'scheduled') where.push('1 = 0');
  }
  if (clean(filters.serviceCode)) {
    if (hasColumn(schema, 'clinical', 'clinical_sessions', 'service_code')) { where.push('(s.service_code = ? OR s.effective_service_code = ?)'); params.push(clean(filters.serviceCode).toUpperCase(), clean(filters.serviceCode).toUpperCase()); }
    else where.push('1 = 0');
  }
  if (clean(filters.placeOfService)) {
    if (hasColumn(schema, 'clinical', 'clinical_sessions', 'place_of_service')) { where.push('s.place_of_service = ?'); params.push(clean(filters.placeOfService)); }
    else where.push('1 = 0');
  }
  const encounterSearch = ['encounter_status', 'service_code', 'effective_service_code', 'place_of_service', 'claim_blocked_reason']
    .filter((column) => hasColumn(schema, 'clinical', 'clinical_sessions', column)).map((column) => `s.${column}`);
  addLike(where, params, encounterSearch, filters.search);
  const providerExpr = hasColumn(schema, 'clinical', 'clinical_sessions', 'rendering_provider_user_id')
    ? 'COALESCE(s.rendering_provider_user_id, s.provider_user_id)' : 's.provider_user_id';
  return fetchPaged({
    db: clinicalPool,
    select: `s.id, s.client_id, s.office_event_id, ${providerExpr} AS provider_user_id,
      s.scheduled_start_at, s.scheduled_end_at,
      ${selectColumn(schema, 'clinical', 'clinical_sessions', 'encounter_status', 's.encounter_status', 'encounter_status', "'scheduled'")},
      ${selectColumn(schema, 'clinical', 'clinical_sessions', 'place_of_service', 's.place_of_service')},
      ${selectColumn(schema, 'clinical', 'clinical_sessions', 'duration_minutes', 's.duration_minutes')},
      ${selectColumn(schema, 'clinical', 'clinical_sessions', 'is_telehealth', 's.is_telehealth', 'is_telehealth', '0')},
      ${selectColumn(schema, 'clinical', 'clinical_sessions', 'service_code', 's.service_code')},
      ${selectColumn(schema, 'clinical', 'clinical_sessions', 'effective_service_code', 's.effective_service_code')},
      ${selectColumn(schema, 'clinical', 'clinical_sessions', 'service_location_id', 's.service_location_id')},
      ${selectColumn(schema, 'clinical', 'clinical_sessions', 'billing_office_location_id', 's.billing_office_location_id')},
      ${selectColumn(schema, 'clinical', 'clinical_sessions', 'billed_units', 's.billed_units')},
      ${selectColumn(schema, 'clinical', 'clinical_sessions', 'claim_blocked_reason', 's.claim_blocked_reason')},
      s.created_at, s.updated_at`,
    from: 'clinical_sessions s', where, params, orderBy: 'COALESCE(s.scheduled_start_at, s.created_at) DESC, s.id DESC', ...page,
    summarySelect: `COUNT(*) AS record_count, COUNT(DISTINCT s.client_id) AS client_count,
      COUNT(DISTINCT ${providerExpr}) AS provider_count,
      ${hasColumn(schema, 'clinical', 'clinical_sessions', 'duration_minutes') ? 'COALESCE(SUM(s.duration_minutes), 0)' : '0'} AS total_minutes,
      ${hasColumn(schema, 'clinical', 'clinical_sessions', 'billed_units') ? 'COALESCE(SUM(s.billed_units), 0)' : '0'} AS total_units,
      ${hasColumn(schema, 'clinical', 'clinical_sessions', 'claim_blocked_reason') ? "SUM(CASE WHEN s.claim_blocked_reason IS NOT NULL AND s.claim_blocked_reason <> '' THEN 1 ELSE 0 END)" : '0'} AS blocked_count`
  });
}

async function queryNotes(agencyId, filters, page, schema) {
  const { where, params } = baseFilters('n', agencyId, filters);
  where.push('n.is_deleted = 0');
  if (positiveInt(filters.providerId)) { where.push('n.created_by_user_id = ?'); params.push(positiveInt(filters.providerId)); }
  const hasSigning = hasColumn(schema, 'clinical', 'clinical_notes', 'provider_signed_at');
  const status = clean(filters.status).toLowerCase();
  if (hasSigning) {
    if (status === 'unsigned') where.push('n.provider_signed_at IS NULL');
    else if (status === 'signed') where.push('n.provider_signed_at IS NOT NULL');
    else if (status === 'awaiting_cosign') where.push('n.provider_signed_at IS NOT NULL AND n.supervisor_cosigned_at IS NULL');
    else if (status === 'cosigned') where.push('n.supervisor_cosigned_at IS NOT NULL');
    else if (status === 'billable') where.push('n.is_billable = 1');
  } else if (status && status !== 'unsigned') where.push('1 = 0');
  addLike(where, params, ['n.title', ...(hasColumn(schema, 'clinical', 'clinical_notes', 'note_type') ? ['n.note_type'] : [])], filters.search);
  return fetchPaged({
    db: clinicalPool,
    select: `n.id, n.clinical_session_id, n.client_id, n.title,
      ${selectColumn(schema, 'clinical', 'clinical_notes', 'note_type', 'n.note_type')},
      ${selectColumn(schema, 'clinical', 'clinical_notes', 'version_number', 'n.version_number', 'version_number', '1')},
      ${selectColumn(schema, 'clinical', 'clinical_notes', 'provider_signed_at', 'n.provider_signed_at')},
      ${selectColumn(schema, 'clinical', 'clinical_notes', 'provider_signed_by_user_id', 'n.provider_signed_by_user_id')},
      ${selectColumn(schema, 'clinical', 'clinical_notes', 'supervisor_cosigned_at', 'n.supervisor_cosigned_at')},
      ${selectColumn(schema, 'clinical', 'clinical_notes', 'supervisor_cosigned_by_user_id', 'n.supervisor_cosigned_by_user_id')},
      ${selectColumn(schema, 'clinical', 'clinical_notes', 'is_billable', 'n.is_billable', 'is_billable', '0')},
      n.created_by_user_id, n.created_at, n.updated_at`,
    from: 'clinical_notes n', where, params, orderBy: 'n.created_at DESC, n.id DESC', ...page,
    summarySelect: `COUNT(*) AS record_count, COUNT(DISTINCT n.client_id) AS client_count,
      ${hasSigning ? 'SUM(CASE WHEN n.provider_signed_at IS NULL THEN 1 ELSE 0 END)' : 'COUNT(*)'} AS unsigned_count,
      ${hasSigning ? 'SUM(CASE WHEN n.provider_signed_at IS NOT NULL AND n.supervisor_cosigned_at IS NULL THEN 1 ELSE 0 END)' : '0'} AS awaiting_cosign_count,
      ${hasSigning ? 'SUM(CASE WHEN n.is_billable = 1 THEN 1 ELSE 0 END)' : '0'} AS billable_count`
  });
}

async function queryDiagnoses(agencyId, filters, page) {
  const { where, params } = baseFilters('d', agencyId, filters);
  const active = activeValue(filters.status);
  if (active != null) { where.push('d.is_active = ?'); params.push(active); }
  else if (clean(filters.status).toLowerCase() === 'primary') where.push('d.is_primary = 1');
  addLike(where, params, ['d.icd10_code', 'd.description'], filters.search);
  return fetchPaged({
    db: clinicalPool,
    select: `d.id, d.client_id, d.clinical_session_id, d.clinical_note_id, d.icd10_code,
      d.description, d.is_primary, d.is_active, d.onset_date, d.created_by_user_id, d.created_at, d.updated_at`,
    from: 'clinical_diagnoses d', where, params, orderBy: 'd.created_at DESC, d.id DESC', ...page,
    summarySelect: `COUNT(*) AS record_count, COUNT(DISTINCT d.client_id) AS client_count,
      SUM(CASE WHEN d.is_active = 1 THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN d.is_primary = 1 THEN 1 ELSE 0 END) AS primary_count`
  });
}

async function queryTreatmentPlans(agencyId, filters, page) {
  const { where, params } = baseFilters('p', agencyId, filters);
  if (positiveInt(filters.providerId)) { where.push('p.created_by_user_id = ?'); params.push(positiveInt(filters.providerId)); }
  if (clean(filters.status)) { where.push('LOWER(p.status) = LOWER(?)'); params.push(clean(filters.status)); }
  addLike(where, params, ['p.title', 'p.status', 'p.source_tool_id'], filters.search);
  return fetchPaged({
    db: clinicalPool,
    select: `p.id, p.client_id, p.clinical_session_id, p.clinical_note_id, p.title, p.status,
      p.source_tool_id, p.created_by_user_id, p.created_at, p.updated_at,
      (SELECT COUNT(*) FROM clinical_treatment_plan_goals g WHERE g.treatment_plan_id = p.id) AS goal_count,
      (SELECT COUNT(*) FROM clinical_treatment_plan_objectives o
         JOIN clinical_treatment_plan_goals g ON g.id = o.goal_id WHERE g.treatment_plan_id = p.id) AS objective_count`,
    from: 'clinical_treatment_plans p', where, params, orderBy: 'p.created_at DESC, p.id DESC', ...page,
    summarySelect: `COUNT(*) AS record_count, COUNT(DISTINCT p.client_id) AS client_count,
      SUM(CASE WHEN LOWER(p.status) = 'active' THEN 1 ELSE 0 END) AS active_count`
  });
}

async function queryFeeSchedule(agencyId, filters, page) {
  const { where, params } = baseFilters('f', agencyId, filters);
  const active = activeValue(filters.status);
  if (active != null) { where.push('f.is_active = ?'); params.push(active); }
  if (clean(filters.serviceCode)) { where.push('f.procedure_code = ?'); params.push(clean(filters.serviceCode).toUpperCase()); }
  if (clean(filters.payer)) { where.push('f.payer_label LIKE ?'); params.push(`%${clean(filters.payer)}%`); }
  addLike(where, params, ['f.procedure_code', 'f.modifier', 'f.description', 'f.payer_label'], filters.search);
  return fetchPaged({
    db: clinicalPool,
    select: 'f.id, f.payer_label, f.procedure_code, f.modifier, f.description, f.unit_price_cents, f.unit_minutes, f.is_active, f.created_at, f.updated_at',
    from: 'medical_fee_schedule_items f', where, params, orderBy: 'f.procedure_code ASC, f.id DESC', ...page,
    summarySelect: 'COUNT(*) AS record_count, SUM(CASE WHEN f.is_active = 1 THEN 1 ELSE 0 END) AS active_count, COALESCE(AVG(f.unit_price_cents), 0) AS average_amount_cents'
  });
}

async function queryServiceCodes(agencyId, filters, page) {
  const { where, params } = baseFilters('s', agencyId, filters);
  const active = activeValue(filters.status);
  if (active != null) { where.push('s.is_active = ?'); params.push(active); }
  if (clean(filters.serviceCode)) { where.push('s.service_code = ?'); params.push(clean(filters.serviceCode).toUpperCase()); }
  if (clean(filters.placeOfService)) { where.push('s.default_place_of_service = ?'); params.push(clean(filters.placeOfService)); }
  addLike(where, params, ['s.service_code', 's.description', 's.unit_calc_mode', 's.overflow_service_code'], filters.search);
  return fetchPaged({
    db: pool,
    select: `s.id, s.service_code, s.description, s.unit_calc_mode, s.unit_minutes, s.min_minutes,
      s.max_minutes, s.max_units_per_session, s.max_units_per_day, s.default_place_of_service,
      s.overflow_service_code, s.overflow_at_minutes, s.is_active, s.created_at, s.updated_at`,
    from: 'agency_medical_service_codes s', where, params, orderBy: 's.service_code ASC, s.id ASC', ...page,
    summarySelect: `COUNT(*) AS record_count, SUM(CASE WHEN s.is_active = 1 THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN s.overflow_service_code IS NOT NULL THEN 1 ELSE 0 END) AS overflow_count`
  });
}

async function queryServiceLocations(agencyId, filters, page) {
  const from = 'agency_service_locations l LEFT JOIN office_locations o ON o.id = l.billing_office_location_id';
  const { where, params } = baseFilters('l', agencyId, filters);
  const active = activeValue(filters.status);
  if (active != null) { where.push('l.is_active = ?'); params.push(active); }
  if (clean(filters.placeOfService)) { where.push('l.place_of_service = ?'); params.push(clean(filters.placeOfService)); }
  addLike(where, params, ['l.name', 'l.place_of_service', 'l.city', 'l.state', 'o.name'], filters.search);
  return fetchPaged({
    db: pool,
    select: `l.id, l.name, l.place_of_service, l.city, l.state, l.postal_code,
      l.requires_credentialing, l.billing_office_location_id, o.name AS billing_office_name,
      l.is_active, l.created_at, l.updated_at`,
    from, where, params, orderBy: 'l.name ASC, l.id ASC', ...page,
    summarySelect: `COUNT(*) AS record_count, SUM(CASE WHEN l.is_active = 1 THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN l.requires_credentialing = 1 THEN 1 ELSE 0 END) AS credentialing_count,
      COUNT(DISTINCT l.place_of_service) AS place_of_service_count`
  });
}

const queryByType = {
  claims: queryClaims,
  claim_lines: queryClaimLines,
  encounters: queryEncounters,
  notes: queryNotes,
  diagnoses: queryDiagnoses,
  treatment_plans: queryTreatmentPlans,
  fee_schedule: queryFeeSchedule,
  service_codes: queryServiceCodes,
  service_locations: queryServiceLocations
};

async function enrichPeople(rows, agencyId) {
  const clientIds = [...new Set(rows.map((row) => positiveInt(row.client_id)).filter(Boolean))];
  const userIds = [...new Set(rows.flatMap((row) => [
    positiveInt(row.provider_user_id), positiveInt(row.created_by_user_id),
    positiveInt(row.provider_signed_by_user_id), positiveInt(row.supervisor_cosigned_by_user_id)
  ]).filter(Boolean))];
  const clientMap = new Map();
  const userMap = new Map();

  if (clientIds.length) {
    const placeholders = clientIds.map(() => '?').join(',');
    const [clients] = await pool.execute(
      `SELECT id, initials, full_name, identifier_code FROM clients
       WHERE agency_id = ? AND id IN (${placeholders})`,
      [agencyId, ...clientIds]
    );
    for (const client of clients || []) {
      clientMap.set(Number(client.id), client.full_name || client.initials || client.identifier_code || `Client #${client.id}`);
    }
  }
  if (userIds.length) {
    const placeholders = userIds.map(() => '?').join(',');
    const [users] = await pool.execute(
      `SELECT id, email, first_name, last_name FROM users WHERE id IN (${placeholders})`,
      userIds
    );
    for (const user of users || []) {
      const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      userMap.set(Number(user.id), name || user.email || `User #${user.id}`);
    }
  }

  return rows.map((row) => ({
    ...row,
    client_display: row.client_id ? (clientMap.get(Number(row.client_id)) || `Client #${row.client_id}`) : null,
    provider_display: row.provider_user_id ? (userMap.get(Number(row.provider_user_id)) || `User #${row.provider_user_id}`) : null,
    created_by_display: row.created_by_user_id ? (userMap.get(Number(row.created_by_user_id)) || `User #${row.created_by_user_id}`) : null
  }));
}

export function getMedicalBillingReportCatalog() {
  return REPORT_CATALOG;
}

export async function getMedicalBillingReportCatalogWithAvailability() {
  const schema = await loadReportSchema();
  return REPORT_CATALOG.map((report) => reportAvailability(report, schema));
}

export async function runMedicalBillingReport({ agencyId, type, filters = {}, limit = 50, offset = 0 }) {
  const report = catalogByType.get(clean(type).toLowerCase());
  if (!report) {
    const error = new Error('Unknown medical billing report type');
    error.status = 400;
    throw error;
  }
  const safeLimit = Math.min(10000, Math.max(1, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const schema = await loadReportSchema();
  const reportWithAvailability = reportAvailability(report, schema);
  if (!reportWithAvailability.available) {
    return {
      report: reportWithAvailability,
      rows: [],
      total: 0,
      summary: {},
      limit: safeLimit,
      offset: safeOffset,
      notice: reportWithAvailability.unavailableReason
    };
  }
  const result = await queryByType[report.type](Number(agencyId), filters, { limit: safeLimit, offset: safeOffset }, schema);
  return {
    report: reportWithAvailability,
    rows: await enrichPeople(result.rows || [], Number(agencyId)),
    total: Number(result.total || 0),
    summary: result.summary || {},
    limit: safeLimit,
    offset: safeOffset,
    notice: null
  };
}

export default {
  getMedicalBillingReportCatalog,
  getMedicalBillingReportCatalogWithAvailability,
  runMedicalBillingReport
};
