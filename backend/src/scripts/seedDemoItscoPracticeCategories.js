/**
 * Idempotent seed for Demo ITSCO practice-category providers.
 * Usage: node src/scripts/seedDemoItscoPracticeCategories.js
 */
import bcrypt from 'bcrypt';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';
import { ensureTenantServiceSuitesForAgency } from '../services/tenantServiceSuiteDefaults.service.js';
import AgencyBusinessType from '../models/AgencyBusinessType.model.js';
import { setPracticeCategoriesForUserAgency } from '../services/practiceCategories.service.js';

const DEMO_PRACTICE_BUSINESS_TYPES = ['mental_health', 'tutoring', 'coaching', 'consulting', 'learning'];
const PASSWORD = 'demo12345';

const getOrCreateUser = async ({ email, firstName, lastName, role, passwordHash, title }) => {
  const existing = await User.findByEmail(email);
  if (existing) {
    if (title) {
      try { await User.update(existing.id, { title }); } catch { /* ignore */ }
    }
    return existing;
  }
  const created = await User.create({
    email,
    passwordHash,
    firstName,
    lastName,
    role,
    status: 'ACTIVE_EMPLOYEE',
    personalEmail: email
  });
  if (title && created?.id) {
    try { await User.update(created.id, { title }); } catch { /* ignore */ }
  }
  return created;
};

async function main() {
  let parent = await Agency.findBySlug('demo');
  if (!parent) parent = await Agency.findBySlug('itsco-demo');
  if (!parent) {
    const [rows] = await pool.execute(
      `SELECT id FROM agencies WHERE LOWER(name) LIKE '%demo itsco%' ORDER BY id ASC LIMIT 1`
    );
    if (rows?.[0]?.id) parent = await Agency.findById(rows[0].id);
  }
  if (!parent) throw new Error('Demo ITSCO parent agency not found (slug demo / itsco-demo)');

  const existing = await AgencyBusinessType.listForAgency(parent.id);
  const byType = new Map(existing.map((r) => [r.businessType, r]));
  const merged = DEMO_PRACTICE_BUSINESS_TYPES.map((businessType, sortOrder) => ({
    businessType,
    isEnabled: true,
    sortOrder: byType.get(businessType)?.sortOrder ?? sortOrder
  }));
  for (const row of existing) {
    if (DEMO_PRACTICE_BUSINESS_TYPES.includes(row.businessType)) continue;
    merged.push({
      businessType: row.businessType,
      isEnabled: row.isEnabled !== false,
      sortOrder: row.sortOrder
    });
  }
  await AgencyBusinessType.setForAgency(parent.id, merged);
  await ensureTenantServiceSuitesForAgency(parent.id);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const providers = [
    { key: 'mh.provider', firstName: 'Demo', lastName: 'MH Provider', title: 'Therapist', categories: ['mental_health'] },
    { key: 'tutor', firstName: 'Demo', lastName: 'Tutor', title: 'Tutor', categories: ['tutoring'] },
    { key: 'coach', firstName: 'Demo', lastName: 'Coach', title: 'Coach', categories: ['coaching'] },
    { key: 'consultant', firstName: 'Demo', lastName: 'Consultant', title: 'Consultant', categories: ['consulting'] },
    { key: 'mh-tutor', firstName: 'Demo', lastName: 'MH Tutor', title: 'Therapist', categories: ['mental_health', 'tutoring'] },
    { key: 'multi', firstName: 'Demo', lastName: 'Multi Provider', title: 'Therapist', categories: ['mental_health', 'coaching', 'consulting'] }
  ];

  for (const p of providers) {
    const email = `${p.key}.itsco-demo@example.demo`;
    const user = await getOrCreateUser({
      email,
      firstName: p.firstName,
      lastName: p.lastName,
      role: 'provider',
      passwordHash,
      title: p.title
    });
    await User.assignToAgency(user.id, parent.id);
    const result = await setPracticeCategoriesForUserAgency(parent.id, user.id, p.categories);
    console.log(`${email} → ${result.categories.join(', ')}`);
  }

  const mike = await User.findByEmail('williams@itsco.health');
  if (mike) {
    const agencies = await User.getAgencies(mike.id);
    if ((agencies || []).some((a) => Number(a.id) === Number(parent.id))) {
      await setPracticeCategoriesForUserAgency(parent.id, mike.id, ['mental_health']);
      console.log('williams@itsco.health → mental_health');
    }
  }

  console.log(`Done. Password for new demo users: ${PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
