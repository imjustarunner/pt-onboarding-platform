import pool from '../config/database.js';
import { recordDocumentQuestion } from './documentAnalytics.service.js';
import User from '../models/User.model.js';
import { getUserCapabilities } from '../utils/capabilities.js';
import { randomUUID } from 'node:crypto';
import { assertDocumentLibraryAccess } from './workplaceDocumentLibrary.service.js';
import { referenceCatalog, referenceCatalogFor, referenceAllowed, referenceMetadata, referenceSource } from './companyReferenceContent.js';
import { cleanHandbookHtml, handbookChanges, validateHandbookSections } from './workplaceHandbookContent.js';
import { answerFromHandbook, validateHandbookQuestion } from './workplaceHandbookAssistant.service.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const json = (value, fallback) => value == null ? fallback : typeof value === 'string' ? JSON.parse(value) : value;
function validateKey(key) { if (!referenceCatalog.some(d => d.key === key)) fail('Document not found.', 404); }
export async function referenceCatalogForAgency(agencyId) {
  const [[agency]] = await pool.execute('SELECT id, name, slug FROM agencies WHERE id = ?', [Number(agencyId)]);
  if (!agency) fail('Company not found.', 404);
  return referenceCatalogFor(agency);
}
async function assertReferenceScope(agencyId, key) {
  validateKey(key);
  if (referenceCatalog.find(d => d.key === key).tenants && !(await referenceCatalogForAgency(agencyId)).some(d => d.key === key)) fail('Document not found for this company.', 404);
}
export async function assertReferenceAccess(user, agencyId, { manage = false } = {}) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) <= 0) fail('Select a company.');
  if (!getUserCapabilities(user, { effectiveRole: user?.effectiveRole }).canViewLibrary) fail('Library access denied.', 403);
  if (manage) return assertDocumentLibraryAccess(user, agencyId);
  if (['super_admin', 'superadmin'].includes(user?.role)) return;
  if (!user?.id || !(await User.getAgencies(user.id)).some(a => Number(a.id) === Number(agencyId))) fail('Company document access denied.', 403);
}
export async function sourceForReference(agencyId, key) {
  validateKey(key);
  const [agencies] = await pool.execute('SELECT id, name, slug FROM agencies WHERE id = ?', [Number(agencyId)]);
  if (!agencies[0]) fail('Company not found.', 404);
  if (!referenceAllowed(agencies[0], key)) fail('Document not found for this company.', 404);
  if (key === 'school-practice-guide') return referenceSource(agencies[0], key);
  const [assignments] = await pool.execute("SELECT id FROM workplace_document_assignments WHERE agency_id = ? AND document_key = 'workplace-handbook'", [Number(agencyId)]);
  return referenceSource(agencies[0], key, { packageAssigned: assignments.length > 0 });
}
function book(row) {
  if (!row) return null;
  return { version: { id: row.id, version_number: row.version_number, revision: row.revision, is_draft: row.is_draft, published_at: row.published_at }, metadata: json(row.metadata_json, {}), sections: json(row.sections_json, []).map(s => ({ ...s, id: s.slug })), changes: json(row.changes_json, []) };
}
export async function publishedReference(agencyId, key) {
  await assertReferenceScope(agencyId, key);
  const [rows] = await pool.execute(`SELECT v.* FROM company_reference_documents d
    JOIN company_reference_versions v ON v.id = d.published_version_id AND v.document_id = d.id AND v.is_draft = 0
    WHERE d.agency_id = ? AND d.document_key = ?`, [Number(agencyId), key]);
  return book(rows[0]);
}
export async function referenceWorkspace(agencyId, key) {
  const [source, published] = await Promise.all([sourceForReference(agencyId, key), publishedReference(agencyId, key)]);
  const [drafts] = await pool.execute(`SELECT v.* FROM company_reference_documents d
    JOIN company_reference_versions v ON v.id = d.draft_version_id AND v.document_id = d.id AND v.is_draft = 1
    WHERE d.agency_id = ? AND d.document_key = ?`, [Number(agencyId), key]);
  const draft = book(drafts[0]);
  return { source: source ? { metadata: referenceMetadata(source), sections: source.sections, revision: source.revision } : null, published, draft,
    changes: draft ? handbookChanges(published?.sections || [], draft.sections) : [] };
}
async function transaction(agencyId, key, operation) {
  await assertReferenceScope(agencyId, key);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('INSERT INTO company_reference_documents (agency_id, document_key) VALUES (?, ?) ON DUPLICATE KEY UPDATE agency_id = VALUES(agency_id)', [Number(agencyId), key]);
    const [[document]] = await conn.execute('SELECT * FROM company_reference_documents WHERE agency_id = ? AND document_key = ? FOR UPDATE', [Number(agencyId), key]);
    const result = await operation(conn, document);
    await conn.commit(); return result;
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
async function versionRow(conn, document, id) {
  if (!id) return null;
  const [[row]] = await conn.execute('SELECT * FROM company_reference_versions WHERE document_id = ? AND id = ?', [document.id, id]);
  return row;
}
export async function createReferenceDraft(agencyId, key, userId, input) {
  const source = await sourceForReference(agencyId, key);
  return transaction(agencyId, key, async (conn, document) => {
    if (Number(input.expectedPublishedVersionId || 0) !== Number(document.published_version_id || 0)) fail('The publication changed. Reload before creating a draft.', 409);
    if (document.draft_version_id) return { versionId: document.draft_version_id, existing: true };
    const published = book(await versionRow(conn, document, document.published_version_id));
    if (!published && (!source || source.revision !== input.sourceRevision)) fail('Reload the available source before creating a draft.', 409);
    // A new revision always starts from the company's last publication, so
    // template/source refreshes cannot silently undo company customization.
    const metadata = published?.metadata || referenceMetadata(source);
    const sections = published?.sections || source.sections;
    const [result] = await conn.execute('INSERT INTO company_reference_versions (document_id, version_number, metadata_json, sections_json, created_by_user_id) VALUES (?, ?, ?, ?, ?)', [document.id, (published?.version.version_number || 0) + 1, JSON.stringify(metadata), JSON.stringify(sections), userId]);
    await conn.execute('UPDATE company_reference_documents SET draft_version_id = ? WHERE id = ?', [result.insertId, document.id]);
    return { versionId: result.insertId };
  });
}
export async function changeReferenceSection(agencyId, key, input, { remove = false } = {}) {
  return transaction(agencyId, key, async (conn, document) => {
    if (!document.draft_version_id || Number(input.expectedVersionId) !== Number(document.draft_version_id)) fail('This draft changed. Reload before editing.', 409);
    const row = await versionRow(conn, document, document.draft_version_id);
    if (!row || !Number(row.is_draft)) fail('Only a current draft can be edited.', 409);
    const sections = json(row.sections_json, []);
    const section = input.sectionId ? sections.find(s => s.slug === input.sectionId) : null;
    if (input.sectionId && !section) fail('Section not found.', 404);
    if (section && (!input.expectedSection || section.title !== input.expectedSection.title || section.body_html !== input.expectedSection.bodyHtml || Number(section.sort_order) !== Number(input.expectedSection.sortOrder))) fail('This section changed. Reload it before saving.', 409);
    if (remove) {
      if (!section) fail('Select a section.');
      if (json(row.metadata_json, {}).requiredSections?.some(s => s.slug === section.slug)) fail('Complete required company topics instead of deleting them.');
      if (sections.some(s => s.parent_slug === section.slug)) fail('Move or remove this chapter’s sections first.');
      sections.splice(sections.indexOf(section), 1);
    } else {
      const title = String(input.title || '').trim(), bodyHtml = cleanHandbookHtml(input.bodyHtml);
      const sortOrder = Number(input.sortOrder);
      if (!title || title.length > 250 || !bodyHtml.replace(/<[^>]+>/g, '').trim() || bodyHtml.length > 150000 || !Number.isSafeInteger(sortOrder) || sortOrder < 0) fail('Provide a title, section content and a valid order.');
      if (section) Object.assign(section, { title, body_html: bodyHtml, sort_order: sortOrder, content_status: 'ready' });
      else sections.push({ slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'section'}-${randomUUID().slice(0, 8)}`, title, body_html: bodyHtml, sort_order: sortOrder, parent_slug: null, content_status: 'ready', source_page: null });
    }
    sections.sort((a, b) => a.sort_order - b.sort_order);
    validateHandbookSections(sections);
    if (sections.length > 500 || JSON.stringify(sections).length > 2000000) fail('This document is too large.');
    await conn.execute('UPDATE company_reference_versions SET sections_json = ?, revision = revision + 1 WHERE id = ? AND document_id = ? AND is_draft = 1', [JSON.stringify(sections), row.id, document.id]);
    return { versionId: row.id };
  });
}
export async function publishReference(agencyId, key, userId, input) {
  return transaction(agencyId, key, async (conn, document) => {
    if (!document.draft_version_id || Number(input.expectedVersionId) !== Number(document.draft_version_id)) fail('The draft changed. Reload before publishing.', 409);
    const row = await versionRow(conn, document, document.draft_version_id);
    if (!row || !Number(row.is_draft) || Number(input.expectedRevision) !== Number(row.revision)) fail('The draft was edited. Review the latest text before publishing.', 409);
    const draft = book(row);
    validateHandbookSections(draft.sections);
    if (!draft.sections.length || draft.sections.some(s => s.content_status !== 'ready' || !s.body_html.replace(/<[^>]+>/g, '').trim())) fail('Complete every section before publishing.');
    if ((draft.metadata.requiredSections || []).some(r => !draft.sections.some(s => s.slug === r.slug))) fail('Complete the required company topics.');
    const previous = book(await versionRow(conn, document, document.published_version_id));
    const changes = handbookChanges(previous?.sections || [], draft.sections);
    await conn.execute('UPDATE company_reference_versions SET is_draft = 0, changes_json = ?, published_by_user_id = ?, published_at = CURRENT_TIMESTAMP WHERE id = ? AND document_id = ? AND is_draft = 1', [JSON.stringify(changes), userId, row.id, document.id]);
    await conn.execute('UPDATE company_reference_documents SET published_version_id = ?, draft_version_id = NULL WHERE id = ?', [row.id, document.id]);
    return { versionId: row.id, changeCount: changes.length };
  });
}
export async function answerReference(agencyId, key, input, userId = null) {
  const question = validateHandbookQuestion(input);
  const document = await publishedReference(agencyId, key);
  if (!document) fail('This document has not been published yet.', 404);
  if (Number(input.expectedVersionId) !== Number(document.version.id)) fail('The guide changed. Reload before asking your question.', 409);
  let status = 'error';
  try {
    const answer = await answerFromHandbook({ handbook: document, ...question });
    const latest = await publishedReference(agencyId, key);
    if (latest?.version.id !== document.version.id) fail('The guide changed while the answer was prepared. Reload and ask again.', 409);
    status = answer.status; return answer;
  } finally { await recordDocumentQuestion({ agencyId, userId, documentKey: key, versionId: document.version.id, question: question.question, status }); }
}
