/**
 * In-app Workplace Handbook — versioned content, view tracking, People Ops Q&A.
 */
import pool from '../config/database.js';

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
  const [ins] = await pool.execute(
    `INSERT INTO workplace_handbook_documents (agency_id, title) VALUES (?, 'Workplace Handbook')`,
    [aid]
  );
  const [rows] = await pool.execute(`SELECT * FROM workplace_handbook_documents WHERE id = ?`, [
    ins.insertId
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
  return { document: doc, version, sections: sections || [] };
}

export async function getDraftOrCreate(agencyId, userId = null) {
  const doc = await ensureDocument(agencyId);
  const [drafts] = await pool.execute(
    `SELECT * FROM workplace_handbook_versions
     WHERE document_id = ? AND is_draft = 1
     ORDER BY version_number DESC LIMIT 1`,
    [doc.id]
  );
  if (drafts?.[0]) {
    const [sections] = await pool.execute(
      `SELECT * FROM workplace_handbook_sections WHERE version_id = ? ORDER BY sort_order ASC, id ASC`,
      [drafts[0].id]
    );
    return { document: doc, version: drafts[0], sections: sections || [] };
  }

  // Seed draft from published snapshot or empty
  const published = await getPublishedHandbook(agencyId);
  const [maxRows] = await pool.execute(
    `SELECT COALESCE(MAX(version_number), 0) AS max_v FROM workplace_handbook_versions WHERE document_id = ?`,
    [doc.id]
  );
  const nextNum = Number(maxRows?.[0]?.max_v || 0) + 1;
  const [ins] = await pool.execute(
    `INSERT INTO workplace_handbook_versions
      (document_id, agency_id, version_number, is_draft, changelog)
     VALUES (?, ?, ?, 1, ?)`,
    [doc.id, agencyId, nextNum, published.version ? `Draft based on v${published.version.version_number}` : 'Initial draft']
  );
  const versionId = ins.insertId;
  if (published.sections?.length) {
    for (const s of published.sections) {
      await pool.execute(
        `INSERT INTO workplace_handbook_sections
          (version_id, agency_id, sort_order, slug, title, body_html)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [versionId, agencyId, s.sort_order, s.slug, s.title, s.body_html]
      );
    }
  } else {
    await pool.execute(
      `INSERT INTO workplace_handbook_sections
        (version_id, agency_id, sort_order, slug, title, body_html)
       VALUES (?, ?, 0, 'welcome', 'Welcome', ?)`,
      [
        versionId,
        agencyId,
        '<p>Paste or write your workplace handbook content here. Publish when ready for providers.</p>'
      ]
    );
  }
  const [versions] = await pool.execute(`SELECT * FROM workplace_handbook_versions WHERE id = ?`, [
    versionId
  ]);
  const [sections] = await pool.execute(
    `SELECT * FROM workplace_handbook_sections WHERE version_id = ? ORDER BY sort_order ASC, id ASC`,
    [versionId]
  );
  return { document: doc, version: versions[0], sections: sections || [] };
}

export async function upsertDraftSection({
  agencyId,
  versionId,
  sectionId = null,
  title,
  bodyHtml,
  sortOrder = 0,
  slug = null
}) {
  const s = slug || slugify(title);
  if (sectionId) {
    await pool.execute(
      `UPDATE workplace_handbook_sections
       SET title = ?, body_html = ?, sort_order = ?, slug = ?
       WHERE id = ? AND version_id = ? AND agency_id = ?`,
      [title, bodyHtml, sortOrder, s, sectionId, versionId, agencyId]
    );
    return sectionId;
  }
  const [ins] = await pool.execute(
    `INSERT INTO workplace_handbook_sections
      (version_id, agency_id, sort_order, slug, title, body_html)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [versionId, agencyId, sortOrder, s, title, bodyHtml]
  );
  return ins.insertId;
}

export async function deleteDraftSection({ agencyId, versionId, sectionId }) {
  await pool.execute(
    `DELETE FROM workplace_handbook_sections WHERE id = ? AND version_id = ? AND agency_id = ?`,
    [sectionId, versionId, agencyId]
  );
}

export async function publishDraft({ agencyId, versionId, changelog, publishedByUserId }) {
  const [vers] = await pool.execute(
    `SELECT * FROM workplace_handbook_versions WHERE id = ? AND agency_id = ? LIMIT 1`,
    [versionId, agencyId]
  );
  const version = vers?.[0];
  if (!version) throw Object.assign(new Error('Version not found'), { status: 404 });
  if (!version.is_draft) throw Object.assign(new Error('Version already published'), { status: 400 });

  await pool.execute(
    `UPDATE workplace_handbook_versions
     SET is_draft = 0, published_at = UTC_TIMESTAMP(), published_by_user_id = ?, changelog = COALESCE(?, changelog)
     WHERE id = ?`,
    [publishedByUserId || null, changelog || null, versionId]
  );
  await pool.execute(
    `UPDATE workplace_handbook_documents SET published_version_id = ? WHERE agency_id = ?`,
    [versionId, agencyId]
  );
  return getPublishedHandbook(agencyId);
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

export async function askHandbookQuestion({
  agencyId,
  versionId,
  sectionId = null,
  askedByUserId,
  recipientId = null,
  questionText
}) {
  const text = String(questionText || '').trim();
  if (!text) throw Object.assign(new Error('Question is required'), { status: 400 });
  const [ins] = await pool.execute(
    `INSERT INTO workplace_handbook_questions
      (agency_id, version_id, section_id, asked_by_user_id, provider_update_recipient_id, question_text, status)
     VALUES (?, ?, ?, ?, ?, ?, 'escalated')`,
    [agencyId, versionId, sectionId, askedByUserId || null, recipientId, text]
  );

  // Best-effort People Ops task / notification via support ticket if available
  let supportTicketId = null;
  try {
    const SupportTicket = (await import('../models/SupportTicket.model.js')).default;
    if (SupportTicket?.create) {
      const ticket = await SupportTicket.create({
        agencyId,
        createdByUserId: askedByUserId,
        subject: 'Workplace Handbook question',
        description: text,
        category: 'people_operations',
        priority: 'medium',
        metadata: { handbookVersionId: versionId, handbookSectionId: sectionId, handbookQuestionId: ins.insertId }
      });
      supportTicketId = ticket?.id || null;
      if (supportTicketId) {
        await pool.execute(
          `UPDATE workplace_handbook_questions SET support_ticket_id = ? WHERE id = ?`,
          [supportTicketId, ins.insertId]
        );
      }
    }
  } catch {
    /* optional */
  }

  const [rows] = await pool.execute(`SELECT * FROM workplace_handbook_questions WHERE id = ?`, [
    ins.insertId
  ]);
  return rows[0];
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
  return {
    digest,
    entries: entries || [],
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

export async function updateDigest({
  digestId,
  agencyId,
  title,
  periodLabel,
  adminUpdateId,
  providerUpdatePushId,
  notes
}) {
  const existing = await getDigest(digestId, agencyId);
  if (!existing) throw Object.assign(new Error('Digest not found'), { status: 404 });
  await pool.execute(
    `UPDATE workplace_handbook_digests
     SET title = COALESCE(?, title),
         period_label = COALESCE(?, period_label),
         admin_update_id = COALESCE(?, admin_update_id),
         provider_update_push_id = COALESCE(?, provider_update_push_id),
         notes = COALESCE(?, notes)
     WHERE id = ? AND agency_id = ?`,
    [
      title != null ? String(title).trim().slice(0, 255) : null,
      periodLabel !== undefined ? (periodLabel ? String(periodLabel).trim().slice(0, 64) : null) : null,
      adminUpdateId !== undefined ? (adminUpdateId ? Number(adminUpdateId) : null) : null,
      providerUpdatePushId !== undefined
        ? providerUpdatePushId
          ? Number(providerUpdatePushId)
          : null
        : null,
      notes !== undefined ? (notes != null ? String(notes) : null) : null,
      digestId,
      agencyId
    ]
  );
  return getDigest(digestId, agencyId);
}

export async function upsertDigestEntry({
  agencyId,
  digestId,
  entryId = null,
  subject,
  rationale,
  changedContent,
  sortOrder = 0
}) {
  const digest = await getDigest(digestId, agencyId);
  if (!digest) throw Object.assign(new Error('Digest not found'), { status: 404 });
  const subj = String(subject || '').trim().slice(0, 500);
  if (!subj) throw Object.assign(new Error('Subject is required'), { status: 400 });
  if (entryId) {
    await pool.execute(
      `UPDATE workplace_handbook_digest_entries
       SET subject = ?, rationale = ?, changed_content = ?, sort_order = ?
       WHERE id = ? AND digest_id = ? AND agency_id = ?`,
      [
        subj,
        rationale != null ? String(rationale) : null,
        changedContent != null ? String(changedContent) : null,
        Number(sortOrder) || 0,
        entryId,
        digestId,
        agencyId
      ]
    );
  } else {
    await pool.execute(
      `INSERT INTO workplace_handbook_digest_entries
        (digest_id, agency_id, sort_order, subject, rationale, changed_content)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        digestId,
        agencyId,
        Number(sortOrder) || 0,
        subj,
        rationale != null ? String(rationale) : null,
        changedContent != null ? String(changedContent) : null
      ]
    );
  }
  return getDigest(digestId, agencyId);
}

export async function deleteDigestEntry({ agencyId, digestId, entryId }) {
  await pool.execute(
    `DELETE FROM workplace_handbook_digest_entries
     WHERE id = ? AND digest_id = ? AND agency_id = ?`,
    [entryId, digestId, agencyId]
  );
  return getDigest(digestId, agencyId);
}

export async function publishDigest({ agencyId, digestId, publishedByUserId }) {
  const existing = await getDigest(digestId, agencyId);
  if (!existing) throw Object.assign(new Error('Digest not found'), { status: 404 });
  await pool.execute(
    `UPDATE workplace_handbook_digests
     SET status = 'published', published_at = UTC_TIMESTAMP(), published_by_user_id = ?
     WHERE id = ? AND agency_id = ?`,
    [publishedByUserId || null, digestId, agencyId]
  );
  return getDigest(digestId, agencyId);
}

export { parseJson, slugify };
