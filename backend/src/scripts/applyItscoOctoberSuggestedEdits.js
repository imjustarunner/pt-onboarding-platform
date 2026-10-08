/** Apply the supplied wording to existing ITSCO drafts. Dry run by default.
 * Does not send invitations, publish the handbook or change employee records. */
import fs from 'node:fs';
import pool from '../config/database.js';
import { itscoSuggestedTopicEdits } from '../content/itscoOctober2026SuggestedEdits.js';

const apply = process.argv.includes('--apply');
const handbookTopics = [
  ['spanish-language-intake', 'spanish_intake'],
  ['business-cards-and-public-profiles', 'business_cards'],
  ['office-kiosk-procedures', 'office_kiosk']
];
async function main() {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[update]] = await db.execute('SELECT * FROM admin_updates WHERE id=1 AND agency_id=2 FOR UPDATE');
    if (update?.status !== 'draft') throw new Error('The ITSCO Admin Update must still be an editable draft.');
    const [topics] = await db.execute('SELECT * FROM admin_update_topics WHERE update_id=1 FOR UPDATE');
    for (const key of Object.keys(itscoSuggestedTopicEdits)) {
      const topic = topics.find(t => t.topic_key === key);
      if (!topic) throw new Error(`Expected topic is missing: ${key}`);
      if (/<(?:img|video|iframe)\b/i.test(topic.body_html || '')) throw new Error(`Preserve embedded media before replacing ${key}.`);
    }
    const [[version]] = await db.execute('SELECT id FROM workplace_handbook_versions WHERE agency_id=2 AND is_draft=1 ORDER BY id DESC LIMIT 1 FOR UPDATE');
    const [sections] = version ? await db.execute('SELECT * FROM workplace_handbook_sections WHERE version_id=? FOR UPDATE', [version.id]) : [[]];
    const [[digest]] = await db.execute("SELECT id FROM workplace_handbook_digests WHERE agency_id=2 AND admin_update_id=1 AND status='draft' ORDER BY id DESC LIMIT 1 FOR UPDATE");
    const [entries] = digest ? await db.execute('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=? FOR UPDATE', [digest.id]) : [[]];
    if (apply) {
      if (!process.env.UPDATE_BACKUP_PATH) throw new Error('Set UPDATE_BACKUP_PATH to save the existing drafts before applying.');
      fs.writeFileSync(process.env.UPDATE_BACKUP_PATH, JSON.stringify({ update, topics, version, sections, digest, entries }, null, 2), { mode: 0o600, flag: 'wx' });
      for (const [key, edit] of Object.entries(itscoSuggestedTopicEdits)) {
        await db.execute('UPDATE admin_update_topics SET title=?,body_html=? WHERE update_id=1 AND topic_key=?', [edit.title, edit.body, key]);
      }
      for (const [slug, key] of handbookTopics) {
        const section = sections.find(s => s.slug === slug);
        if (!section) continue;
        await db.execute('UPDATE workplace_handbook_sections SET body_html=? WHERE id=? AND version_id=?', [itscoSuggestedTopicEdits[key].body, section.id, version.id]);
        const entry = entries.find(e => e.subject === section.title);
        if (entry) await db.execute('UPDATE workplace_handbook_digest_entries SET changed_content=? WHERE id=? AND digest_id=?', [itscoSuggestedTopicEdits[key].body, entry.id, digest.id]);
      }
      await db.commit();
    } else await db.rollback();
    console.log(JSON.stringify({ mode: apply ? 'applied-draft-edits' : 'dry-run', adminUpdateId: 1, topics: Object.keys(itscoSuggestedTopicEdits).length, handbookSections: handbookTopics.filter(([slug]) => sections.some(s => s.slug === slug)).length, staffRecordsChanged: 0, messagesSent: 0 }));
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
