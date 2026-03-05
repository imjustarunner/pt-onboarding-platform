import bcrypt from 'bcrypt';
import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import PayrollMileageClaim from '../models/PayrollMileageClaim.model.js';
import PayrollPtoAccount from '../models/PayrollPtoAccount.model.js';
import PayrollPtoRequest from '../models/PayrollPtoRequest.model.js';
import PayrollReimbursementClaim from '../models/PayrollReimbursementClaim.model.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';

const asJson = (raw, fallback = null) => {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    const item = args[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = 'true';
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
};

const toPositiveInt = (raw, fallback) => {
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
};

const getSourceAgency = async ({ sourceSlug, sourceAgencyId }) => {
  if (sourceAgencyId) {
    const byId = await Agency.findById(Number(sourceAgencyId));
    if (byId) return byId;
  }
  if (sourceSlug) {
    const bySlug = await Agency.findBySlug(sourceSlug);
    if (bySlug) return bySlug;
  }
  return null;
};

const getOrCreateOrg = async ({ name, slug, organizationType, sourceAgency }) => {
  const existing = await Agency.findBySlug(slug);
  if (existing) return existing;
  return Agency.create({
    name,
    officialName: name,
    slug,
    portalUrl: slug,
    organizationType,
    isActive: true,
    logoUrl: sourceAgency.logo_url || null,
    logoPath: sourceAgency.logo_path || null,
    colorPalette: asJson(sourceAgency.color_palette, {}),
    terminologySettings: asJson(sourceAgency.terminology_settings, {}),
    themeSettings: asJson(sourceAgency.theme_settings, {}),
    iconId: sourceAgency.icon_id || null,
    chatIconId: sourceAgency.chat_icon_id || null
  });
};

const getOrCreateUser = async ({ email, firstName, lastName, role, passwordHash }) => {
  const existing = await User.findByEmail(email);
  if (existing) return existing;
  return User.create({
    email,
    passwordHash,
    firstName,
    lastName,
    role,
    status: 'ACTIVE_EMPLOYEE',
    personalEmail: email
  });
};

const assignUserToOrgs = async (userId, orgIds) => {
  for (const orgId of orgIds) {
    await User.assignToAgency(userId, orgId);
  }
};

const createFakeClientIfMissing = async ({ agencyId, organizationId, providerId, createdByUserId, initials, fullName }) => {
  const [existing] = await pool.execute(
    `SELECT id FROM clients
     WHERE agency_id = ? AND organization_id = ? AND initials = ?
     LIMIT 1`,
    [agencyId, organizationId, initials]
  );
  if (Array.isArray(existing) && existing.length > 0) {
    return existing[0];
  }
  return Client.create({
    organization_id: organizationId,
    agency_id: agencyId,
    provider_id: providerId,
    initials,
    full_name: fullName,
    status: 'ACTIVE',
    submission_date: new Date(),
    source: 'ADMIN_CREATED',
    document_status: 'NONE',
    created_by_user_id: createdByUserId,
    service_day: 'Tuesday',
    internal_notes: 'Synthetic demo client for training and sales walkthroughs.'
  });
};

const tableExists = async (tableName) => {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.tables
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
};

const ensureClientAssignments = async ({ clientId, organizationId, providerId }) => {
  const cid = Number.parseInt(clientId, 10);
  const orgId = Number.parseInt(organizationId, 10);
  const provId = Number.parseInt(providerId, 10);
  if (!Number.isInteger(cid) || cid < 1 || !Number.isInteger(orgId) || orgId < 1) return;

  const hasOrgAssignments = await tableExists('client_organization_assignments');
  if (hasOrgAssignments) {
    await pool.execute(
      `INSERT INTO client_organization_assignments (client_id, organization_id, is_active)
       VALUES (?, ?, TRUE)
       ON DUPLICATE KEY UPDATE is_active = TRUE, updated_at = CURRENT_TIMESTAMP`,
      [cid, orgId]
    );
  }

  const hasProviderAssignments = await tableExists('client_provider_assignments');
  if (hasProviderAssignments && Number.isInteger(provId) && provId > 0) {
    await pool.execute(
      `INSERT INTO client_provider_assignments (client_id, organization_id, provider_user_id, service_day, is_active)
       VALUES (?, ?, ?, 'Tuesday', TRUE)
       ON DUPLICATE KEY UPDATE provider_user_id = VALUES(provider_user_id), is_active = TRUE, updated_at = CURRENT_TIMESTAMP`,
      [cid, orgId, provId]
    );
  }
};

const formatDate = (d) => {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - Number(n || 0));
  return formatDate(d);
};

const ensurePayrollAccessForProviders = async ({ agencyId, providerUsers }) => {
  const [colRows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'user_agencies'
       AND COLUMN_NAME = 'has_payroll_access'`
  );
  const hasPayrollAccessColumn = Number(colRows?.[0]?.cnt || 0) > 0;
  if (!hasPayrollAccessColumn) return;
  const userIds = (providerUsers || []).map((u) => Number(u?.id)).filter((n) => Number.isInteger(n) && n > 0);
  if (!userIds.length) return;
  const placeholders = userIds.map(() => '?').join(',');
  await pool.execute(
    `UPDATE user_agencies
     SET has_payroll_access = 1
     WHERE agency_id = ?
       AND user_id IN (${placeholders})`,
    [agencyId, ...userIds]
  );
};

const ensureSeededTimeClaim = async ({ agencyId, userId, submittedByUserId, claimType, claimDate, payload }) => {
  const [rows] = await pool.execute(
    `SELECT id
     FROM payroll_time_claims
     WHERE agency_id = ?
       AND user_id = ?
       AND claim_type = ?
       AND claim_date = ?
     LIMIT 1`,
    [agencyId, userId, claimType, claimDate]
  );
  if (Array.isArray(rows) && rows.length > 0) return rows[0];
  return PayrollTimeClaim.create({
    agencyId,
    userId,
    submittedByUserId,
    claimType,
    claimDate,
    payload
  });
};

const ensureSeededMileageClaim = async ({
  agencyId,
  userId,
  submittedByUserId,
  driveDate,
  schoolOrganizationId,
  miles,
  startLocation,
  endLocation
}) => {
  const [rows] = await pool.execute(
    `SELECT id
     FROM payroll_mileage_claims
     WHERE agency_id = ?
       AND user_id = ?
       AND drive_date = ?
       AND ABS(miles - ?) < 0.01
     LIMIT 1`,
    [agencyId, userId, driveDate, Number(miles || 0)]
  );
  if (Array.isArray(rows) && rows.length > 0) return rows[0];
  return PayrollMileageClaim.create({
    agencyId,
    userId,
    submittedByUserId,
    driveDate,
    claimType: 'school_travel',
    schoolOrganizationId,
    miles,
    roundTrip: 1,
    startLocation,
    endLocation,
    tripPurpose: 'Demo school travel',
    notes: 'Synthetic payroll mileage claim for demo tenant',
    attestation: 1
  });
};

const ensureSeededReimbursementClaim = async ({
  agencyId,
  userId,
  submittedByUserId,
  expenseDate,
  amount,
  vendor
}) => {
  const [rows] = await pool.execute(
    `SELECT id
     FROM payroll_reimbursement_claims
     WHERE agency_id = ?
       AND user_id = ?
       AND expense_date = ?
       AND ABS(amount - ?) < 0.01
     LIMIT 1`,
    [agencyId, userId, expenseDate, Number(amount || 0)]
  );
  if (Array.isArray(rows) && rows.length > 0) return rows[0];
  return PayrollReimbursementClaim.create({
    agencyId,
    userId,
    submittedByUserId,
    expenseDate,
    amount,
    paymentMethod: 'personal_card',
    vendor,
    purchasePreapproved: 1,
    category: 'supplies',
    reason: 'Demo reimbursement sample',
    notes: 'Synthetic reimbursement claim for training demos',
    attestation: 1
  });
};

const ensureSeededPtoData = async ({ agencyId, userId, submittedByUserId, idx }) => {
  await PayrollPtoAccount.upsert({
    agencyId,
    userId,
    employmentType: 'hourly',
    trainingPtoEligible: true,
    sickStartHours: 24,
    sickStartEffectiveDate: daysAgo(120),
    trainingStartHours: 12,
    trainingStartEffectiveDate: daysAgo(120),
    sickBalanceHours: 18 - (idx % 4),
    trainingBalanceHours: 8 - (idx % 3),
    lastAccruedPayrollPeriodId: null,
    lastSickRolloverYear: null,
    trainingForfeitedAt: null,
    updatedByUserId: submittedByUserId
  });

  const requestDate = daysAgo(10 + (idx % 7));
  const [existing] = await pool.execute(
    `SELECT id
     FROM payroll_pto_requests
     WHERE agency_id = ?
       AND user_id = ?
       AND request_type = 'sick'
       AND DATE(created_at) = ?
     LIMIT 1`,
    [agencyId, userId, requestDate]
  );
  if (Array.isArray(existing) && existing.length > 0) return existing[0];

  const req = await PayrollPtoRequest.create({
    agencyId,
    userId,
    submittedByUserId,
    requestType: 'sick',
    notes: 'Demo PTO request',
    totalHours: 4
  });
  if (req?.id) {
    await PayrollPtoRequest.addItems({
      requestId: req.id,
      agencyId,
      items: [{ requestDate, hours: 4 }]
    });
  }
  return req;
};

const seedPayrollForProviders = async ({ agencyId, schoolOrganizationId, providerUsers, adminUserId }) => {
  if (!await tableExists('payroll_time_claims')) return { seeded: false, reason: 'payroll tables not found' };
  await ensurePayrollAccessForProviders({ agencyId, providerUsers });

  const claimTypes = ['meeting_training', 'service_correction', 'overtime_evaluation'];
  for (let i = 0; i < providerUsers.length; i += 1) {
    const provider = providerUsers[i];
    const userId = Number(provider?.id || 0);
    if (!userId) continue;
    const claimDate = daysAgo(3 + (i % 14));
    const claimType = claimTypes[i % claimTypes.length];
    await ensureSeededTimeClaim({
      agencyId,
      userId,
      submittedByUserId: adminUserId,
      claimType,
      claimDate,
      payload: {
        hours: Number((1.5 + (i % 4) * 0.5).toFixed(2)),
        note: 'Synthetic demo time claim',
        category: claimType
      }
    });

    await ensureSeededMileageClaim({
      agencyId,
      userId,
      submittedByUserId: adminUserId,
      driveDate: daysAgo(2 + (i % 10)),
      schoolOrganizationId,
      miles: Number((12 + (i % 6) * 3.25).toFixed(2)),
      startLocation: 'Home',
      endLocation: `Demo School ${((i % 4) + 1)}`
    });

    await ensureSeededReimbursementClaim({
      agencyId,
      userId,
      submittedByUserId: adminUserId,
      expenseDate: daysAgo(5 + (i % 9)),
      amount: Number((22 + (i % 5) * 7.5).toFixed(2)),
      vendor: `Demo Vendor ${((i % 5) + 1)}`
    });

    if (await tableExists('payroll_pto_accounts') && await tableExists('payroll_pto_requests')) {
      await ensureSeededPtoData({
        agencyId,
        userId,
        submittedByUserId: adminUserId,
        idx: i
      });
    }
  }
  return { seeded: true, providerCount: providerUsers.length };
};

const getAgencyTableColumns = async () => {
  const [rows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'agencies'`
  );
  return new Set((rows || []).map((r) => String(r.COLUMN_NAME || '').trim()).filter(Boolean));
};

const syncPresentationSettings = async ({ sourceAgency, targetAgencyIds }) => {
  const columns = await getAgencyTableColumns();
  const source = sourceAgency || {};
  const copyable = [];
  for (const col of columns) {
    if (
      col.endsWith('_icon_id') ||
      col === 'logo_url' ||
      col === 'logo_path' ||
      col === 'color_palette' ||
      col === 'theme_settings' ||
      col === 'terminology_settings'
    ) {
      copyable.push(col);
    }
  }
  if (copyable.length === 0) return;

  const setters = copyable.map((col) => `${col} = ?`).join(', ');
  const values = copyable.map((col) => (source[col] !== undefined ? source[col] : null));
  for (const id of targetAgencyIds) {
    await pool.execute(
      `UPDATE agencies
       SET ${setters}
       WHERE id = ?`,
      [...values, id]
    );
  }
};

async function main() {
  const args = parseArgs();
  const sourceSlug = String(args['source-slug'] || '').trim().toLowerCase();
  const sourceAgencyId = args['source-id'] ? Number(args['source-id']) : null;
  const presenterEmail = String(args['presenter-email'] || process.env.DEMO_MODE_USER_ALLOWLIST || '')
    .split(',')
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean)[0];

  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  const allowProd = String(process.env.ALLOW_PROD_DEMO_SEED || '').toLowerCase() === 'true';
  if (nodeEnv === 'production' && !allowProd) {
    throw new Error('Refusing to seed demo tenant in production without ALLOW_PROD_DEMO_SEED=true');
  }

  if (!sourceSlug && !sourceAgencyId) {
    throw new Error('Provide --source-slug <slug> or --source-id <id>');
  }

  const sourceAgency = await getSourceAgency({ sourceSlug, sourceAgencyId });
  if (!sourceAgency) {
    throw new Error('Source agency not found');
  }

  const baseSlug = slugify(args['demo-slug'] || `${sourceAgency.slug || sourceAgency.portal_url || sourceAgency.name}-demo`);
  const providerCount = toPositiveInt(args['provider-count'], 10);
  const clientCount = toPositiveInt(args['client-count'], 60);
  const parentSlug = baseSlug;
  const parentName = `Demo ${sourceAgency.name || sourceAgency.slug || 'Agency'}`;

  console.log(`Seeding demo tenant from source: ${sourceAgency.name} (${sourceAgency.slug || sourceAgency.id})`);

  const parent = await getOrCreateOrg({
    name: parentName,
    slug: parentSlug,
    organizationType: 'agency',
    sourceAgency
  });

  const school = await getOrCreateOrg({
    name: `${parentName} School`,
    slug: `${baseSlug}-school`,
    organizationType: 'school',
    sourceAgency
  });
  const program = await getOrCreateOrg({
    name: `${parentName} Program`,
    slug: `${baseSlug}-program`,
    organizationType: 'program',
    sourceAgency
  });
  const learning = await getOrCreateOrg({
    name: `${parentName} Learning`,
    slug: `${baseSlug}-learning`,
    organizationType: 'learning',
    sourceAgency
  });
  const clinical = await getOrCreateOrg({
    name: `${parentName} Clinical`,
    slug: `${baseSlug}-clinical`,
    organizationType: 'clinical',
    sourceAgency
  });

  for (const child of [school, program, learning, clinical]) {
    await OrganizationAffiliation.upsert({
      agencyId: parent.id,
      organizationId: child.id,
      isActive: true
    });
  }

  // Keep demo visuals aligned with the source org so presenters do not
  // need to manually reconfigure icon cards and branding assets.
  await syncPresentationSettings({
    sourceAgency,
    targetAgencyIds: [parent.id, school.id, program.id, learning.id, clinical.id]
  });

  const password = String(args['password'] || 'demo12345');
  const passwordHash = await bcrypt.hash(password, 10);

  const demoUsers = [
    { key: 'admin', role: 'admin', firstName: 'Demo', lastName: 'Admin' },
    { key: 'support', role: 'support', firstName: 'Demo', lastName: 'Support' },
    { key: 'staff', role: 'staff', firstName: 'Demo', lastName: 'Staff' },
    { key: 'provider-core', role: 'provider', firstName: 'Demo', lastName: 'Provider Core' },
    { key: 'providerplus', role: 'provider_plus', firstName: 'Demo', lastName: 'ProviderPlus' }
  ];

  const createdUsers = {};
  for (const u of demoUsers) {
    const email = `${u.key}.${baseSlug}@example.demo`;
    const user = await getOrCreateUser({
      email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      passwordHash
    });
    createdUsers[u.key] = user;
  }

  // Generate additional fake providers for richer scheduling/training demos.
  for (let i = 1; i <= providerCount; i += 1) {
    const num = String(i).padStart(2, '0');
    const email = `provider${num}.${baseSlug}@example.demo`;
    const provider = await getOrCreateUser({
      email,
      firstName: `Provider${num}`,
      lastName: 'Demo',
      role: 'provider',
      passwordHash
    });
    createdUsers[`provider-${num}`] = provider;
  }

  const allOrgIds = [parent.id, school.id, program.id, learning.id, clinical.id];
  for (const user of Object.values(createdUsers)) {
    await assignUserToOrgs(user.id, allOrgIds);
  }

  if (presenterEmail) {
    const presenter = await User.findByEmail(presenterEmail);
    if (presenter) {
      await assignUserToOrgs(presenter.id, allOrgIds);
      console.log(`Assigned presenter to demo tenant: ${presenterEmail}`);
    } else {
      console.warn(`Presenter email not found, skipping assignment: ${presenterEmail}`);
    }
  }

  const providerUsers = Object.entries(createdUsers)
    .filter(([, u]) => String(u?.role || '').toLowerCase() === 'provider' || String(u?.role || '').toLowerCase() === 'provider_plus')
    .map(([, u]) => u);
  const targetOrgs = [school, program, learning, clinical];
  const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Riley', 'Casey', 'Skyler', 'Avery', 'Quinn', 'Parker'];
  const lastNames = ['Stone', 'Reed', 'Hayes', 'Brooks', 'Carter', 'Dawson', 'Flynn', 'West', 'Lane', 'Cruz'];

  for (let i = 1; i <= clientCount; i += 1) {
    const provider = providerUsers[(i - 1) % providerUsers.length];
    const org = targetOrgs[(i - 1) % targetOrgs.length];
    const fn = firstNames[(i - 1) % firstNames.length];
    const ln = lastNames[Math.floor((i - 1) / firstNames.length) % lastNames.length];
    const initials = `D${String(i).padStart(3, '0')}`;
    const client = await createFakeClientIfMissing({
      agencyId: parent.id,
      organizationId: org.id,
      providerId: provider.id,
      createdByUserId: createdUsers.admin.id,
      initials,
      fullName: `${fn} ${ln} Demo`
    });
    await ensureClientAssignments({
      clientId: client?.id,
      organizationId: org.id,
      providerId: provider.id
    });
  }

  const payrollResult = await seedPayrollForProviders({
    agencyId: parent.id,
    schoolOrganizationId: school.id,
    providerUsers,
    adminUserId: Number(createdUsers.admin?.id || 0)
  });

  console.log('Demo tenant ready.');
  console.log(`Parent demo slug: ${parent.slug}`);
  console.log(`Demo org slugs: ${school.slug}, ${program.slug}, ${learning.slug}, ${clinical.slug}`);
  console.log(`Generated provider users: ${providerCount + 1} (includes provider-core)`);
  console.log(`Generated/ensured clients: ${clientCount}`);
  if (payrollResult?.seeded) {
    console.log(`Generated/ensured payroll claims for providers: ${payrollResult.providerCount}`);
  } else {
    console.log(`Payroll seeding skipped: ${payrollResult?.reason || 'unknown reason'}`);
  }
  console.log(`Demo login password for generated users: ${password}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to seed demo tenant:', err?.message || err);
    process.exit(1);
  });
