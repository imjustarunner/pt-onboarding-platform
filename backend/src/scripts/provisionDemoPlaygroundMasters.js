/**
 * Provision Demo Playground (slug: demo) with independent master digital + paper forms.
 * Copies structure/content from ITSCO when available, but stores separate rows so
 * Demo Playground never shares live ITSCO masters.
 *
 * Usage:
 *   node backend/src/scripts/provisionDemoPlaygroundMasters.js [--dry-run]
 */
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import AgencySchoolIntakeMaster from '../models/AgencySchoolIntakeMaster.model.js';
import AgencyOfficeIntakeMaster from '../models/AgencyOfficeIntakeMaster.model.js';
import AgencyChannelIntakeMaster from '../models/AgencyChannelIntakeMaster.model.js';
import SchoolPacketTemplate from '../models/SchoolPacketTemplate.model.js';
import OfficePacketTemplate from '../models/OfficePacketTemplate.model.js';
import { ensureDigitalIntakeFormsForSchool } from '../services/schoolOnboardingIntakeBootstrap.service.js';
import { FRAMED_MASTER_CHANNELS } from '../constants/masterFormChannels.js';

async function resolveDemoAgency() {
  const [rows] = await pool.execute(
    `SELECT id, name, slug FROM agencies
     WHERE LOWER(slug) = 'demo' AND organization_type = 'agency' AND is_active = 1
     LIMIT 1`
  );
  return rows?.[0] ? Agency.findById(rows[0].id) : null;
}

async function resolveDemoSchool(demoAgencyId) {
  const [rows] = await pool.execute(
    `SELECT a.id, a.name, a.slug
     FROM agency_schools asx
     INNER JOIN agencies a ON a.id = asx.school_organization_id
     WHERE asx.agency_id = ? AND asx.is_active = 1
     ORDER BY (LOWER(a.slug) = 'demo-school') DESC, a.id ASC
     LIMIT 1`,
    [demoAgencyId]
  );
  return rows?.[0] || null;
}

async function resolveItscoId() {
  const [rows] = await pool.execute(
    `SELECT id FROM agencies
     WHERE LOWER(slug) = 'itsco' AND organization_type = 'agency'
     LIMIT 1`
  );
  return Number(rows?.[0]?.id || 0) || null;
}

async function copySchoolMasterFromSource({ demoAgencyId, sourceAgencyId, languageCode, dryRun }) {
  const lang = languageCode === 'es' ? 'es' : 'en';
  const existing = await AgencySchoolIntakeMaster.findByAgencyLanguage(demoAgencyId, lang);
  if (existing?.editor_intake_link_id) {
    return { languageCode: lang, action: 'exists', id: existing.id, version: existing.version };
  }

  let source = sourceAgencyId
    ? await AgencySchoolIntakeMaster.findByAgencyLanguage(sourceAgencyId, lang)
    : null;

  if (dryRun) {
    return {
      languageCode: lang,
      action: 'would_create',
      sourceMasterId: source?.id || null,
      stepCount: (source?.intake_steps || []).length
    };
  }

  const title = lang === 'es'
    ? 'Demo Playground — School Referral Master (ES)'
    : 'Demo Playground — School Referral Master (EN)';

  const created = await AgencySchoolIntakeMaster.upsertContent({
    agencyId: demoAgencyId,
    languageCode: lang,
    title,
    intakeSteps: source?.intake_steps || null,
    intakeFields: source?.intake_fields || null,
    actorUserId: null,
    bumpVersion: false
  });
  return {
    languageCode: lang,
    action: 'created',
    id: created?.id,
    version: created?.version,
    editorLinkId: created?.editor_intake_link_id
  };
}

async function ensureOfficeMaster({ demoAgencyId, sourceAgencyId, languageCode, dryRun }) {
  const lang = languageCode === 'es' ? 'es' : 'en';
  const existing = await AgencyOfficeIntakeMaster.findByAgencyLanguage(demoAgencyId, lang);
  if (existing?.published_intake_link_id && existing?.editor_intake_link_id) {
    return { languageCode: lang, action: 'exists', id: existing.id, publishedLinkId: existing.published_intake_link_id };
  }

  let sourceSteps = null;
  let sourceFields = null;
  if (sourceAgencyId) {
    try {
      const source = await AgencyOfficeIntakeMaster.findByAgencyLanguage(sourceAgencyId, lang);
      if (source?.intake_steps?.length) {
        sourceSteps = source.intake_steps;
        sourceFields = source.intake_fields;
      } else {
        const schoolSource = await AgencySchoolIntakeMaster.findByAgencyLanguage(sourceAgencyId, lang);
        // Strip school_roi for office seed.
        sourceSteps = (schoolSource?.intake_steps || []).filter(
          (s) => !['school_roi', 'spanish_clarification'].includes(String(s?.type || '').toLowerCase())
        );
        sourceFields = schoolSource?.intake_fields || null;
      }
    } catch {
      // ignore
    }
  }

  if (dryRun) {
    return { languageCode: lang, action: 'would_create', stepCount: (sourceSteps || []).length };
  }

  const title = lang === 'es'
    ? 'Demo Playground — Office Intake Master (ES)'
    : 'Demo Playground — Office Intake Master (EN)';

  const created = await AgencyOfficeIntakeMaster.upsertContent({
    agencyId: demoAgencyId,
    languageCode: lang,
    title,
    intakeSteps: sourceSteps,
    intakeFields: sourceFields,
    actorUserId: null,
    bumpVersion: false
  });
  return {
    languageCode: lang,
    action: 'created',
    id: created?.id,
    publishedLinkId: created?.published_intake_link_id,
    editorLinkId: created?.editor_intake_link_id
  };
}

async function ensurePacketTemplates({ demoAgencyId, sourceAgencyId, dryRun }) {
  const out = { school: {}, office: {} };
  for (const locale of ['en', 'es']) {
    if (dryRun) {
      out.school[locale] = 'would_ensure';
      out.office[locale] = 'would_ensure';
      continue;
    }
    // Prefer copying ITSCO school packet HTML into Demo's own school + office templates.
    let html = null;
    if (sourceAgencyId) {
      try {
        const src = await SchoolPacketTemplate.findByAgencyId(sourceAgencyId, locale);
        html = src?.html_content || null;
      } catch {
        html = null;
      }
    }
    const schoolTpl = await SchoolPacketTemplate.getOrCreateForAgency(demoAgencyId, { locale });
    if (html && (!schoolTpl?.html_content || schoolTpl.is_default_fallback)) {
      await SchoolPacketTemplate.upsertContent({
        agencyId: demoAgencyId,
        htmlContent: html,
        locale,
        actorUserId: null
      });
      out.school[locale] = 'copied';
    } else {
      out.school[locale] = schoolTpl?.version ? `v${schoolTpl.version}` : 'ensured';
    }

    const officeTpl = await OfficePacketTemplate.getOrCreateForAgency(demoAgencyId, { locale });
    if (html && (!officeTpl?.html_content || officeTpl.is_default_fallback)) {
      await OfficePacketTemplate.upsertContent({
        agencyId: demoAgencyId,
        htmlContent: html,
        locale,
        actorUserId: null
      });
      out.office[locale] = 'copied';
    } else {
      out.office[locale] = officeTpl?.version ? `v${officeTpl.version}` : 'ensured';
    }
  }
  return out;
}

async function ensureChannelMasters({ demoAgencyId, dryRun }) {
  const results = [];
  for (const channel of FRAMED_MASTER_CHANNELS) {
    for (const languageCode of ['en', 'es']) {
      if (dryRun) {
        results.push({ channel, languageCode, action: 'would_ensure' });
        continue;
      }
      const master = await AgencyChannelIntakeMaster.getOrCreateForAgency(demoAgencyId, {
        channel,
        languageCode
      });
      results.push({
        channel,
        languageCode,
        action: 'ensured',
        id: master?.id,
        status: master?.status,
        editorLinkId: master?.editor_intake_link_id
      });
    }
  }
  return results;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
    || String(process.env.DRY_RUN || '').toLowerCase() === 'true';

  const demo = await resolveDemoAgency();
  if (!demo?.id) {
    console.error('Demo Playground agency (slug=demo) not found');
    process.exit(1);
  }
  const school = await resolveDemoSchool(demo.id);
  const itscoId = await resolveItscoId();

  console.log(JSON.stringify({
    dryRun,
    demoAgencyId: demo.id,
    demoName: demo.name,
    demoSchoolId: school?.id || null,
    demoSchoolSlug: school?.slug || null,
    sourceAgencyId: itscoId
  }, null, 2));

  const schoolMasters = [];
  for (const lang of ['en', 'es']) {
    schoolMasters.push(await copySchoolMasterFromSource({
      demoAgencyId: demo.id,
      sourceAgencyId: itscoId,
      languageCode: lang,
      dryRun
    }));
  }

  const officeMasters = [];
  for (const lang of ['en', 'es']) {
    officeMasters.push(await ensureOfficeMaster({
      demoAgencyId: demo.id,
      sourceAgencyId: itscoId,
      languageCode: lang,
      dryRun
    }));
  }

  const packets = await ensurePacketTemplates({
    demoAgencyId: demo.id,
    sourceAgencyId: itscoId,
    dryRun
  });

  let schoolShells = null;
  if (school?.id) {
    if (dryRun) {
      schoolShells = { action: 'would_ensure_en_es_shells', schoolId: school.id };
    } else {
      schoolShells = await ensureDigitalIntakeFormsForSchool({
        agencyId: demo.id,
        schoolOrganizationId: school.id,
        schoolName: school.name || 'Demo K-8 School',
        createdByUserId: null,
        onlyIfMissing: true,
        reuseSourcePublicKey: false
      });
      try {
        await AgencySchoolIntakeMaster.markAgencySchoolLinksInheriting(demo.id);
      } catch {
        // ignore
      }
    }
  }

  const channels = await ensureChannelMasters({ demoAgencyId: demo.id, dryRun });

  console.log(JSON.stringify({
    schoolMasters,
    officeMasters,
    packets,
    schoolShells,
    channels: channels.slice(0, 6),
    channelCount: channels.length
  }, null, 2));

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
