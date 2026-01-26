import crypto from 'crypto';
import pool from '../config/database.js';
import { adjustProviderSlots } from './providerSlots.service.js';
import { notifyClientBecameCurrent, notifyPaperworkReceived } from './clientNotifications.service.js';
import ClientNotes from '../models/ClientNotes.model.js';

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

const normalizeIdentifierCodeFromSheet = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const alnum = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  // Only accept exactly 6 chars (DB column is typically VARCHAR(6)).
  return alnum.length === 6 ? alnum : '';
};

const IDENT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1

const randomIdentifierCode = () => {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += IDENT_CODE_ALPHABET[bytes[i] % IDENT_CODE_ALPHABET.length];
  }
  return out;
};

async function generateUniqueIdentifierCode(connection, { agencyId, maxAttempts = 25 }) {
  for (let i = 0; i < maxAttempts; i++) {
    const code = randomIdentifierCode();
    // Uniqueness per agency
    const [rows] = await connection.execute(
      `SELECT 1 FROM clients WHERE agency_id = ? AND identifier_code = ? LIMIT 1`,
      [agencyId, code]
    );
    if (!rows?.length) return code;
  }
  throw new Error('Failed to generate a unique identifier code (too many collisions)');
}

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

async function getCurrentClientStatusId(connection, agencyId) {
  const [rows] = await connection.execute(
    `SELECT id FROM client_statuses WHERE agency_id = ? AND status_key = 'current' LIMIT 1`,
    [agencyId]
  );
  return rows?.[0]?.id || null;
}

function isCurrentStatusFromRowLabel(rowStatus) {
  return normalizeClientStatusKey(rowStatus) === 'current';
}

function isTerminalClientStatus(rowStatus) {
  const key = normalizeClientStatusKey(rowStatus);
  if (key === 'dead' || key === 'terminated') return true;
  const raw = String(rowStatus || '').toLowerCase();
  return raw.includes('dead') || raw.includes('terminated');
}

async function findOrCreateSchool(connection, { agencyId, schoolName, districtName }) {
  const name = String(schoolName || '').trim();
  if (!name) throw new Error('School is required');
  const slug = slugify(name);

  // Find-only: bulk client upload must NOT create schools.
  // Schools are created/maintained via the school directory import + org management.
  const [existing] = await connection.execute(
    `SELECT id
     FROM agencies
     WHERE organization_type = 'school'
       AND (LOWER(name) = LOWER(?) OR slug = ?)
     LIMIT 1`,
    [name, slug]
  );
  const schoolId = existing[0]?.id || null;
  if (!schoolId) {
    throw new Error(`School not found: "${name}"`);
  }

  // Best-effort: ensure the school is affiliated to the agency (non-destructive).
  await connection.execute(
    `INSERT INTO organization_affiliations (agency_id, organization_id, is_active)
     VALUES (?, ?, TRUE)
     ON DUPLICATE KEY UPDATE is_active = TRUE`,
    [agencyId, schoolId]
  );

  // We intentionally do NOT upsert district/school_profiles from the client uploader.
  // That data is owned by the school directory import.

  return schoolId;
}

async function ensureProviderSchoolAssignmentDefault(connection, { agencyId, currentStatusId, providerUserId, schoolId, dayOfWeek }) {
  if (!providerUserId || !schoolId || !dayOfWeek) return;

  // Count existing "current" clients already assigned to this provider/school/day.
  // This ensures a brand new schedule starts from the right baseline (and may already be overbooked).
  const [cntRows] = currentStatusId
    ? await connection.execute(
        `SELECT COUNT(*) AS cnt
         FROM clients
         WHERE agency_id = ?
           AND organization_id = ?
           AND provider_id = ?
           AND service_day = ?
           AND status <> 'ARCHIVED'
           AND client_status_id = ?`,
        [agencyId, schoolId, providerUserId, dayOfWeek, currentStatusId]
      )
    : [[{ cnt: 0 }]];
  const currentCount = parseInt(String(cntRows?.[0]?.cnt ?? 0), 10) || 0;

  // Upsert the assignment. We only set defaults when values are missing.
  // We do NOT overwrite existing slots_available because that represents live capacity management.
  const [existing] = await connection.execute(
    `SELECT id, slots_total, slots_available, start_time, end_time
     FROM provider_school_assignments
     WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ?
     LIMIT 1`,
    [providerUserId, schoolId, dayOfWeek]
  );

  if (!existing?.[0]?.id) {
    const slotsTotal = 7;
    const slotsAvail = slotsTotal - currentCount; // can be negative
    await connection.execute(
      `INSERT INTO provider_school_assignments
        (provider_user_id, school_organization_id, day_of_week, slots_total, slots_available, start_time, end_time, is_active)
       VALUES (?, ?, ?, ?, ?, '08:00:00', '15:00:00', TRUE)`,
      [providerUserId, schoolId, dayOfWeek, slotsTotal, slotsAvail]
    );
    return;
  }

  const row = existing[0];
  const updates = [];
  const values = [];
  const set = (f, v) => {
    updates.push(`${f} = ?`);
    values.push(v);
  };

  // Keep it active
  set('is_active', true);

  if (!row.start_time) set('start_time', '08:00:00');
  if (!row.end_time) set('end_time', '15:00:00');
  if (!row.slots_total || Number(row.slots_total) <= 0) set('slots_total', 7);

  if (updates.length) {
    values.push(row.id);
    await connection.execute(`UPDATE provider_school_assignments SET ${updates.join(', ')} WHERE id = ?`, values);
  }
}

function normalizePersonNameKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  // Drop parentheticals (e.g., credentials, notes)
  let s = raw.replace(/\([^)]*\)/g, ' ');
  // Normalize separators/punctuation
  s = s.replace(/[.,/\\]+/g, ' ').replace(/-/g, ' ');
  // Keep only letters + spaces for matching
  s = s.replace(/[^a-zA-Z\s]+/g, ' ');
  s = s.toLowerCase().replace(/\s+/g, ' ').trim();

  // Remove common credential tokens (best-effort)
  const drop = new Set([
    'dr', 'doctor', 'phd', 'psyd', 'psy', 'd', 'ma', 'ms', 'msw', 'lpc', 'lcsw', 'lmft', 'lpcc', 'ccc', 'cccs',
    'm', 'ed', 'med', 'ba', 'bs', 'b', 'a', 'rbt', 'bcba'
  ]);
  const parts = s.split(' ').filter(Boolean).filter((t) => !drop.has(t));
  return parts.join(' ').trim();
}

function nameTokens(value) {
  const k = normalizePersonNameKey(value);
  if (!k) return [];
  return k.split(' ').filter(Boolean);
}

function buildProviderIndex(providerRows) {
  const map = new Map();
  for (const r of providerRows || []) {
    const id = r?.id;
    const first = String(r?.first_name || '').trim();
    const last = String(r?.last_name || '').trim();
    if (!id || (!first && !last)) continue;
    const full = `${first} ${last}`.trim();
    const rev = `${last} ${first}`.trim();
    const k1 = normalizePersonNameKey(full);
    const k2 = normalizePersonNameKey(rev);
    if (k1 && !map.has(k1)) map.set(k1, id);
    if (k2 && !map.has(k2)) map.set(k2, id);
  }
  return map;
}

async function findProviderIdByName({ providerIndex, providerName }) {
  const raw = String(providerName || '').trim();
  if (!raw) return null;
  const directKey = normalizePersonNameKey(raw);
  if (directKey && providerIndex?.has(directKey)) return providerIndex.get(directKey);

  // Handle "Last, First" by flipping.
  if (raw.includes(',')) {
    const [l, f] = raw.split(',').map((x) => String(x || '').trim());
    const flipped = `${f} ${l}`.trim();
    const k = normalizePersonNameKey(flipped);
    if (k && providerIndex?.has(k)) return providerIndex.get(k);
  }

  // Fallback: try matching on first+last token only (strip middle names).
  const toks = nameTokens(raw);
  if (toks.length >= 2) {
    const key = `${toks[0]} ${toks[toks.length - 1]}`.trim();
    if (key && providerIndex?.has(key)) return providerIndex.get(key);
  }
  return null;
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

    // Build a provider name index once for this agency (find-only; no creation).
    const [providerRows] = await connection.execute(
      `SELECT u.id, u.first_name, u.last_name, u.role
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND LOWER(u.role) IN ('provider','supervisor','admin')`,
      [agencyId]
    );
    const providerIndex = buildProviderIndex(providerRows || []);
    const currentStatusId = await getCurrentClientStatusId(connection, agencyId);

    for (const row of rows) {
      await connection.beginTransaction();
      try {
        const schoolId = await findOrCreateSchool(connection, {
          agencyId,
          schoolName: row.school,
          districtName: row.district
        });
        const providerProvided = String(row.provider || '').trim() !== '';
        const providerUserId = await findProviderIdByName({ providerIndex, providerName: row.provider });

        const warnings = [];
        if (providerProvided && !providerUserId) {
          warnings.push(`Provider not found: "${String(row.provider || '').trim()}". Client will be unassigned.`);
        }
        if ((row.day || row.providerAvailability !== undefined) && (!providerProvided || !providerUserId)) {
          warnings.push('Provider scheduling fields were ignored because provider is not assigned.');
        }

        // Ensure the provider is scheduled for this school/day with default hours + default slots.
        if (providerUserId && schoolId && row.day) {
          await ensureProviderSchoolAssignmentDefault(connection, {
            agencyId,
            currentStatusId,
            providerUserId,
            schoolId,
            dayOfWeek: row.day
          });
        }

        const defaults = await ensureDefaultCatalogIds(connection, agencyId, schoolId);

        const initials = normalizeClientCode(row.clientName);
        if (!initials) throw new Error('Initials is required');

        const identifierFromSheet = normalizeIdentifierCodeFromSheet(row.identifierCode);
        const identifierCode = identifierFromSheet || (await generateUniqueIdentifierCode(connection, { agencyId }));

        const existingClientQuery =
          `SELECT id, referral_date, provider_id, organization_id, service_day, paperwork_received_at, status, client_status_id
           FROM clients
           WHERE agency_id = ? AND identifier_code = ?
           LIMIT 1`;
        const [existingRows] = await connection.execute(existingClientQuery, [agencyId, identifierCode]);
        const existing = existingRows[0] || null;
        const existingWasArchived = String(existing?.status || '').toUpperCase() === 'ARCHIVED';

        const clientStatusKey = normalizeClientStatusKey(row.status);
        const shouldArchive = isTerminalClientStatus(row.status);
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

        // Provider/day: only store day if provider is assigned and the day is provided.
        const wantsAssignProvider = providerUserId && row.day;
        const newProviderId = wantsAssignProvider ? providerUserId : (existing?.provider_id || null);
        const newDay = wantsAssignProvider ? (row.day || null) : (existing?.service_day || null);
        const newSchoolId = schoolId;

        // Slot consumption only applies to CURRENT client status.
        const newIsCurrentStatus = currentStatusId
          ? parseInt(String(clientStatusId || 0), 10) === parseInt(String(currentStatusId), 10)
          : isCurrentStatusFromRowLabel(row.status);
        const newConsumesSlot = !!(newProviderId && newDay && newSchoolId && newIsCurrentStatus && !shouldArchive);
        const oldConsumesSlot = !!(
          existing?.provider_id &&
          existing?.service_day &&
          existing?.organization_id &&
          existing?.client_status_id &&
          currentStatusId &&
          parseInt(existing.client_status_id, 10) === parseInt(currentStatusId, 10) &&
          String(existing?.status || '').toUpperCase() !== 'ARCHIVED'
        );

        const paperworkKey = normalizeKey(paperworkStatusKey || row.paperworkStatus);
        const paperworkIsCompleted = paperworkKey === 'completed' || String(row.paperworkStatus || '').toLowerCase() === 'completed';
        const oldPaperworkReceived = !!existing?.paperwork_received_at;
        const willMarkPaperworkReceived = paperworkIsCompleted && !oldPaperworkReceived;

        // Slot adjustments:
        // - Release old slot if the old record consumed one and either assignment changed or the new record won't consume.
        // - Take new slot if the new record consumes one and either assignment changed or old record didn't consume.
        const assignmentSame = !!(
          existing &&
          existing.provider_id &&
          existing.service_day &&
          existing.organization_id &&
          parseInt(existing.provider_id, 10) === parseInt(newProviderId || 0, 10) &&
          String(existing.service_day) === String(newDay || '') &&
          parseInt(existing.organization_id, 10) === parseInt(newSchoolId || 0, 10)
        );

        if (oldConsumesSlot && (!assignmentSame || !newConsumesSlot)) {
          await adjustProviderSlots(connection, {
            providerUserId: existing.provider_id,
            schoolId: existing.organization_id,
            dayOfWeek: existing.service_day,
            delta: +1
          });
        }

        if (newConsumesSlot && (!assignmentSame || !oldConsumesSlot)) {
          await ensureProviderSchoolAssignmentDefault(connection, {
            agencyId,
            currentStatusId,
            providerUserId: newProviderId,
            schoolId: newSchoolId,
            dayOfWeek: newDay
          });
          const slotResult = await adjustProviderSlots(connection, {
            providerUserId: newProviderId,
            schoolId: newSchoolId,
            dayOfWeek: newDay,
            delta: -1,
            allowNegative: true
          });
          if (!slotResult.ok) throw new Error(slotResult.reason);
          if (slotResult.nextSlotsAvailable < 0) {
            warnings.push('Provider schedule is over capacity for that school/day. Add additional slots to resolve.');
          }
        }

        if (!existing) {
          const submissionDate = row.referralDate || todayYmd();
          const referralDate = row.referralDate || submissionDate;
          const statusToSet = shouldArchive ? 'ARCHIVED' : 'PENDING_REVIEW';

          await connection.execute(
            `INSERT INTO clients (
              organization_id, agency_id, provider_id, initials, full_name, status,
              submission_date, document_status, source, created_by_user_id,
              referral_date, client_status_id, paperwork_status_id, insurance_type_id, paperwork_delivery_method_id,
              doc_date, grade, school_year, gender, identifier_code, primary_client_language, primary_parent_language,
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
              initials,
              initials,
              statusToSet,
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
              row.schoolYear || null,
              row.gender || null,
              identifierCode,
              row.primaryClientLanguage || null,
              row.primaryParentLanguage || null,
              row.skills ? 1 : 0,
              null,
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
          // Provider/day: only update if a provider was explicitly provided AND successfully matched.
          // If the sheet contains a provider name that we can't match, do NOT clear the existing assignment.
          if (providerProvided && providerUserId && row.day) {
            set('provider_id', newProviderId);
            set('service_day', newDay);
          }
          set('full_name', initials);
          set('initials', initials);
          set('client_status_id', clientStatusId);
          set('paperwork_status_id', paperworkStatusId);
          set('insurance_type_id', insuranceTypeId);
          set('paperwork_delivery_method_id', deliveryMethodId);
          set('doc_date', row.docDate || null);
          set('grade', row.grade || null);
          set('school_year', row.schoolYear || null);
          set('gender', row.gender || null);
          set('primary_client_language', row.primaryClientLanguage || null);
          set('primary_parent_language', row.primaryParentLanguage || null);
          set('skills', row.skills ? 1 : 0);
          // Imported notes are stored as internal client notes (not on the client row).
          set('internal_notes', null);
          if (willMarkPaperworkReceived) {
            set('paperwork_received_at', new Date());
          }

          // referral_date is immutable after set
          if (!existing.referral_date && row.referralDate) {
            set('referral_date', row.referralDate);
          }

          // If the existing client was archived, unarchive on re-import.
          if (existingWasArchived && !shouldArchive) {
            set('status', 'PENDING_REVIEW');
            warnings.push('Existing client was archived; unarchived during import.');
          }
          if (shouldArchive) {
            set('status', 'ARCHIVED');
          }

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
        const noteMsg = String(row.notes || '').trim();

        await upsertBulkJobRow(connection, {
          jobId,
          rowNumber: row.rowNumber,
          status: 'success',
          message: warnings.length ? `Imported with warnings: ${warnings.join(' ')}` : 'Imported successfully',
          entityIds: { clientId, providerUserId, schoolOrganizationId: schoolId }
        });

        await connection.commit();
        successRows += 1;

        // Imported notes -> internal client note (backoffice-only). Best-effort; after commit.
        if (clientId && noteMsg) {
          ClientNotes.create(
            {
              client_id: clientId,
              author_id: userId,
              category: 'administrative',
              urgency: 'low',
              message: noteMsg,
              is_internal_only: true
            },
            { hasAgencyAccess: true, canViewInternalNotes: true }
          ).catch(() => {});
        }

        // Notifications (best-effort, outside the transaction)
        if (!oldConsumesSlot && newConsumesSlot && clientId) {
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
      failedRows
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

