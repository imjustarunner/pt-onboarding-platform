import bcrypt from 'bcrypt';
import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
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

  const password = String(args['password'] || 'demo12345');
  const passwordHash = await bcrypt.hash(password, 10);

  const demoUsers = [
    { key: 'admin', role: 'admin', firstName: 'Demo', lastName: 'Admin' },
    { key: 'support', role: 'support', firstName: 'Demo', lastName: 'Support' },
    { key: 'staff', role: 'staff', firstName: 'Demo', lastName: 'Staff' },
    { key: 'provider', role: 'provider', firstName: 'Demo', lastName: 'Provider' },
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

  const providerId = createdUsers.provider.id;
  await createFakeClientIfMissing({
    agencyId: parent.id,
    organizationId: school.id,
    providerId,
    createdByUserId: createdUsers.admin.id,
    initials: 'DM',
    fullName: 'Demo Minor'
  });
  await createFakeClientIfMissing({
    agencyId: parent.id,
    organizationId: program.id,
    providerId,
    createdByUserId: createdUsers.admin.id,
    initials: 'DP',
    fullName: 'Demo Program Client'
  });
  await createFakeClientIfMissing({
    agencyId: parent.id,
    organizationId: learning.id,
    providerId,
    createdByUserId: createdUsers.admin.id,
    initials: 'DL',
    fullName: 'Demo Learning Client'
  });

  console.log('Demo tenant ready.');
  console.log(`Parent demo slug: ${parent.slug}`);
  console.log(`Demo org slugs: ${school.slug}, ${program.slug}, ${learning.slug}, ${clinical.slug}`);
  console.log(`Demo login password for generated users: ${password}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to seed demo tenant:', err?.message || err);
    process.exit(1);
  });
