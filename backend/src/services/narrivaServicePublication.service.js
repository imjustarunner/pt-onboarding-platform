import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { clinicalServiceHandbookSections, H2011_HANDBOOK_SLUG, NARRIVA_SERVICE_RELEASE } from '../content/narrivaServiceHandbookAmendment.js';
import sanitizeHtml from 'sanitize-html';
const cleanHandbookHtml = value => sanitizeHtml(String(value || ''));
const handbookBodyHash = value => createHash('sha256').update(cleanHandbookHtml(value)).digest('hex');

export const CLINICAL_AGENCIES_SQL = `SELECT a.id, a.slug FROM agencies a
 WHERE COALESCE(a.is_active,1)=1
 AND (a.organization_type IS NULL OR a.organization_type NOT IN ('school','program','learning'))
 AND (EXISTS(SELECT 1 FROM agency_medical_service_codes m WHERE m.agency_id=a.id)
   OR EXISTS(SELECT 1 FROM agency_business_types b WHERE b.agency_id=a.id
     AND b.business_type IN ('mental_health','healthcare') AND b.is_enabled=1))`;
export async function listNarrivaClinicalAgencies(db = pool) {
  const [rows] = await db.execute(CLINICAL_AGENCIES_SQL + ' ORDER BY a.id');
  return rows;
}

/** Publish only this additive section and its dedicated November addendum.
 * Never publish/replace a user's draft, resend an update or mutate old versions.
 * Default is a read-only preview. Callers must explicitly request apply.
 */
export async function publishNarrivaServiceAmendment({ agencyId, actorUserId = null, apply = false }, db = pool) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [agencies] = await conn.execute(CLINICAL_AGENCIES_SQL + ' AND a.id = ? FOR UPDATE', [agencyId]);
    if (!agencies[0]) throw Object.assign(new Error('An active clinical company is required.'), { status: 404 });
    const result = { agencyId: Number(agencyId), slug: agencies[0].slug, applied: apply, handbookStatus: 'no-published-handbook', digestStatus: 'missing-release-draft' };
    const [[doc]] = await conn.execute('SELECT * FROM workplace_handbook_documents WHERE agency_id = ? FOR UPDATE', [agencyId]);
    let newVersionId = null;
    if (doc?.published_version_id) {
      const [[published]] = await conn.execute('SELECT * FROM workplace_handbook_versions WHERE id = ? AND document_id = ?', [doc.published_version_id, doc.id]);
      const [sections] = await conn.execute('SELECT * FROM workplace_handbook_sections WHERE version_id = ? ORDER BY sort_order,id', [doc.published_version_id]);
      const [drafts] = await conn.execute('SELECT id FROM workplace_handbook_versions WHERE document_id = ? AND is_draft = 1', [doc.id]);
      const additions = clinicalServiceHandbookSections();
      const present = additions.filter(addition => sections.some(section => section.slug === addition.slug));
      const conflicts = present.some(addition => cleanHandbookHtml(sections.find(section => section.slug === addition.slug).body_html) !== cleanHandbookHtml(addition.bodyHtml));
      if (conflicts) result.handbookStatus = 'section-collision';
      else if (present.length === additions.length) result.handbookStatus = 'already-published';
      else if (drafts.length) result.handbookStatus = 'draft-collision';
      else {
        result.handbookStatus = apply ? 'published' : 'ready-to-publish';
        if (apply) {
          const metadata = typeof published.metadata_json === 'string' ? published.metadata_json : JSON.stringify(published.metadata_json || {});
          const [[max]] = await conn.execute('SELECT MAX(version_number) AS n FROM workplace_handbook_versions WHERE document_id = ?', [doc.id]);
          const revision = createHash('sha256').update(`${published.source_revision || ''}:${NARRIVA_SERVICE_RELEASE}`).digest('hex');
          const [version] = await conn.execute(`INSERT INTO workplace_handbook_versions
            (document_id,agency_id,version_number,is_draft,source_revision,metadata_json,changelog)
            VALUES(?,?,?,1,?,?,?)`, [doc.id,agencyId,Number(max.n || 0)+1,revision,metadata,'Add H2011 service reference; preserve all prior company wording']);
          newVersionId = version.insertId;
          await conn.execute(`INSERT INTO workplace_handbook_sections
            (version_id,agency_id,sort_order,slug,title,body_html,parent_slug,source_page,content_status,source_body_hash)
            SELECT ?,agency_id,sort_order,slug,title,body_html,parent_slug,source_page,content_status,source_body_hash
            FROM workplace_handbook_sections WHERE version_id = ?`, [newVersionId,doc.published_version_id]);
          let order = Math.max(-1,...sections.map(section => Number(section.sort_order))) + 1;
          for (const addition of additions.filter(addition => !present.some(section => section.slug === addition.slug))) {
            const body = cleanHandbookHtml(addition.bodyHtml);
            await conn.execute(`INSERT INTO workplace_handbook_sections
              (version_id,agency_id,sort_order,slug,title,body_html,parent_slug,source_page,content_status,source_body_hash)
              VALUES(?,?,?,?,?,?,?,?,'ready',?)`, [newVersionId,agencyId,order++,addition.slug,addition.title,body,addition.parentSlug,addition.sourcePage,handbookBodyHash(body)]);
          }
          await conn.execute('UPDATE workplace_handbook_versions SET is_draft=0,published_at=UTC_TIMESTAMP(),published_by_user_id=? WHERE id=?', [actorUserId,newVersionId]);
          await conn.execute('UPDATE workplace_handbook_documents SET published_version_id=? WHERE id=?', [newVersionId,doc.id]);
          result.versionId = newVersionId;
        }
      }
    }
    const [[digest]] = await conn.execute('SELECT * FROM workplace_handbook_digests WHERE agency_id=? AND notes=? ORDER BY id DESC LIMIT 1 FOR UPDATE', [agencyId,NARRIVA_SERVICE_RELEASE]);
    if (digest) {
      const [entries] = await conn.execute('SELECT id,handbook_section_slug FROM workplace_handbook_digest_entries WHERE digest_id=?', [digest.id]);
      const ownOnly = entries.length === 1 && entries[0].handbook_section_slug === H2011_HANDBOOK_SLUG;
      result.digestId = digest.id;
      if (digest.status === 'published') result.digestStatus = 'already-published';
      else if (!ownOnly) result.digestStatus = 'draft-collision';
      else {
        result.digestStatus = apply ? 'published' : 'ready-to-publish';
        if (apply) {
          // A collision leaves the full handbook unchanged, while this explicit
          // addendum supplies the independently authorized November service text.
          await conn.execute("UPDATE workplace_handbook_digests SET status='published',published_at=UTC_TIMESTAMP(),published_by_user_id=? WHERE id=? AND status='draft'", [actorUserId,digest.id]);
          if (newVersionId) await conn.execute('UPDATE workplace_handbook_digest_entries SET handbook_version_id=? WHERE id=?', [newVersionId,entries[0].id]);
        }
      }
    }
    if (apply) await conn.commit(); else await conn.rollback();
    return result;
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
