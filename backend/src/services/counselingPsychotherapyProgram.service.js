/**
 * Ensures each mental_health tenant has an in-office Counseling and Psychotherapy
 * clinical program org affiliated under that tenant (not as a root tenant).
 */
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';

const DISPLAY_NAME = 'Counseling and Psychotherapy';

function slugForAgency(agencyId) {
  return `counseling-and-psychotherapy-${Number(agencyId)}`;
}

export async function findCounselingPsychotherapyForAgency(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return null;
  const [rows] = await pool.execute(
    `SELECT child.id, child.name, child.slug, child.organization_type
     FROM organization_affiliations oa
     INNER JOIN agencies child ON child.id = oa.organization_id
     WHERE oa.agency_id = ?
       AND COALESCE(oa.is_active, 0) = 1
       AND COALESCE(child.is_archived, 0) = 0
       AND LOWER(TRIM(COALESCE(child.organization_type, ''))) = 'clinical'
       AND (
         LOWER(TRIM(COALESCE(child.slug, ''))) = 'counseling-and-psychotherapy'
         OR LOWER(TRIM(COALESCE(child.slug, ''))) = ?
         OR LOWER(TRIM(COALESCE(child.name, ''))) = ?
       )
     ORDER BY
       CASE
         WHEN LOWER(TRIM(COALESCE(child.slug, ''))) = 'counseling-and-psychotherapy' THEN 0
         WHEN LOWER(TRIM(COALESCE(child.slug, ''))) = ? THEN 1
         ELSE 2
       END,
       child.id ASC
     LIMIT 1`,
    [aid, slugForAgency(aid), DISPLAY_NAME.toLowerCase(), slugForAgency(aid)]
  );
  return rows?.[0] || null;
}

/**
 * Create (if needed) and affiliate Counseling and Psychotherapy under a tenant agency.
 * @returns {Promise<object|null>} the clinical org row
 */
export async function ensureCounselingPsychotherapyProgramForAgency(agencyId, { colorPalette = null } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return null;

  const parent = await Agency.findById(aid);
  if (!parent) return null;
  const parentType = String(parent.organization_type || 'agency').toLowerCase();
  if (parentType !== 'agency') return null;

  const existing = await findCounselingPsychotherapyForAgency(aid);
  if (existing?.id) {
    await OrganizationAffiliation.upsert({
      agencyId: aid,
      organizationId: existing.id,
      isActive: true
    });
    return existing;
  }

  const slug = slugForAgency(aid);
  let child = null;
  const [bySlug] = await pool.execute(
    `SELECT id, name, slug, organization_type FROM agencies WHERE slug = ? LIMIT 1`,
    [slug]
  );
  if (bySlug?.[0]?.id) {
    child = bySlug[0];
  } else {
    const palette =
      colorPalette ||
      parent.color_palette ||
      { primary: '#059669', secondary: '#10b981', accent: '#f59e0b' };
    child = await Agency.create({
      name: DISPLAY_NAME,
      officialName: DISPLAY_NAME,
      slug,
      portalUrl: null,
      organizationType: 'clinical',
      isActive: true,
      colorPalette: typeof palette === 'string' ? (() => { try { return JSON.parse(palette); } catch { return null; } })() : palette
    });
    try {
      await Agency.update(child.id, {
        featureFlags: {
          noteAidEnabled: true,
          focusMusicEnabled: true,
          focusPackageEnabled: true,
          clinicalNoteGeneratorEnabled: true,
          inOfficeCounselingProgram: true
        }
      });
    } catch {
      // best effort
    }
  }

  if (!child?.id) return null;

  await OrganizationAffiliation.upsert({
    agencyId: aid,
    organizationId: child.id,
    isActive: true
  });

  return child;
}

export default {
  ensureCounselingPsychotherapyProgramForAgency,
  findCounselingPsychotherapyForAgency
};
