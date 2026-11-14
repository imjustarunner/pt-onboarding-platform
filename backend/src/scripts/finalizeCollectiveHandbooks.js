/** Owner-approved November release. Preview, back up, then publish atomically. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { planOwnerReviewedHandbookRelease, ownerReviewHash } from '../services/ownerReviewedHandbookRelease.service.js';
import { companyHandbookReadiness } from '../services/workplaceDocumentTemplates.js';
import { COLLECTIVE_HANDBOOK_RELEASE } from '../content/collectiveHandbookNovember2026.js';
import { handbookBodyHash } from '../services/workplaceHandbookContent.js';

dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
const option = key => process.argv.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const apply = process.argv.includes('--apply');
const ids = [2, 6, 377, 453, 454];
const reviewPath = option('review');
if (!reviewPath) throw new Error('Supply the owner’s exported wording decisions for the approval record.');
const reviewBytes = fs.readFileSync(reviewPath);
const review = JSON.parse(reviewBytes);
if (review.reviewType !== 'mental-range-draft-wording') throw new Error('Unexpected review file type.');
const approvalFileHash = createHash('sha256').update(reviewBytes).digest('hex');
const db = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3307), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, timezone: 'Z', connectTimeout: 15000 });

async function snapshots() {
  const [agencies] = await db.query('SELECT id,name,slug,color_palette,logo_url,feature_flags FROM agencies WHERE id IN (?) ORDER BY id FOR UPDATE', [ids]);
  if (agencies.length !== ids.length) throw new Error('An expected company or retained QA mirror is missing.');
  const result = [];
  for (const agency of agencies) {
    const [[document]] = await db.query('SELECT * FROM workplace_handbook_documents WHERE agency_id=? FOR UPDATE', [agency.id]);
    if (!document) throw new Error(`No reviewed handbook document for ${agency.id}.`);
    const [versions] = await db.query('SELECT * FROM workplace_handbook_versions WHERE document_id=? ORDER BY version_number DESC FOR UPDATE', [document.id]);
    const drafts = versions.filter(v => v.is_draft);
    if (drafts.length > 1) throw new Error(`Multiple drafts require reconciliation for ${agency.id}.`);
    const version = drafts[0] || versions.find(v => v.id === document.published_version_id);
    if (!version) throw new Error(`No reviewed edition for ${agency.id}.`);
    const [sections] = await db.query('SELECT * FROM workplace_handbook_sections WHERE version_id=? ORDER BY sort_order,id FOR UPDATE', [version.id]);
    const [digests] = await db.query("SELECT * FROM workplace_handbook_digests WHERE agency_id=? AND status='draft' ORDER BY id FOR UPDATE", [agency.id]);
    const [entries] = digests.length ? await db.query('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id IN (?) ORDER BY digest_id,sort_order,id FOR UPDATE', [digests.map(d => d.id)]) : [[]];
    const [medical] = await db.query('SELECT * FROM agency_medical_service_codes WHERE agency_id=? ORDER BY service_code FOR UPDATE', [agency.id]);
    result.push({ agency, document, version, maxVersionNumber: Math.max(...versions.map(v => Number(v.version_number))), sections, digests, entries, medical });
  }
  return result;
}

async function preservationFingerprint() {
  const [contracts] = await db.query('SELECT id,agency_id,SHA2(CONCAT_WS(CHAR(0),COALESCE(rendered_html,\'\'),COALESCE(CAST(token_values_json AS CHAR),\'\'),COALESCE(CAST(task_id AS CHAR),\'\'),COALESCE(CAST(user_specific_document_id AS CHAR),\'\')),256) AS content_hash FROM contract_generations WHERE agency_id IN (?) ORDER BY id', [ids]);
  const [payRules] = await db.query('SELECT * FROM payroll_service_code_rules WHERE agency_id IN (?) ORDER BY agency_id,service_code', [ids]);
  const [payRates] = await db.query('SELECT * FROM payroll_pay_system_rates WHERE agency_id IN (?) ORDER BY agency_id,category,level', [ids]);
  return { contracts: ownerReviewHash(contracts), contractCount: contracts.length, payRules: ownerReviewHash(payRules), payRuleCount: payRules.length, payRates: ownerReviewHash(payRates), payRateCount: payRates.length };
}

try {
  await db.beginTransaction();
  const current = await snapshots();
  const stateHash = ownerReviewHash(current);
  const plans = current.map(snapshot => planOwnerReviewedHandbookRelease(snapshot, { approvalFileHash }));
  const preservedBefore = await preservationFingerprint();
  const report = {
    mode: apply ? 'applied' : 'preview', release: COLLECTIVE_HANDBOOK_RELEASE, stateHash, reviewExportSha256: approvalFileHash,
    approvalAuthority: 'Owner’s subsequent written chat direction supersedes publicationRequested:false in the review export: apply the detailed feedback, approve all, finalize and initiate a new version.',
    companies: plans.map(p => ({ agencyId: p.agency.id, slug: p.agency.slug, alreadyFinal: p.alreadyFinal, versionId: p.versionId, versionNumber: p.versionNumber, sections: p.sections?.length, excludedUnprovidedSections: p.metadata?.excludedUnprovidedSections, digestsToFinalize: p.digests?.map(d => ({ id: d.id, period: d.period_label })), novemberEntryAdditions: p.novemberAdditions?.map(e => e.handbook_section_slug), entriesReconciled: p.entries?.length, removedDraftEntryIds: p.removedEntryIds, medicalReferencesToAdd: p.medicalInsertions?.map(row => row.serviceCode), prospectiveMinimumWorkloadWaivedFrom: p.minimumWorkloadWaivedFrom })),
    preservedBefore, contractsIssued: 0, messagesSent: 0, billingCodesActivated: 0, retrospectivePayrollChanged: false
  };
  if (apply) {
    if (option('expected-state') !== stateHash) throw new Error('Live drafts changed. Review a fresh publication preview before applying.');
    if (!option('backup')) throw new Error('A new private backup path is required.');
    fs.writeFileSync(option('backup'), JSON.stringify({ capturedAt: new Date().toISOString(), reviewExportSha256: approvalFileHash, preservedBefore, snapshots: current }, null, 2), { mode: 0o600, flag: 'wx' });
    for (const plan of plans) {
      if (plan.alreadyFinal) continue;
      const remaining = companyHandbookReadiness(plan.metadata, plan.sections.map(s => ({ ...s, body_html: s.bodyHtml, content_status: s.status })));
      if (remaining.length) throw new Error(`Incomplete company policies for ${plan.agency.id}: ${remaining.map(s => s.title).join(', ')}`);
      for (const id of plan.removedEntryIds) await db.query('DELETE e FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE e.id=? AND e.agency_id=? AND d.status=\'draft\'', [id, plan.agency.id]);
      if (plan.removedSectionIds.length) await db.query('DELETE FROM workplace_handbook_sections WHERE version_id=? AND id IN (?)', [plan.versionId, plan.removedSectionIds]);
      for (const section of plan.sections) {
        const values = [section.slug, section.title, section.bodyHtml, section.parentSlug || null, section.sourcePage || null, 'ready', handbookBodyHash(section.bodyHtml), section.sortOrder];
        if (section.databaseId) await db.query('UPDATE workplace_handbook_sections SET slug=?,title=?,body_html=?,parent_slug=?,source_page=?,content_status=?,source_body_hash=?,sort_order=? WHERE id=? AND version_id=?', [...values, section.databaseId, plan.versionId]);
        else await db.query('INSERT INTO workplace_handbook_sections(slug,title,body_html,parent_slug,source_page,content_status,source_body_hash,sort_order,agency_id,version_id) VALUES(?,?,?,?,?,?,?,?,?,?)', [...values, plan.agency.id, plan.versionId]);
      }
      let novemberId = plan.novemberDigestId;
      if (!novemberId) {
        const [created] = await db.query("INSERT INTO workplace_handbook_digests(agency_id,title,period_label,status,notes) VALUES(?,'November 2026 Workplace Handbook Updates','November 2026','draft',?)", [plan.agency.id, `Owner-approved release ${COLLECTIVE_HANDBOOK_RELEASE}`]);
        novemberId = created.insertId;
      }
      for (const entry of plan.entries) await db.query('UPDATE workplace_handbook_digest_entries SET subject=?,rationale=?,changed_content=?,handbook_section_slug=? WHERE id=? AND agency_id=?', [entry.subject, entry.rationale || null, entry.changed_content, entry.handbook_section_slug, entry.id, plan.agency.id]);
      let order = Math.max(0, ...plan.entries.filter(e => e.digest_id === novemberId).map(e => Number(e.sort_order) || 0));
      for (const entry of plan.novemberAdditions) await db.query('INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content,handbook_section_slug,change_kind) VALUES(?,?,?,?,?,?,?,\'updated\')', [novemberId, plan.agency.id, ++order, entry.subject, entry.rationale || null, entry.changed_content, entry.handbook_section_slug]);
      for (const row of plan.medicalInsertions) await db.query("INSERT IGNORE INTO agency_medical_service_codes(agency_id,service_code,description,unit_calc_mode,is_addon,is_active,session_mode) VALUES(?,?,?,'NONE',?,0,'individual')", [plan.agency.id, row.serviceCode, row.description, row.isAddon ? 1 : 0]);
      // This dated favorable policy never flips an undated employee assignment
      // or changes a rate table, a signed schedule, or a historical service date.
      // Merge the object so a company without payrollPolicy receives the
      // parent too. Setting only a nested leaf silently does nothing in MySQL.
      await db.query("UPDATE agencies SET feature_flags=JSON_MERGE_PATCH(COALESCE(feature_flags,JSON_OBJECT()),JSON_OBJECT('payrollPolicy',JSON_OBJECT('minimumWorkloadWaivedFrom',?))) WHERE id=?", [plan.minimumWorkloadWaivedFrom, plan.agency.id]);
      const [[waiver]] = await db.query("SELECT JSON_UNQUOTE(JSON_EXTRACT(feature_flags,'$.payrollPolicy.minimumWorkloadWaivedFrom')) AS waived_from FROM agencies WHERE id=?", [plan.agency.id]);
      if (waiver?.waived_from !== plan.minimumWorkloadWaivedFrom) throw new Error(`The prospective workload waiver was not saved for ${plan.agency.id}. Roll back and inspect.`);
      await db.query('UPDATE workplace_handbook_versions SET version_number=?,source_revision=?,metadata_json=?,is_draft=0,published_at=UTC_TIMESTAMP(),published_by_user_id=NULL,changelog=? WHERE id=? AND agency_id=? AND is_draft=1', [plan.versionNumber, plan.sourceRevision, JSON.stringify(plan.metadata), `Owner-approved final November revision ${COLLECTIVE_HANDBOOK_RELEASE}; prior reviewed draft ${plan.originalVersionNumber} retained in the private release backup.`, plan.versionId, plan.agency.id]);
      await db.query('UPDATE workplace_handbook_documents SET published_version_id=? WHERE id=? AND agency_id=?', [plan.versionId, plan.documentId, plan.agency.id]);
      const digestIds = [...new Set([...plan.digests.map(d => d.id), novemberId])];
      for (const digestId of digestIds) await db.query("UPDATE workplace_handbook_digests SET status='published',published_at=UTC_TIMESTAMP(),published_by_user_id=NULL,notes=CONCAT_WS(CHAR(10),NULLIF(notes,''),?) WHERE id=? AND agency_id=? AND status='draft'", [`Final, updated and owner-approved against Workplace Handbook version ${plan.versionNumber}; release ${COLLECTIVE_HANDBOOK_RELEASE}.`, digestId, plan.agency.id]);
    }
    const preservedAfter = await preservationFingerprint();
    if (ownerReviewHash(preservedBefore) !== ownerReviewHash(preservedAfter)) throw new Error('Protected contract or rate data changed during the release transaction. Roll back and inspect.');
    report.preservedAfter = preservedAfter;
    await db.commit();
    report.committedAt = new Date().toISOString();
  } else {
    if (option('snapshot')) fs.writeFileSync(option('snapshot'), JSON.stringify(current, null, 2), { mode: 0o600, flag: 'wx' });
    await db.rollback();
  }
  if (option('report')) fs.writeFileSync(option('report'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
} catch (error) { await db.rollback(); throw error; }
finally { await db.end(); }
