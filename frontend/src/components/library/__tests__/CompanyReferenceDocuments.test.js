import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { routeLocationKey, createRouter, createMemoryHistory } from 'vue-router';
import Book from '../../handbook/WorkplaceHandbookBook.vue';
import Assistant from '../../handbook/WorkplaceHandbookAssistant.vue';
import Workspace from '../CompanyReferenceWorkspace.vue';
import Library from '../CompanyReferenceLibrary.vue';
import Roadmap from '../../handbook/SchoolPracticeRoadmap.vue';
import schoolSource from '../../../../../backend/src/content/school-practice-guides/itsco.json';
import Editor from '../../handbook/HandbookSectionEditor.vue';
import source from '../../../../../backend/src/content/provider-guides/nlu.json';
import careSource from '../../../../../backend/src/content/care-guides/shared.json';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
import api from '../../../services/api';
const metadata = { ...source, sections: undefined, documentKey: 'provider-guide', coverTitle: ['Provider’s', 'guide.'] };
const handbook = { metadata, sections: source.sections.map(s => ({ ...s, id: s.slug })), version: { id: 8, version_number: 2, is_draft: 0, revision: 3 }, changes: [] };
beforeEach(() => { vi.resetAllMocks(); window.history.replaceState({}, '', '/'); window.confirm = vi.fn().mockReturnValue(true); });
const button = (wrapper, text) => wrapper.findAll('button').find(b => b.text().includes(text));
describe('Care Approaches & Practice Guide reader', () => {
  const care = { metadata: { ...careSource, organization: 'Next Level Up', presentation: source.presentation, coverTitle: ['Care', 'approaches.'] }, sections: careSource.sections, version: { id: 46, version_number: 1, is_draft: 0 } };
  it('shows orientation boundaries, searches H0004 and opens a stable care-guide anchor', async () => {
    const w = mount(Book, { props: { handbook: care } });
    expect(w.get('.care-orientation-banner').text()).toContain('does not certify');
    expect(w.get('.branded-cover').attributes('aria-label')).toContain('Next Level Up Care approaches.');
    await w.get('input[type=search]').setValue('8-minute');
    await w.get('.outline-link').trigger('click');
    expect(window.location.hash).toBe('#counseling-guide-h0004-service');
    expect(w.get('.book-page').text()).toContain('not a guarantee of coverage');
    expect(w.find('a[download]').exists()).toBe(false);
    expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only');
    w.unmount();
  });
  it('uses care-specific questions and returns citations to the exact scope section', async () => {
    const ask = vi.fn().mockResolvedValue({ status: 'answered', paragraphs: [{ text: 'The agency title is facilitator.', citations: [{ slug: 'facilitator-scope', title: 'Facilitator scope', quote: 'Use the title facilitator.' }] }] });
    const w = mount(Book, { props: { handbook: care, answerQuestion: ask } });
    expect(w.getComponent(Assistant).text()).toContain('Ask the care guide');
    expect(w.getComponent(Assistant).text()).toContain('without client names');
    await button(w, 'What may a bachelor’s-level facilitator do?').trigger('click'); await flushPromises();
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ expectedVersionId: 46 }), expect.any(Object));
    await w.get('.answer-policy-links a').trigger('click');
    expect(window.location.hash).toBe('#counseling-guide-facilitator-scope');
    expect(w.get('.book-page').text()).toContain('express, documented approval');
    w.unmount();
  });
});
describe('Provider’s Guide reader', () => {
  it('does not expose a training review or quiz for a reference-only resource', async () => {
    const reference = { ...handbook, metadata: { ...metadata, documentKey: 'group-psychotherapy-sop', learningPurpose: 'reference-only' } };
    api.get.mockResolvedValue({ data: { published: reference, draft: null, source: null } });
    const w = mount(Workspace, { props: { agencyId: 12, manage: true, documentKey: 'group-psychotherapy-sop', documentTitle: 'Group Psychotherapy SOP' } });
    await flushPromises();
    expect(w.findComponent({ name: 'DocumentTrainingReview' }).exists()).toBe(false);
    expect(api.get.mock.calls.some(([url]) => url.includes('training-review'))).toBe(false);
    w.unmount();
  });
  it('opens an enabled measure from Appendix A within the current company', () => {
    window.history.replaceState({}, '', '/nlu/library#provider-guide-measure-phq-9');
    const w = mount(Book, { props: { handbook }, global: { provide: { [routeLocationKey]: { params: { organizationSlug: 'nlu' } } } } });
    expect(w.get('.handbook-prose a[href="/nlu/outcome-measures?measure=phq-9"]').text()).toContain('Preview');
    expect(w.get('.book-page').text()).toContain('Available in the app');
    w.unmount();
  });
  it('renders the correct company cover and searches actual text without download controls', async () => {
    const w = mount(Book, { props: { handbook } });
    expect(w.get('.cover-copy h2').text()).toBe('Provider’sguide.');
    expect(w.get('.branded-cover').attributes('aria-label')).toContain('Next Level Up Provider’s guide.');
    expect(w.find('.handbook-book').classes()).toContain('nlu-foundations'); expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only');
    expect(w.find('a[download]').exists()).toBe(false); expect(w.findAll('button').some(b => /download|export|print|my copy/i.test(b.text()))).toBe(false);
    await w.get('input[type=search]').setValue('two or more');
    expect(w.findAll('.outline-link')).toHaveLength(1);
    await w.get('.outline-link').trigger('click');
    expect(w.get('.book-page').text()).toContain('schedule three');
    expect(window.location.hash).toBe('#provider-guide-definition-of-services');
    w.unmount();
  });
  it('opens stable guide anchors and sends handbook references to the current company context', async () => {
    window.history.replaceState({}, '', '/#provider-guide-2-documentation-standards-universal');
    const w = mount(Book, { props: { handbook } });
    expect(w.get('.book-page h3').text()).toContain('Documentation Standards');
    await w.get('.handbook-prose a').trigger('click');
    expect(w.emitted('handbook-link')[0][0]).toBe('handbook-timekeeping-compensation-and-payroll-compliance');
    w.unmount();
  });
  it('uses guide-specific questions and links verified citations to the exact section', async () => {
    const ask = vi.fn().mockResolvedValue({ status: 'answered', paragraphs: [{ text: 'Record the actual service and provider credentials.', citations: [{ slug: '2-documentation-standards-universal', title: 'Documentation standards', path: 'General standards → Documentation', quote: 'Provider name, signature, and credential or professional title' }] }], version: { number: 2 } });
    const w = mount(Book, { props: { handbook, answerQuestion: ask } });
    expect(w.getComponent(Assistant).text()).toContain('Ask the provider guide');
    await button(w, 'What must I include in a clinical note?').trigger('click'); await flushPromises();
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ expectedVersionId: 8 }), expect.any(Object));
    await w.get('.answer-policy-links a').trigger('click');
    expect(w.get('.book-page h3').text()).toContain('Documentation Standards');
    expect(w.get('.answer-policy-links a').attributes('href')).toBe('#provider-guide-2-documentation-standards-universal');
    w.unmount();
  });
});
describe('guide workspace and section editing', () => {
  it('loads published content only for staff and routes questions to the guide endpoint', async () => {
    api.get.mockResolvedValue({ data: handbook }); api.post.mockResolvedValue({ data: { status: 'not_found', paragraphs: [] } });
    const w = mount(Workspace, { props: { agencyId: 12 } }); await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/provider-update/company-documents/provider-guide/published', { params: { agencyId: 12 } });
    expect(w.findComponent(Editor).exists()).toBe(false); expect(button(w, 'Publish')).toBeUndefined();
    await button(w, 'What must I include').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/provider-update/company-documents/provider-guide/answer', expect.objectContaining({ agencyId: 12, expectedVersionId: 8 }), expect.objectContaining({ timeout: 240000 }));
    w.unmount();
  });
  it('keeps drafts out of Q&A and publishes only the reviewed draft revision', async () => {
    const draft = { ...handbook, version: { id: 9, version_number: 3, revision: 4, is_draft: 1 } };
    api.get.mockResolvedValue({ data: { source: null, published: null, draft, changes: [] } }); api.post.mockResolvedValue({ data: {} });
    const w = mount(Workspace, { props: { agencyId: 12, manage: true } }); await flushPromises();
    expect(w.findComponent(Assistant).exists()).toBe(false);
    expect(w.getComponent(Editor).props('apiBase')).toBe('/provider-update/company-documents/provider-guide');
    await button(w, 'Publish reviewed edition').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/provider-update/company-documents/provider-guide/publish', { agencyId: 12, expectedVersionId: 9, expectedRevision: 4 });
    w.unmount();
  });
  it('refuses to leave unsaved section changes when the user keeps editing', async () => {
    const draft = { ...handbook, version: { id: 9, version_number: 3, revision: 4, is_draft: 1 } };
    api.get.mockResolvedValue({ data: { published: handbook, draft, source: null, changes: [] } });
    const w = mount(Workspace, { props: { agencyId: 12, manage: true } }); await flushPromises();
    await button(w, 'Company draft').trigger('click'); await flushPromises();
    w.getComponent(Editor).vm.$emit('dirty', true); await flushPromises(); window.confirm.mockReturnValue(false);
    expect(w.vm.canLeave()).toBe(false); expect(button(w, 'Publish reviewed edition').attributes('disabled')).toBeDefined();
    w.unmount();
  });
  it('saves guide edits to its own endpoint with the original section snapshot', async () => {
    api.post.mockResolvedValue({ data: {} });
    const section = handbook.sections[0];
    const w = mount(Editor, { props: { agencyId: 12, versionId: 9, sections: [section], apiBase: '/provider-update/company-documents/provider-guide', anchorPrefix: 'provider-guide' } }); await flushPromises();
    const title = w.findAll('input').find(input => input.attributes('maxlength') === '255' || input.attributes('maxlength') === '250') || w.findAll('.editor-fields input')[0];
    await title.setValue('Our clinical practice guide');
    await w.get('form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/provider-update/company-documents/provider-guide/sections', expect.objectContaining({ agencyId: 12, expectedVersionId: 9, sectionId: section.slug, title: 'Our clinical practice guide', expectedSection: { title: section.title, bodyHtml: section.body_html, sortOrder: section.sort_order } }));
    w.unmount();
  });
});


const school = { metadata: { ...schoolSource, sections: undefined, coverTitle: ['School', 'practice.'] }, sections: schoolSource.sections, version: { id: 31, version_number: 1, is_draft: 0, revision: 2 } };
describe('ITSCO school practice reader', () => {
  it('shows four phases, current headings and exact school anchors without download controls', async () => {
    const w = mount(Book, { props: { handbook: school }, global: { provide: { [routeLocationKey]: { params: { organizationSlug: 'itsco' } } } } });
    expect(w.find('.handbook-book').classes()).toContain('itsco-foundations'); expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only');
    expect(w.get('.branded-cover').attributes('aria-label')).toContain('ITSCO School practice.');
    expect(w.findAll('.phase-grid>.phase')).toHaveLength(4);
    expect(w.get('.handbook-prose a[href="/itsco/library?companyDocument=provider-guide#provider-guide-overview"]').exists()).toBe(true);
    await w.get('.phase-2 .phase-heading').trigger('click');
    expect(window.location.hash).toBe('#school-practice-guide-client-intake');
    expect(w.get('.book-page h3').text()).toContain('Phase 2');
    await w.get('input[type=search]').setValue('not automatically a payable H0032');
    expect(w.findAll('.outline-link')).toHaveLength(1);
    await w.get('.outline-link').trigger('click');
    expect(w.get('.book-page').text()).toContain('treatment plan');
    expect(w.findAll('button').some(b => /download|export|print/i.test(b.text()))).toBe(false);
    expect(w.find('a[download]').exists()).toBe(false);
    w.unmount();
  });
  it('keeps the roadmap in sync with edited and removed section headings', async () => {
    const sections = school.sections.map(s => ({ ...s }));
    const w = mount(Roadmap, { props: { sections } });
    const target = sections.find(s => s.slug === 'conduct-intake'); target.title = 'Our revised intake steps';
    await w.setProps({ sections: [...sections] });
    expect(w.text()).toContain('Our revised intake steps');
    await w.setProps({ sections: sections.filter(s => s.slug !== target.slug) });
    expect(w.text()).not.toContain('Our revised intake steps');
    expect(w.find('a[href="#school-practice-guide-conduct-intake"]').exists()).toBe(false);
    w.unmount();
  });
  it('routes school questions and citations to this document and its exact policy location', async () => {
    api.get.mockResolvedValue({ data: school });
    api.post.mockResolvedValue({ data: { status: 'answered', paragraphs: [{ text: 'Follow the emergency procedure immediately.', citations: [{ slug: 'safety-and-urgent-response', title: 'Respond to safety concerns immediately', path: 'Essential protocols → Safety', quote: 'do not delay action' }] }] } });
    const w = mount(Workspace, { props: { agencyId: 11, documentKey: 'school-practice-guide', documentTitle: 'School Practice Guide' } }); await flushPromises();
    expect(w.get('.reference-heading h2').text()).toBe('School Practice Guide');
    expect(api.get).toHaveBeenCalledWith('/provider-update/company-documents/school-practice-guide/published', { params: { agencyId: 11 } });
    await button(w, 'What must I do before seeing a new student?').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/provider-update/company-documents/school-practice-guide/answer', expect.objectContaining({ agencyId: 11, expectedVersionId: 31 }), expect.any(Object));
    expect(w.get('.answer-policy-links a').attributes('href')).toBe('#school-practice-guide-safety-and-urgent-response');
    await w.get('.answer-policy-links a').trigger('click');
    expect(w.get('.book-page h3').text()).toBe('Respond to safety concerns immediately');
    w.unmount();
  });
  it('publishes and edits school drafts through their own endpoints', async () => {
    api.get.mockResolvedValue({ data: { draft: { ...school, version: { id: 32, version_number: 2, revision: 5, is_draft: 1 } }, published: null } }); api.post.mockResolvedValue({ data: {} });
    const w = mount(Workspace, { props: { agencyId: 11, documentKey: 'school-practice-guide', documentTitle: 'School Practice Guide', manage: true } }); await flushPromises();
    expect(w.getComponent(Editor).props()).toMatchObject({ apiBase: '/provider-update/company-documents/school-practice-guide', anchorPrefix: 'school-practice-guide' });
    expect(w.findComponent(Assistant).exists()).toBe(false);
    await button(w, 'Publish reviewed edition').trigger('click'); await flushPromises();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('School Practice Guide'));
    expect(api.post).toHaveBeenCalledWith('/provider-update/company-documents/school-practice-guide/publish', { agencyId: 11, expectedVersionId: 32, expectedRevision: 5 });
    w.unmount();
  });
  it('ignores a late response after switching document keys', async () => {
    let resolve;
    api.get.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce({ data: handbook });
    const w = mount(Workspace, { props: { agencyId: 11, documentKey: 'school-practice-guide', documentTitle: 'School Practice Guide' } });
    await w.setProps({ documentKey: 'provider-guide', documentTitle: 'Provider’s Guide' }); await flushPromises();
    resolve({ data: school }); await flushPromises();
    expect(w.getComponent(Book).props('handbook').metadata.documentKey).toBe('provider-guide');
    expect(w.findComponent(Roadmap).exists()).toBe(false); w.unmount();
  });
  it('uses the server catalog to hide copied school links and clears the reader on company change', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:organizationSlug/library', component: { template: '<div />' } }, { path: '/:organizationSlug/outcome-measures', component: { template: '<div />' } }, { path: '/:organizationSlug/admin/document-library', component: { template: '<div />' } }] });
    await router.push('/itsco/library?companyDocument=school-practice-guide'); await router.isReady();
    api.get.mockResolvedValue({ data: { canManage: true, documents: [{ key: 'provider-guide', title: 'Provider’s Guide', published: null }, { key: 'school-practice-guide', title: 'School Practice Guide', published: { version_number: 1 } }] } });
    const w = mount(Library, { props: { agencyId: 11, orgPrefix: '/itsco' }, global: { plugins: [router], stubs: { CompanyReferenceWorkspace: { name: 'CompanyReferenceWorkspace', props: ['documentKey', 'documentTitle'], template: '<div class="workspace-stub">{{ documentTitle }}</div>' } } } }); await flushPromises();
    expect(w.findAll('.reference-cards button')).toHaveLength(3);
    expect(w.getComponent({ name: 'CompanyReferenceWorkspace' }).props('documentKey')).toBe('school-practice-guide');
    api.get.mockResolvedValue({ data: { canManage: true, documents: [{ key: 'provider-guide', title: 'Provider’s Guide' }] } });
    await w.setProps({ agencyId: 12, orgPrefix: '/nlu' });
    expect(w.find('.workspace-stub').exists()).toBe(false);
    await flushPromises();
    expect(w.find('.workspace-stub').exists()).toBe(false);
    expect(w.findAll('.reference-cards button')).toHaveLength(2);
    expect(w.text()).not.toContain('School Practice Guide');
    w.unmount();
  });
});
