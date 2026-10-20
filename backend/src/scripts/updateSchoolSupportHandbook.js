/**
 * Owner-approved October 20 wording and November update. No payroll or email changes.
 * Dry run first; apply requires the printed section hash and a new private backup path.
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { SCHOOL_SUPPORT_SECTION } from '../content/compensationHandbookClarifications.js';
import { SCHOOL_SUPPORT_HANDBOOK_SLUG, SCHOOL_SUPPORT_NOVEMBER_UPDATE } from '../content/schoolSupportHandbookAmendment.js';

const apply = process.argv.includes('--apply');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const db = await pool.getConnection();
try {
  await db.beginTransaction();
  const [[agency]] = await db.execute("SELECT id FROM agencies WHERE LOWER(slug)='itsco'");
  if (!agency) throw Error('ITSCO agency not found.');
  const [[document]] = await db.execute('SELECT * FROM workplace_handbook_documents WHERE agency_id=? FOR UPDATE', [agency.id]);
  if (!document) throw Error('Handbook document not found.');
  const [versions] = await db.execute('SELECT * FROM workplace_handbook_versions WHERE document_id=? AND is_draft=1 FOR UPDATE', [document.id]);
  if (versions.length !== 1) throw Error('Expected one editable handbook draft.');
  const version = versions[0];
  const [sections] = await db.execute('SELECT * FROM workplace_handbook_sections WHERE version_id=? FOR UPDATE', [version.id]);
  const targets = sections.filter(row => [SCHOOL_SUPPORT_SECTION.slug, SCHOOL_SUPPORT_HANDBOOK_SLUG].includes(row.slug));
  if (targets.length !== 1) throw Error('Expected one existing School Support Hours section.');
  const section = targets[0];
  const [digests] = await db.execute("SELECT * FROM workplace_handbook_digests WHERE agency_id=? AND period_label='November 2026' FOR UPDATE", [agency.id]);
  if (digests.length !== 1 || digests[0].status !== 'draft') throw Error('Expected one November 2026 draft; published updates are not editable.');
  const digest = digests[0];
  const [entries] = await db.execute('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=? FOR UPDATE', [digest.id]);
  const matches = entries.filter(row => [SCHOOL_SUPPORT_SECTION.slug, SCHOOL_SUPPORT_HANDBOOK_SLUG].includes(row.handbook_section_slug));
  if (matches.length > 1) throw Error('Multiple School Support Hours updates require reconciliation.');
  const entry = matches[0];
  const update = SCHOOL_SUPPORT_NOVEMBER_UPDATE;
  if (entry && (entry.subject !== update.subject || entry.rationale !== update.rationale
    || entry.changed_content !== update.changedContent || entry.handbook_section_slug !== SCHOOL_SUPPORT_HANDBOOK_SLUG)) {
    throw Error('A different November School Support Hours entry exists; preserve it for reconciliation.');
  }
  const sectionHash = hash([section.title, section.body_html]);
  const sectionChanged = section.title !== SCHOOL_SUPPORT_SECTION.title || section.body_html !== SCHOOL_SUPPORT_SECTION.bodyHtml;
  const report = { agencyId: agency.id, sectionId: section.id, sectionHash, sectionChanged,
    digestId: digest.id, digestStatus: digest.status, addNovemberEntry: !entry,
    handbookLink: SCHOOL_SUPPORT_HANDBOOK_SLUG, payrollChanged: false, messagesSent: 0 };
  if (apply && (sectionChanged || !entry)) {
    if (process.env.EXPECTED_SECTION_HASH !== sectionHash) throw Error('Section changed or expected hash missing; review a fresh dry run.');
    if (!process.env.UPDATE_BACKUP_PATH) throw Error('A new private backup path is required.');
    fs.writeFileSync(process.env.UPDATE_BACKUP_PATH, JSON.stringify({ document, version, sections, digest, entries }, null, 2), { mode: 0o600, flag: 'wx' });
    if (sectionChanged) await db.execute('UPDATE workplace_handbook_sections SET title=?,body_html=? WHERE id=? AND version_id=?',
      [SCHOOL_SUPPORT_SECTION.title, SCHOOL_SUPPORT_SECTION.bodyHtml, section.id, version.id]);
    if (!entry) {
      const order = Math.max(0, ...entries.map(row => Number(row.sort_order) || 0)) + 1;
      await db.execute(`INSERT INTO workplace_handbook_digest_entries
        (digest_id,agency_id,sort_order,subject,rationale,changed_content,handbook_section_slug,change_kind,previous_content)
        VALUES(?,?,?,?,?,?,?,'updated',?)`,
      [digest.id, agency.id, order, update.subject, update.rationale, update.changedContent, SCHOOL_SUPPORT_HANDBOOK_SLUG, section.body_html]);
    }
    await db.commit();
  } else await db.rollback();
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', ...report }));
} catch (error) {
  await db.rollback();
  throw error;
} finally {
  db.release();
  await pool.end();
}
