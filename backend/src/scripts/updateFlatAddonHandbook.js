/**
 * Update the existing ITSCO handbook draft and November 2026 digest only.
 * Dry run first. Apply requires the reviewed state hash and a new private backup.
 * This script neither publishes a handbook/digest nor sends notifications.
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { applyFlatAddonHandbookAmendment, FLAT_ADDON_HANDBOOK_SLUG, FLAT_ADDON_NOVEMBER_UPDATE } from '../content/flatAddonHandbookAmendment.js';

dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
const apply = process.argv.includes('--apply');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const db = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, timezone: 'Z'
});
try {
  await db.beginTransaction();
  const [agencies] = await db.execute("SELECT id,slug FROM agencies WHERE LOWER(slug)='itsco'");
  if (agencies.length !== 1) throw Error('Expected one ITSCO agency.');
  const agency = agencies[0];
  const [documents] = await db.execute('SELECT * FROM workplace_handbook_documents WHERE agency_id=? FOR UPDATE', [agency.id]);
  if (documents.length !== 1) throw Error('Expected one handbook document.');
  const document = documents[0];
  const [versions] = await db.execute('SELECT * FROM workplace_handbook_versions WHERE document_id=? AND is_draft=1 FOR UPDATE', [document.id]);
  if (versions.length !== 1) throw Error('Expected one editable handbook draft.');
  const version = versions[0];
  const [sections] = await db.execute('SELECT * FROM workplace_handbook_sections WHERE version_id=? ORDER BY sort_order,id FOR UPDATE', [version.id]);
  const [digests] = await db.execute("SELECT * FROM workplace_handbook_digests WHERE agency_id=? AND period_label='November 2026' FOR UPDATE", [agency.id]);
  if (digests.length !== 1 || digests[0].status !== 'draft') throw Error('Expected one November 2026 draft; published updates are not editable.');
  const digest = digests[0];
  const [entries] = await db.execute('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=? ORDER BY sort_order,id FOR UPDATE', [digest.id]);
  const update = FLAT_ADDON_NOVEMBER_UPDATE;
  const matches = entries.filter(e => e.handbook_section_slug === FLAT_ADDON_HANDBOOK_SLUG || e.subject === update.subject);
  if (matches.length > 1) throw Error('Multiple flat add-on entries require reconciliation.');
  const entry = matches[0];
  const updateEntry = !!entry && (entry.subject !== update.subject || entry.rationale !== update.rationale || entry.changed_content !== update.changedContent || entry.handbook_section_slug !== FLAT_ADDON_HANDBOOK_SLUG);
  if (updateEntry && !process.argv.includes('--revise-existing-entry')) throw Error('An existing November entry differs; review and use --revise-existing-entry for an explicitly authorized draft correction.');
  const amended = applyFlatAddonHandbookAmendment({ sections: sections.map(s => ({
    slug: s.slug, parentSlug: s.parent_slug, title: s.title, status: s.content_status, bodyHtml: s.body_html
  })) }, 'itsco').sections;
  const changes = amended.flatMap(section => {
    const before = sections.find(s => s.slug === section.slug);
    if (before && before.title === section.title && before.body_html === section.bodyHtml) return [];
    if (!before && section.slug !== FLAT_ADDON_HANDBOOK_SLUG) throw Error('Unexpected new handbook section.');
    return [{ before, section }];
  });
  if (changes.some(c => ['school-mileage-reimbursement', 'mileage-reimbursement-policy', 'school-service-support-time', 'school-support-activity-hours'].includes(c.section.slug))) {
    throw Error('School mileage and School Support Hours must remain unchanged.');
  }
  const snapshot = { document, version, sections, digest, entries };
  const stateHash = hash(snapshot);
  const report = { mode: apply ? 'applied' : 'dry-run', agencyId: agency.id, versionId: version.id,
    stateHash, sectionChanges: changes.map(({ before, section }) => ({ id: before?.id || null, slug: section.slug, kind: before ? 'updated' : 'added', bodyHash: hash(section.bodyHtml) })),
    digestId: digest.id, digestStatus: digest.status, addNovemberEntry: !entry, updateNovemberEntry: updateEntry, publishedVersionId: document.published_version_id, messagesSent: 0 };
  if (apply && (changes.length || !entry || updateEntry)) {
    if (process.env.EXPECTED_STATE_HASH !== stateHash) throw Error('State changed or expected hash missing; review a fresh dry run.');
    if (!process.env.UPDATE_BACKUP_PATH) throw Error('A new private backup path is required.');
    fs.writeFileSync(process.env.UPDATE_BACKUP_PATH, JSON.stringify(snapshot, null, 2), { mode: 0o600, flag: 'wx' });
    for (const { before, section } of changes) {
      if (before) await db.execute('UPDATE workplace_handbook_sections SET title=?,body_html=? WHERE id=? AND version_id=?', [section.title, section.bodyHtml, before.id, version.id]);
      else await db.execute(`INSERT INTO workplace_handbook_sections
        (version_id,agency_id,sort_order,slug,title,body_html,parent_slug,content_status) VALUES(?,?,?,?,?,?,?,'ready')`,
      [version.id, agency.id, Math.max(0, ...sections.map(s => Number(s.sort_order) || 0)) + 1, section.slug, section.title, section.bodyHtml, section.parentSlug]);
    }
    if (!entry) await db.execute(`INSERT INTO workplace_handbook_digest_entries
      (digest_id,agency_id,sort_order,subject,rationale,changed_content,handbook_section_slug,change_kind,previous_content)
      VALUES(?,?,?,?,?,?,?,'added',?)`, [digest.id, agency.id, Math.max(0, ...entries.map(e => Number(e.sort_order) || 0)) + 1,
      update.subject, update.rationale, update.changedContent, FLAT_ADDON_HANDBOOK_SLUG,
      sections.filter(s => changes.some(c => c.before?.id === s.id)).map(s => `<h3>${s.title}</h3>${s.body_html}`).join('\n')]);
    if (updateEntry) await db.execute('UPDATE workplace_handbook_digest_entries SET subject=?,rationale=?,changed_content=?,handbook_section_slug=? WHERE id=? AND digest_id=?',
      [update.subject,update.rationale,update.changedContent,FLAT_ADDON_HANDBOOK_SLUG,entry.id,digest.id]);
    const actorUserId = Number(process.env.UPDATE_ACTOR_USER_ID);
    if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0) throw Error('An accountable actor is required.');
    const [audit] = await db.execute('INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES(?,?,?,?)',
      ['workplace_handbook_updated',actorUserId,agency.id,JSON.stringify({reason:'Flat add-on compensation and Colorado eligibility; November draft update',...report})]);
    report.auditId = audit.insertId;
    await db.commit();
  } else await db.rollback();
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await db.rollback();
  throw error;
} finally {
  await db.end();
}
