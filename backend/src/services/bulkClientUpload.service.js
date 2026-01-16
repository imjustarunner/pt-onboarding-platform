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

const initialsFromName = (fullName) => {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'NA';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase().slice(0, 10) || 'NA';
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

const parseIntOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
};

const todayYmd = () => new Date().toISOString().split('T')[0];

async function upsertBulkJobRow(connection, { jobId, rowNumber, status, message, entityIds }) {
  await connection.execute(
    `INSERT INTO bulk_import_job_rows (job_id, row_number, status, message, entity_ids)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), message = VALUES(message), entity_ids = VALUES(entity_ids)`,
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
    const [rows] = await connection.execute(
      `SELECT u.id
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ? AND u.first_name = ? AND u.last_name = ?
       LIMIT 1`,
      [agencyId, firstName, lastName]
    );
    if (rows[0]?.id) return rows[0].id;
  }

  const hash = crypto.createHash('sha256').update(`${agencyId}:${name}`).digest('hex').slice(0, 10);
  const email = `provider+${hash}@example.invalid`;

  const [existing] = await connection.execute(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
  let userId = existing[0]?.id || null;

  if (!userId) {
    const [result] = await connection.execute(
      `INSERT INTO users (role, status, first_name, last_name, email)
       VALUES ('clinician', 'pending', ?, ?, ?)`,
      [firstName || 'Provider', lastName || 'User', email]
    );
    userId = result.insertId;
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

    for (const row of rows) {
      await connection.beginTransaction();
      try {
        const schoolId = await findOrCreateSchool(connection, {
          agencyId,
          schoolName: row.school,
          districtName: row.district
        });

        const providerUserId = await findOrCreateProvider(connection, { agencyId, providerName: row.provider });
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

        const identifierCode = (row.identifierCode && row.identifierCode.length === 6 ? row.identifierCode : '') || generateIdentifierCode(row.clientName);
        if (!row.clientName) throw new Error('Client Name is required');

        const existingClientQuery = `SELECT id, referral_date, provider_id, organization_id, service_day, paperwork_received_at FROM clients WHERE agency_id = ? AND identifier_code = ? LIMIT 1`;
        const [existingRows] = await connection.execute(existingClientQuery, [agencyId, identifierCode]);
        const existing = existingRows[0] || null;

        const clientStatusId =
          (await getCatalogId(connection, { table: 'client_statuses', agencyId, label: row.status, keyColumn: 'status_key', labelColumn: 'label' })) ||
          defaults.clientStatusId;
        const paperworkStatusId =
          (await getCatalogId(connection, { table: 'paperwork_statuses', agencyId, label: row.paperworkStatus, keyColumn: 'status_key', labelColumn: 'label' })) ||
          defaults.paperworkStatusId;
        const insuranceTypeId =
          (await getCatalogId(connection, { table: 'insurance_types', agencyId, label: row.insurance, keyColumn: 'insurance_key', labelColumn: 'label' })) ||
          defaults.insuranceTypeId;
        const deliveryMethodId =
          (await getDeliveryMethodId(connection, { schoolId, label: row.paperworkDelivery })) || defaults.deliveryMethodId;

        // Determine if this assignment changes slots
        const newProviderId = providerUserId || null;
        const newDay = row.day || null;
        const newSchoolId = schoolId;
        const oldIsCurrent = !!(existing?.provider_id && existing?.service_day);
        const newIsCurrent = !!(newProviderId && newDay);

        const paperworkKey = normalizeKey(row.paperworkStatus);
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
              initialsFromName(row.clientName),
              String(row.clientName).trim(),
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
          set('full_name', String(row.clientName).trim());
          set('initials', initialsFromName(row.clientName));
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

    return { jobId, totalRows: rows.length, successRows, failedRows };
  } finally {
    connection.release();
  }
}

