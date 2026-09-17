#!/usr/bin/env node
/**
 * Seed ITSCO hire / onboarding document templates + packages from bundled PDFs/HTML.
 * Idempotent by template name + agency_id.
 *
 * Usage: node backend/src/scripts/seedItscoHireOnboardingDocs.js
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';
import { hireFormDefinitions } from '../services/hireFormDefinitions.service.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import OnboardingPackage from '../models/OnboardingPackage.model.js';
import StorageService from '../services/storage.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = path.join(__dirname, '../assets/hireOnboarding/itsco');

// The real source PDFs are required. A generic paragraph is not a substitute
// for delivering a statutory notice, benefits summary or withholding form.
const HTML_ACKS = [];

const PDF_DOCS = [
  { file: 'COpregnancy.pdf', name: 'Colorado Pregnancy Accommodation Notice', action: 'review', stage: 'onboarding' },
  { file: 'FAMLI_Program_Notice.pdf', name: 'Colorado FAMLI Program Notice', action: 'review', stage: 'onboarding' },
  { file: 'health_plan.pdf', name: 'Health Insurance Plan Information', action: 'review', stage: 'onboarding' },
  {
    file: 'w4_2026.pdf',
    fieldKind: 'w4',
    name: 'Form W-4 (2026)',
    action: 'signature',
    lifecycleItemKey: 'w4',
    stage: 'onboarding'
  },
  {
    file: 'i9_2025.pdf',
    fieldKind: 'i9',
    name: 'Form I-9 · Employee Section 1 (01/20/25)',
    action: 'signature',
    lifecycleItemKey: 'i9',
    stage: 'onboarding'
  },
  {
    file: 'directdepositform.pdf',
    fieldKind: 'direct_deposit',
    name: 'Direct Deposit Form · Onboarding 2026',
    action: 'signature',
    lifecycleItemKey: 'direct_deposit_form',
    stage: 'onboarding'
  },
  {
    file: 'Health_Insurance_Opt_In_Out__1_.pdf',
    fieldKind: 'health_election',
    name: 'Health Insurance Opt-In / Opt-Out · Onboarding 2026',
    action: 'signature',
    lifecycleItemKey: null,
    stage: 'onboarding'
  }
];

async function resolveItscoAgencyId() {
  const [rows] = await pool.execute(
    `SELECT id FROM agencies
     WHERE LOWER(COALESCE(slug,'')) LIKE '%itsco%'
        OR LOWER(COALESCE(portal_url,'')) LIKE '%itsco%'
        OR LOWER(COALESCE(name,'')) LIKE '%itsco%'
        OR LOWER(COALESCE(official_name,'')) LIKE '%itsco%'
     ORDER BY id ASC
     LIMIT 1`
  );
  return rows[0]?.id || null;
}

async function findExistingTemplate(agencyId, name) {
  const [rows] = await pool.execute(
    `SELECT id FROM document_templates
     WHERE agency_id = ? AND name = ? AND is_active = TRUE
     ORDER BY version DESC LIMIT 1`,
    [agencyId, name]
  );
  return rows[0]?.id || null;
}

async function ensurePdfTemplate(agencyId, spec) {
  const existing = await findExistingTemplate(agencyId, spec.name);
  if (existing) return existing;
  const src = path.join(ASSET_DIR, spec.file);
  const bytes = await fs.readFile(src);
  const saved = await StorageService.saveTemplate(bytes, `itsco_${agencyId}_${spec.file}`);
  const filePath = saved.relativePath;
  const created = await DocumentTemplate.create({
    name: spec.name,
    description: `${spec.name} — ITSCO hire/onboarding packet. Map fillable fields in Documents Library.`,
    templateType: 'pdf',
    filePath,
    agencyId,
    documentType: 'administrative',
    documentActionType: spec.action,
    documentStage: spec.stage || 'onboarding',
    lifecycleItemKey: spec.lifecycleItemKey,
    isRequired: true,
    fieldDefinitions: spec.fieldKind ? await hireFormDefinitions(bytes, spec.fieldKind) : [],
    createdByUserId: null
  });
  return created.id;
}

async function ensureHtmlTemplate(agencyId, spec) {
  const existing = await findExistingTemplate(agencyId, spec.name);
  if (existing) return existing;
  const created = await DocumentTemplate.create({
    name: spec.name,
    description: `${spec.name} — HTML acknowledgement (editable in Documents Library).`,
    templateType: 'html',
    htmlContent: spec.html,
    agencyId,
    documentType: 'administrative',
    documentActionType: 'review',
    documentStage: 'onboarding',
    lifecycleItemKey: spec.lifecycleItemKey,
    isRequired: true,
    createdByUserId: null
  });
  return created.id;
}

async function ensurePackage(agencyId, { name, packageType, description, templateIds }) {
  const [existing] = await pool.execute(
    `SELECT id FROM onboarding_packages WHERE agency_id = ? AND name = ? LIMIT 1`,
    [agencyId, name]
  );
  let packageId = existing[0]?.id || null;
  if (!packageId) {
    const pkg = await OnboardingPackage.create({
      name,
      description,
      agencyId,
      packageType,
      isActive: true,
      createdByUserId: null
    });
    packageId = pkg.id;
  }
  const current = await OnboardingPackage.getDocuments(packageId);
  const have = new Set((current || []).map((d) => Number(d.document_template_id)));
  let order = (current || []).length;
  for (const tid of templateIds) {
    if (have.has(Number(tid))) continue;
    const tmpl = await DocumentTemplate.findById(tid);
    await OnboardingPackage.addDocument(
      packageId,
      tid,
      order,
      tmpl?.document_action_type || 'signature',
      null
    );
    order += 1;
  }
  return packageId;
}

async function main() {
  const agencyId = await resolveItscoAgencyId();
  if (!agencyId) {
    console.error('ITSCO agency not found — aborting seed');
    process.exit(1);
  }
  console.log('ITSCO agency id:', agencyId);

  const templateIds = [];
  for (const html of HTML_ACKS) {
    const id = await ensureHtmlTemplate(agencyId, html);
    templateIds.push(id);
    console.log('HTML template', html.name, id);
  }
  for (const pdf of PDF_DOCS) {
    const id = await ensurePdfTemplate(agencyId, pdf);
    templateIds.push(id);
    console.log('PDF template', pdf.name, id);
  }

  const onboardingPkgId = await ensurePackage(agencyId, {
    name: 'ITSCO Onboarding · 2026',
    packageType: 'onboarding',
    description: 'Step-by-step onboarding documents (acks + W-4/I-9/direct deposit/benefits). Editable in People Ops → Onboarding Packages.',
    templateIds
  });
  const prehirePkgId = await ensurePackage(agencyId, {
    name: 'ITSCO Pre-Hire Essentials · 2026',
    packageType: 'pre_hire',
    description: 'Pre-hire acknowledgements and notices. Add/remove steps in Onboarding Packages.',
    templateIds: [] // Pre-hire steps are built in; employment forms belong to onboarding.
  });

  // Preserve assigned questionnaires/training while replacing legacy form documents.
  const [settingsRows] = await pool.execute(
    `SELECT prehire_settings FROM agencies WHERE id = ? LIMIT 1`,
    [agencyId]
  );
  let settings = {};
  try {
    const raw = settingsRows[0]?.prehire_settings;
    settings = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
  } catch {
    settings = {};
  }
  const previousPackageId = Number(settings.default_onboarding_package_id);
  if (previousPackageId && previousPackageId !== Number(onboardingPkgId)) {
    const previous = await OnboardingPackage.findById(previousPackageId);
    if (previous && Number(previous.agency_id) === Number(agencyId)) {
      for (const item of await OnboardingPackage.getModules(previousPackageId)) await OnboardingPackage.addModule(onboardingPkgId, item.module_id, item.order_index);
      for (const item of await OnboardingPackage.getTrainingFocuses(previousPackageId)) await OnboardingPackage.addTrainingFocus(onboardingPkgId, item.track_id, item.order_index);
      for (const item of await OnboardingPackage.getChecklistItems(previousPackageId)) await OnboardingPackage.addChecklistItem(onboardingPkgId, item.checklist_item_id, item.order_index);
      for (const item of await OnboardingPackage.getIntakeLinks(previousPackageId)) await OnboardingPackage.addIntakeLink(onboardingPkgId, item.intake_link_id, item.order_index);
    }
  }
  settings.default_onboarding_package_id = onboardingPkgId;
  settings.default_prehire_package_id = prehirePkgId;
  const existingResources = settings.portal_workflow?.resources || [];
  const resources = [
    { id: 'd11', title: 'D11 Pre-Hire document', kind: 'upload', phase: 'pre_hire', required: true, url: '' },
    { id: 'co-withholding-notice', title: 'Colorado withholding certificate (DR 0004) · 2026', kind: 'acknowledgement', phase: 'onboarding', required: true,
      url: 'https://tax.colorado.gov/sites/tax/files/documents/DR_0004_2026.pdf', instructions: 'Review the Colorado withholding certificate. This certificate is optional. If you complete it, upload it in the Colorado withholding submission step.' },
    { id: 'co-withholding', title: 'Submit Colorado withholding elections', kind: 'upload', phase: 'onboarding', required: false,
      url: 'https://tax.colorado.gov/sites/tax/files/documents/DR_0004_2026.pdf', instructions: 'Upload your completed DR 0004 if you choose to submit separate Colorado withholding elections.' },
    { id: 'marketplace', title: 'Health insurance marketplace coverage notice', kind: 'acknowledgement', phase: 'onboarding', required: true, url: '' },
    { id: 'family-practice', title: 'Family practice information sheet', kind: 'acknowledgement', phase: 'onboarding', required: true, url: '' },
    { id: 'supervisor-meeting', title: 'Meet with your supervisor', kind: 'meeting', phase: 'onboarding', required: true, url: '' }
  ];
  const byId = new Map(resources.map(r => [r.id, r]));
  for (const resource of existingResources) byId.set(resource.id, resource);
  settings.portal_workflow = { ...settings.portal_workflow, resources: [...byId.values()] };
  await pool.execute(
    `UPDATE agencies SET prehire_settings = ? WHERE id = ?`,
    [JSON.stringify(settings), agencyId]
  );

  console.log('Packages:', { onboardingPkgId, prehirePkgId });
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
