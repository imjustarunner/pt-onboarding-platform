import pool from '../config/database.js';

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s/.-]/g, '');
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function parseBool(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return false;
  return ['1', 'true', 'yes', 'y', 'checked', 'x'].includes(v);
}

function normalizeDay(value) {
  const v = String(value || '').trim().toLowerCase();
  const map = {
    mon: 'Monday',
    monday: 'Monday',
    tue: 'Tuesday',
    tues: 'Tuesday',
    tuesday: 'Tuesday',
    wed: 'Wednesday',
    weds: 'Wednesday',
    wednesday: 'Wednesday',
    thu: 'Thursday',
    thur: 'Thursday',
    thurs: 'Thursday',
    thursday: 'Thursday',
    fri: 'Friday',
    friday: 'Friday'
  };
  return map[v] || null;
}

function parseDateToYMD(value) {
  const str = String(value || '').trim();
  if (!str) return null;
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
  // Try MM/DD/YYYY
  const m1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const [, mm, dd, yyyy] = m1;
    const mm2 = mm.padStart(2, '0');
    const dd2 = dd.padStart(2, '0');
    return `${yyyy}-${mm2}-${dd2}`;
  }
  return null;
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function makeIdentifierBase(clientName) {
  const parts = String(clientName || '').trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] || '').replace(/[^a-zA-Z]/g, '');
  const last = (parts.length > 1 ? parts[parts.length - 1] : '').replace(/[^a-zA-Z]/g, '');
  const first3 = (first.slice(0, 3) || 'Cli').padEnd(3, 'x');
  const last3 = (last.slice(0, 3) || 'Ent').padEnd(3, 'x');
  const fmt = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return `${fmt(first3)}${fmt(last3)}`; // 6 chars
}

async function ensureDefinition(conn, tableName, agencyId, displayName) {
  const clean = String(displayName || '').trim();
  if (!clean) return null;
  const keyName = clean.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 64) || 'Unknown';

  const [existing] = await conn.execute(
    `SELECT id FROM ${tableName} WHERE agency_id = ? AND (LOWER(display_name) = LOWER(?) OR LOWER(key_name) = LOWER(?)) LIMIT 1`,
    [agencyId, clean, keyName]
  );
  if (existing.length) return existing[0].id;

  const [ins] = await conn.execute(
    `INSERT INTO ${tableName} (agency_id, key_name, display_name, is_active) VALUES (?, ?, ?, TRUE)`,
    [agencyId, keyName, clean]
  );
  return ins.insertId;
}

async function ensureAgencySeeds(conn, agencyId) {
  // If any of the definitions tables have zero rows for this agency, seed a minimal baseline.
  const checks = [
    { table: 'client_status_definitions', values: ['Current', 'Pending', 'Terminated', 'Inactive', 'Waitlist', 'Screener', 'Packet'] },
    { table: 'insurance_definitions', values: ['Medicaid', 'Tricare', 'Commercial / Other', 'Unknown', 'None', 'Self Pay'] },
    { table: 'paperwork_delivery_definitions', values: ['Uploaded', 'School Emailed', 'Set Home', 'Unknown'] },
    { table: 'paperwork_status_definitions', values: ['Completed', 'Re-Auth', 'New Insurance', 'Insurance / Payment Auth', 'Emailed Packet', 'ROI', 'Renewal', 'New Docs', 'Disclosure and Consent', 'BALANCE'] },
    { table: 'provider_credential_definitions', values: ['Bachelors', 'Intern', 'LPC', 'LPCC', 'MFT', 'MFTC', 'Peer Professional', 'SWC', 'LCSW', 'LMFT', 'Unknown'] }
  ];

  for (const c of checks) {
    const [rows] = await conn.execute(`SELECT COUNT(*) AS cnt FROM ${c.table} WHERE agency_id = ?`, [agencyId]);
    if ((rows[0]?.cnt || 0) > 0) continue;
    for (const name of c.values) {
      await ensureDefinition(conn, c.table, agencyId, name);
    }
  }
}

async function ensureSchoolOrg(conn, schoolName) {
  const normalized = normalizeKey(schoolName);
  if (!normalized) throw new Error('School is required');

  const [existing] = await conn.execute(
    `SELECT id, name, slug FROM agencies WHERE organization_type = 'school' AND LOWER(name) = LOWER(?) LIMIT 1`,
    [schoolName.trim()]
  );
  if (existing.length) return existing[0];

  let baseSlug = slugify(schoolName);
  if (!baseSlug) baseSlug = `school-${Date.now()}`;
  let slug = baseSlug;
  for (let i = 2; i < 200; i++) {
    const [slugRows] = await conn.execute(`SELECT id FROM agencies WHERE slug = ? LIMIT 1`, [slug]);
    if (!slugRows.length) break;
    slug = `${baseSlug}-${i}`;
  }

  const [ins] = await conn.execute(
    `INSERT INTO agencies (name, slug, is_active, organization_type) VALUES (?, ?, TRUE, 'school')`,
    [schoolName.trim(), slug]
  );
  return { id: ins.insertId, name: schoolName.trim(), slug };
}

async function ensureAffiliation(conn, agencyId, organizationId) {
  await conn.execute(
    `INSERT INTO organization_affiliations (agency_id, organization_id, is_active)
     VALUES (?, ?, TRUE)
     ON DUPLICATE KEY UPDATE is_active = TRUE`,
    [agencyId, organizationId]
  );
}

async function ensureUserAgencyLink(conn, userId, agencyId) {
  await conn.execute(
    `INSERT IGNORE INTO user_agencies (user_id, agency_id) VALUES (?, ?)`,
    [userId, agencyId]
  );
}

async function ensureProviderUserAndProfile(conn, agencyId, providerRow) {
  const clinicianName = String(providerRow['Clinician Name'] || '').trim();
  if (!clinicianName) throw new Error('Clinician Name is required');

  const { firstName, lastName } = splitName(clinicianName);
  if (!firstName) throw new Error('Clinician Name is invalid');

  // Try match by exact name; fall back to display_name match in provider_profiles.
  let userId = null;
  const [u1] = await conn.execute(
    `SELECT id FROM users WHERE LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?) LIMIT 1`,
    [firstName, lastName || '']
  );
  if (u1.length) userId = u1[0].id;

  if (!userId) {
    // Create user with a unique placeholder email if email is required.
    const baseEmailLocal = slugify(`${firstName}.${lastName || 'provider'}`) || `provider-${Date.now()}`;
    let email = `${baseEmailLocal}@import.local`;
    for (let i = 2; i < 200; i++) {
      const [eRows] = await conn.execute(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
      if (!eRows.length) break;
      email = `${baseEmailLocal}-${i}@import.local`;
    }

    const [ins] = await conn.execute(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, is_active)
       VALUES (?, NULL, 'clinician', ?, ?, TRUE)`,
      [email, firstName, lastName || null]
    );
    userId = ins.insertId;
  }

  await ensureUserAgencyLink(conn, userId, agencyId);

  const credentialName = String(providerRow['Credential'] || '').trim() || 'Unknown';
  const credentialId = await ensureDefinition(conn, 'provider_credential_definitions', agencyId, credentialName);

  const statusRaw = String(providerRow['Status'] || '').trim().toLowerCase();
  const status = statusRaw === 'inactive' ? 'INACTIVE' : 'ACTIVE';

  const profile = {
    status,
    credential_id: credentialId,
    display_name: String(providerRow['Display Name'] || '').trim() || null,
    accepts_medicaid: parseBool(providerRow['Accepts Medicaid']),
    accepts_commercial: parseBool(providerRow['Accepts Commercial']),
    accepts_tricare_override: parseBool(providerRow['Accepts Tricare']),
    background_check_date: parseDateToYMD(providerRow['Background Check Date']),
    background_status: String(providerRow['Bckgrnd Status'] || '').trim() || null,
    cleared_to_start: parseBool(providerRow['Cleared to Start']),
    risk_high_behavior: parseBool(providerRow['High Behavioral Needs']),
    risk_suicidal: parseBool(providerRow['Suicidal']),
    risk_substance_use: parseBool(providerRow['Substance Use']),
    risk_trauma: parseBool(providerRow['Trauma']),
    risk_skills: parseBool(providerRow['Skills']),
    staff_notes: String(providerRow['Clinician Notes'] || providerRow['Bckgrnd Notes'] || '').trim() || null
  };

  await conn.execute(
    `INSERT INTO provider_profiles (
      agency_id, user_id, status, credential_id, display_name,
      accepts_medicaid, accepts_commercial, accepts_tricare_override,
      background_check_date, background_status, cleared_to_start,
      risk_high_behavior, risk_suicidal, risk_substance_use, risk_trauma, risk_skills,
      staff_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      credential_id = VALUES(credential_id),
      display_name = VALUES(display_name),
      accepts_medicaid = VALUES(accepts_medicaid),
      accepts_commercial = VALUES(accepts_commercial),
      accepts_tricare_override = VALUES(accepts_tricare_override),
      background_check_date = VALUES(background_check_date),
      background_status = VALUES(background_status),
      cleared_to_start = VALUES(cleared_to_start),
      risk_high_behavior = VALUES(risk_high_behavior),
      risk_suicidal = VALUES(risk_suicidal),
      risk_substance_use = VALUES(risk_substance_use),
      risk_trauma = VALUES(risk_trauma),
      risk_skills = VALUES(risk_skills),
      staff_notes = VALUES(staff_notes)`,
    [
      agencyId,
      userId,
      profile.status,
      profile.credential_id,
      profile.display_name,
      profile.accepts_medicaid ? 1 : 0,
      profile.accepts_commercial ? 1 : 0,
      profile.accepts_tricare_override ? 1 : 0,
      profile.background_check_date,
      profile.background_status,
      profile.cleared_to_start ? 1 : 0,
      profile.risk_high_behavior ? 1 : 0,
      profile.risk_suicidal ? 1 : 0,
      profile.risk_substance_use ? 1 : 0,
      profile.risk_trauma ? 1 : 0,
      profile.risk_skills ? 1 : 0,
      profile.staff_notes
    ]
  );

  return { userId, clinicianName };
}

async function upsertProviderSchedule(conn, agencyId, scheduleRow, providerUserId, schoolOrgId) {
  const day = normalizeDay(scheduleRow['Day']);
  if (!day) throw new Error(`Invalid Day: ${scheduleRow['Day'] || ''}`);

  const startingAvailable = parseInt(String(scheduleRow['Starting Available'] || '').trim(), 10);
  const safeStarting = Number.isFinite(startingAvailable) ? Math.max(0, startingAvailable) : 0;
  const notes = String(scheduleRow['Notes'] || '').trim() || null;

  await conn.execute(
    `INSERT INTO provider_school_schedules (
      agency_id, provider_user_id, school_organization_id, day_of_week, starting_available, notes
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      starting_available = VALUES(starting_available),
      notes = VALUES(notes)`,
    [agencyId, providerUserId, schoolOrgId, day, safeStarting, notes]
  );
}

async function ensureClientIdentifierUnique(conn, agencyId, base) {
  let candidate = base;
  for (let i = 1; i < 500; i++) {
    const [rows] = await conn.execute(
      `SELECT id FROM clients WHERE agency_id = ? AND (client_identifier_name = ? OR initials = ?) LIMIT 1`,
      [agencyId, candidate, candidate]
    );
    if (!rows.length) return candidate;
    // Keep the legacy initials field safe even if it's still VARCHAR(10) in some DBs.
    // We still store the full value in client_identifier_name; initials is capped later at write time.
    candidate = `${base}${i + 1}`;
  }
  // fallback
  return `${base}${Date.now()}`;
}

async function generateUniqueIdentifierCode(conn, agencyId) {
  for (let i = 0; i < 2000; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const [rows] = await conn.execute(
      `SELECT id FROM clients WHERE agency_id = ? AND identifier_code = ? LIMIT 1`,
      [agencyId, code]
    );
    if (!rows.length) return code;
  }
  throw new Error('Unable to generate unique identifier code');
}

async function getProviderScheduleCapacity(conn, providerUserId, schoolOrgId, day) {
  const [sched] = await conn.execute(
    `SELECT starting_available FROM provider_school_schedules
     WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ?
     LIMIT 1`,
    [providerUserId, schoolOrgId, day]
  );
  if (!sched.length) return { startingAvailable: null, currentAssigned: null };
  const startingAvailable = sched[0].starting_available;
  const [countRows] = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM clients
     WHERE provider_id = ? AND organization_id = ? AND assigned_day_of_week = ?`,
    [providerUserId, schoolOrgId, day]
  );
  return { startingAvailable, currentAssigned: countRows[0]?.cnt || 0 };
}

export default class BulkClientOneTimeImportService {
  static expectedClientsHeaders = [
    'Client Name',
    'Status',
    'Referral Date',
    'Skills',
    'Insurance',
    'School',
    'Provider',
    'Day',
    'Paperwork Delivery',
    'Doc Date',
    'Paperwork Status',
    'Notes',
    'Grade',
    'Gender',
    'Identifier Code',
    'District',
    'Primary Client Language',
    'Primary Parent Language'
  ];

  static expectedProvidersHeaders = [
    'Status',
    'Clinician Name',
    'Credential',
    'Display Name',
    'Accepts Medicaid',
    'Accepts Commercial',
    'Accepts Tricare',
    'Background Check Date',
    'Bckgrnd Status',
    'Cleared to Start',
    'Bckgrnd Notes',
    'High Behavioral Needs',
    'Suicidal',
    'Substance Use',
    'Trauma',
    'Skills',
    'Clinician Notes'
  ];

  static expectedRosterHeaders = [
    'School',
    'Provider Name',
    'Day',
    'Openings',
    'Starting Available',
    'Current',
    'Notes'
  ];

  static validateHeaders(records, expectedHeaders, sheetName) {
    if (!records || records.length === 0) return;
    const headers = Object.keys(records[0] || {});
    const normalizeHeader = (h) => String(h || '').trim().toLowerCase();
    const actual = new Set(headers.map(normalizeHeader));
    const expected = new Set(expectedHeaders.map(normalizeHeader));

    const missing = expectedHeaders.filter(h => !actual.has(normalizeHeader(h)));
    if (missing.length) {
      throw new Error(`${sheetName} CSV missing required headers: ${missing.join(', ')}`);
    }
  }

  static async createPreviewJob({
    agencyId,
    uploadedByUserId,
    clientsRecords,
    providersRecords,
    rosterRecords
  }) {
    this.validateHeaders(clientsRecords, this.expectedClientsHeaders, 'Clients');
    this.validateHeaders(providersRecords, this.expectedProvidersHeaders, 'Providers');
    this.validateHeaders(rosterRecords, this.expectedRosterHeaders, 'Roster');

    const results = {
      jobId: null,
      totals: {
        clients: clientsRecords.length,
        providers: providersRecords.length,
        roster: rosterRecords.length
      },
      pending: 0,
      errors: []
    };

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        `INSERT INTO bulk_import_jobs (agency_id, uploaded_by_user_id, kind, status, total_clients_rows, total_providers_rows, total_roster_rows)
         VALUES (?, ?, 'CLIENTS_ONE_TIME', 'PREVIEW', ?, ?, ?)`,
        [agencyId, uploadedByUserId, clientsRecords.length, providersRecords.length, rosterRecords.length]
      );
      const [[jobRow]] = await conn.execute(`SELECT LAST_INSERT_ID() AS id`);
      results.jobId = jobRow.id;

      await ensureAgencySeeds(conn, agencyId);

      // Store provider rows as PENDING preview rows
      for (let idx = 0; idx < providersRecords.length; idx++) {
        const rowNumber = idx + 2;
        const clinicianName = String(providersRecords[idx]['Clinician Name'] || '').trim();
        const identifier = clinicianName || `row-${rowNumber}`;
        await conn.execute(
          `INSERT INTO bulk_import_job_rows (job_id, sheet, row_number, identifier, status, action, payload_json)
           VALUES (?, 'providers', ?, ?, 'PENDING', 'preview', ?)`,
          [results.jobId, rowNumber, identifier, JSON.stringify(providersRecords[idx])]
        );
      }

      // Store roster rows as PENDING preview rows
      for (let idx = 0; idx < rosterRecords.length; idx++) {
        const rowNumber = idx + 2;
        const schoolName = String(rosterRecords[idx]['School'] || '').trim();
        const providerName = String(rosterRecords[idx]['Provider Name'] || '').trim();
        const identifier = `${schoolName} | ${providerName} | ${String(rosterRecords[idx]['Day'] || '').trim()}`.trim();
        await conn.execute(
          `INSERT INTO bulk_import_job_rows (job_id, sheet, row_number, identifier, status, action, payload_json)
           VALUES (?, 'roster', ?, ?, 'PENDING', 'preview', ?)`,
          [results.jobId, rowNumber, identifier, JSON.stringify(rosterRecords[idx])]
        );
      }

      // Validate each client row and store as PENDING or ERROR (no writes)
      for (let idx = 0; idx < clientsRecords.length; idx++) {
        const row = clientsRecords[idx];
        const rowNumber = idx + 2;

        try {
          const schoolName = String(row['School'] || '').trim();
          const providerName = String(row['Provider'] || '').trim();
          const clientName = String(row['Client Name'] || '').trim();
          const day = normalizeDay(row['Day']);
          if (!clientName) throw new Error('Client Name is required');
          if (!schoolName) throw new Error('School is required');
          if (!providerName) throw new Error('Provider is required');
          if (!day) throw new Error(`Invalid Day: ${row['Day'] || ''}`);

          // Ensure provider exists in Providers CSV
          const providerKey = normalizeKey(providerName);
          const providersKeySet = new Set(
            providersRecords
              .map((p) => normalizeKey(String(p['Clinician Name'] || '').trim()))
              .filter(Boolean)
          );
          if (!providersKeySet.has(providerKey)) {
            throw new Error(`Provider not found in Providers CSV: ${providerName}`);
          }

          // Ensure roster has this provider+school+day
          const rosterKeySet = new Set(
            rosterRecords
              .map((r) => `${normalizeKey(r['School'])}|${normalizeKey(r['Provider Name'])}|${normalizeDay(r['Day'])}`)
          );
          const rosterKey = `${normalizeKey(schoolName)}|${normalizeKey(providerName)}|${day}`;
          if (!rosterKeySet.has(rosterKey)) {
            throw new Error(`Roster missing schedule for ${schoolName} | ${providerName} | ${day}`);
          }

          const baseIdentifier = makeIdentifierBase(clientName);
          const identifierName = baseIdentifier; // final uniqueness resolved at apply time

          const payload = {
            clientRow: row,
            computed: {
              schoolName,
              providerName,
              day,
              identifierBase: identifierName
            }
          };

          results.pending++;
          await conn.execute(
            `INSERT INTO bulk_import_job_rows (job_id, sheet, row_number, identifier, status, action, payload_json)
             VALUES (?, 'clients', ?, ?, 'PENDING', 'apply', ?)`,
            [results.jobId, rowNumber, identifierName, JSON.stringify(payload)]
          );
        } catch (e) {
          results.errors.push({ sheet: 'clients', row: rowNumber, error: e.message });
          await conn.execute(
            `INSERT INTO bulk_import_job_rows (job_id, sheet, row_number, identifier, status, action, message, payload_json)
             VALUES (?, 'clients', ?, ?, 'ERROR', 'apply', ?, ?)`,
            [results.jobId, rowNumber, String(row['Client Name'] || '').trim() || null, e.message, JSON.stringify({ clientRow: row })]
          );
        }
      }

      await conn.commit();
      return results;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  static async applyJobRow({ jobId, rowId, uploadedByUserId }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute(
        `SELECT * FROM bulk_import_job_rows WHERE id = ? AND job_id = ? FOR UPDATE`,
        [rowId, jobId]
      );
      if (!rows.length) throw new Error('Job row not found');
      const jobRow = rows[0];
      if (jobRow.status !== 'PENDING') throw new Error('Only PENDING rows can be applied');
      if (jobRow.sheet !== 'clients') throw new Error('Only client rows are directly approvable');

      const [jobRows] = await conn.execute(
        `SELECT * FROM bulk_import_jobs WHERE id = ? FOR UPDATE`,
        [jobId]
      );
      if (!jobRows.length) throw new Error('Job not found');
      const job = jobRows[0];
      const agencyId = job.agency_id;

      const payload = jobRow.payload_json ? JSON.parse(jobRow.payload_json) : null;
      const clientRow = payload?.clientRow || null;
      if (!clientRow) throw new Error('Missing client payload');

      await ensureAgencySeeds(conn, agencyId);

      // Find provider payload by name
      const providerName = String(clientRow['Provider'] || '').trim();
      const providerKey = normalizeKey(providerName);
      const [providerRows] = await conn.execute(
        `SELECT payload_json FROM bulk_import_job_rows
         WHERE job_id = ? AND sheet = 'providers' AND LOWER(identifier) = LOWER(?) LIMIT 1`,
        [jobId, providerName]
      );
      // Fall back to scan if casing differs / identifier differs slightly
      let providerPayload = providerRows[0]?.payload_json ? JSON.parse(providerRows[0].payload_json) : null;
      if (!providerPayload) {
        const [allProviders] = await conn.execute(
          `SELECT identifier, payload_json FROM bulk_import_job_rows WHERE job_id = ? AND sheet = 'providers'`,
          [jobId]
        );
        const match = allProviders.find(p => normalizeKey(p.identifier) === providerKey);
        providerPayload = match?.payload_json ? JSON.parse(match.payload_json) : null;
      }
      if (!providerPayload) throw new Error(`Provider not found in preview job: ${providerName}`);

      // Create/update provider user/profile (track undo snapshot)
      const providerBefore = await (async () => {
        const name = String(providerPayload['Clinician Name'] || '').trim();
        const { firstName, lastName } = splitName(name);
        if (!firstName) return null;
        const [u] = await conn.execute(
          `SELECT id FROM users WHERE LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?) LIMIT 1`,
          [firstName, lastName || '']
        );
        if (!u.length) return null;
        const userId = u[0].id;
        const [p] = await conn.execute(
          `SELECT * FROM provider_profiles WHERE agency_id = ? AND user_id = ? LIMIT 1`,
          [agencyId, userId]
        );
        return { userId, profile: p[0] || null };
      })();

      const { userId: providerUserId } = await ensureProviderUserAndProfile(conn, agencyId, providerPayload);

      // Find roster schedule payload by school+provider+day
      const schoolName = String(clientRow['School'] || '').trim();
      const day = normalizeDay(clientRow['Day']);
      const rosterKey = `${normalizeKey(schoolName)}|${normalizeKey(providerName)}|${day}`;
      const [allRoster] = await conn.execute(
        `SELECT id, identifier, payload_json FROM bulk_import_job_rows WHERE job_id = ? AND sheet = 'roster'`,
        [jobId]
      );
      const rosterMatch = allRoster.find(r => {
        const rPayload = r.payload_json ? JSON.parse(r.payload_json) : {};
        const k = `${normalizeKey(rPayload['School'])}|${normalizeKey(rPayload['Provider Name'])}|${normalizeDay(rPayload['Day'])}`;
        return k === rosterKey;
      });
      const rosterPayload = rosterMatch?.payload_json ? JSON.parse(rosterMatch.payload_json) : null;
      if (!rosterPayload) throw new Error(`Roster schedule not found for ${schoolName} | ${providerName} | ${day}`);

      const school = await ensureSchoolOrg(conn, schoolName);
      await ensureAffiliation(conn, agencyId, school.id);

      const [scheduleBeforeRows] = await conn.execute(
        `SELECT * FROM provider_school_schedules
         WHERE agency_id = ? AND provider_user_id = ? AND school_organization_id = ? AND day_of_week = ?
         LIMIT 1`,
        [agencyId, providerUserId, school.id, day]
      );
      const scheduleBefore = scheduleBeforeRows[0] || null;

      await upsertProviderSchedule(conn, agencyId, rosterPayload, providerUserId, school.id);

      // Now apply the client row similarly to existing logic, but capture undo snapshot
      const clientName = String(clientRow['Client Name'] || '').trim();
      const baseIdentifier = makeIdentifierBase(clientName);
      const identifierName = await ensureClientIdentifierUnique(conn, agencyId, baseIdentifier);
      const identifierCode = await generateUniqueIdentifierCode(conn, agencyId);

      const insuranceId = await ensureDefinition(conn, 'insurance_definitions', agencyId, clientRow['Insurance']);
      const requestedClientStatusId = await ensureDefinition(conn, 'client_status_definitions', agencyId, clientRow['Status']);
      const currentClientStatusId = await ensureDefinition(conn, 'client_status_definitions', agencyId, 'Current');
      const becomesCurrent = !!providerUserId && !!day && requestedClientStatusId !== currentClientStatusId;
      const effectiveClientStatusId = (!!providerUserId && !!day) ? currentClientStatusId : requestedClientStatusId;
      const paperworkDeliveryId = await ensureDefinition(conn, 'paperwork_delivery_definitions', agencyId, clientRow['Paperwork Delivery']);
      const paperworkStatusId = await ensureDefinition(conn, 'paperwork_status_definitions', agencyId, clientRow['Paperwork Status']);

      const referralDate = parseDateToYMD(clientRow['Referral Date']);
      const docDate = parseDateToYMD(clientRow['Doc Date']);
      const skills = parseBool(clientRow['Skills']);
      const notes = String(clientRow['Notes'] || '').trim() || null;
      const grade = String(clientRow['Grade'] || '').trim() || null;
      const gender = String(clientRow['Gender'] || '').trim() || null;
      const primaryClientLanguage = String(clientRow['Primary Client Language'] || '').trim() || null;
      const primaryParentLanguage = String(clientRow['Primary Parent Language'] || '').trim() || null;

      const [matchRows] = await conn.execute(
        `SELECT * FROM clients
         WHERE agency_id = ? AND organization_id = ?
           AND (client_identifier_name = ? OR initials = ?)
         LIMIT 1`,
        [agencyId, school.id, identifierName, identifierName]
      );

      let clientUndo = null;
      let createdEntityId = null;
      let createdMessage = null;

      if (matchRows.length) {
        const before = matchRows[0];
        clientUndo = { kind: 'update', before };
        const clientId = before.id;
        createdEntityId = clientId;
        createdMessage = 'updated';

        await conn.execute(
          `UPDATE clients
           SET provider_id = ?,
               assigned_day_of_week = ?,
               skills = ?,
               insurance_id = ?,
               client_status_id = ?,
               paperwork_delivery_id = ?,
               doc_date = ?,
               paperwork_status_id = ?,
               grade = ?,
               gender = ?,
               primary_client_language = ?,
               primary_parent_language = ?,
               internal_notes = ?,
               identifier_code = ?,
               client_identifier_name = COALESCE(client_identifier_name, ?)
           WHERE id = ?`,
          [
            providerUserId,
            day,
            skills ? 1 : 0,
            insuranceId,
            effectiveClientStatusId,
            paperworkDeliveryId,
            docDate,
            paperworkStatusId,
            grade,
            gender,
            primaryClientLanguage,
            primaryParentLanguage,
            notes,
            identifierCode,
            identifierName,
            clientId
          ]
        );
        if (!before.referral_date && referralDate) {
          await conn.execute(`UPDATE clients SET referral_date = ? WHERE id = ?`, [referralDate, clientId]);
        }
      } else {
        const [ins] = await conn.execute(
          `INSERT INTO clients (
            organization_id, agency_id, provider_id,
            initials, client_identifier_name, identifier_code,
            status, document_status, source, created_by_user_id,
            referral_date, skills, insurance_id, client_status_id,
            paperwork_delivery_id, doc_date, paperwork_status_id,
            assigned_day_of_week, grade, gender, primary_client_language, primary_parent_language, internal_notes,
            submission_date
          ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 'NONE', 'BULK_IMPORT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()))`,
          [
            school.id,
            agencyId,
            providerUserId,
            identifierName,
            identifierName,
            identifierCode,
            uploadedByUserId,
            referralDate,
            skills ? 1 : 0,
            insuranceId,
            effectiveClientStatusId,
            paperworkDeliveryId,
            docDate,
            paperworkStatusId,
            day,
            grade,
            gender,
            primaryClientLanguage,
            primaryParentLanguage,
            notes,
            referralDate
          ]
        );
        createdEntityId = ins.insertId;
        createdMessage = 'created';
        clientUndo = { kind: 'create', id: ins.insertId };
      }

      // Create notifications consistent with existing behavior
      if (paperworkDeliveryId && (docDate || referralDate)) {
        await conn.execute(
          `INSERT INTO notifications (type, severity, title, message, user_id, agency_id, related_entity_type, related_entity_id)
           VALUES ('paperwork_received', 'warning', 'Paperwork Received', ?, NULL, ?, 'client', ?)`,
          [`Paperwork received for client ${identifierName} (${schoolName}).`, agencyId, createdEntityId]
        );
      }
      if (becomesCurrent) {
        await conn.execute(
          `INSERT INTO notifications (type, severity, title, message, user_id, agency_id, related_entity_type, related_entity_id)
           VALUES ('client_became_current', 'info', 'Client Became Current', ?, NULL, ?, 'client', ?),
                  ('client_became_current', 'info', 'Client Became Current', ?, ?, ?, 'client', ?)`,
          [
            `Client ${identifierName} is now Current (assigned ${providerName} on ${day}).`,
            agencyId,
            createdEntityId,
            `Client ${identifierName} is now Current (assigned ${providerName} on ${day}).`,
            providerUserId,
            agencyId,
            createdEntityId
          ]
        );
      }

      const undo = {
        client: clientUndo,
        providerProfileBefore,
        scheduleBefore,
        providerUserId,
        schoolOrgId: school.id,
        day
      };

      await conn.execute(
        `UPDATE bulk_import_job_rows
         SET status = 'SUCCESS',
             message = ?,
             created_entity_id = ?,
             created_entity_type = 'client',
             undo_json = ?,
             applied_at = NOW()
         WHERE id = ?`,
        [createdMessage, createdEntityId, JSON.stringify(undo), rowId]
      );

      await conn.commit();
      return { success: true, createdEntityId, message: createdMessage };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  static async applyJobAll({ jobId, uploadedByUserId }) {
    const [rows] = await pool.execute(
      `SELECT id FROM bulk_import_job_rows WHERE job_id = ? AND sheet = 'clients' AND status = 'PENDING' ORDER BY row_number ASC`,
      [jobId]
    );
    const results = { applied: 0, errors: [] };
    for (const r of rows) {
      try {
        await this.applyJobRow({ jobId, rowId: r.id, uploadedByUserId });
        results.applied++;
      } catch (e) {
        results.errors.push({ rowId: r.id, error: e.message });
        // keep going to allow partial approvals
      }
    }
    return results;
  }

  static async rollbackJob({ jobId }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT id, undo_json FROM bulk_import_job_rows
         WHERE job_id = ? AND sheet = 'clients' AND status = 'SUCCESS' AND undo_json IS NOT NULL
         ORDER BY applied_at DESC`,
        [jobId]
      );

      let rolledBack = 0;
      for (const r of rows) {
        const undo = JSON.parse(r.undo_json);
        const c = undo.client;
        if (c?.kind === 'create' && c.id) {
          await conn.execute(`DELETE FROM clients WHERE id = ?`, [c.id]);
        } else if (c?.kind === 'update' && c.before?.id) {
          const before = c.before;
          const fields = [
            'provider_id','assigned_day_of_week','skills','insurance_id','client_status_id','paperwork_delivery_id',
            'doc_date','paperwork_status_id','grade','gender','primary_client_language','primary_parent_language',
            'internal_notes','identifier_code','client_identifier_name','referral_date'
          ];
          const setSql = fields.map(f => `${f} = ?`).join(', ');
          const vals = fields.map(f => before[f] ?? null);
          vals.push(before.id);
          await conn.execute(`UPDATE clients SET ${setSql} WHERE id = ?`, vals);
        }

        // Revert provider schedule if we captured "before"
        if (undo.scheduleBefore) {
          const b = undo.scheduleBefore;
          await conn.execute(
            `UPDATE provider_school_schedules
             SET starting_available = ?, notes = ?
             WHERE id = ?`,
            [b.starting_available, b.notes, b.id]
          );
        } else if (undo.providerUserId && undo.schoolOrgId && undo.day) {
          // if it didn't exist before, delete it (safe, idempotent)
          await conn.execute(
            `DELETE FROM provider_school_schedules
             WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ?`,
            [undo.providerUserId, undo.schoolOrgId, undo.day]
          );
        }

        // Revert provider profile if we captured "before"
        if (undo.providerProfileBefore?.profile?.id) {
          const p = undo.providerProfileBefore.profile;
          await conn.execute(
            `UPDATE provider_profiles
             SET status = ?, credential_id = ?, display_name = ?,
                 accepts_medicaid = ?, accepts_commercial = ?, accepts_self_pay = ?, accepts_tricare_override = ?,
                 background_check_date = ?, background_status = ?, cleared_to_start = ?,
                 risk_high_behavior = ?, risk_suicidal = ?, risk_substance_use = ?, risk_trauma = ?, risk_skills = ?,
                 staff_notes = ?
             WHERE id = ?`,
            [
              p.status,
              p.credential_id,
              p.display_name,
              p.accepts_medicaid,
              p.accepts_commercial,
              p.accepts_self_pay,
              p.accepts_tricare_override,
              p.background_check_date,
              p.background_status,
              p.cleared_to_start,
              p.risk_high_behavior,
              p.risk_suicidal,
              p.risk_substance_use,
              p.risk_trauma,
              p.risk_skills,
              p.staff_notes,
              p.id
            ]
          );
        } else if (undo.providerProfileBefore?.userId) {
          // If it didn't exist before, remove it (safe)
          await conn.execute(
            `DELETE FROM provider_profiles WHERE agency_id = ? AND user_id = ?`,
            [(await conn.execute(`SELECT agency_id FROM bulk_import_jobs WHERE id = ?`, [jobId]))[0][0].agency_id, undo.providerProfileBefore.userId]
          );
        }

        await conn.execute(
          `UPDATE bulk_import_job_rows SET status = 'SKIPPED', message = 'rolled_back' WHERE id = ?`,
          [r.id]
        );
        rolledBack++;
      }

      await conn.execute(`UPDATE bulk_import_jobs SET status = 'ROLLED_BACK' WHERE id = ?`, [jobId]);
      await conn.commit();
      return { rolledBack };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  static async runOneTimeImport({
    agencyId,
    uploadedByUserId,
    clientsRecords,
    providersRecords,
    rosterRecords
  }) {
    const results = {
      jobId: null,
      totals: {
        clients: clientsRecords.length,
        providers: providersRecords.length,
        roster: rosterRecords.length
      },
      created: 0,
      updated: 0,
      errors: []
    };

    this.validateHeaders(clientsRecords, this.expectedClientsHeaders, 'Clients');
    this.validateHeaders(providersRecords, this.expectedProvidersHeaders, 'Providers');
    this.validateHeaders(rosterRecords, this.expectedRosterHeaders, 'Roster');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        `INSERT INTO bulk_import_jobs (agency_id, uploaded_by_user_id, kind, status, total_clients_rows, total_providers_rows, total_roster_rows)
         VALUES (?, ?, 'CLIENTS_ONE_TIME', 'RUNNING', ?, ?, ?)`,
        [agencyId, uploadedByUserId, clientsRecords.length, providersRecords.length, rosterRecords.length]
      );
      const [[jobRow]] = await conn.execute(`SELECT LAST_INSERT_ID() AS id`);
      results.jobId = jobRow.id;

      await ensureAgencySeeds(conn, agencyId);

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Provider + roster pre-pass (each row atomic), then clients (each row atomic)
    const providerNameToUserId = new Map();
    const schoolNameToOrgId = new Map();

    // Providers
    for (let idx = 0; idx < providersRecords.length; idx++) {
      const row = providersRecords[idx];
      const rowNumber = idx + 2;
      const rowConn = await pool.getConnection();
      try {
        await rowConn.beginTransaction();
        await ensureAgencySeeds(rowConn, agencyId);
        const { userId, clinicianName } = await ensureProviderUserAndProfile(rowConn, agencyId, row);
        providerNameToUserId.set(normalizeKey(clinicianName), userId);

        await rowConn.execute(
          `INSERT INTO bulk_import_job_rows (job_id, sheet, row_number, identifier, status, message, created_entity_id, created_entity_type)
           VALUES (?, 'providers', ?, ?, 'SUCCESS', NULL, ?, 'user')`,
          [results.jobId, rowNumber, clinicianName, userId]
        );
        await rowConn.commit();
      } catch (e) {
        await rowConn.rollback();
        results.errors.push({ sheet: 'providers', row: rowNumber, error: e.message });
        await pool.execute(
          `INSERT INTO bulk_import_job_rows (job_id, sheet, row_number, identifier, status, message)
           VALUES (?, 'providers', ?, ?, 'ERROR', ?)`,
          [results.jobId, rowNumber, row['Clinician Name'] || null, e.message]
        );
      } finally {
        rowConn.release();
      }
    }

    // Roster schedules
    for (let idx = 0; idx < rosterRecords.length; idx++) {
      const row = rosterRecords[idx];
      const rowNumber = idx + 2;
      const rowConn = await pool.getConnection();
      try {
        await rowConn.beginTransaction();
        const schoolName = String(row['School'] || '').trim();
        const providerName = String(row['Provider Name'] || '').trim();
        if (!schoolName) throw new Error('School is required');
        if (!providerName) throw new Error('Provider Name is required');

        const school = await ensureSchoolOrg(rowConn, schoolName);
        schoolNameToOrgId.set(normalizeKey(school.name), school.id);
        await ensureAffiliation(rowConn, agencyId, school.id);

        const providerKey = normalizeKey(providerName);
        const providerUserId = providerNameToUserId.get(providerKey);
        if (!providerUserId) {
          throw new Error(`Provider not found in Providers CSV: ${providerName}`);
        }

        await upsertProviderSchedule(rowConn, agencyId, row, providerUserId, school.id);

        await rowConn.execute(
          `INSERT INTO bulk_import_job_rows (job_id, sheet, row_number, identifier, status, message)
           VALUES (?, 'roster', ?, ?, 'SUCCESS', NULL)`,
          [results.jobId, rowNumber, `${schoolName} | ${providerName}`]
        );
        await rowConn.commit();
      } catch (e) {
        await rowConn.rollback();
        results.errors.push({ sheet: 'roster', row: rowNumber, error: e.message });
        await pool.execute(
          `INSERT INTO bulk_import_job_rows (job_id, sheet, row_number, identifier, status, message)
           VALUES (?, 'roster', ?, ?, 'ERROR', ?)`,
          [results.jobId, rowNumber, `${row['School'] || ''} | ${row['Provider Name'] || ''}`.trim(), e.message]
        );
      } finally {
        rowConn.release();
      }
    }

    // Clients
    for (let idx = 0; idx < clientsRecords.length; idx++) {
      const row = clientsRecords[idx];
      const rowNumber = idx + 2;
      const rowConn = await pool.getConnection();
      try {
        await rowConn.beginTransaction();
        await ensureAgencySeeds(rowConn, agencyId);

        const schoolName = String(row['School'] || '').trim();
        const providerName = String(row['Provider'] || '').trim();
        const clientName = String(row['Client Name'] || '').trim();
        const day = normalizeDay(row['Day']);

        if (!clientName) throw new Error('Client Name is required');
        if (!schoolName) throw new Error('School is required');
        if (!providerName) throw new Error('Provider is required');
        if (!day) throw new Error(`Invalid Day: ${row['Day'] || ''}`);

        const school = await ensureSchoolOrg(rowConn, schoolName);
        await ensureAffiliation(rowConn, agencyId, school.id);

        const providerUserId = providerNameToUserId.get(normalizeKey(providerName));
        if (!providerUserId) throw new Error(`Provider not found in Providers CSV: ${providerName}`);

        // Enforce day exists and capacity
        const cap = await getProviderScheduleCapacity(rowConn, providerUserId, school.id, day);
        if (cap.startingAvailable === null) {
          throw new Error(`Provider is not scheduled for ${schoolName} on ${day}`);
        }
        if (cap.currentAssigned >= cap.startingAvailable) {
          throw new Error(`No capacity for ${providerName} at ${schoolName} on ${day} (starting ${cap.startingAvailable}, current ${cap.currentAssigned})`);
        }

        const baseIdentifier = makeIdentifierBase(clientName);
        const identifierName = await ensureClientIdentifierUnique(rowConn, agencyId, baseIdentifier);
        const identifierCode = await generateUniqueIdentifierCode(rowConn, agencyId);

        const insuranceId = await ensureDefinition(rowConn, 'insurance_definitions', agencyId, row['Insurance']);
        const requestedClientStatusId = await ensureDefinition(rowConn, 'client_status_definitions', agencyId, row['Status']);
        const currentClientStatusId = await ensureDefinition(rowConn, 'client_status_definitions', agencyId, 'Current');
        const becomesCurrent = !!providerUserId && !!day && requestedClientStatusId !== currentClientStatusId;
        const effectiveClientStatusId = (!!providerUserId && !!day) ? currentClientStatusId : requestedClientStatusId;
        const paperworkDeliveryId = await ensureDefinition(rowConn, 'paperwork_delivery_definitions', agencyId, row['Paperwork Delivery']);
        const paperworkStatusId = await ensureDefinition(rowConn, 'paperwork_status_definitions', agencyId, row['Paperwork Status']);

        const referralDate = parseDateToYMD(row['Referral Date']);
        const docDate = parseDateToYMD(row['Doc Date']);

        const skills = parseBool(row['Skills']);
        const notes = String(row['Notes'] || '').trim() || null;
        const grade = String(row['Grade'] || '').trim() || null;
        const gender = String(row['Gender'] || '').trim() || null;
        const primaryClientLanguage = String(row['Primary Client Language'] || '').trim() || null;
        const primaryParentLanguage = String(row['Primary Parent Language'] || '').trim() || null;

        // Match by agency + school + initials (we use initials as the de-identified identifier)
        const [matchRows] = await rowConn.execute(
          `SELECT id, referral_date
           FROM clients
           WHERE agency_id = ? AND organization_id = ?
             AND (client_identifier_name = ? OR initials = ?)
           LIMIT 1`,
          [agencyId, school.id, identifierName, identifierName]
        );

        if (matchRows.length) {
          const clientId = matchRows[0].id;
          // referral_date immutable after import: only set if currently NULL
          await rowConn.execute(
            `UPDATE clients
             SET provider_id = ?,
                 assigned_day_of_week = ?,
                 skills = ?,
                 insurance_id = ?,
                 client_status_id = ?,
                 paperwork_delivery_id = ?,
                 doc_date = ?,
                 paperwork_status_id = ?,
                 grade = ?,
                 gender = ?,
                 primary_client_language = ?,
                 primary_parent_language = ?,
                 internal_notes = ?,
                 identifier_code = ?,
                 client_identifier_name = COALESCE(client_identifier_name, ?)
             WHERE id = ?`,
            [
              providerUserId,
              day,
              skills ? 1 : 0,
              insuranceId,
              effectiveClientStatusId,
              paperworkDeliveryId,
              docDate,
              paperworkStatusId,
              grade,
              gender,
              primaryClientLanguage,
              primaryParentLanguage,
              notes,
              identifierCode,
              identifierName,
              clientId
            ]
          );

          if (!matchRows[0].referral_date && referralDate) {
            await rowConn.execute(`UPDATE clients SET referral_date = ? WHERE id = ?`, [referralDate, clientId]);
          }

          // Notifications
          if (paperworkDeliveryId && (docDate || referralDate)) {
            await rowConn.execute(
              `INSERT INTO notifications (type, severity, title, message, user_id, agency_id, related_entity_type, related_entity_id)
               VALUES ('paperwork_received', 'warning', 'Paperwork Received', ?, NULL, ?, 'client', ?)`,
              [`Paperwork received for client ${identifierName} (${schoolName}).`, agencyId, clientId]
            );
          }
          if (becomesCurrent) {
            await rowConn.execute(
              `INSERT INTO notifications (type, severity, title, message, user_id, agency_id, related_entity_type, related_entity_id)
               VALUES ('client_became_current', 'info', 'Client Became Current', ?, NULL, ?, 'client', ?),
                      ('client_became_current', 'info', 'Client Became Current', ?, ?, ?, 'client', ?)`,
              [
                `Client ${identifierName} is now Current (assigned ${providerName} on ${day}).`,
                agencyId,
                clientId,
                `Client ${identifierName} is now Current (assigned ${providerName} on ${day}).`,
                providerUserId,
                agencyId,
                clientId
              ]
            );
          }

          results.updated++;
          await rowConn.execute(
            `INSERT INTO bulk_import_job_rows (job_id, sheet, row_number, identifier, status, message, created_entity_id, created_entity_type)
             VALUES (?, 'clients', ?, ?, 'SUCCESS', 'updated', ?, 'client')`,
            [results.jobId, rowNumber, identifierName, clientId]
          );
        } else {
          const [ins] = await rowConn.execute(
            `INSERT INTO clients (
              organization_id, agency_id, provider_id,
              initials, client_identifier_name, identifier_code,
              status, document_status, source, created_by_user_id,
              referral_date, skills, insurance_id, client_status_id,
              paperwork_delivery_id, doc_date, paperwork_status_id,
              assigned_day_of_week, grade, gender, primary_client_language, primary_parent_language, internal_notes,
              submission_date
            ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 'NONE', 'BULK_IMPORT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()))`,
            [
              school.id,
              agencyId,
              providerUserId,
              identifierName,
              identifierName,
              identifierCode,
              uploadedByUserId,
              referralDate,
              skills ? 1 : 0,
              insuranceId,
              effectiveClientStatusId,
              paperworkDeliveryId,
              docDate,
              paperworkStatusId,
              day,
              grade,
              gender,
              primaryClientLanguage,
              primaryParentLanguage,
              notes,
              referralDate
            ]
          );

          // Notifications
          if (paperworkDeliveryId && (docDate || referralDate)) {
            await rowConn.execute(
              `INSERT INTO notifications (type, severity, title, message, user_id, agency_id, related_entity_type, related_entity_id)
               VALUES ('paperwork_received', 'warning', 'Paperwork Received', ?, NULL, ?, 'client', ?)`,
              [`Paperwork received for client ${identifierName} (${schoolName}).`, agencyId, ins.insertId]
            );
          }
          if (becomesCurrent) {
            await rowConn.execute(
              `INSERT INTO notifications (type, severity, title, message, user_id, agency_id, related_entity_type, related_entity_id)
               VALUES ('client_became_current', 'info', 'Client Became Current', ?, NULL, ?, 'client', ?),
                      ('client_became_current', 'info', 'Client Became Current', ?, ?, ?, 'client', ?)`,
              [
                `Client ${identifierName} is now Current (assigned ${providerName} on ${day}).`,
                agencyId,
                ins.insertId,
                `Client ${identifierName} is now Current (assigned ${providerName} on ${day}).`,
                providerUserId,
                agencyId,
                ins.insertId
              ]
            );
          }

          results.created++;
          await rowConn.execute(
            `INSERT INTO bulk_import_job_rows (job_id, sheet, row_number, identifier, status, message, created_entity_id, created_entity_type)
             VALUES (?, 'clients', ?, ?, 'SUCCESS', 'created', ?, 'client')`,
            [results.jobId, rowNumber, identifierName, ins.insertId]
          );
        }

        await rowConn.commit();
      } catch (e) {
        await rowConn.rollback();
        results.errors.push({ sheet: 'clients', row: rowNumber, error: e.message });
        await pool.execute(
          `INSERT INTO bulk_import_job_rows (job_id, sheet, row_number, identifier, status, message)
           VALUES (?, 'clients', ?, ?, 'ERROR', ?)`,
          [results.jobId, rowNumber, row['Client Name'] || null, e.message]
        );
      } finally {
        rowConn.release();
      }
    }

    // Close job
    const status = results.errors.length ? 'COMPLETED' : 'COMPLETED';
    await pool.execute(
      `UPDATE bulk_import_jobs
       SET status = ?,
           created_count = ?,
           updated_count = ?,
           error_count = ?
       WHERE id = ?`,
      [status, results.created, results.updated, results.errors.length, results.jobId]
    );

    return results;
  }
}

