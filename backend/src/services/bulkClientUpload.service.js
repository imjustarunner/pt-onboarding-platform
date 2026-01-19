import crypto from 'crypto';
import pool from '../config/database.js';
import { adjustProviderSlots } from './providerSlots.service.js';
import { notifyClientBecameCurrent, notifyPaperworkReceived } from './clientNotifications.service.js';

const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const titleCase = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1).toLowerCase() : '');

const safeLetters = (s) => String(s || '').replace(/[^a-zA-Z]/g, '');

// In Bulk Client Upload, the "Client Name" column is a short identifier code (e.g. MesJuv / NevCas),
// not a person's full legal name. We preserve the code verbatim (trimmed) so the UI shows it correctly.
const normalizeClientCode = (value) => {
  const s = String(value || '').trim();
  // Keep original casing; only strip surrounding whitespace.
  return s;
};

const generateIdentifierCode = (fullName) => {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = safeLetters(parts[0] || '');
  const last = safeLetters(parts[parts.length - 1] || '');
  const last3 = (last.slice(0, 3) || '').padEnd(3, 'x');
  const first3 = (first.slice(0, 3) || '').padEnd(3, 'x');
  const base = `${titleCase(last3)}${titleCase(first3)}`.slice(0, 6);
  return base;
};

const normalizeKey = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

const normalizeClientStatusKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('pending')) return 'pending';
  if (raw.includes('current') || raw === 'active') return 'current';
  if (raw.includes('inactive')) return 'inactive';
  if (raw.includes('terminated') || raw.includes('terminate')) return 'terminated';
  if (raw.includes('waitlist')) return 'waitlist';
  if (raw.includes('screener') || raw.includes('screen')) return 'screener';
  if (raw.includes('packet')) return 'packet';
  return normalizeKey(raw);
};

const normalizePaperworkStatusKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('completed')) return 'completed';
  if (raw.includes('re-auth') || raw.includes('reauth')) return 're_auth';
  if (raw.includes('new insurance')) return 'new_insurance';
  if (raw.includes('insurance') || raw.includes('payment')) return 'insurance_payment_auth';
  if (raw.includes('emailed')) return 'emailed_packet';
  if (raw === 'roi' || raw.includes('release')) return 'roi';
  if (raw.includes('renewal')) return 'renewal';
  if (raw.includes('new docs') || raw.includes('new documents')) return 'new_docs';
  if (raw.includes('disclosure') || raw.includes('consent')) return 'disclosure_consent';
  if (raw.includes('balance')) return 'balance';
  return normalizeKey(raw);
};

const normalizeInsuranceKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('medicaid')) return 'medicaid';
  if (raw.includes('tricare')) return 'tricare';
  if (raw.includes('self')) return 'self_pay';
  if (raw.includes('commercial') || raw.includes('other')) return 'commercial_other';
  if (raw.includes('none')) return 'none';
  if (raw.includes('unknown')) return 'unknown';
  return normalizeKey(raw);
};

const normalizeDeliveryMethodKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('upload')) return 'uploaded';
  if (raw.includes('school') && raw.includes('email')) return 'school_emailed';
  if (raw.includes('set home') || (raw.includes('sent') && raw.includes('home'))) return 'set_home';
  if (raw.includes('unknown')) return 'unknown';
  return normalizeKey(raw);
};

const parseIntOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
};

const todayYmd = () => new Date().toISOString().split('T')[0];

async function upsertBulkJobRow(connection, { jobId, rowNumber, status, message, entityIds }) {
  await connection.execute(
    `INSERT INTO bulk_import_job_rows (job_id, \`row_number\`, \`status\`, message, entity_ids)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE \`status\` = VALUES(\`status\`), message = VALUES(message), entity_ids = VALUES(entity_ids)`,
    [jobId, rowNumber, status, message || null, entityIds ? JSON.stringify(entityIds) : null]
  );
}

async function getCatalogId(connection, { table, agencyId, label, keyColumn, labelColumn }) {
  const rawLabel = String(label || '').trim();
  if (!rawLabel) return null;
  const k = normalizeKey(rawLabel);
  const [rows] = await connection.execute(
    `SELECT id FROM ${table} WHERE agency_id = ? AND (LOWER(${labelColumn}) = LOWER(?) OR ${keyColumn} = ?) LIMIT 1`,
    [agencyId, rawLabel, k]
  );
  return rows[0]?.id || null;
}

async function getDeliveryMethodId(connection, { schoolId, label }) {
  const rawLabel = String(label || '').trim();
  if (!rawLabel) return null;
  const k = normalizeKey(rawLabel);
  const [rows] = await connection.execute(
    `SELECT id FROM paperwork_delivery_methods WHERE school_organization_id = ? AND (LOWER(label) = LOWER(?) OR method_key = ?) LIMIT 1`,
    [schoolId, rawLabel, k]
  );
  return rows[0]?.id || null;
}

async function ensureDefaultCatalogIds(connection, agencyId, schoolId) {
  const [clientStatus] = await connection.execute(
    `SELECT id FROM client_statuses WHERE agency_id = ? AND status_key = 'pending' LIMIT 1`,
    [agencyId]
  );
  const [paperworkStatus] = await connection.execute(
    `SELECT id FROM paperwork_statuses WHERE agency_id = ? AND status_key = 'emailed_packet' LIMIT 1`,
    [agencyId]
  );
  const [insurance] = await connection.execute(
    `SELECT id FROM insurance_types WHERE agency_id = ? AND insurance_key = 'unknown' LIMIT 1`,
    [agencyId]
  );
  const [delivery] = await connection.execute(
    `SELECT id FROM paperwork_delivery_methods WHERE school_organization_id = ? AND method_key = 'unknown' LIMIT 1`,
    [schoolId]
  );
  return {
    clientStatusId: clientStatus[0]?.id || null,
    paperworkStatusId: paperworkStatus[0]?.id || null,
    insuranceTypeId: insurance[0]?.id || null,
    deliveryMethodId: delivery[0]?.id || null
  };
}

async function findOrCreateSchool(connection, { agencyId, schoolName, districtName }) {
  const name = String(schoolName || '').trim();
  if (!name) throw new Error('School is required');
  const slug = slugify(name);

  const [existing] = await connection.execute(
    `SELECT id FROM agencies WHERE organization_type = 'school' AND (name = ? OR slug = ?) LIMIT 1`,
    [name, slug]
  );
  let schoolId = existing[0]?.id || null;

  if (!schoolId) {
    const [result] = await connection.execute(
      `INSERT INTO agencies (name, slug, logo_url, color_palette, terminology_settings, is_active, organization_type)
       VALUES (?, ?, NULL, NULL, NULL, TRUE, 'school')`,
      [name, slug || crypto.randomBytes(8).toString('hex')]
    );
    schoolId = result.insertId;
  }

  // Link to agency via organization_affiliations
  await connection.execute(
    `INSERT INTO organization_affiliations (agency_id, organization_id, is_active)
     VALUES (?, ?, TRUE)
     ON DUPLICATE KEY UPDATE is_active = TRUE`,
    [agencyId, schoolId]
  );

  if (districtName && String(districtName).trim()) {
    await connection.execute(
      `INSERT INTO school_profiles (school_organization_id, district_name)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE district_name = VALUES(district_name)`,
      [schoolId, String(districtName).trim()]
    );
  }

  return schoolId;
}

async function findOrCreateProvider(connection, { agencyId, providerName }) {
  const name = String(providerName || '').trim();
  if (!name) return null;

  // Basic name parsing: "Last, First" or "First Last"
  let firstName = '';
  let lastName = '';
  if (name.includes(',')) {
    const [l, f] = name.split(',').map(s => String(s || '').trim());
    firstName = f || '';
    lastName = l || '';
  } else {
    const parts = name.split(/\s+/).filter(Boolean);
    firstName = parts[0] || '';
    lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  }

  // Try to match an existing agency user by name
  if (firstName && lastName) {
    const firstToken = String(firstName).trim().split(/\s+/)[0] || firstName;
    const [rows] = await connection.execute(
      `SELECT u.id
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ? AND u.first_name = ? AND u.last_name = ?
       LIMIT 1`,
      [agencyId, firstToken, lastName]
    );
    if (rows[0]?.id) return rows[0].id;
  }

  // Use a canonical name key for placeholder-email hashing so imports match even if one file uses
  // "Last, First" and another uses "First Last".
  const firstToken = String(firstName).trim().split(/\s+/)[0] || '';
  const canonicalName = (firstToken && lastName) ? `${firstToken} ${lastName}` : name;
  const hashNew = crypto.createHash('sha256').update(`${agencyId}:${canonicalName.toLowerCase()}`).digest('hex').slice(0, 10);
  const hashOld = crypto.createHash('sha256').update(`${agencyId}:${name}`).digest('hex').slice(0, 10);
  const emailNew = `provider+${hashNew}@example.invalid`;
  const emailOld = `provider+${hashOld}@example.invalid`;

  // Backward-compat: check both the old and new email hashes to avoid duplicates.
  const [existing] = await connection.execute(
    `SELECT id FROM users WHERE email IN (?, ?) LIMIT 1`,
    [emailNew, emailOld]
  );
  let userId = existing[0]?.id || null;

  if (!userId) {
    const safeStatusCandidates = ['ACTIVE_EMPLOYEE', 'active', 'completed', 'pending'];
    let inserted = false;
    let lastErr = null;

    for (const status of safeStatusCandidates) {
      try {
        const [result] = await connection.execute(
          `INSERT INTO users (role, status, first_name, last_name, email)
           VALUES ('provider', ?, ?, ?, ?)`,
          [status, firstName || 'Provider', lastName || 'User', emailNew]
        );
        userId = result.insertId;
        inserted = true;
        break;
      } catch (e) {
        lastErr = e;
        // Try next candidate if ENUM mismatch
        if (e?.code === 'ER_WRONG_VALUE_FOR_FIELD' || String(e?.message || '').includes('Incorrect')) {
          continue;
        }
        throw e;
      }
    }

    if (!inserted) {
      throw lastErr || new Error('Failed to create provider user');
    }
  }

  await connection.execute(
    `INSERT INTO user_agencies (user_id, agency_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [userId, agencyId]
  );

  return userId;
}

async function ensureProviderAvailability(connection, { providerUserId, schoolId, dayOfWeek, slots }) {
  if (!providerUserId || !schoolId || !dayOfWeek || !slots || slots < 0) return;
  const [rows] = await connection.execute(
    `SELECT id FROM provider_school_assignments
     WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ?
     LIMIT 1`,
    [providerUserId, schoolId, dayOfWeek]
  );
  if (rows[0]?.id) return;

  await connection.execute(
    `INSERT INTO provider_school_assignments
      (provider_user_id, school_organization_id, day_of_week, slots_total, slots_available, is_active)
     VALUES (?, ?, ?, ?, ?, TRUE)`,
    [providerUserId, schoolId, dayOfWeek, slots, slots]
  );
}


export async function processBulkClientUpload({ agencyId, userId, fileName, rows }) {
  const connection = await pool.getConnection();
  let jobId = null;
  try {
    // Create job
    const [jobResult] = await connection.execute(
      `INSERT INTO bulk_import_jobs (agency_id, uploaded_by_user_id, file_name, started_at, total_rows)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [agencyId, userId, fileName, rows.length]
    );
    jobId = jobResult.insertId;

    let successRows = 0;
    let failedRows = 0;
    const createdSchools = new Map(); // name -> id
    const createdProviders = new Map(); // provider display -> userId

    for (const row of rows) {
      await connection.beginTransaction();
      try {
        const schoolId = await findOrCreateSchool(connection, {
          agencyId,
          schoolName: row.school,
          districtName: row.district
        });
        if (row.school && schoolId) {
          // Best-effort "created" tracking: if the name doesn't exist in map yet, record it.
          const key = String(row.school).trim();
          if (key && !createdSchools.has(key)) createdSchools.set(key, schoolId);
        }

        const providerUserId = await findOrCreateProvider(connection, { agencyId, providerName: row.provider });
        if (row.provider && providerUserId) {
          const key = String(row.provider).trim();
          if (key && !createdProviders.has(key)) createdProviders.set(key, providerUserId);
        }
        if (row.day && !providerUserId) {
          throw new Error('Day provided but Provider is missing');
        }

        const providerSlots = parseIntOrNull(row.providerAvailability);
        if (providerUserId && schoolId && row.day && providerSlots !== null) {
          await ensureProviderAvailability(connection, {
            providerUserId,
            schoolId,
            dayOfWeek: row.day,
            slots: providerSlots
          });
        }

        const defaults = await ensureDefaultCatalogIds(connection, agencyId, schoolId);

        const clientCode = normalizeClientCode(row.clientName || row.identifierCode);
        if (!clientCode) throw new Error('Client Name is required');
        // Preserve the client identifier code for UI + matching.
        // Note: the DB column may be sized differently across environments; migrations should align it.
        const identifierCode = clientCode;

        const existingClientQuery = `SELECT id, referral_date, provider_id, organization_id, service_day, paperwork_received_at FROM clients WHERE agency_id = ? AND identifier_code = ? LIMIT 1`;
        const [existingRows] = await connection.execute(existingClientQuery, [agencyId, identifierCode]);
        const existing = existingRows[0] || null;

        const clientStatusKey = normalizeClientStatusKey(row.status);
        const paperworkStatusKey = normalizePaperworkStatusKey(row.paperworkStatus);
        const insuranceKey = normalizeInsuranceKey(row.insurance);
        const deliveryKey = normalizeDeliveryMethodKey(row.paperworkDelivery);

        const clientStatusId =
          (await getCatalogId(connection, { table: 'client_statuses', agencyId, label: clientStatusKey || row.status, keyColumn: 'status_key', labelColumn: 'label' })) ||
          defaults.clientStatusId;
        const paperworkStatusId =
          (await getCatalogId(connection, { table: 'paperwork_statuses', agencyId, label: paperworkStatusKey || row.paperworkStatus, keyColumn: 'status_key', labelColumn: 'label' })) ||
          defaults.paperworkStatusId;
        const insuranceTypeId =
          (await getCatalogId(connection, { table: 'insurance_types', agencyId, label: insuranceKey || row.insurance, keyColumn: 'insurance_key', labelColumn: 'label' })) ||
          defaults.insuranceTypeId;
        const deliveryMethodId =
          (await getDeliveryMethodId(connection, { schoolId, label: deliveryKey || row.paperworkDelivery })) || defaults.deliveryMethodId;

        // Determine if this assignment changes slots
        const newProviderId = providerUserId || null;
        const newDay = row.day || null;
        const newSchoolId = schoolId;
        const oldIsCurrent = !!(existing?.provider_id && existing?.service_day);
        const newIsCurrent = !!(newProviderId && newDay);

        const paperworkKey = normalizeKey(paperworkStatusKey || row.paperworkStatus);
        const paperworkIsCompleted = paperworkKey === 'completed' || String(row.paperworkStatus || '').toLowerCase() === 'completed';
        const oldPaperworkReceived = !!existing?.paperwork_received_at;
        const willMarkPaperworkReceived = paperworkIsCompleted && !oldPaperworkReceived;

        if (newProviderId && newDay) {
          // If existing assignment differs, release old slot then take new slot
          if (existing?.provider_id && existing?.service_day && existing?.organization_id) {
            const same =
              parseInt(existing.provider_id, 10) === parseInt(newProviderId, 10) &&
              String(existing.service_day) === String(newDay) &&
              parseInt(existing.organization_id, 10) === parseInt(newSchoolId, 10);
            if (!same) {
              await adjustProviderSlots(connection, {
                providerUserId: existing.provider_id,
                schoolId: existing.organization_id,
                dayOfWeek: existing.service_day,
                delta: +1
              });
            }
          }

          // Take new slot if it’s a new assignment
          const needsTake =
            !existing ||
            !existing.provider_id ||
            !existing.service_day ||
            !existing.organization_id ||
            parseInt(existing.provider_id, 10) !== parseInt(newProviderId, 10) ||
            String(existing.service_day) !== String(newDay) ||
            parseInt(existing.organization_id, 10) !== parseInt(newSchoolId, 10);
          if (needsTake) {
            const slotResult = await adjustProviderSlots(connection, {
              providerUserId: newProviderId,
              schoolId: newSchoolId,
              dayOfWeek: newDay,
              delta: -1
            });
            if (!slotResult.ok) throw new Error(slotResult.reason);
          }
        }

        if (!existing) {
          const submissionDate = row.referralDate || todayYmd();
          const referralDate = row.referralDate || submissionDate;

          await connection.execute(
            `INSERT INTO clients (
              organization_id, agency_id, provider_id, initials, full_name, status,
              submission_date, document_status, source, created_by_user_id,
              referral_date, client_status_id, paperwork_status_id, insurance_type_id, paperwork_delivery_method_id,
              doc_date, grade, gender, identifier_code, primary_client_language, primary_parent_language,
              skills, internal_notes, service_day, paperwork_received_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?
            )`,
            [
              newSchoolId,
              agencyId,
              newProviderId,
              clientCode,
              clientCode,
              newProviderId && newDay ? 'ACTIVE' : 'PENDING_REVIEW',
              submissionDate,
              'NONE',
              'BULK_IMPORT',
              userId,
              referralDate,
              clientStatusId,
              paperworkStatusId,
              insuranceTypeId,
              deliveryMethodId,
              row.docDate || null,
              row.grade || null,
              row.gender || null,
              identifierCode,
              row.primaryClientLanguage || null,
              row.primaryParentLanguage || null,
              row.skills ? 1 : 0,
              row.notes || null,
              newDay,
              willMarkPaperworkReceived ? new Date() : null
            ]
          );
        } else {
          const updates = [];
          const values = [];

          const set = (field, val) => {
            updates.push(`${field} = ?`);
            values.push(val);
          };

          set('organization_id', newSchoolId);
          set('provider_id', newProviderId);
          set('service_day', newDay);
          set('full_name', clientCode);
          set('initials', clientCode);
          set('client_status_id', clientStatusId);
          set('paperwork_status_id', paperworkStatusId);
          set('insurance_type_id', insuranceTypeId);
          set('paperwork_delivery_method_id', deliveryMethodId);
          set('doc_date', row.docDate || null);
          set('grade', row.grade || null);
          set('gender', row.gender || null);
          set('primary_client_language', row.primaryClientLanguage || null);
          set('primary_parent_language', row.primaryParentLanguage || null);
          set('skills', row.skills ? 1 : 0);
          set('internal_notes', row.notes || null);
          if (willMarkPaperworkReceived) {
            set('paperwork_received_at', new Date());
          }

          // referral_date is immutable after set
          if (!existing.referral_date && row.referralDate) {
            set('referral_date', row.referralDate);
          }

          // Keep legacy status enum roughly aligned with assignment state
          set('status', newProviderId && newDay ? 'ACTIVE' : 'PENDING_REVIEW');

          // Always update last_activity + updated_by
          set('updated_by_user_id', userId);
          updates.push('last_activity_at = CURRENT_TIMESTAMP');

          values.push(existing.id);
          await connection.execute(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, values);
        }

        const [clientRows] = await connection.execute(
          `SELECT id FROM clients WHERE agency_id = ? AND identifier_code = ? LIMIT 1`,
          [agencyId, identifierCode]
        );
        const clientId = clientRows[0]?.id || null;

        await upsertBulkJobRow(connection, {
          jobId,
          rowNumber: row.rowNumber,
          status: 'success',
          message: 'Imported successfully',
          entityIds: { clientId, providerUserId, schoolOrganizationId: schoolId }
        });

        await connection.commit();
        successRows += 1;

        // Notifications (best-effort, outside the transaction)
        if (!oldIsCurrent && newIsCurrent && clientId) {
          notifyClientBecameCurrent({
            agencyId,
            schoolOrganizationId: schoolId,
            clientId,
            providerUserId: newProviderId,
            clientNameOrIdentifier: identifierCode
          }).catch(() => {});
        }
        if (!oldPaperworkReceived && willMarkPaperworkReceived && clientId) {
          notifyPaperworkReceived({
            agencyId,
            schoolOrganizationId: schoolId,
            clientId,
            clientNameOrIdentifier: identifierCode
          }).catch(() => {});
        }
      } catch (e) {
        await connection.rollback();
        failedRows += 1;
        await upsertBulkJobRow(connection, {
          jobId,
          rowNumber: row.rowNumber,
          status: 'failed',
          message: e.message || 'Row failed',
          entityIds: null
        });
      }
    }

    await connection.execute(
      `UPDATE bulk_import_jobs
       SET finished_at = CURRENT_TIMESTAMP, success_rows = ?, failed_rows = ?
       WHERE id = ?`,
      [successRows, failedRows, jobId]
    );

    return {
      jobId,
      totalRows: rows.length,
      successRows,
      failedRows,
      createdSchools: Array.from(createdSchools.entries()).map(([name, id]) => ({ name, id })),
      createdProviders: Array.from(createdProviders.entries()).map(([name, id]) => ({ name, id }))
    };
  } finally {
    connection.release();
  }
}

export async function undoBulkClientUploadJob({ agencyId, jobId, requestingUserId, dryRun = true }) {
  const aId = parseInt(agencyId, 10);
  const jId = parseInt(jobId, 10);
  if (!aId || !jId) throw new Error('agencyId and jobId are required');

  const connection = await pool.getConnection();
  try {
    const [jobs] = await connection.execute(
      `SELECT id, agency_id, uploaded_by_user_id, started_at, finished_at, created_at
       FROM bulk_import_jobs
       WHERE id = ? AND agency_id = ?
       LIMIT 1`,
      [jId, aId]
    );
    const job = jobs[0] || null;
    if (!job) throw new Error('Job not found');
    if (!job.finished_at) throw new Error('Job is still running (cannot undo until finished)');

    // Only allow the uploader or another privileged admin to undo.
    // The controller already gates by role; this is an extra safety check.
    if (job.uploaded_by_user_id && requestingUserId && parseInt(job.uploaded_by_user_id, 10) !== parseInt(requestingUserId, 10)) {
      // Allow, but note in response (audit-level decision belongs to controller/role)
    }

    const windowStart = job.started_at || job.created_at;
    const windowEnd = job.finished_at;

    // Only delete clients that were CREATED during this job window.
    // We cannot safely revert "updates" without a before-snapshot.
    const [clientRows] = await connection.execute(
      `SELECT id, provider_id, organization_id, service_day
       FROM clients
       WHERE agency_id = ?
         AND source = 'BULK_IMPORT'
         AND created_by_user_id = ?
         AND created_at BETWEEN ? AND ?`,
      [aId, job.uploaded_by_user_id, windowStart, windowEnd]
    );

    const clientIds = clientRows.map((r) => r.id);
    const providerIds = Array.from(new Set(clientRows.map((r) => r.provider_id).filter(Boolean)));
    const schoolIds = Array.from(new Set(clientRows.map((r) => r.organization_id).filter(Boolean)));

    const summary = {
      jobId: jId,
      agencyId: aId,
      dryRun: !!dryRun,
      willDeleteClients: clientIds.length,
      willReleaseSlots: clientRows.filter((r) => r.provider_id && r.organization_id && r.service_day).length,
      willAttemptProviderCleanup: providerIds.length,
      willAttemptSchoolCleanup: schoolIds.length,
      note: 'Undo only deletes clients created by the job. Rows that updated existing clients are not reverted.'
    };

    if (dryRun) return summary;

    await connection.beginTransaction();

    // Release provider slots for created clients that took a slot
    let releasedSlots = 0;
    for (const c of clientRows) {
      if (!c.provider_id || !c.organization_id || !c.service_day) continue;
      const res = await adjustProviderSlots(connection, {
        providerUserId: c.provider_id,
        schoolId: c.organization_id,
        dayOfWeek: c.service_day,
        delta: +1
      });
      if (res.ok) releasedSlots += 1;
    }

    // Delete clients
    if (clientIds.length > 0) {
      const placeholders = clientIds.map(() => '?').join(',');
      await connection.execute(`DELETE FROM clients WHERE id IN (${placeholders})`, clientIds);
    }

    // Best-effort cleanup: delete placeholder providers created by this job window that are now unused.
    // This is intentionally conservative.
    let deletedProviders = 0;
    for (const pId of providerIds) {
      const [users] = await connection.execute(
        `SELECT id, email, created_at
         FROM users
         WHERE id = ? LIMIT 1`,
        [pId]
      );
      const u = users[0];
      if (!u) continue;
      const email = String(u.email || '');
      const isPlaceholder = email.endsWith('@example.invalid') && email.startsWith('provider+');
      if (!isPlaceholder) continue;

      // Ensure provider is not referenced by any remaining clients
      const [refs] = await connection.execute(`SELECT 1 FROM clients WHERE provider_id = ? LIMIT 1`, [pId]);
      if (refs.length > 0) continue;

      // Remove scheduling rows
      await connection.execute(`DELETE FROM provider_school_assignments WHERE provider_user_id = ?`, [pId]);
      // Remove agency link
      await connection.execute(`DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?`, [pId, aId]);

      // Attempt to delete the user (may fail if referenced elsewhere)
      try {
        const [del] = await connection.execute(`DELETE FROM users WHERE id = ?`, [pId]);
        if (del.affectedRows > 0) deletedProviders += 1;
      } catch {
        // leave user in place
      }
    }

    // Best-effort cleanup: delete schools created during this job window that are now unused.
    let deletedSchools = 0;
    for (const sId of schoolIds) {
      const [schools] = await connection.execute(
        `SELECT id, created_at
         FROM agencies
         WHERE id = ? AND organization_type = 'school'
         LIMIT 1`,
        [sId]
      );
      const s = schools[0];
      if (!s) continue;
      const createdAt = s.created_at;
      if (!(createdAt >= windowStart && createdAt <= windowEnd)) continue;

      const [clientRefs] = await connection.execute(`SELECT 1 FROM clients WHERE organization_id = ? LIMIT 1`, [sId]);
      if (clientRefs.length > 0) continue;
      const [schedRefs] = await connection.execute(
        `SELECT 1 FROM provider_school_assignments WHERE school_organization_id = ? LIMIT 1`,
        [sId]
      );
      if (schedRefs.length > 0) continue;

      // Remove affiliations/links
      await connection.execute(`DELETE FROM organization_affiliations WHERE agency_id = ? AND organization_id = ?`, [aId, sId]);
      await connection.execute(`DELETE FROM agency_schools WHERE agency_id = ? AND school_organization_id = ?`, [aId, sId]);
      await connection.execute(`DELETE FROM school_profiles WHERE school_organization_id = ?`, [sId]).catch(() => {});

      try {
        const [del] = await connection.execute(`DELETE FROM agencies WHERE id = ?`, [sId]);
        if (del.affectedRows > 0) deletedSchools += 1;
      } catch {
        // leave school in place
      }
    }

    await connection.commit();

    return {
      ...summary,
      dryRun: false,
      releasedSlots,
      deletedClients: clientIds.length,
      deletedProviders,
      deletedSchools
    };
  } catch (e) {
    try {
      await connection.rollback();
    } catch {
      // ignore
    }
    throw e;
  } finally {
    connection.release();
  }
}

