/**
 * In-app Workplace Handbook — versioned content, view tracking, People Ops Q&A.
 */
import pool from '../config/database.js';
import { handbookUpdateLocations } from './handbookUpdateLocations.js';
import {prepareEncryptedTicketText} from '../utils/supportTicketCrypto.js';
import {resolveTrainingHtml} from './updateTrainingMedia.service.js';
import { cleanHandbookHtml, parseHandbookMetadata, mapHandbookReviewUpdates } from './workplaceHandbookContent.js';
import { publishHandbookVersion, sourceForAgency } from './workplaceHandbookWorkflow.service.js';

function slugify(title) {
  return String(title || 'section')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'section';
}

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function ensureDocument(agencyId) {
  const aid = Number(agencyId);
  const [existing] = await pool.execute(
    `SELECT * FROM workplace_handbook_documents WHERE agency_id = ? LIMIT 1`,
    [aid]
  );
  if (existing?.[0]) return existing[0];
  await pool.execute(
    `INSERT INTO workplace_handbook_documents (agency_id, title) VALUES (?, 'Workplace Handbook') ON DUPLICATE KEY UPDATE agency_id = VALUES(agency_id)`,
    [aid]
  );
  const [rows] = await pool.execute(`SELECT * FROM workplace_handbook_documents WHERE agency_id = ?`, [
    aid
  ]);
  return rows[0];
}

export async function getPublishedHandbook(agencyId) {
  const doc = await ensureDocument(agencyId);
  if (!doc.published_version_id) {
    return { document: doc, version: null, sections: [] };
  }
  const [versions] = await pool.execute(
    `SELECT * FROM workplace_handbook_versions WHERE id = ? LIMIT 1`,
    [doc.published_version_id]
  );
  const version = versions?.[0] || null;
  if (!version) return { document: doc, version: null, sections: [] };
  const [sections] = await pool.execute(
    `SELECT * FROM workplace_handbook_sections WHERE version_id = ? ORDER BY sort_order ASC, id ASC`,
    [version.id]
  );
  const [updates] = await pool.execute(`SELECT e.*, d.title AS digest_title, d.published_at, d.status, d.period_label
    FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id = e.digest_id
    WHERE d.agency_id = ? AND d.status = 'published'
      AND e.handbook_version_id IS NULL
    ORDER BY d.published_at DESC, d.id DESC, e.sort_order, e.id`, [agencyId]);
  const source = await sourceForAgency(agencyId, { includeCurrentForms: false });
  return { document: doc, version, metadata: parseHandbookMetadata(version.metadata_json), sections: await Promise.all((sections || []).map(async s => ({...s, body_html: await resolveTrainingHtml(s.body_html, agencyId)}))), updates: mapHandbookReviewUpdates(source, updates) };
}

async function withHandbookDraft(agencyId, versionId, edit) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Publication and edits acquire the document lock in the same order.
    const [documents] = await conn.execute('SELECT id FROM workplace_handbook_documents WHERE agency_id = ? FOR UPDATE', [agencyId]);
    if (!documents[0]) throw Object.assign(new Error('Handbook not found.'), { status: 404 });
    const [versions] = await conn.execute('SELECT * FROM workplace_handbook_versions WHERE id = ? AND agency_id = ? AND document_id = ? FOR UPDATE', [versionId, agencyId, documents[0].id]);
    if (!versions[0]?.is_draft) throw Object.assign(new Error('Only draft sections can be edited.'), { status: 409 });
    const result = await edit(conn);
    await conn.commit();
    return result;
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}

export async function getDraftOrCreate(agencyId, userId = null) {
  await ensureDocument(agencyId);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [documents] = await conn.execute('SELECT * FROM workplace_handbook_documents WHERE agency_id = ? FOR UPDATE', [agencyId]);
    const doc = documents[0];
    const [drafts] = await conn.execute('SELECT * FROM workplace_handbook_versions WHERE document_id = ? AND is_draft = 1 ORDER BY version_number DESC LIMIT 1', [doc.id]);
    let version = drafts[0];
    if (!version) {
      const [published] = doc.published_version_id ? await conn.execute('SELECT * FROM workplace_handbook_versions WHERE id = ?', [doc.published_version_id]) : [[]];
      const [max] = await conn.execute('SELECT COALESCE(MAX(version_number), 0) AS n FROM workplace_handbook_versions WHERE document_id = ?', [doc.id]);
      const [result] = await conn.execute('INSERT INTO workplace_handbook_versions (document_id, agency_id, version_number, is_draft, changelog, source_revision, metadata_json) VALUES (?, ?, ?, 1, ?, ?, ?)', [doc.id, agencyId, Number(max[0].n) + 1, published[0] ? `Draft based on v${published[0].version_number}` : 'Initial draft', published[0]?.source_revision || null, published[0]?.metadata_json ? JSON.stringify(parseHandbookMetadata(published[0].metadata_json)) : null]);
      const [created] = await conn.execute('SELECT * FROM workplace_handbook_versions WHERE id = ?', [result.insertId]);
      version = created[0];
      if (doc.published_version_id) {
        await conn.execute('INSERT INTO workplace_handbook_sections (version_id, agency_id, sort_order, slug, title, body_html, parent_slug, source_page, content_status, source_body_hash) SELECT ?, agency_id, sort_order, slug, title, body_html, parent_slug, source_page, content_status, source_body_hash FROM workplace_handbook_sections WHERE version_id = ?', [version.id, doc.published_version_id]);
      } else {
        await conn.execute("INSERT INTO workplace_handbook_sections (version_id, agency_id, sort_order, slug, title, body_html, content_status) VALUES (?, ?, 0, 'welcome', 'Welcome', '', 'pending')", [version.id, agencyId]);
      }
    }
    const [sections] = await conn.execute('SELECT * FROM workplace_handbook_sections WHERE version_id = ? ORDER BY sort_order, id', [version.id]);
    await conn.commit();
    return { document: doc, version, sections, metadata: parseHandbookMetadata(version.metadata_json) };
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}

function assertUnchangedSection(section, expected) {
  if (!expected) return;
  if (String(section.title) !== String(expected.title) || cleanHandbookHtml(section.body_html) !== cleanHandbookHtml(expected.bodyHtml) || Number(section.sort_order) !== Number(expected.sortOrder)) {
    throw Object.assign(new Error('This section was changed by another administrator. Reload it before saving.'), { status: 409 });
  }
}

export async function upsertDraftSection({ agencyId, versionId, sectionId = null, title, bodyHtml, sortOrder = 0, slug = null, expectedSection }) {
  if (!String(title || '').trim()) throw Object.assign(new Error('Section title is required.'), { status: 400 });
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) throw Object.assign(new Error('Section position must be a whole number of zero or greater.'), { status: 400 });
  const cleaned = cleanHandbookHtml(bodyHtml);
  return withHandbookDraft(agencyId, versionId, async conn => {
    if (sectionId) {
      const [sections] = await conn.execute('SELECT slug, title, body_html, sort_order FROM workplace_handbook_sections WHERE id = ? AND version_id = ? AND agency_id = ?', [sectionId, versionId, agencyId]);
      if (!sections[0]) throw Object.assign(new Error('Section not found.'), { status: 404 });
      assertUnchangedSection(sections[0], expectedSection);
      // The slug is a permanent identity, even when the title changes.
      await conn.execute("UPDATE workplace_handbook_sections SET title = ?, body_html = ?, sort_order = ?, content_status = 'ready' WHERE id = ? AND version_id = ? AND agency_id = ?", [title, cleaned, sortOrder, sectionId, versionId, agencyId]);
      return sectionId;
    }
    const stableSlug = slug || slugify(title);
    if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(stableSlug)) throw Object.assign(new Error('Invalid section link.'), { status: 400 });
    const [result] = await conn.execute('INSERT INTO workplace_handbook_sections (version_id, agency_id, sort_order, slug, title, body_html) VALUES (?, ?, ?, ?, ?, ?)', [versionId, agencyId, sortOrder, stableSlug, title, cleaned]);
    return result.insertId;
  });
}

export async function deleteDraftSection({ agencyId, versionId, sectionId, expectedSection }) {
  return withHandbookDraft(agencyId, versionId, async conn => {
    const [sections] = await conn.execute('SELECT slug, title, body_html, sort_order FROM workplace_handbook_sections WHERE id = ? AND version_id = ? AND agency_id = ?', [sectionId, versionId, agencyId]);
    if (!sections[0]) throw Object.assign(new Error('Section not found.'), { status: 404 });
    assertUnchangedSection(sections[0], expectedSection);
    if (!sections[0]) throw Object.assign(new Error('Section not found.'), { status: 404 });
    const [children] = await conn.execute('SELECT id FROM workplace_handbook_sections WHERE version_id = ? AND parent_slug = ? LIMIT 1', [versionId, sections[0].slug]);
    if (children.length) throw Object.assign(new Error('Move or remove the chapter’s child sections first.'), { status: 409 });
    await conn.execute('DELETE FROM workplace_handbook_sections WHERE id = ? AND version_id = ? AND agency_id = ?', [sectionId, versionId, agencyId]);
  });
}

export async function publishDraft(options) {
  const publication = await publishHandbookVersion(options);
  return { ...await getPublishedHandbook(options.agencyId), publication };
}

export async function recordHandbookView({
  agencyId,
  versionId,
  sectionId = null,
  userId = null,
  recipientId = null,
  eventType = 'open'
}) {
  await pool.execute(
    `INSERT INTO workplace_handbook_views
      (agency_id, version_id, section_id, user_id, provider_update_recipient_id, event_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [agencyId, versionId, sectionId, userId, recipientId, eventType]
  );
}

// Keep the Q&A record and its People Operations ticket in one transaction.
async function attachHandbookQuestionTicket(db,question){
  if(question.support_ticket_id)return question.support_ticket_id;
  const enc=prepareEncryptedTicketText(question.question_text);
  if(!enc.encrypted)throw Object.assign(new Error('Secure ticket storage is unavailable. Your question has not been sent; please try again.'),{status:503});
  const [ticket]=await db.execute(`INSERT INTO support_tickets
    (agency_id,school_organization_id,created_by_user_id,created_by_source_key,subject,question,
     question_ciphertext,question_iv,question_auth_tag,question_encryption_key_id,status,topic,priority)
    VALUES (?,?,?,'provider_update',?,?,?,?,?,?,'open','people_operations','medium')`,
    [question.agency_id,question.agency_id,question.asked_by_user_id,'Workplace Handbook question',enc.plain,enc.ciphertext,enc.iv,enc.authTag,enc.keyId]);
  await db.execute(`UPDATE workplace_handbook_questions SET support_ticket_id=?,status='escalated' WHERE id=?`,[ticket.insertId,question.id]);
  return ticket.insertId;
}

export async function recoverHandbookQuestionTicket(questionId){
  const db=await pool.getConnection();
  try{await db.beginTransaction();const [[question]]=await db.execute('SELECT * FROM workplace_handbook_questions WHERE id=? FOR UPDATE',[questionId]);
    if(!question)throw Object.assign(new Error('Handbook question not found'),{status:404});
    const ticketId=await attachHandbookQuestionTicket(db,question);await db.commit();return {questionId:question.id,ticketId};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}

export async function askHandbookQuestion({agencyId,versionId,sectionId=null,askedByUserId,recipientId=null,questionText}) {
  const text=String(questionText||'').trim();
  if(!text)throw Object.assign(new Error('Question is required'),{status:400});
  const db=await pool.getConnection();
  try{
    await db.beginTransaction();
    const [ins]=await db.execute(`INSERT INTO workplace_handbook_questions
      (agency_id,version_id,section_id,asked_by_user_id,provider_update_recipient_id,question_text,status)
      VALUES (?,?,?,?,?,?,'open')`,[agencyId,versionId,sectionId,askedByUserId||null,recipientId,text]);
    await attachHandbookQuestionTicket(db,{id:ins.insertId,agency_id:agencyId,asked_by_user_id:askedByUserId||null,question_text:text});
    const [[question]]=await db.execute('SELECT * FROM workplace_handbook_questions WHERE id=?',[ins.insertId]);
    await db.commit();return question;
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}

export async function listHandbookQuestions(agencyId, { status = null } = {}) {
  const params = [agencyId];
  let sql = `SELECT q.*,
                    s.title AS section_title,
                    u.first_name, u.last_name, u.email
             FROM workplace_handbook_questions q
             LEFT JOIN workplace_handbook_sections s ON s.id = q.section_id
             LEFT JOIN users u ON u.id = q.asked_by_user_id
             WHERE q.agency_id = ?`;
  if (status) {
    sql += ` AND q.status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY q.created_at DESC LIMIT 200`;
  const [rows] = await pool.execute(sql, params);
  return rows || [];
}

/** Full handbook lives outside the app (Google Doc). Digests are monthly change lists. */
export async function setFullHandbookUrl(agencyId, url) {
  const doc = await ensureDocument(agencyId);
  await pool.execute(
    `UPDATE workplace_handbook_documents SET full_handbook_url = ? WHERE id = ?`,
    [url ? String(url).trim().slice(0, 1000) : null, doc.id]
  );
  return ensureDocument(agencyId);
}

export async function listDigests(agencyId) {
  const [rows] = await pool.execute(
    `SELECT d.*,
            (SELECT COUNT(*) FROM workplace_handbook_digest_entries e WHERE e.digest_id = d.id) AS entry_count
     FROM workplace_handbook_digests d
     WHERE d.agency_id = ?
     ORDER BY COALESCE(d.published_at, d.updated_at) DESC, d.id DESC
     LIMIT 50`,
    [Number(agencyId)]
  );
  return rows || [];
}

export async function getDigest(digestId, agencyId = null) {
  const params = [Number(digestId)];
  let sql = `SELECT * FROM workplace_handbook_digests WHERE id = ?`;
  if (agencyId) {
    sql += ` AND agency_id = ?`;
    params.push(Number(agencyId));
  }
  sql += ` LIMIT 1`;
  const [rows] = await pool.execute(sql, params);
  const digest = rows?.[0];
  if (!digest) return null;
  const [entries] = await pool.execute(
    `SELECT * FROM workplace_handbook_digest_entries
     WHERE digest_id = ? ORDER BY sort_order ASC, id ASC`,
    [digest.id]
  );
  const doc = await ensureDocument(digest.agency_id);
  const source = await sourceForAgency(digest.agency_id, { includeCurrentForms: false });
  const [[agency]] = await pool.execute('SELECT slug FROM agencies WHERE id = ? LIMIT 1', [digest.agency_id]);
  const published = doc.published_version_id ? await getPublishedHandbook(digest.agency_id) : null;
  const locatedEntries = handbookUpdateLocations(agency, entries || [], published);
  return {
    digest,
    entries: mapHandbookReviewUpdates(source, await Promise.all(locatedEntries.map(async e => ({ ...e, changed_content: await resolveTrainingHtml(e.changed_content, digest.agency_id), status: digest.status, period_label: digest.period_label })))),
    fullHandbookUrl: doc.full_handbook_url || null
  };
}

export async function getPublishedDigestForAgency(agencyId, { adminUpdateId = null, pushId = null } = {}) {
  const aid = Number(agencyId);
  let row = null;
  if (pushId) {
    const [byPush] = await pool.execute(
      `SELECT * FROM workplace_handbook_digests
       WHERE agency_id = ? AND provider_update_push_id = ? AND status = 'published'
       ORDER BY id DESC LIMIT 1`,
      [aid, Number(pushId)]
    );
    row = byPush?.[0] || null;
  }
  if (!row && adminUpdateId) {
    const [byAu] = await pool.execute(
      `SELECT * FROM workplace_handbook_digests
       WHERE agency_id = ? AND admin_update_id = ? AND status = 'published'
       ORDER BY id DESC LIMIT 1`,
      [aid, Number(adminUpdateId)]
    );
    row = byAu?.[0] || null;
  }
  if (!row) {
    const [latest] = await pool.execute(
      `SELECT * FROM workplace_handbook_digests
       WHERE agency_id = ? AND status = 'published'
       ORDER BY COALESCE(published_at, updated_at) DESC, id DESC
       LIMIT 1`,
      [aid]
    );
    row = latest?.[0] || null;
  }
  if (!row) {
    const doc = await ensureDocument(aid);
    return { digest: null, entries: [], fullHandbookUrl: doc.full_handbook_url || null };
  }
  return getDigest(row.id, aid);
}

export async function createDigest({
  agencyId,
  title,
  periodLabel,
  adminUpdateId = null,
  providerUpdatePushId = null,
  notes = null
}) {
  const [ins] = await pool.execute(
    `INSERT INTO workplace_handbook_digests
      (agency_id, title, period_label, admin_update_id, provider_update_push_id, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
    [
      Number(agencyId),
      String(title || 'Handbook Updates').trim().slice(0, 255),
      periodLabel ? String(periodLabel).trim().slice(0, 64) : null,
      adminUpdateId ? Number(adminUpdateId) : null,
      providerUpdatePushId ? Number(providerUpdatePushId) : null,
      notes != null ? String(notes) : null
    ]
  );
  return getDigest(ins.insertId, agencyId);
}

async function editDigestDraft(digestId, agencyId, edit) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM workplace_handbook_digests WHERE id = ? AND agency_id = ? FOR UPDATE', [digestId, agencyId]);
    if (!rows[0]) throw Object.assign(new Error('Digest not found'), { status: 404 });
    if (rows[0].status !== 'draft') throw Object.assign(new Error('Published updates are preserved. Create a new digest for further changes.'), { status: 409 });
    await edit(conn, rows[0]);
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
  return getDigest(digestId, agencyId);
}

export async function updateDigest({ digestId, agencyId, title, periodLabel, adminUpdateId, providerUpdatePushId, notes }) {
  return editDigestDraft(digestId, agencyId, async conn => {
    for (const [table, id] of [['admin_updates', adminUpdateId], ['provider_update_pushes', providerUpdatePushId]]) {
      if (!id) continue;
      const [rows] = await conn.execute(`SELECT id FROM ${table} WHERE id = ? AND agency_id = ?`, [id, agencyId]);
      if (!rows[0]) throw Object.assign(new Error('The selected update is not available for this organization.'), { status: 400 });
    }
    await conn.execute(`UPDATE workplace_handbook_digests SET title = COALESCE(?, title), period_label = COALESCE(?, period_label), admin_update_id = COALESCE(?, admin_update_id), provider_update_push_id = COALESCE(?, provider_update_push_id), notes = COALESCE(?, notes) WHERE id = ? AND agency_id = ?`, [title != null ? String(title).trim().slice(0,255) : null, periodLabel || null, adminUpdateId || null, providerUpdatePushId || null, notes || null, digestId, agencyId]);
  });
}

export async function upsertDigestEntry({ agencyId, digestId, entryId = null, subject, rationale, changedContent, sortOrder = 0, sectionSlug }) {
  const subj = String(subject || '').trim().slice(0, 500);
  if (!subj) throw Object.assign(new Error('Subject is required'), { status: 400 });
  if (sectionSlug) {
    const source = await sourceForAgency(agencyId, { includeCurrentForms: false });
    const [rows] = await pool.execute('SELECT s.slug FROM workplace_handbook_sections s JOIN workplace_handbook_documents d ON d.published_version_id = s.version_id WHERE d.agency_id = ? AND s.slug = ? LIMIT 1', [agencyId, sectionSlug]);
    if (!rows.length && !source?.sections.some(s => s.slug === sectionSlug)) throw Object.assign(new Error('Handbook section not found.'), { status: 400 });
  }
  return editDigestDraft(digestId, agencyId, async conn => {
    if (entryId) {
      const [entries] = await conn.execute('SELECT * FROM workplace_handbook_digest_entries WHERE id = ? AND digest_id = ? AND agency_id = ?', [entryId, digestId, agencyId]);
      const existing = entries[0];
      if (!existing) throw Object.assign(new Error('Update entry not found'), { status: 404 });
      if (existing.handbook_version_id && (String(changedContent ?? '') !== String(existing.changed_content ?? '') || (sectionSlug !== undefined && sectionSlug !== existing.handbook_section_slug))) throw Object.assign(new Error('Generated updates retain the published wording and section. Change the handbook in a new version.'), { status: 409 });
      await conn.execute('UPDATE workplace_handbook_digest_entries SET subject = ?, rationale = ?, changed_content = ?, sort_order = ?, handbook_section_slug = ? WHERE id = ? AND digest_id = ? AND agency_id = ?', [subj, rationale ?? null, changedContent ?? null, Number(sortOrder) || 0, sectionSlug === undefined ? existing.handbook_section_slug : sectionSlug || null, entryId, digestId, agencyId]);
    } else {
      await conn.execute('INSERT INTO workplace_handbook_digest_entries (digest_id, agency_id, sort_order, subject, rationale, changed_content, handbook_section_slug) VALUES (?, ?, ?, ?, ?, ?, ?)', [digestId, agencyId, Number(sortOrder) || 0, subj, rationale ?? null, changedContent ?? null, sectionSlug || null]);
    }
  });
}

export async function deleteDigestEntry({ agencyId, digestId, entryId }) {
  return editDigestDraft(digestId, agencyId, async conn => {
    const [entries] = await conn.execute('SELECT handbook_version_id FROM workplace_handbook_digest_entries WHERE id = ? AND digest_id = ? AND agency_id = ?', [entryId, digestId, agencyId]);
    if (!entries[0]) throw Object.assign(new Error('Update entry not found'), { status: 404 });
    if (entries[0].handbook_version_id) throw Object.assign(new Error('Generated handbook history cannot be deleted.'), { status: 409 });
    await conn.execute('DELETE FROM workplace_handbook_digest_entries WHERE id = ? AND digest_id = ? AND agency_id = ?', [entryId, digestId, agencyId]);
  });
}

export async function publishDigest({ agencyId, digestId, publishedByUserId }) {
  return editDigestDraft(digestId, agencyId, async conn => {
    const [entries] = await conn.execute('SELECT id FROM workplace_handbook_digest_entries WHERE digest_id = ? LIMIT 1', [digestId]);
    if (!entries.length) throw Object.assign(new Error('Add at least one handbook update before publishing.'), { status: 400 });
    await conn.execute("UPDATE workplace_handbook_digests SET status = 'published', published_at = UTC_TIMESTAMP(), published_by_user_id = ? WHERE id = ? AND agency_id = ?", [publishedByUserId || null, digestId, agencyId]);
  });
}

export { parseJson, slugify };
