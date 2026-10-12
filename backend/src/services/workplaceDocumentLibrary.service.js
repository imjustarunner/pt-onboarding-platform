import pool from '../config/database.js';
import User from '../models/User.model.js';
import { handbookTenant } from './handbookTenant.js';
import { documentTemplate, documentTemplateCatalog } from './workplaceDocumentTemplates.js';
import { parseHandbookMetadata } from './workplaceHandbookContent.js';
import { referenceCatalogFor } from './companyReferenceContent.js';

const fail = (message, status = 403) => Object.assign(new Error(message), { status });
const isManager = user => ['super_admin', 'superadmin'].includes(user?.role);
export async function assertDocumentLibraryAccess(user, agencyId = null, { grant = false } = {}) {
  if (agencyId !== null && (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) <= 0)) throw fail('Select a company.', 400);
  if (isManager(user)) return;
  if (grant) throw fail('Only a platform administrator can assign a company document package.');
  if (!['admin', 'support'].includes(user?.role)) throw fail('Administrator access required.');
  if (agencyId !== null && !(await User.getAgencies(user.id)).some(a => Number(a.id) === Number(agencyId))) throw fail('Company document access denied.');
}

export async function listCompanyDocuments(user, scope = {}) {
  await assertDocumentLibraryAccess(user);
  let scopedId = scope.agencyId;
  if (scope.organizationSlug) {
    const [[agency]] = await pool.execute('SELECT id FROM agencies WHERE slug = ?', [String(scope.organizationSlug)]);
    if (!agency) throw fail('Company not found.', 404);
    scopedId = agency.id;
  }
  if (scopedId != null) await assertDocumentLibraryAccess(user, scopedId);
  const ids = scopedId != null ? [Number(scopedId)] : isManager(user) ? null : (await User.getAgencies(user.id)).map(a => Number(a.id)).filter(Number.isSafeInteger);
  if (ids && !ids.length) return { catalog: documentTemplateCatalog(), companies: [], canAssign: false };
  const clause = ids ? `WHERE a.id IN (${ids.map(() => '?').join(',')})` : "WHERE a.organization_type IS NULL OR a.organization_type NOT IN ('school', 'program', 'learning')";
  const [rows] = await pool.execute(`SELECT a.id, a.name, a.slug, a.is_active, a.logo_url, a.color_palette,
    x.id AS assignment_id, x.document_key, x.template_version, x.package_key, x.created_at AS assigned_at,
    d.published_version_id, v.version_number AS published_version_number, v.metadata_json AS published_metadata,
    (SELECT MAX(w.version_number) FROM workplace_handbook_versions w WHERE w.document_id = d.id AND w.is_draft = 1) AS draft_version_number
    FROM agencies a LEFT JOIN workplace_document_assignments x ON x.agency_id = a.id AND x.document_key = 'workplace-handbook'
    LEFT JOIN workplace_handbook_documents d ON d.agency_id = a.id
    LEFT JOIN workplace_handbook_versions v ON v.id = d.published_version_id ${clause} ORDER BY a.name, a.id`, ids || []);
  return { catalog: documentTemplateCatalog(), canAssign: isManager(user), companies: rows.map(row => {
    const metadata = parseHandbookMetadata(row.published_metadata);
    const { published_metadata, ...company } = row;
    return { ...company, hasOwnedHandbook: !!handbookTenant(row), publishedTemplateVersion: metadata.template?.version || null, referenceDocuments: referenceCatalogFor(row) };
  }) };
}

export async function assignCompanyDocument(user, { agencyId, key, version }) {
  await assertDocumentLibraryAccess(user, agencyId, { grant: true });
  const template = documentTemplate(key, version);
  if (!template) throw fail('Select an available document template release.', 400);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [agencies] = await conn.execute('SELECT id, name, slug, organization_type FROM agencies WHERE id = ? FOR UPDATE', [Number(agencyId)]);
    if (!agencies[0]) throw fail('Company not found.', 404);
    if (handbookTenant(agencies[0])) throw fail('This company already has its own supplied handbook. Open that edition instead.', 409);
    if (['school', 'program', 'learning'].includes(agencies[0].organization_type)) throw fail('Assign workplace documents to a company, not a nested program or school.', 400);
    const [assigned] = await conn.execute('SELECT * FROM workplace_document_assignments WHERE agency_id = ? AND document_key = ?', [Number(agencyId), key]);
    if (assigned[0]) {
      if (assigned[0].template_version !== version) throw fail('A different release is already assigned. Review its company edition before changing releases.', 409);
      await conn.commit();
      return { assignmentId: assigned[0].id, alreadyAssigned: true };
    }
    // Share the handbook document lock with draft creation/publication. Granting
    // a package must not replace an unrelated company handbook or in-flight edit.
    await conn.execute("INSERT INTO workplace_handbook_documents (agency_id, title) VALUES (?, 'Workplace Handbook') ON DUPLICATE KEY UPDATE agency_id = VALUES(agency_id)", [Number(agencyId)]);
    const [documents] = await conn.execute('SELECT id FROM workplace_handbook_documents WHERE agency_id = ? FOR UPDATE', [Number(agencyId)]);
    const [versions] = await conn.execute('SELECT id FROM workplace_handbook_versions WHERE document_id = ? LIMIT 1', [documents[0].id]);
    if (versions.length) throw fail('This company already has a handbook draft or publication. Review it before assigning a different source.', 409);
    const [result] = await conn.execute('INSERT INTO workplace_document_assignments (agency_id, document_key, template_version, package_key, granted_by_user_id) VALUES (?, ?, ?, ?, ?)', [Number(agencyId), key, version, template.minimumTier, user.id]);
    await conn.commit();
    return { assignmentId: result.insertId, alreadyAssigned: false };
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
