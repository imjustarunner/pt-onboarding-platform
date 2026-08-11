/**
 * One-shot: ensure agency school intake masters exist and every affiliated
 * school has active EN/ES inheriting digital intake shells.
 *
 * Usage:
 *   node backend/src/scripts/backfillSchoolDigitalIntakeMasters.js [agencySlug|agencyId] [--dry-run]
 *   AGENCY_ID=2 node backend/src/scripts/backfillSchoolDigitalIntakeMasters.js
 */
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchoolIntakeMaster from '../models/AgencySchoolIntakeMaster.model.js';
import { ensureDigitalIntakeFormsForSchool } from '../services/schoolOnboardingIntakeBootstrap.service.js';

async function resolveAgency(arg) {
  const envId = Number(process.env.AGENCY_ID || 0);
  if (envId > 0) return Agency.findById(envId);
  if (arg && /^\d+$/.test(String(arg))) return Agency.findById(Number(arg));
  const slug = String(arg || process.env.AGENCY_SLUG || 'itsco').trim().toLowerCase();
  const [rows] = await pool.execute(
    `SELECT id FROM agencies
     WHERE LOWER(COALESCE(portal_url, slug, '')) = ?
       AND COALESCE(organization_type, 'agency') IN ('agency', '')
     LIMIT 1`,
    [slug]
  );
  if (rows?.[0]?.id) return Agency.findById(rows[0].id);
  // Fallback: match by name/slug more loosely
  const [rows2] = await pool.execute(
    `SELECT id FROM agencies WHERE LOWER(slug) = ? OR LOWER(portal_url) = ? LIMIT 1`,
    [slug, slug]
  );
  return rows2?.[0]?.id ? Agency.findById(rows2[0].id) : null;
}

async function listSchoolOrgs(agencyId) {
  const ids = new Map();
  try {
    const orgs = await OrganizationAffiliation.listActiveOrganizationsForAgency(agencyId);
    for (const o of orgs || []) {
      const ot = String(o?.organization_type || 'school').toLowerCase();
      if (!['school', 'program', 'learning'].includes(ot)) continue;
      const id = Number(o.id || 0);
      if (id) ids.set(id, { id, name: o.name || `Org ${id}`, organization_type: ot });
    }
  } catch {
    // ignore
  }
  try {
    const schools = await AgencySchool.listByAgency(agencyId, { includeInactive: false });
    for (const s of schools || []) {
      const id = Number(s.school_organization_id || s.id || 0);
      if (!id || ids.has(id)) continue;
      ids.set(id, {
        id,
        name: s.name || s.school_name || `School ${id}`,
        organization_type: 'school'
      });
    }
  } catch {
    // ignore
  }
  return [...ids.values()];
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
  const dryRun = process.argv.includes('--dry-run')
    || String(process.env.DRY_RUN || '').toLowerCase() === 'true';
  const agency = await resolveAgency(args[0]);
  if (!agency?.id) {
    console.error('Agency not found');
    process.exit(1);
  }

  console.log(`[backfillSchoolDigitalIntakeMasters] agency=${agency.id} name=${agency.name} dryRun=${dryRun}`);

  if (!dryRun) {
    for (const lang of ['en', 'es']) {
      const master = await AgencySchoolIntakeMaster.getOrCreateForAgency(agency.id, {
        languageCode: lang,
        actorUserId: null
      });
      console.log(`  master ${lang}: id=${master?.id} version=${master?.version} steps=${(master?.intake_steps || []).length}`);
    }
  } else {
    console.log('  (dry-run) would ensure EN/ES agency school intake masters');
  }

  const schools = await listSchoolOrgs(agency.id);
  console.log(`  schools/programs found: ${schools.length}`);

  const summary = { ensured: 0, skipped: 0, errors: [] };
  for (const school of schools) {
    if (dryRun) {
      console.log(`  [dry-run] would ensure intakes for ${school.id} ${school.name}`);
      summary.skipped += 1;
      continue;
    }
    try {
      const result = await ensureDigitalIntakeFormsForSchool({
        agencyId: agency.id,
        schoolOrganizationId: school.id,
        schoolName: school.name,
        createdByUserId: null,
        onlyIfMissing: true,
        reuseSourcePublicKey: true
      });
      const en = result.en?.publicKey ? 'en' : '-';
      const es = result.es?.publicKey ? 'es' : '-';
      console.log(`  ok school=${school.id} ${school.name} [${en}/${es}] errors=${(result.errors || []).length}`);
      if (result.errors?.length) summary.errors.push({ schoolId: school.id, errors: result.errors });
      summary.ensured += 1;
    } catch (e) {
      console.error(`  FAIL school=${school.id}:`, e?.message || e);
      summary.errors.push({ schoolId: school.id, errors: [e?.message || String(e)] });
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
