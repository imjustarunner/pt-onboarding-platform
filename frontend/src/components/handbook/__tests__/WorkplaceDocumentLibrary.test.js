import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Library from '../WorkplaceDocumentLibrary.vue';
import Editor from '../HandbookSectionEditor.vue';
import Workspace from '../WorkplaceHandbookWorkspace.vue';
import Book from '../WorkplaceHandbookBook.vue';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
import api from '../../../services/api';

const catalog = [{ key: 'workplace-handbook', title: 'Workplace Handbook', version: '1.0.0', owner: 'Plot Twist CO', sectionCount: 30, requiredSections: [{ slug: 'company-foundations', title: 'Mission', prompt: 'Write your mission.' }] }];
const companies = [{ id: 31, name: 'Cedar Studio', slug: 'cedar', assignment_id: 9, template_version: '1.0.0' }, { id: 32, name: 'Pine Company', slug: 'pine' }];
const sections = [{ id: 1, slug: 'welcome', title: 'Welcome', sort_order: 0, content_status: 'ready', body_html: '<p>Original text</p><table><tbody><tr><td><p>Existing table</p></td></tr></tbody></table>' }];
beforeEach(() => { vi.resetAllMocks(); api.post.mockResolvedValue({ data: {} }); api.delete.mockResolvedValue({ data: {} }); });
describe('company document library', () => {
  it('shows persistent package context, filters company names and opens a chosen edition', async () => {
    const w = mount(Library, { props: { catalog, companies, selectedId: 31, canAssign: true } });
    expect(w.text()).toContain('Included in Basic');
    expect(w.text()).toContain('template 1.0.0');
    await w.get('input[type="search"]').setValue('pine');
    expect(w.findAll('.company-row')).toHaveLength(1);
    await w.get('.company-row').trigger('click'); expect(w.emitted('select')[0]).toEqual([32]);
    await w.setProps({ selectedId: 32 });
    await w.get('.assign-button').trigger('click');
    expect(w.emitted('assign')[0]).toEqual([{ agencyId: 32, key: 'workplace-handbook', version: '1.0.0' }]);
    await w.setProps({ canAssign: false });
    expect(w.find('.assign-button').exists()).toBe(false);
    expect(w.text()).toContain('platform administrator'); w.unmount();
  });
  it('uses company branding with search and no staff download actions', async () => {
    const w = mount(Book, { props: { handbook: { metadata: { organization: 'Cedar Studio', template: { version: '1.0.0' }, presentation: { theme: 'company-foundations', primaryColor: '#28354a' } }, sections } } });
    expect(w.get('.branded-cover').attributes('style')).toContain('#28354a');
    expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only');
    expect(w.find('a[download]').exists()).toBe(false);
    await w.get('input[type="search"]').setValue('Original');
    expect(w.findAll('.outline-link')).toHaveLength(1);
    expect(w.text()).not.toMatch(/ITSCO|Next Level Up|Inner Strength/); w.unmount();
  });
  it('keeps publication disabled until the required company topics are complete', async () => {
    api.get.mockResolvedValue({ data: { published: { version: null }, source: null, changes: [], draft: { version: { id: 8, version_number: 1 }, sections, metadata: { template: catalog[0] }, requiredCompanySections: catalog[0].requiredSections } } });
    const w = mount(Workspace, { props: { agencyId: 31 } }); await flushPromises();
    expect(w.get('.publish-button').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('Complete 1 company setup topics');
    expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });
});
describe('company section editing', () => {
  it('preserves tables and stable identity, and sends the original revision for conflict checking', async () => {
    const w = mount(Editor, { props: { agencyId: 31, versionId: 8, sections } }); await flushPromises();
    expect(w.find('table').text()).toContain('Existing table');
    expect(w.text()).not.toContain('Unsaved changes');
    await w.get('input[maxlength="255"]').setValue('Welcome, team');
    await w.get('form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledOnce();
    const payload = api.post.mock.calls[0][1];
    expect(payload).toMatchObject({ agencyId: 31, sectionId: 1, expectedVersionId: 8, title: 'Welcome, team', expectedSection: { title: 'Welcome', bodyHtml: sections[0].body_html, sortOrder: 0 } });
    expect(payload.bodyHtml).toContain('<table');
    expect(payload.slug).toBeUndefined();
    expect(w.emitted('saved')).toHaveLength(1); w.unmount();
  });
  it('shows a conflict without claiming the section was saved', async () => {
    api.post.mockRejectedValue({ response: { data: { error: { message: 'This section was changed by another administrator.' } } } });
    const w = mount(Editor, { props: { agencyId: 31, versionId: 8, sections } }); await flushPromises();
    await w.get('input[maxlength="255"]').setValue('My changed title');
    await w.get('form').trigger('submit'); await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('another administrator');
    expect(w.emitted('saved')).toBeUndefined(); expect(w.text()).toContain('Unsaved changes'); w.unmount();
  });
  it('requires confirmation before removing a section and prevents removing required setup topics', async () => {
    const w = mount(Editor, { props: { agencyId: 31, versionId: 8, sections } }); await flushPromises();
    await w.findAll('button').find(b => b.text() === 'Delete section…').trigger('click');
    expect(api.delete).not.toHaveBeenCalled();
    await w.findAll('button').find(b => b.text() === 'Remove from draft').trigger('click'); await flushPromises();
    expect(api.delete.mock.calls[0][1].data).toMatchObject({ agencyId: 31, expectedVersionId: 8, expectedSection: { title: 'Welcome' } });
    w.unmount();
    const required = mount(Editor, { props: { agencyId: 31, versionId: 8, sections, requiredSections: [{ slug: 'welcome', prompt: 'Supply your own welcome.' }] } }); await flushPromises();
    expect(required.text()).toContain('Supply your own welcome.');
    expect(required.text()).not.toContain('Delete section…'); required.unmount();
  });
});
