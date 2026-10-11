import pool from '../config/database.js';
import EmployeeEvaluationTemplate from '../models/EmployeeEvaluationTemplate.model.js';
import { handbookTenant } from './handbookTenant.js';
import { getHandbookSource, handbookMetadata, mergeSuppliedSections, handbookChanges, cleanHandbookHtml, validateHandbookSections } from './workplaceHandbookContent.js';
import { companyHandbookReadiness, companyHandbookSource, mergeCompanyHandbookSource } from './workplaceDocumentTemplates.js';
import { parseHandbookMetadata } from './workplaceHandbookContent.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });

export async function sourceForAgency(agencyId, { includeCurrentForms = true } = {}) {
  const [rows] = await pool.execute('SELECT id, slug, name, logo_url, color_palette FROM agencies WHERE id = ? LIMIT 1', [agencyId]);
  if (!rows[0]) return null;
  if (!handbookTenant(rows[0])) {
    const [assignments] = await pool.execute("SELECT * FROM workplace_document_assignments WHERE agency_id = ? AND document_key = 'workplace-handbook'", [agencyId]);
    return assignments[0] ? companyHandbookSource(rows[0], assignments[0]) : null;
  }
  const employeeTemplates = includeCurrentForms ? await EmployeeEvaluationTemplate.listForAgency(agencyId) : undefined;
  return getHandbookSource(rows[0], { employeeTemplates });
}

async function lockDocument(conn, agencyId) {
  await conn.execute("INSERT INTO workplace_handbook_documents (agency_id, title) VALUES (?, 'Workplace Handbook') ON DUPLICATE KEY UPDATE agency_id = VALUES(agency_id)", [agencyId]);
  const [rows] = await conn.execute('SELECT * FROM workplace_handbook_documents WHERE agency_id = ? FOR UPDATE', [agencyId]);
  return rows[0];
}

async function sectionsForVersion(conn, versionId) {
  if (!versionId) return [];
  const [rows] = await conn.execute('SELECT * FROM workplace_handbook_sections WHERE version_id = ? ORDER BY sort_order, id', [versionId]);
  return rows;
}

export async function stageHandbookSource({ agencyId, expectedPublishedVersionId, sourceRevision }) {
  const source = await sourceForAgency(agencyId);
  if (!source) throw fail('No supplied handbook is available for this organization.', 404);
  if (sourceRevision !== source.revision) throw fail('The supplied content has changed. Reload its preview before adding it.');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const doc = await lockDocument(conn, agencyId);
    if (Number(doc.published_version_id || 0) !== Number(expectedPublishedVersionId || 0)) throw fail('The handbook has changed. Reload before preparing this draft.');
    const previous = await sectionsForVersion(conn, doc.published_version_id);
    let priorMetadata = {};
    if (doc.published_version_id) {
      const [published] = await conn.execute('SELECT source_revision, metadata_json FROM workplace_handbook_versions WHERE id = ?', [doc.published_version_id]);
      priorMetadata = parseHandbookMetadata(published[0]?.metadata_json);
      if (published[0]?.source_revision === source.revision) throw fail('This supplied content is already published.');
    }
    const [drafts] = await conn.execute('SELECT * FROM workplace_handbook_versions WHERE document_id = ? AND is_draft = 1 ORDER BY version_number DESC LIMIT 1 FOR UPDATE', [doc.id]);
    let draft = drafts[0];
    if (draft) {
      const current = await sectionsForVersion(conn, draft.id);
      if (draft.source_revision === source.revision) {
        await conn.commit();
        return { versionId: draft.id, alreadyStaged: true };
      }
      const emptyStarter = current.length === 1 && current[0].slug === 'welcome' && ((!current[0].body_html && current[0].content_status === 'pending') || current[0].body_html === '<p>Paste or write your workplace handbook content here. Publish when ready for providers.</p>');
      const comparable = values => JSON.stringify(values.map(s => [s.slug, s.title, s.parent_slug || null, Number(s.sort_order), s.content_status, cleanHandbookHtml(s.body_html)]));
      if (!emptyStarter && comparable(previous) !== comparable(current)) {
        throw fail('An existing draft has changes. Publish or finish that draft before importing more content.');
      }
      await conn.execute('DELETE FROM workplace_handbook_sections WHERE version_id = ?', [draft.id]);
      await conn.execute('UPDATE workplace_handbook_versions SET source_revision = ?, metadata_json = ? WHERE id = ?', [source.revision, JSON.stringify(handbookMetadata(source)), draft.id]);
    } else {
      const [max] = await conn.execute('SELECT COALESCE(MAX(version_number), 0) AS n FROM workplace_handbook_versions WHERE document_id = ?', [doc.id]);
      const [result] = await conn.execute('INSERT INTO workplace_handbook_versions (document_id, agency_id, version_number, is_draft, source_revision, metadata_json, changelog) VALUES (?, ?, ?, 1, ?, ?, ?)', [doc.id, agencyId, Number(max[0].n) + 1, source.revision, JSON.stringify(handbookMetadata(source)), 'Supplied handbook content']);
      draft = { id: result.insertId };
    }
    const sections = source.template ? mergeCompanyHandbookSource(source, previous, priorMetadata) : mergeSuppliedSections(source.sections, previous, source.removedSectionSlugs);
    for (const section of sections) {
      await conn.execute('INSERT INTO workplace_handbook_sections (version_id, agency_id, sort_order, slug, title, body_html, parent_slug, source_page, content_status, source_body_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [draft.id, agencyId, section.sort_order, section.slug, section.title, cleanHandbookHtml(section.body_html), section.parent_slug || null, section.source_page || null, section.content_status || 'ready', section.source_body_hash || null]);
    }
    await conn.commit();
    return { versionId: draft.id, sectionCount: sections.length };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

export async function publishHandbookVersion({ agencyId, versionId, changelog, publishedByUserId, adminUpdateId = null, pushId = null }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const doc = await lockDocument(conn, agencyId);
    const [versions] = await conn.execute('SELECT * FROM workplace_handbook_versions WHERE id = ? AND document_id = ? AND agency_id = ? FOR UPDATE', [versionId, doc.id, agencyId]);
    const version = versions[0];
    if (!version) throw fail('Version not found.', 404);
    // Retrying a successful publish must never create a second update entry.
    if (!version.is_draft) {
      await conn.commit();
      return { versionId, alreadyPublished: true };
    }
    if (doc.published_version_id) {
      const [published] = await conn.execute('SELECT version_number FROM workplace_handbook_versions WHERE id = ?', [doc.published_version_id]);
      if (Number(published[0]?.version_number) >= Number(version.version_number)) throw fail('A newer handbook version has already been published. Reload before publishing.');
    }
    const sections = await sectionsForVersion(conn, versionId);
    validateHandbookSections(sections);
    const outstanding = companyHandbookReadiness(parseHandbookMetadata(version.metadata_json), sections);
    if (outstanding.length) throw fail(`Complete the company policies before publishing: ${outstanding.map(s => s.title).join('; ')}.`, 400);
    if (!sections.some(s => s.content_status === 'ready' && cleanHandbookHtml(s.body_html).trim())) throw fail('Add section content before publishing.', 400);
    const previous = await sectionsForVersion(conn, doc.published_version_id);
    const changes = doc.published_version_id ? handbookChanges(previous, sections) : [];
    let digestId = null;
    if (changes.length) {
      if (pushId) {
        const [pushes] = await conn.execute('SELECT id, attached_admin_update_id FROM provider_update_pushes WHERE id = ? AND agency_id = ?', [pushId, agencyId]);
        if (!pushes[0]) throw fail('The selected Provider Update belongs to another organization or no longer exists.', 400);
        adminUpdateId = pushes[0].attached_admin_update_id || adminUpdateId;
      }
      if (adminUpdateId) {
        const [updates] = await conn.execute('SELECT id FROM admin_updates WHERE id = ? AND agency_id = ?', [adminUpdateId, agencyId]);
        if (!updates[0]) throw fail('The selected Admin Update belongs to another organization or no longer exists.', 400);
      }
      const period = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Denver' });
      // Respect an explicitly selected update. Without one, the latest open
      // organization digest is the destination, regardless of its display label.
      const clause = pushId ? 'AND provider_update_push_id = ?' : adminUpdateId ? 'AND admin_update_id = ? AND provider_update_push_id IS NULL' : '';
      const params = pushId || adminUpdateId ? [agencyId, pushId || adminUpdateId] : [agencyId];
      const [digests] = await conn.execute(`SELECT id FROM workplace_handbook_digests WHERE agency_id = ? AND status = 'draft' ${clause} ORDER BY updated_at DESC, id DESC LIMIT 1 FOR UPDATE`, params);
      digestId = digests[0]?.id;
      if (!digestId) {
        const [result] = await conn.execute("INSERT INTO workplace_handbook_digests (agency_id, title, period_label, admin_update_id, provider_update_push_id, status) VALUES (?, ?, ?, ?, ?, 'draft')", [agencyId, `${period} Handbook Updates`, period, adminUpdateId, pushId]);
        digestId = result.insertId;
      }
      const [orders] = await conn.execute('SELECT COALESCE(MAX(sort_order), -1) AS last_order FROM workplace_handbook_digest_entries WHERE digest_id = ?', [digestId]);
      let order = Number(orders[0].last_order) + 1;
      for (const change of changes) {
        await conn.execute('INSERT INTO workplace_handbook_digest_entries (digest_id, agency_id, sort_order, subject, rationale, changed_content, handbook_section_slug, handbook_version_id, change_kind, previous_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [digestId, agencyId, order++, `${change.title} — ${change.kind}`.slice(0, 500), changelog || null, change.afterHtml, change.slug, versionId, change.kind, change.beforeHtml]);
      }
    }
    await conn.execute('UPDATE workplace_handbook_versions SET is_draft = 0, published_at = UTC_TIMESTAMP(), published_by_user_id = ?, changelog = ? WHERE id = ?', [publishedByUserId || null, changelog || (doc.published_version_id ? 'Handbook updated' : 'Initial handbook transfer'), versionId]);
    await conn.execute('UPDATE workplace_handbook_documents SET published_version_id = ? WHERE id = ?', [versionId, doc.id]);
    await conn.commit();
    return { versionId, digestId, changeCount: changes.length, initialImport: !doc.published_version_id };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

export async function linkHandbookUpdate({ agencyId, digestId, entryId, sectionSlug }) {
  if (sectionSlug) {
    const source = await sourceForAgency(agencyId, { includeCurrentForms: false });
    const [matches] = await pool.execute('SELECT s.slug FROM workplace_handbook_sections s JOIN workplace_handbook_documents d ON d.published_version_id = s.version_id WHERE d.agency_id = ? AND s.slug = ? LIMIT 1', [agencyId, sectionSlug]);
    if (!matches.length && !source?.sections.some(s => s.slug === sectionSlug)) throw fail('Handbook section not found.', 400);
  }
  const [result] = await pool.execute('UPDATE workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id = e.digest_id SET e.handbook_section_slug = ? WHERE e.id = ? AND e.digest_id = ? AND e.agency_id = ? AND d.agency_id = ? AND e.handbook_version_id IS NULL', [sectionSlug || null, entryId, digestId, agencyId, agencyId]);
  if (!result.affectedRows) throw fail('This update could not be linked. Generated updates keep their original section reference.', 400);
}
