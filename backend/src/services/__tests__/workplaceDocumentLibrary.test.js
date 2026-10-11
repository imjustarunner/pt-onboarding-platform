import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn(), execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import { assignCompanyDocument, assertDocumentLibraryAccess, listCompanyDocuments } from '../workplaceDocumentLibrary.service.js';
import { companyHandbookSource, companyHandbookReadiness, documentTemplateCatalog, mergeCompanyHandbookSource } from '../workplaceDocumentTemplates.js';
import { handbookMetadata, mergeSuppliedSections } from '../workplaceHandbookContent.js';
import { sourceForAgency, publishHandbookVersion } from '../workplaceHandbookWorkflow.service.js';
import { upsertDraftSection, deleteDraftSection } from '../workplaceHandbook.service.js';
import { planIncludesFeature } from '../productPlanPolicy.js';

const agency = { id: 31, name: 'Cedar & Co', slug: 'cedar', color_palette: { primary: '#28354a', secondary: '#aabbcc' }, logo_url: '/assets/cedar.png' };
const assignment = { id: 9, agency_id: 31, document_key: 'workplace-handbook', template_version: '1.0.0' };
const owner = { id: 7, role: 'super_admin' };
let conn;
beforeEach(() => {
  vi.resetAllMocks();
  User.getAgencies.mockResolvedValue([{ id: 31 }]);
  conn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  pool.getConnection.mockResolvedValue(conn);
});
describe('company handbook template', () => {
  it('creates separate branded copies without leaking the owned companies or their clinical programs', () => {
    const source = companyHandbookSource(agency, assignment);
    expect(source.sections).toHaveLength(30);
    expect(source.template.requiredSections).toHaveLength(8);
    expect(source.presentation).toMatchObject({ primaryColor: '#28354a', logoUrl: '/assets/cedar.png' });
    expect(source.sections[0].body_html).toContain('Cedar &amp; Co');
    expect(JSON.stringify(source.sections)).not.toMatch(/ITSCO|Next Level Up|Inner Strength|Rachel|Michael|Colorado|H0004|Skill Builder|60\/40|Google Form/);
    expect(source.forms).toBeUndefined();
    source.sections[0].body_html = '<p>Company-only change</p>';
    const second = companyHandbookSource({ ...agency, id: 32, name: 'Pine Studio' }, { ...assignment, agency_id: 32 });
    expect(JSON.stringify(second)).not.toMatch(/Cedar|Company-only/);
    expect(second.revision).not.toBe(source.revision);
    expect(companyHandbookSource(agency, assignment).sections[0].body_html).not.toBe(source.sections[0].body_html);
  });
  it('rejects cross-company assignments and unavailable releases', () => {
    expect(() => companyHandbookSource({ ...agency, id: 32 }, assignment)).toThrow('access denied');
    expect(() => companyHandbookSource(agency, { ...assignment, template_version: '99' })).toThrow('unavailable');
  });
  it('treats company identity and brand settings as untrusted display data', () => {
    const source = companyHandbookSource({ ...agency, name: '<img src=x onerror=alert(1)>', logo_url: 'javascript:alert(1)', color_palette: { primary: 'red; background:url(evil)' } }, assignment);
    expect(source.sections[0].body_html).not.toContain('<img');
    expect(source.sections[0].body_html).toContain('&lt;img');
    expect(source.presentation.logoUrl).toBe('');
    expect(source.presentation.primaryColor).toBe('#223a50');
    expect(companyHandbookSource({ ...agency, logo_url: 'https://cdn.example.com/brand.svg' }, assignment).presentation.logoUrl).toBe('https://cdn.example.com/brand.svg');
  });
  it('requires company-specific policies even if metadata requirements are stripped', () => {
    const source = companyHandbookSource(agency, assignment);
    const metadata = handbookMetadata(source);
    expect(metadata.template.version).toBe('1.0.0');
    metadata.template.requiredSections = [];
    expect(companyHandbookReadiness(metadata, source.sections)).toHaveLength(8);
    const complete = source.sections.map(s => ({ ...s, content_status: 'ready', body_html: s.body_html || '<p>The company does not offer this program.</p>' }));
    expect(companyHandbookReadiness(metadata, complete)).toEqual([]);
    complete.find(s => s.slug === 'pay-and-work-hours').body_html = '<p>[insert company payroll rules]</p>';
    expect(companyHandbookReadiness(metadata, complete).map(s => s.slug)).toEqual(['pay-and-work-hours']);
    expect(companyHandbookReadiness(metadata, complete.filter(s => s.slug !== 'benefits-and-insurance'))).toHaveLength(2);
  });
  it('preserves company edits and additions on reimport, and refuses conflicting template text', () => {
    const source = companyHandbookSource(agency, assignment);
    const previous = structuredClone(source.sections);
    previous[0].title = 'Our welcome'; previous[0].body_html = '<p>Our own welcome.</p>';
    previous.push({ slug: 'local-operations', title: 'Local operations', content_status: 'ready', body_html: '<p>Local rules.</p>', sort_order: 30 });
    const merged = mergeCompanyHandbookSource(source, previous, handbookMetadata(source));
    expect(merged[0].body_html).toBe('<p>Our own welcome.</p>');
    expect(merged[0].title).toBe('Our welcome');
    expect(merged.at(-1).slug).toBe('local-operations');
    expect(mergeCompanyHandbookSource(source, previous.filter(s => s.slug !== 'remote-work-and-property'), handbookMetadata(source)).some(s => s.slug === 'remote-work-and-property')).toBe(false);
    const incoming = structuredClone(source.sections); incoming[0].body_html = '<p>A new template rule.</p>'; incoming[0].source_body_hash = 'new-hash';
    expect(() => mergeSuppliedSections(incoming, previous)).toThrow('newer in-app wording');
  });
  it('includes the library in Basic and higher without including unrelated premium features', () => {
    for (const agencyTier of ['basic', 'premium', 'premium_plus']) expect(planIncludesFeature({ agencyTier }, 'workplaceDocumentLibrary')).toBe(true);
    expect(planIncludesFeature({ agencyTier: 'basic' }, 'peopleOpsEnabled')).toBe(false);
    expect(documentTemplateCatalog()[0]).toMatchObject({ minimumTier: 'basic', key: 'workplace-handbook' });
  });
  it('loads an explicitly assigned company source and returns no template for an unassigned tenant', async () => {
    pool.execute.mockImplementation(async sql => sql.includes('FROM agencies') ? [[agency]] : [[assignment]]);
    expect((await sourceForAgency(31)).template.assignmentId).toBe(9);
    pool.execute.mockImplementation(async sql => sql.includes('FROM agencies') ? [[agency]] : [[]]);
    expect(await sourceForAgency(31)).toBeNull();
  });
  it('blocks incomplete company publication before changing the published pointer or making updates', async () => {
    const source = companyHandbookSource(agency, assignment);
    conn.execute.mockImplementation(async sql => {
      if (sql.startsWith('INSERT')) return [{ insertId: 1 }];
      if (sql.includes('FROM workplace_handbook_documents')) return [[{ id: 1 }]];
      if (sql.includes('FROM workplace_handbook_versions')) return [[{ id: 8, is_draft: 1, metadata_json: handbookMetadata(source) }]];
      if (sql.includes('FROM workplace_handbook_sections')) return [source.sections];
      throw new Error(`Unexpected query ${sql}`);
    });
    await expect(publishHandbookVersion({ agencyId: 31, versionId: 8 })).rejects.toThrow('Complete the company policies');
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes('SET published_version_id') || sql.includes('INSERT INTO workplace_handbook_digest_entries'))).toBe(false);
  });
});
describe('package access and grants', () => {
  it('denies staff, unaffiliated admins and non-platform grants', async () => {
    await expect(assertDocumentLibraryAccess({ id: 2, role: 'staff' })).rejects.toMatchObject({ status: 403 });
    await expect(assertDocumentLibraryAccess({ id: 2, role: 'admin' }, 32)).rejects.toMatchObject({ status: 403 });
    await expect(assignCompanyDocument({ id: 2, role: 'admin' }, { agencyId: 31, key: 'workplace-handbook', version: '1.0.0' })).rejects.toMatchObject({ status: 403 });
    await expect(assertDocumentLibraryAccess(owner, -1, { grant: true })).rejects.toMatchObject({ status: 400 });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
  it('limits tenant administrators to their affiliated companies', async () => {
    pool.execute.mockResolvedValue([[{ ...agency, published_metadata: null }]]);
    const result = await listCompanyDocuments({ id: 2, role: 'admin' });
    expect(result.canAssign).toBe(false);
    expect(pool.execute.mock.calls[0][0]).toContain('WHERE a.id IN (?)');
    expect(pool.execute.mock.calls[0][1]).toEqual([31]);
  });
  function arrange({ slug = 'cedar', assigned = false, existing = false, failWrite = false } = {}) {
    conn.execute.mockImplementation(async sql => {
      if (sql.includes('FROM agencies')) return [[{ ...agency, slug, organization_type: 'agency' }]];
      if (sql.includes('SELECT * FROM workplace_document_assignments')) return [assigned ? [assignment] : []];
      if (sql.includes('SELECT id FROM workplace_handbook_documents')) return [[{ id: 70 }]];
      if (sql.includes('SELECT id FROM workplace_handbook_versions')) return [existing ? [{ id: 80 }] : []];
      if (sql.includes('INSERT INTO workplace_document_assignments') && failWrite) throw new Error('Storage unavailable');
      return [{ insertId: 9 }];
    });
  }
  const payload = { agencyId: 31, key: 'workplace-handbook', version: '1.0.0' };
  it('records package, company, version and grant actor transactionally', async () => {
    arrange();
    expect(await assignCompanyDocument(owner, payload)).toEqual({ assignmentId: 9, alreadyAssigned: false });
    expect(conn.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO workplace_document_assignments'))[1]).toEqual([31, 'workplace-handbook', '1.0.0', 'basic', 7]);
    expect(conn.commit).toHaveBeenCalledOnce(); expect(conn.release).toHaveBeenCalledOnce();
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO workplace_handbook_versions'))).toBe(false);
  });
  it('is idempotent on a retry and protects existing owned/custom handbooks', async () => {
    arrange({ assigned: true }); expect((await assignCompanyDocument(owner, payload)).alreadyAssigned).toBe(true);
    expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
    arrange({ slug: 'itsco' }); await expect(assignCompanyDocument(owner, payload)).rejects.toThrow('own supplied handbook');
    arrange({ existing: true }); await expect(assignCompanyDocument(owner, payload)).rejects.toThrow('already has a handbook');
  });
  it('rolls back a failed package assignment', async () => {
    arrange({ failWrite: true }); await expect(assignCompanyDocument(owner, payload)).rejects.toThrow('Storage unavailable');
    expect(conn.rollback).toHaveBeenCalledOnce(); expect(conn.commit).not.toHaveBeenCalled();
  });
});
describe('section editor conflict protection', () => {
  it('refuses stale saves and stale deletions without overwriting another administrator', async () => {
    conn.execute.mockImplementation(async sql => {
      if (sql.includes('FROM workplace_handbook_documents')) return [[{ id: 1 }]];
      if (sql.includes('FROM workplace_handbook_versions')) return [[{ id: 8, is_draft: 1 }]];
      if (sql.startsWith('SELECT slug')) return [[{ slug: 'welcome', title: 'Welcome', body_html: '<p>New wording.</p>', sort_order: 0 }]];
      throw new Error('Unexpected write');
    });
    const edit = { agencyId: 31, versionId: 8, sectionId: 4, title: 'Welcome', bodyHtml: '<p>My edit.</p>', expectedSection: { title: 'Welcome', bodyHtml: '<p>Old wording.</p>', sortOrder: 0 } };
    await expect(upsertDraftSection(edit)).rejects.toMatchObject({ status: 409 });
    await expect(deleteDraftSection(edit)).rejects.toMatchObject({ status: 409 });
    expect(conn.execute.mock.calls.some(([sql]) => /^(UPDATE|DELETE)/.test(sql))).toBe(false);
  });
});
