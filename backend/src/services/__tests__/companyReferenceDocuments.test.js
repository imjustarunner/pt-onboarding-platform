import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../workplaceHandbookAssistant.service.js', () => ({ answerFromHandbook: vi.fn(), validateHandbookQuestion: vi.fn(input => ({ question: input.question, history: [] })) }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import { answerFromHandbook } from '../workplaceHandbookAssistant.service.js';
import { referenceSource, referenceMetadata, referenceCatalogFor } from '../companyReferenceContent.js';
import { getHandbookSource } from '../workplaceHandbookContent.js';
import { assertReferenceAccess, sourceForReference, referenceCatalogForAgency, publishedReference, referenceWorkspace, createReferenceDraft, changeReferenceSection, publishReference, answerReference } from '../companyReferenceDocuments.service.js';
import * as controller from '../../controllers/companyReferenceDocuments.controller.js';

let agency;
const user = { id: 7, role: 'admin', status: 'ACTIVE_EMPLOYEE' };
const source = () => referenceSource(agency, 'provider-guide');
let document, versions, conn, nextId;
beforeEach(() => {
  vi.resetAllMocks();
  agency = { id: 12, slug: 'nlu', name: 'Next Level Up' };
  document = { id: 1, agency_id: 12, document_key: 'provider-guide', published_version_id: null, draft_version_id: null };
  versions = []; nextId = 10;
  User.getAgencies.mockResolvedValue([{ id: 12 }]);
  const execute = async (sql, values = []) => {
    if (sql.startsWith('SELECT id, name, slug FROM agencies')) return [[agency]];
    if (sql.includes('FROM workplace_document_assignments')) return [[]];
    if (sql.startsWith('INSERT INTO company_reference_documents')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT * FROM company_reference_documents')) return [[document]];
    if (sql.startsWith('SELECT * FROM company_reference_versions')) return [versions.filter(v => v.document_id === values[0] && v.id === values[1])];
    if (sql.includes('JOIN company_reference_versions')) {
      const id = sql.includes('d.draft_version_id') ? document.draft_version_id : document.published_version_id;
      return [versions.filter(v => v.id === id && v.document_id === document.id && (sql.includes('d.draft_version_id') ? v.is_draft === 1 : v.is_draft === 0))];
    }
    if (sql.startsWith('INSERT INTO company_reference_versions')) {
      const id = nextId++; versions.push({ id, document_id: values[0], version_number: values[1], metadata_json: values[2], sections_json: values[3], revision: 1, is_draft: 1 }); return [{ insertId: id }];
    }
    if (sql.startsWith('UPDATE company_reference_documents SET draft_version_id')) { document.draft_version_id = values[0]; return [{}]; }
    if (sql.startsWith('UPDATE company_reference_documents SET published_version_id')) { document.published_version_id = values[0]; document.draft_version_id = null; return [{}]; }
    if (sql.startsWith('UPDATE company_reference_versions SET sections_json')) { const row = versions.find(v => v.id === values[1]); row.sections_json = values[0]; row.revision++; return [{}]; }
    if (sql.startsWith('UPDATE company_reference_versions SET is_draft')) { const row = versions.find(v => v.id === values[2]); Object.assign(row, { is_draft: 0, changes_json: values[0], published_at: '2026-10-10' }); return [{}]; }
    throw new Error(`Unhandled test query: ${sql}`);
  };
  pool.execute.mockImplementation(execute);
  conn = { execute: vi.fn(execute), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  pool.getConnection.mockResolvedValue(conn);
});
const create = () => createReferenceDraft(12, 'provider-guide', 7, { sourceRevision: source().revision, expectedPublishedVersionId: null });
const publish = () => publishReference(12, 'provider-guide', 7, { expectedVersionId: document.draft_version_id, expectedRevision: versions.at(-1).revision });
const sectionInput = (section, bodyHtml = '<p>Company-specific revision.</p>') => ({ expectedVersionId: document.draft_version_id, sectionId: section.slug, title: section.title, bodyHtml, sortOrder: section.sort_order, expectedSection: { title: section.title, bodyHtml: section.body_html, sortOrder: section.sort_order } });

describe('provider guide sources', () => {
  it('includes every measure, role guidance and in-app workflows in three separate editions', () => {
    for (const slug of ['itsco', 'nlu', 'tisi']) {
      const guide = referenceSource({ slug }, 'provider-guide');
      expect(guide.sections.filter(s => s.slug.startsWith('measure-'))).toHaveLength(33);
      expect(guide.sections.some(s => s.title.includes('INTERN MENTAL HEALTH'))).toBe(true);
      expect(JSON.stringify(guide.sections)).not.toMatch(/TherapyNotes|Therapy Notes|Google Form|10 minutes per hour|services being deemed non-compensable|second session.*typically results in self-pay/i);
      expect(guide.sections.find(s => s.slug === 'measure-bbgs').title).toContain('Brief Biosocial');
    }
  });
  it('applies NLU attendance and split-service boundaries without granting payer coverage', () => {
    const text = source().sections.find(s => s.slug === 'definition-of-services').body_html;
    expect(text).toMatch(/schedule three.*two or more/); expect(text).toMatch(/only one.*self-pay or reschedule/);
    expect(text).toMatch(/H0004.*requires billing approval/); expect(text).toContain('Tutoring must never be included');
  });
  it('keeps ISI counseling-only and new companies free of owned-company policy details', () => {
    const isi = referenceSource({ slug: 'tisi' }, 'provider-guide');
    expect(isi.sections.find(s => s.slug === 'definition-of-services').body_html).toContain('provides counseling');
    expect(isi.sections.some(s => s.title === 'A.1 Practice Orientation')).toBe(false);
    expect(referenceSource({ slug: 'unassigned' }, 'provider-guide')).toBeNull();
    const company = referenceSource({ id: 33, slug: 'cedar', name: 'Cedar <script>x</script>' }, 'provider-guide', { packageAssigned: true });
    expect(company.requiredSections).toHaveLength(4);
    expect(company.sections.filter(s => s.content_status === 'pending')).toHaveLength(4);
    expect(JSON.stringify(company.sections)).not.toMatch(/ITSCO|Next Level Up|Inner Strength|H0004|\bISI\b|href=\\"\/workplace-handbook#|<script>/);
    expect(referenceSource({ slug: 'nlu' }, 'unknown-key')).toBeNull();
  });
  it('returns independent copies with working internal handbook links', async () => {
    const first = source(); first.sections[0].body_html = 'private change';
    expect(source().sections[0].body_html).not.toContain('private change');
    for (const key of ['itsco', 'nlu', 'isi']) {
      const guide = referenceSource({ slug: key === 'isi' ? 'tisi' : key }, 'provider-guide');
      const handbook = getHandbookSource({ slug: key === 'isi' ? 'tisi' : key }, { employeeTemplates: [] });
      for (const section of guide.sections) for (const link of section.body_html.matchAll(/href="\/workplace-handbook#handbook-([^"]+)"/g)) expect(handbook.sections.some(s => s.slug === link[1])).toBe(true);
    }
  });
});
describe('company isolation and permissions', () => {
  it('allows member reads but refuses other companies, staff edits and forged company ids', async () => {
    await expect(assertReferenceAccess({ id: 7, role: 'provider', status: 'ACTIVE_EMPLOYEE' }, 12)).resolves.toBeUndefined();
    await expect(assertReferenceAccess(user, 33)).rejects.toMatchObject({ status: 403 });
    await expect(assertReferenceAccess({ id: 7, role: 'provider', status: 'ACTIVE_EMPLOYEE' }, 12, { manage: true })).rejects.toMatchObject({ status: 403 });
    await expect(assertReferenceAccess({ id: 7, role: 'school_staff', status: 'ACTIVE_EMPLOYEE' }, 12)).rejects.toMatchObject({ status: 403 });
    await expect(assertReferenceAccess({ id: 7, role: 'provider', status: 'INACTIVE_EMPLOYEE' }, 12)).rejects.toMatchObject({ status: 403 });
    await expect(assertReferenceAccess(user, '12 OR 1=1')).rejects.toMatchObject({ status: 400 });
  });
  it('authorizes before any content or model access on HTTP endpoints', async () => {
    const next = vi.fn(), req = { user: { id: 9, role: 'provider', status: 'ACTIVE_EMPLOYEE' }, method: 'POST', params: { key: 'provider-guide' }, body: { agencyId: 33, question: 'Private policy?' } };
    await controller.answer(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(pool.execute).not.toHaveBeenCalled(); expect(answerFromHandbook).not.toHaveBeenCalled();
    next.mockClear(); req.body.agencyId = 12;
    await controller.draft(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });
});
describe('drafts, publication and change records', () => {
  it('keeps supplied and draft content out of the reader until published', async () => {
    await create();
    expect(await publishedReference(12, 'provider-guide')).toBeNull();
    const workspace = await referenceWorkspace(12, 'provider-guide');
    expect(workspace.draft.sections).toHaveLength(75); expect(workspace.source.sections).toHaveLength(75);
    await publish();
    expect((await publishedReference(12, 'provider-guide')).version).toMatchObject({ version_number: 1, is_draft: 0 });
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes('FOR UPDATE'))).toBe(true);
  });
  it('does not overwrite an existing draft, rejects a stale source, and rolls back errors', async () => {
    await expect(createReferenceDraft(12, 'provider-guide', 7, { sourceRevision: 'old' })).rejects.toMatchObject({ status: 409 });
    expect(conn.rollback).toHaveBeenCalled(); expect(versions).toHaveLength(0);
    await create(); await create(); expect(versions).toHaveLength(1);
  });
  it('preserves company edits in the next draft and stores exact before/after changes', async () => {
    await create(); await publish();
    const old = await publishedReference(12, 'provider-guide');
    await createReferenceDraft(12, 'provider-guide', 7, { expectedPublishedVersionId: old.version.id });
    await changeReferenceSection(12, 'provider-guide', sectionInput(old.sections[0]));
    expect((await publishedReference(12, 'provider-guide')).sections[0].body_html).toBe(old.sections[0].body_html);
    await publish();
    const current = await publishedReference(12, 'provider-guide');
    expect(current.changes).toHaveLength(1);
    expect(current.changes[0]).toMatchObject({ slug: old.sections[0].slug, beforeHtml: old.sections[0].body_html, afterHtml: '<p>Company-specific revision.</p>' });
    await createReferenceDraft(12, 'provider-guide', 7, { expectedPublishedVersionId: current.version.id });
    expect((await referenceWorkspace(12, 'provider-guide')).draft.sections[0].body_html).toContain('Company-specific');
  });
  it('rejects stale section writes, foreign version ids, and publication after an unseen edit', async () => {
    await create(); const initial = (await referenceWorkspace(12, 'provider-guide')).draft;
    const input = sectionInput(initial.sections[0]);
    await changeReferenceSection(12, 'provider-guide', input);
    await expect(changeReferenceSection(12, 'provider-guide', input)).rejects.toMatchObject({ status: 409 });
    await expect(changeReferenceSection(12, 'provider-guide', { ...input, expectedVersionId: 99 })).rejects.toMatchObject({ status: 409 });
    await expect(publishReference(12, 'provider-guide', 7, { expectedVersionId: initial.version.id, expectedRevision: 1 })).rejects.toMatchObject({ status: 409 });
    expect(document.published_version_id).toBeNull();
  });
  it('protects chapters, sanitizes section HTML and records a published removal', async () => {
    await create(); await publish(); const old = await publishedReference(12, 'provider-guide');
    await createReferenceDraft(12, 'provider-guide', 7, { expectedPublishedVersionId: old.version.id });
    const chapter = old.sections.find(s => s.slug === 'appendix-a');
    await expect(changeReferenceSection(12, 'provider-guide', sectionInput(chapter), { remove: true })).rejects.toThrow('chapter');
    await changeReferenceSection(12, 'provider-guide', sectionInput(old.sections[0], '<script>bad()</script><p>Safe</p>'));
    const leaf = old.sections.find(s => s.slug === 'measure-bbgs');
    await changeReferenceSection(12, 'provider-guide', sectionInput(leaf), { remove: true }); await publish();
    const current = await publishedReference(12, 'provider-guide');
    expect(current.sections[0].body_html).toBe('<p>Safe</p>');
    expect(current.changes.some(c => c.slug === leaf.slug && c.kind === 'removed')).toBe(true);
    await expect(changeReferenceSection(12, 'provider-guide', sectionInput(current.sections[0]))).rejects.toMatchObject({ status: 409 });
  });
});
describe('published guide answers', () => {
  it('uses only the selected published edition and ignores caller-supplied passages', async () => {
    await create(); await expect(answerReference(12, 'provider-guide', { question: 'What is this?' })).rejects.toMatchObject({ status: 404 });
    await publish(); const current = await publishedReference(12, 'provider-guide');
    answerFromHandbook.mockResolvedValue({ status: 'answered', paragraphs: [] });
    await answerReference(12, 'provider-guide', { question: 'What must I document?', expectedVersionId: current.version.id, sections: [{ body_html: 'Invented policy' }] });
    const data = answerFromHandbook.mock.calls[0][0];
    expect(data.handbook.metadata.organization).toBe('Next Level Up'); expect(JSON.stringify(data)).not.toContain('Invented policy');
    expect(data.handbook.version.is_draft).toBe(0);
  });
  it('refuses stale questions and discards answers when publication changes in flight', async () => {
    await create(); await publish(); const id = document.published_version_id;
    await expect(answerReference(12, 'provider-guide', { question: 'Question', expectedVersionId: 99 })).rejects.toMatchObject({ status: 409 });
    expect(answerFromHandbook).not.toHaveBeenCalled();
    answerFromHandbook.mockImplementation(async () => { document.published_version_id = null; return { status: 'answered' }; });
    await expect(answerReference(12, 'provider-guide', { question: 'Question', expectedVersionId: id })).rejects.toMatchObject({ status: 409 });
  });
});


describe('ITSCO-only school practice guide', () => {
  const key = 'school-practice-guide';
  it('provides four phases with stable sections, current handbook links and company branding', async () => {
    const guide = referenceSource({ slug: 'itsco' }, key);
    expect(guide.sections).toHaveLength(25);
    expect(guide.sections.filter(s => s.title.startsWith('Phase '))).toHaveLength(4);
    expect(referenceMetadata(guide)).toMatchObject({ documentKey: key, organization: 'ITSCO', coverTitle: ['School', 'practice.'], presentation: { theme: 'itsco-foundations' } });
    const handbook = getHandbookSource({ slug: 'itsco' }, { employeeTemplates: [] });
    for (const section of guide.sections) {
      expect(section.content_status).toBe('ready');
      if (section.parent_slug) expect(guide.sections.some(s => s.slug === section.parent_slug)).toBe(true);
      for (const match of section.body_html.matchAll(/href="\/workplace-handbook#handbook-([^"]+)"/g)) expect(handbook.sections.some(s => s.slug === match[1])).toBe(true);
    }
    const section = slug => guide.sections.find(s => s.slug === slug).body_html;
    expect(section('recurring-sessions-and-location')).toContain('not a universal location');
    expect(section('recurring-sessions-and-location')).toContain('90832 time band, not 90834');
    expect(section('treatment-plan-acknowledgment')).toContain('not automatically a payable H0032 service');
    expect(section('school-closures-and-provider-absence')).toContain('Do not label a school closure as a client no-show');
    expect(section('timekeeping-and-current-policies')).toContain('does not erase time actually worked');
    expect(section('safety-and-urgent-response')).toContain('do not delay action');
    expect(JSON.stringify(guide.sections)).not.toMatch(/TherapyNotes|Google Form|support@itsco|90632/);
    guide.sections[0].body_html = 'private draft';
    expect(referenceSource({ slug: 'itsco' }, key).sections[0].body_html).not.toContain('private draft');
  });
  it.each(['nlu', 'tisi', 'cedar', 'itsco-copy'])('excludes %s even with a package and a misleading company name', slug => {
    const other = { slug, name: 'ITSCO' };
    expect(referenceSource(other, key, { packageAssigned: true })).toBeNull();
    expect(referenceCatalogFor(other).some(d => d.key === key)).toBe(false);
    expect(referenceCatalogFor({ slug: 'itsco' }).some(d => d.key === key)).toBe(true);
  });
  it.each(['nlu', 'tisi', 'cedar'])('blocks every direct document operation for %s before version access, writes or model use', async slug => {
    agency = { id: 12, name: 'ITSCO', slug };
    document.document_key = key; document.published_version_id = 50; document.draft_version_id = 51;
    // Even a stray school-guide record assigned to the wrong agency cannot be read.
    versions.push({ id: 50, document_id: 1, is_draft: 0, metadata_json: '{}', sections_json: '[{"body_html":"private"}]' });
    expect((await referenceCatalogForAgency(12)).some(d => d.key === key)).toBe(false);
    const operations = [
      () => sourceForReference(12, key), () => publishedReference(12, key), () => referenceWorkspace(12, key),
      () => createReferenceDraft(12, key, 7, {}), () => changeReferenceSection(12, key, {}),
      () => changeReferenceSection(12, key, {}, { remove: true }), () => publishReference(12, key, 7, {}),
      () => answerReference(12, key, { question: 'What is the school procedure?', expectedVersionId: 50 })
    ];
    for (const operation of operations) await expect(operation()).rejects.toMatchObject({ status: 404 });
    expect(pool.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT id, name, slug FROM agencies'))).toBe(true);
    expect(pool.getConnection).not.toHaveBeenCalled(); expect(answerFromHandbook).not.toHaveBeenCalled();
  });
  it('filters the HTTP catalog even when another agency has a stray published school record', async () => {
    pool.execute.mockImplementation(async sql => sql.startsWith('SELECT id, name, slug FROM agencies') ? [[agency]] : [[{ document_key: key, version_number: 99 }]]);
    const res = { set: vi.fn(), json: vi.fn() }, next = vi.fn();
    await controller.list({ user, query: { agencyId: 12 } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].documents.map(d => d.key)).toEqual(['nlu-learning-pilot-guide', 'clinical-note-aid-guide', 'provider-guide', 'counseling-guide', 'skill-development-guide', 'facilities-guide', 'crisis-response-guide', 'facilitator-coding-protocol', 'service-documentation-standards', 'group-psychotherapy-sop', 'caseload-management-sop', 'mandated-reporting-sop']);
    agency = { ...agency, slug: 'itsco' };
    await controller.list({ user, query: { agencyId: 12 } }, res, next);
    expect(res.json.mock.calls[1][0].documents.map(d => d.key)).toEqual(['clinical-note-aid-guide', 'provider-guide', key, 'counseling-guide', 'skill-development-guide', 'facilities-guide', 'crisis-response-guide', 'facilitator-coding-protocol', 'service-documentation-standards', 'group-psychotherapy-sop', 'caseload-management-sop', 'mandated-reporting-sop']);
  });
  it('publishes, answers and revises the ITSCO guide independently with exact section changes', async () => {
    agency = { id: 12, slug: 'itsco', name: 'ITSCO' }; document.document_key = key;
    const guide = referenceSource(agency, key);
    await createReferenceDraft(12, key, 7, { sourceRevision: guide.revision });
    expect(await publishedReference(12, key)).toBeNull();
    await publishReference(12, key, 7, { expectedVersionId: document.draft_version_id, expectedRevision: 1 });
    const published = await publishedReference(12, key);
    expect(published.metadata.documentKey).toBe(key);
    expect(published.sections).toHaveLength(25);
    answerFromHandbook.mockResolvedValue({ status: 'answered', paragraphs: [] });
    await answerReference(12, key, { question: 'What do I do when school closes?', expectedVersionId: published.version.id, sections: [{ body_html: 'forged' }] });
    expect(answerFromHandbook.mock.calls[0][0].handbook.metadata).toMatchObject({ documentKey: key, organization: 'ITSCO' });
    expect(JSON.stringify(answerFromHandbook.mock.calls)).not.toContain('forged');
    await createReferenceDraft(12, key, 7, { expectedPublishedVersionId: published.version.id });
    const target = published.sections.find(s => s.slug === 'school-closures-and-provider-absence');
    await changeReferenceSection(12, key, sectionInput(target, '<p>Revised closure procedure.</p>'));
    expect((await publishedReference(12, key)).sections.find(s => s.slug === target.slug).body_html).toBe(target.body_html);
    await publishReference(12, key, 7, { expectedVersionId: document.draft_version_id, expectedRevision: 2 });
    expect((await publishedReference(12, key)).changes).toEqual([expect.objectContaining({ slug: target.slug, beforeHtml: target.body_html, afterHtml: '<p>Revised closure procedure.</p>' })]);
    expect(conn.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO company_reference_documents')).every(([, values]) => values[1] === key)).toBe(true);
  });
});
