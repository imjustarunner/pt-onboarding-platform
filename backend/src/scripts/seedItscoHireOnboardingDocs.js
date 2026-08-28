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
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import OnboardingPackage from '../models/OnboardingPackage.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = path.join(__dirname, '../assets/hireOnboarding/itsco');
const UPLOAD_DIR = path.join(__dirname, '../../uploads/templates');

const HTML_ACKS = [
  {
    name: 'Employee Handbook Acknowledgement',
    lifecycleItemKey: 'handbook_acknowledged',
    html: `<h1>Employee Handbook Acknowledgement</h1>
<p>I acknowledge that I have received access to the workplace handbook and understand it is my responsibility to read and follow its policies.</p>
<p>I understand that policies may be updated and that I can review the current handbook in my hire portal Resources section.</p>`
  },
  {
    name: 'FAMLI Program Notice',
    lifecycleItemKey: null,
    html: `<h1>Colorado FAMLI Program Notice</h1>
<p>Please review the Colorado Family and Medical Leave Insurance (FAMLI) program notice provided by your employer.</p>
<p>By acknowledging, you confirm you have been given an opportunity to review this notice.</p>`
  },
  {
    name: 'Colorado Pregnancy Workers Fairness Notice',
    lifecycleItemKey: null,
    html: `<h1>Colorado Pregnancy Workers Fairness Act Notice</h1>
<p>Please review the pregnancy workers fairness notice. By acknowledging, you confirm you received this information.</p>`
  },
  {
    name: 'Colorado Paid Family Leave Notice',
    lifecycleItemKey: null,
    html: `<h1>Colorado Paid Family and Medical Leave Notice</h1>
<p>Please review the paid family leave notice stuffer. By acknowledging, you confirm you received this information.</p>`
  },
  {
    name: 'Health Plan Summary Notice',
    lifecycleItemKey: null,
    html: `<h1>Health Plan Information</h1>
<p>Please review the health plan summary information provided by your employer. Contact People Operations with questions about benefits enrollment.</p>`
  },
  {
    name: 'Discrimination / Rights Notice (DR-0004)',
    lifecycleItemKey: null,
    html: `<h1>Employee Rights Notice</h1>
<p>Please review the posted employee rights / discrimination notice. By acknowledging, you confirm you have been provided this notice.</p>`
  }
];

const PDF_DOCS = [
  {
    file: 'w4_2025_2.pdf',
    name: 'Form W-4 (2025)',
    action: 'signature',
    lifecycleItemKey: 'w4',
    stage: 'onboarding'
  },
  {
    file: 'i9_0527.pdf',
    name: 'Form I-9',
    action: 'signature',
    lifecycleItemKey: 'i9',
    stage: 'onboarding'
  },
  {
    file: 'directdepositform.pdf',
    name: 'Direct Deposit Form',
    action: 'signature',
    lifecycleItemKey: 'direct_deposit_form',
    stage: 'onboarding'
  },
  {
    file: 'Health_Insurance_Opt_In_Out__1_.pdf',
    name: 'Health Insurance Opt-In / Opt-Out',
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
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const src = path.join(ASSET_DIR, spec.file);
  const destName = `itsco_${spec.file}`;
  const dest = path.join(UPLOAD_DIR, destName);
  await fs.copyFile(src, dest);
  const filePath = `templates/${destName}`;
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
    fieldDefinitions: [],
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
    name: 'ITSCO Standard Onboarding',
    packageType: 'onboarding',
    description: 'Step-by-step onboarding documents (acks + W-4/I-9/direct deposit/benefits). Editable in People Ops → Onboarding Packages.',
    templateIds
  });
  const prehirePkgId = await ensurePackage(agencyId, {
    name: 'ITSCO Pre-Hire Essentials',
    packageType: 'pre_hire',
    description: 'Pre-hire acknowledgements and notices. Add/remove steps in Onboarding Packages.',
    templateIds: templateIds.slice(0, 6) // HTML acks first
  });

  // Point agency prehire_settings defaults at these packages when unset
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
  if (!settings.default_onboarding_package_id) settings.default_onboarding_package_id = onboardingPkgId;
  if (!settings.default_prehire_package_id) settings.default_prehire_package_id = prehirePkgId;
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
