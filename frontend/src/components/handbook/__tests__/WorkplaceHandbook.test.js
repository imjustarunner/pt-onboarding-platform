import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Book from '../WorkplaceHandbookBook.vue';
import Reader from '../WorkplaceHandbookReader.vue';
import Workspace from '../WorkplaceHandbookWorkspace.vue';
import Admin from '../WorkplaceHandbookAdmin.vue';
import PolicyLinks from '../WorkplaceHandbookPolicyLinks.vue';
import Foundations from '../WorkplaceHandbookFoundations.vue';
import Portal from '../WorkplaceHandbookPortal.vue';
import HirePortalWorkspace from '../../prehire/HirePortalWorkspace.vue';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import api from '../../../services/api';

const sections = [
  { slug: 'foundations', title: 'Foundations of ITSCO', parent_slug: null, content_status: 'pending', source_page: 5 },
  { slug: 'welcome', title: 'Welcome', parent_slug: 'foundations', content_status: 'ready', body_html: '<p>Welcome to our community.</p>', source_page: 5 },
  { slug: 'history', title: 'History and background', parent_slug: 'foundations', content_status: 'pending', source_page: 6 }
];
const handbook = { sections, metadata: { organization: 'ITSCO', coverUrl: '/assets/handbooks/itsco-cover.png' }, version: { id: 10, version_number: 1, is_draft: 0 } };
beforeEach(() => { vi.resetAllMocks(); HTMLElement.prototype.scrollIntoView = vi.fn(); window.history.replaceState({}, '', '/'); });
describe('handbook reader', () => {
  it('renders ISI foundations and cover without importing another company’s founders', async () => {
    const mission = { slug: 'mission', title: 'Mission', content_status: 'ready', body_html: '<p>Compassionate counseling.</p>' };
    const metadata = { organization: 'Inner Strength Institute', coverUrl: '/assets/handbooks/isi-cover.png', presentation: { theme: 'isi-foundations', brandLabel: 'Inner Strength Institute', logoUrl: '/assets/branding/innerstrength-mark.png', historySectionSlug: 'purpose-and-background-of-inner-strength-institute', storyLabel: 'The purpose behind our practice', founders: [] } };
    const w = mount(Book, { props: { handbook: { sections: [mission], metadata } } });
    expect(w.find('.handbook-book').classes()).toContain('isi-foundations');
    expect(w.get('.purpose-signature').text()).toContain('Inner Strength Institute');
    expect(w.get('.cover-art').classes()).toContain('isi-cover');
    expect(w.get('.cover-art .cover-landscape').attributes('src')).toBe('/assets/tisi/mountain-banner.webp');
    expect(w.find('.founder-grid').exists()).toBe(false);
    expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only');
    expect(w.text()).not.toMatch(/ITSCO|Next Level Up|Rachel|Melissa/);
    w.unmount();
  });
  it('uses NLU branding and its own founders while retaining staff print restrictions', async () => {
    const story = { slug: 'history-and-background-of-next-level-up', title: 'History', content_status: 'ready', body_html: '<p>Michael and Melissa started NLU.</p>' };
    const metadata = { organization: 'Next Level Up', presentation: { theme: 'nlu-foundations', brandLabel: 'Next Level Up', logoUrl: '/assets/nlu/logo.png', historySectionSlug: story.slug, storyLabel: 'Our beginnings', founders: [{ name: 'Michael Mendez', photoUrl: '/michael.jpg' }, { name: 'Melissa Mendez' }] } };
    const w = mount(Book, { props: { handbook: { sections: [story], metadata } } });
    expect(w.find('.handbook-book').classes()).toContain('nlu-foundations');
    expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only');
    expect(w.get('.cover-logo').attributes('src')).toBe('/assets/nlu/logo.png');
    expect(w.get('.founder-grid').attributes('aria-label')).toBe('Next Level Up founders');
    expect(w.get('.founder-initials').text()).toBe('MM');
    expect(w.text()).not.toMatch(/ITSCO|Rachel|2022/);
    await w.setProps({ handbook: { sections: [{ ...story, slug: 'mission', title: 'Mission' }], metadata } });
    expect(w.get('.purpose-signature').text()).toContain('Next Level Up');
    w.unmount();
  });
  it('defaults to in-app reading and only reveals the original with explicit admin capabilities', async () => {
    const url = 'https://docs.google.com/document/d/original-handbook';
    const w = mount(Book, { props: { handbook, fullHandbookUrl: url } });
    expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only');
    expect(w.find(`a[href="${url}"]`).exists()).toBe(false);
    await w.setProps({ canOpenOriginal: true, canPrint: true });
    expect(w.find('.handbook-book').classes()).not.toContain('handbook-screen-only');
    expect(w.get(`a[href="${url}"]`).text()).toContain('Admin');
    await w.setProps({ fullHandbookUrl: 'javascript:alert(1)' });
    expect(w.find('a[href^="javascript:"]').exists()).toBe(false);
    w.unmount();
  });
  it.each(['token', 'auth'])('applies original-document capabilities correctly in %s mode', async accessMode => {
    const url = 'https://docs.google.com/document/d/original-handbook';
    api.get.mockResolvedValue({ data: { handbook, entries: [], fullHandbookUrl: url, access: { canOpenOriginal: true, canPrint: true } } });
    const w = mount(Reader, { props: { accessMode, token: 'invite', agencyId: 2 } });
    await flushPromises();
    expect(w.find(`a[href="${url}"]`).exists()).toBe(accessMode === 'auth');
    expect(w.find('.handbook-book').classes().includes('handbook-screen-only')).toBe(accessMode === 'token');
    expect(w.getComponent(Book).props('canPrint')).toBe(accessMode === 'auth');
    if (accessMode === 'auth') {
      api.get.mockResolvedValue({ data: { handbook, entries: [], fullHandbookUrl: url } });
      await w.setProps({ agencyId: 3 });
      await flushPromises();
      expect(w.find(`a[href="${url}"]`).exists()).toBe(false);
      expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only');
    }
    w.unmount();
  });
  it('distinguishes explicitly configured chapter openings from missing policy text', async () => {
    const w = mount(Book, { props: { handbook: { ...handbook, metadata: { presentation: { chapterDividers: ['foundations'] } } } } });
    await w.get('.outline-link[href="#handbook-foundations"]').trigger('click');
    expect(w.get('.book-page').text()).toContain('Explore the sections in this chapter.');
    expect(w.find('.pending-section').exists()).toBe(false);
    await w.get('.outline-link[href="#handbook-history"]').trigger('click');
    expect(w.get('.pending-section').text()).toContain('Text pending');
    w.unmount();
  });
  it('uses the published in-app handbook in the hire portal and never elevates token access', async () => {
    const http = { get: vi.fn().mockResolvedValue({ data: { available: true, handbook, fullHandbookUrl: 'https://docs.google.com/document/d/original-handbook', access: { canOpenOriginal: true, canPrint: true } } }) };
    const w = mount(Portal, { props: { http, token: 'candidate/token' } });
    await flushPromises();
    expect(http.get).toHaveBeenCalledWith('/prehire-portal/candidate%2Ftoken/resources/handbook');
    expect(w.get('.book-page').text()).toContain('Welcome to our community.');
    expect(w.getComponent(Book).props('canPrint')).toBe(false);
    expect(w.find('a[href^="https://docs.google.com"]').exists()).toBe(false);
    expect(w.emitted('available').at(-1)).toEqual([true]);
    http.get.mockResolvedValue({ data: { available: false } });
    await w.setProps({ token: 'another-candidate' });
    await flushPromises();
    expect(w.findComponent(Book).exists()).toBe(false);
    expect(w.emitted('available').at(-1)).toEqual([false]);
    expect(w.text()).toContain('before acknowledging');
    w.unmount();
  });
  it('loads the reference edition in optional review without enabling signature or published-only questions', async () => {
    const http = { get: vi.fn().mockResolvedValue({ data: { available: true, acknowledgeable: false, handbook: { ...handbook, beta: true, version: null } } }) };
    const w = mount(Portal, { props: { http, token: 'candidate', referenceOnly: true } });
    await flushPromises();
    expect(http.get).toHaveBeenCalledWith('/prehire-portal/candidate/resources/handbook?reference=1');
    expect(w.get('.book-page').text()).toContain('Welcome to our community.');
    expect(w.text()).toContain('Reference edition');
    expect(w.getComponent(Book).props('answerQuestion')).toBeNull();
    expect(w.emitted('available').at(-1)).toEqual([false]);
    expect(w.emitted('version').at(-1)).toEqual([null]);
    await w.setProps({ referenceOnly: false }); await flushPromises();
    expect(w.findComponent(Book).exists()).toBe(false);
    w.unmount();
  });
  it('lets an optional reader recover from a loading failure or contact the team without suggesting acknowledgement', async () => {
    const http = { get: vi.fn().mockRejectedValue(new Error('Offline')) };
    const w = mount(Portal, { props: { http, token: 'candidate', referenceOnly: true } });
    expect(w.get('[role="status"]').text()).toContain('Opening your workplace handbook');
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('continue your pre-hire steps');
    expect(w.text()).not.toContain('before acknowledging');
    await w.get('.contact-action').trigger('click');
    expect(w.emitted('help')).toHaveLength(1);
    http.get.mockResolvedValue({ data: { available: true, handbook } });
    await w.findAll('button').find(b => b.text() === 'Try again').trigger('click'); await flushPromises();
    expect(w.findComponent(Book).exists()).toBe(true);
    w.unmount();
  });
  it('keeps the pre-hire handbook an optional reference without an acknowledgment', async () => {
    const http = { get: vi.fn().mockResolvedValue({ data: { available: true, handbook } }), post: vi.fn().mockResolvedValue({ data: { ok: true } }), defaults: { baseURL: '/api' } };
    const data = { candidate: { status: 'PREHIRE_OPEN', firstName: 'Test', lastName: 'Person' }, agency: { id: 2, name: 'ITSCO' }, workflow: { config: {}, steps: { pre_hire: [{ key: 'handbook', kind: 'handbook', title: 'Workplace handbook', url: 'https://docs.google.com/document/d/old-handbook/edit' }], onboarding: [] } } };
    const w = mount(HirePortalWorkspace, { props: { data, http, token: 'candidate' } });
    await w.findAll('.hire-nav button').find(b => b.text().includes('Optional reference')).trigger('click');
    await flushPromises();
    expect(w.get('.book-page').text()).toContain('Welcome to our community.');
    expect(w.find('.resource-frame').exists()).toBe(false);
    expect(w.find('a[href^="https://docs.google.com"]').exists()).toBe(false);
    expect(w.text()).toContain('Optional reference');
    expect(w.get('.hire-topbar a[aria-label="Plotline PO by PlotTwistCo"]').exists()).toBe(true);
    expect(http.get).toHaveBeenCalledWith('/prehire-portal/candidate/resources/handbook?reference=1');
    expect(w.find('.check-label input').exists()).toBe(false);
    expect(http.post).not.toHaveBeenCalled();
    w.unmount();
  });
  it('submits the onboarding handbook version actually shown with its acknowledgment', async () => {
    const http = { get: vi.fn().mockResolvedValue({ data: { available: true, handbook } }), post: vi.fn().mockResolvedValue({ data: { ok: true } }), defaults: { baseURL: '/api' } };
    const data = { candidate: { status: 'ONBOARDING', firstName: 'Test', lastName: 'Person' }, agency: { id: 2, name: 'ITSCO' }, workflow: { config: {}, steps: { pre_hire: [], onboarding: [{ key: 'handbook', kind: 'handbook', title: 'Workplace handbook' }] } } };
    const w = mount(HirePortalWorkspace, { props: { data, http, token: 'candidate' }, global: { stubs: { AdaptiveSignatureCapture: true } } });
    await w.get('button[aria-label="View Workplace handbook"]').trigger('click');
    await flushPromises();
    await w.get('.check-label input').setValue(true);
    w.getComponent({ name: 'AdaptiveSignatureCapture' }).vm.$emit('update:modelValue', 'test-signature');
    await flushPromises();
    await w.findAll('button').find(b => b.text() === 'Sign acknowledgement').trigger('click');
    await flushPromises();
    expect(http.post).toHaveBeenCalledWith('/prehire-portal/candidate/workflow/handbook', expect.objectContaining({ handbookVersionId: 10, acknowledged: true, signatureData: 'test-signature' }));
    expect(w.emitted('reload')).toHaveLength(1);
    w.unmount();
  });
  it('keeps navigation outside scrolling content and tracks the current chapter', async () => {
    const w = mount(Book, { props: { handbook: { ...handbook, sections: [...sections, { slug: 'work', title: 'Our work', content_status: 'ready', body_html: '<p>Work guidance.</p>' }] } } });
    await w.get('.outline-link[data-section="welcome"]').trigger('click');
    expect(w.get('.chapter-picker select').element.value).toBe('foundations');
    expect(w.get('[aria-current="location"]').attributes('data-section')).toBe('welcome');
    expect(w.get('.page-navigation').element.parentElement.className).toBe('reader-pane');
    w.get('.book-page').element.scrollTop = 100;
    const next = w.get('.page-navigation button:last-child');
    await next.trigger('click'); await flushPromises();
    expect(w.get('.book-page').element.scrollTop).toBe(0);
    expect(w.get('[aria-current="location"]').attributes('data-section')).toBe('history');
    await next.trigger('click'); await flushPromises();
    expect(w.get('.chapter-picker select').element.value).toBe('work');
    expect(w.get('.chapter-outline').isVisible()).toBe(false);
    expect(w.get('.book-page').text()).toContain('Work guidance.');
    w.unmount();
  });
  it('styles current values without hiding later edits or unsafe markup', async () => {
    const w=mount(Foundations,{props:{section:{slug:'values',body_html:'<h4>Honesty</h4><p>Original value.</p>'}}});
    expect(w.findAll('.value-card')).toHaveLength(1);
    expect(w.text()).toContain('Original value.');
    await w.setProps({section:{slug:'values',body_html:'<h4>Honesty</h4><p>Revised value.</p><h4>Added value</h4><p>New guidance.</p>'}});
    expect(w.findAll('.value-card')).toHaveLength(2);
    expect(w.text()).toContain('Revised value.');
    expect(w.text()).toContain('New guidance.');
    await w.setProps({section:{slug:'values',body_html:'<p>New introduction.</p><h4>Honesty</h4><ul><li>Keep this addition.</li></ul><script>bad()</script>'}});
    expect(w.text()).toContain('New introduction.');
    expect(w.text()).toContain('Keep this addition.');
    expect(w.html()).not.toContain('<script>');
    w.unmount();
  });
  it('uses the founder portraits only in the configured founding story and keeps names when an image fails', async () => {
    const story={slug:'history-and-background-of-itsco',title:'History',content_status:'ready',body_html:'<p>Our shared history.</p>'};
    const founders=[{name:'Rachel Finch',photoUrl:'/rachel.jpg'},{name:'Michael Mendez',photoUrl:'/michael.jpg'}];
    const w=mount(Book,{props:{handbook:{sections:[story],metadata:{presentation:{theme:'itsco-foundations',founders}}}}});
    expect(w.findAll('.founder-portrait img')).toHaveLength(2);
    expect(w.get('img[alt="Rachel Finch"]').attributes('src')).toBe('/rachel.jpg');
    await w.get('img[alt="Rachel Finch"]').trigger('error');
    expect(w.get('.founder-initials').text()).toBe('RF');
    expect(w.get('.founder-grid').text()).toContain('Rachel Finch');
    await w.setProps({handbook:{sections:[story],metadata:{organization:'Another agency'}}});
    expect(w.find('.founder-grid').exists()).toBe(false);
    expect(w.text()).toContain('Our shared history.');
    w.unmount();
  });
  it('shows supplied content and clear pending states, and searches section text', async () => {
    const w = mount(Book, { props: { handbook } });
    expect(w.find('img').attributes('src')).toBe('/assets/handbooks/itsco-cover.png');
    expect(w.find('.book-page').text()).toContain('Welcome to our community.');
    await w.get('input[type="search"]').setValue('background');
    expect(w.findAll('.outline-link')).toHaveLength(1);
    await w.get('.outline-link').trigger('click');
    expect(w.find('.book-page').text()).toContain('Its full text is still being added here.');
    await w.get('input[type="search"]').setValue('community');
    expect(w.findAll('.outline-link')).toHaveLength(1);
    w.unmount();
  });
  it('does not execute stored HTML or accept unsafe original-document links', () => {
    const w = mount(Book, { props: { handbook: { ...handbook, sections: [{ ...sections[1], body_html: '<script>steal()</script><p onclick="steal()">Hello</p>' }] }, fullHandbookUrl: 'javascript:alert(1)' } });
    expect(w.html()).not.toContain('<script>');
    expect(w.html()).not.toContain('onclick=');
    expect(w.findAll('a[href^="javascript:"]')).toHaveLength(0);
    w.unmount();
  });
  it('clearly identifies associated draft updates without presenting missing section text as complete', async () => {
    const w = mount(Book, { props: { handbook, updates: [{ id: 2, handbook_section_slug: 'history', status: 'draft', subject: 'Proposed change', changed_content: '<p>Draft wording.</p>' }] } });
    await w.findAll('.outline-link').find(a => a.text().includes('History')).trigger('click');
    expect(w.find('.book-page').text()).toContain('Its full text is still being added here.');
    expect(w.find('.section-update').text()).toContain('Draft · awaiting publication');
    expect(w.find('.section-update').text()).toContain('Draft wording.');
    await w.get('input[type="search"]').setValue('Proposed change');
    expect(w.findAll('.outline-link')).toHaveLength(1);
    w.unmount();
  });
  it('keeps update review separate, opens the linked section, and identifies the acknowledged version', async () => {
    api.get.mockResolvedValue({ data: { handbook, digest: { id: 7, title: 'October updates' }, entries: [{ id: 4, subject: 'Welcome updated', handbook_section_slug: 'welcome', changed_content: '<p>Updated<script>bad()</script></p>' }] } });
    const w = mount(Reader, { props: { agencyId: 2 } });
    await flushPromises();
    expect(w.text()).toContain('October updates');
    expect(w.html()).not.toContain('<script>');
    await w.get('.ack-row button').trigger('click');
    expect(w.emitted('acknowledged')[0][0]).toEqual({ digestId: 7, handbookVersionId: 10 });
    expect(w.get('.policy-locations').text()).toContain('Foundations of ITSCO');
    expect(w.get('.policy-locations a').text()).toContain('Welcome');
    await w.get('.policy-locations a').trigger('click');
    await flushPromises();
    expect(w.find('.book-page').text()).toContain('Welcome to our community.');
    expect(window.location.hash).toBe('#handbook-welcome');
    // Review controls remain available when navigating into a linked policy.
    expect(w.find('.ack-row').exists()).toBe(true);
    w.unmount();
  });
  it('shows an error without an acknowledgment control when the request fails', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    const w = mount(Reader, { props: { agencyId: 2 } });
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('could not be loaded');
    expect(w.find('.ack-row').exists()).toBe(false);
    w.unmount();
  });
  it('opens a shared policy link directly even when a digest is also available', async () => {
    window.history.replaceState({}, '', '#handbook-welcome');
    api.get.mockResolvedValue({ data: { handbook, digest: { id:7 }, entries: [{ id:4, subject:'Update', handbook_section_slug:'welcome' }] } });
    const w = mount(Reader, { props: { agencyId:2 } });
    await flushPromises();
    expect(w.find('.book-page').text()).toContain('Welcome to our community.');
    w.unmount();
  });
  it('follows cross-references inside a policy and shows updates for secondary policy destinations', async () => {
    const linkedSections = sections.map(s => s.slug === 'welcome' ? { ...s, body_html:'<p>See <a href="#handbook-history">our history</a>.</p>' } : s.slug === 'history' ? { ...s, content_status:'ready', body_html:'<p>Our current history.</p>' } : s);
    const w = mount(Book, { props:{ handbook:{ ...handbook, sections:linkedSections }, updates:[{ id:4, subject:'Foundations revised', handbook_section_slug:'welcome', policy_section_slugs:['welcome','history'], status:'draft' }] } });
    await w.get('.handbook-prose a').trigger('click');
    await flushPromises();
    expect(w.get('.book-page').attributes('id')).toBe('handbook-history');
    expect(w.get('.book-page').text()).toContain('Our current history.');
    expect(w.get('.section-update').text()).toContain('Foundations revised');
    expect(window.location.hash).toBe('#handbook-history');
    w.unmount();
  });
  it('lists exact available policy locations and never links to pending or missing text', async () => {
    const w = mount(PolicyLinks, { props: { sections, entry: { policy_section_slugs:['welcome','welcome','history','missing'] } } });
    expect(w.findAll('a')).toHaveLength(1);
    expect(w.get('a').attributes('href')).toBe('#handbook-welcome');
    await w.get('a').trigger('click');
    expect(w.emitted('open')[0]).toEqual(['welcome']);
    w.unmount();
  });
  it('loads only through the token endpoint for an invited employee', async () => {
    api.get.mockResolvedValue({ data: { handbook, entries: [] } });
    const w = mount(Reader, { props: { accessMode: 'token', token: 'example/token' } });
    await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/public/provider-update/example%2Ftoken/handbook');
    w.unmount();
  });
});
describe('handbook workspace', () => {
  it('hides the original-document settings from support without removing content management', async () => {
    api.get.mockResolvedValue({ data: { digests: [], entries: [], access: { canOpenOriginal: false, canPrint: false }, fullHandbookUrl: 'https://docs.google.com/document/d/original-handbook' } });
    const w = mount(Admin, { props: { agencyId: 2 } });
    await flushPromises();
    expect(w.classes()).toContain('handbook-screen-only');
    expect(w.text()).not.toContain('Original handbook link');
    expect(w.findComponent(Workspace).exists()).toBe(true);
    w.unmount();
  });
  it('opens exact policies from the admin updater and refreshes a corrected destination', async () => {
    const readySections = sections.map(s => s.slug === 'history' ? { ...s, content_status:'ready', body_html:'<p>Current history.</p>' } : s);
    const digest = { id:7, title:'October updates', status:'draft' };
    const entry = { id:4, subject:'Welcome updated', handbook_section_slug:'welcome', policy_section_slugs:['welcome'], changed_content:'<p>Updated.</p>' };
    api.get.mockImplementation(async path => ({ data:
      path.endsWith('/workspace') ? { source:{ ...handbook.metadata, sections:readySections }, published:handbook, draft:null, changes:[] } :
      path.endsWith('/published') ? { handbook, entries:[] } :
      path.endsWith('/digests') ? { digests:[digest] } : { digest, entries:[{...entry}] }
    }));
    const w = mount(Admin, { props:{agencyId:2} });
    await flushPromises();
    await w.findAll('.handbook-tabs button').find(b => b.text() === 'Handbook Updates').trigger('click');
    await w.get('.policy-locations a').trigger('click');
    await flushPromises();
    expect(w.get('.book-page').text()).toContain('Welcome to our community.');
    expect(w.get('.handbook-tabs button').attributes('aria-pressed')).toBe('true');
    await w.findAll('.handbook-tabs button').find(b => b.text() === 'Handbook Updates').trigger('click');
    await w.get('.entry select').setValue('history');
    api.put.mockResolvedValue({ data:{ digest, entries:[{ ...entry, handbook_section_slug:'history', policy_section_slugs:['history'] }] } });
    await w.findAll('.entry button').find(b => b.text() === 'Connect section').trigger('click');
    await flushPromises();
    expect(w.get('.policy-locations a').attributes('href')).toBe('#handbook-history');
    await w.get('.policy-locations a').trigger('click');
    await flushPromises();
    expect(w.get('.book-page').text()).toContain('Current history.');
    w.unmount();
  });
  it('opens the current supplied policy from an admin update link', async () => {
    const source = { ...handbook.metadata, sections };
    api.get.mockResolvedValue({ data: { source, published:handbook, draft:null, changes:[] } });
    const w = mount(Workspace, { props:{agencyId:2} });
    await flushPromises();
    await w.vm.openSection('welcome');
    expect(w.get('select').element.value).toBe('source');
    expect(w.find('.book-page').text()).toContain('Welcome to our community.');
    w.unmount();
  });
  it('previews source before staging and requires publishing as a separate action', async () => {
    const source = { ...handbook.metadata, revision: 'source-one', sections };
    api.get.mockResolvedValueOnce({ data: { source, published: { version: null, sections: [] }, draft: null, changes: [] } });
    api.post.mockResolvedValue({ data: { versionId: 20 } });
    const w = mount(Workspace, { props: { agencyId: 2 } });
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
    api.get.mockResolvedValueOnce({ data: { source, published: { version: null, sections: [] }, draft: { ...handbook, version: { id: 20, version_number: 1, is_draft: 1, source_revision: 'source-one' } }, changes: [] } });
    await w.findAll('button').find(b => b.text() === 'Add supplied content to draft').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/provider-update/handbook/source/stage', { agencyId: 2, sourceRevision: 'source-one', expectedPublishedVersionId: null });
    expect(w.text()).toContain('will not announce every imported section');
    expect(w.get('.publish-button').text()).toBe('Publish handbook');
    w.unmount();
  });
});
