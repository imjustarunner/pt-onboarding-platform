// Synchronize only the existing draft entries covered by the approved handbook
// reconciliation. Default is a dry run; concurrent edits and publication abort.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const read = name => JSON.parse(readFileSync(new URL(`../content/handbooks/${name}`, import.meta.url), 'utf8'));
const original = read('itsco-updates-before-reconciliation.json').updates;
const desired = read('itsco-draft-updates.json').updates;
const source = read('itsco.json');
const apply = process.argv.includes('--apply');
const hash = value => createHash('sha256').update(String(value || '')).digest('hex');
const connection = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3307), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
try {
  await connection.beginTransaction();
  const [agencies] = await connection.execute('SELECT id FROM agencies WHERE slug = ?', ['itsco']);
  if (agencies.length !== 1) throw new Error('Expected exactly one ITSCO organization.');
  const agencyId = agencies[0].id;
  const [columns] = await connection.execute("SHOW COLUMNS FROM workplace_handbook_digest_entries LIKE 'handbook_section_slug'");
  const hasSectionColumn = columns.length > 0;
  const plan = [];
  for (const entry of desired) {
    const before = original.find(e => e.id === entry.id && e.digest_id === entry.digest_id);
    if (!before) throw new Error(`Missing original entry ${entry.id}.`);
    for (const slug of entry.policy_section_slugs || []) if (!source.sections.some(s => s.slug === slug && s.status === 'ready')) throw new Error(`Policy ${slug} is not ready.`);
    const [rows] = await connection.execute(`SELECT e.*, d.status FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE e.id=? AND e.digest_id=? AND e.agency_id=? AND d.agency_id=? FOR UPDATE`, [entry.id, entry.digest_id, agencyId, agencyId]);
    const live = rows[0];
    if (!live || live.status !== 'draft') throw new Error(`Entry ${entry.id} is missing or no longer a draft.`);
    if (live.subject !== before.subject || (live.rationale || '') !== (before.rationale || '')) throw new Error(`Entry ${entry.id} was edited since reconciliation. Reload before replacing it.`);
    if (hash(live.changed_content) !== hash(before.changed_content) && hash(live.changed_content) !== hash(entry.changed_content)) throw new Error(`Entry ${entry.id} has newer wording. Reconciliation stopped.`);
    const changed = hash(live.changed_content) !== hash(entry.changed_content) || (hasSectionColumn && live.handbook_section_slug !== entry.handbook_section_slug);
    plan.push({ id: entry.id, digestId: entry.digest_id, subject: entry.subject, changed, beforeHash: hash(live.changed_content), afterHash: hash(entry.changed_content), policySectionSlugs: entry.policy_section_slugs });
  }
  if (apply) {
    for (const item of plan.filter(p => p.changed)) {
      const entry = desired.find(e => e.id === item.id);
      const sql = hasSectionColumn ? 'UPDATE workplace_handbook_digest_entries SET changed_content=?, handbook_section_slug=? WHERE id=? AND digest_id=? AND agency_id=?' : 'UPDATE workplace_handbook_digest_entries SET changed_content=? WHERE id=? AND digest_id=? AND agency_id=?';
      const params = [entry.changed_content, ...(hasSectionColumn ? [entry.handbook_section_slug] : []), entry.id, entry.digest_id, agencyId];
      await connection.execute(sql, params);
    }
    for (const digestId of new Set(plan.filter(p => p.changed).map(p => p.digestId))) await connection.execute('UPDATE workplace_handbook_digests SET updated_at=UTC_TIMESTAMP() WHERE id=? AND agency_id=? AND status=\'draft\'', [digestId, agencyId]);
    await connection.commit();
  } else await connection.rollback();
  const result = { mode: apply ? 'applied' : 'dry-run', recordedAt: new Date().toISOString(), agencyId, reviewed: plan.length, changed: plan.filter(p => p.changed).length, hasSectionColumn, published: false, plan };
  if (apply) writeFileSync(fileURLToPath(new URL('../../../deliverables/handbook-verification/updater-reconciliation.json', import.meta.url)), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await connection.rollback();
  throw error;
} finally { await connection.end(); }
