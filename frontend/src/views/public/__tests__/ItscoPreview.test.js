import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Itsco from '../ItscoPublicWebsite.vue';
import api from '../../../services/api';
const route = vi.hoisted(() => ({ query: { marketingPreview: '1' }, params: {}, fullPath: '/p/itsco?marketingPreview=1' }));
vi.mock('vue-router', () => ({ useRoute: () => route }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
const fixture = { agency: { id: 1 }, content: { heroTitle: 'Published title' }, settings: {}, districts: [], providers: [], team: [], insurances: [], metrics: { studentsSupported: null, schools: 0, districts: 0, teamMembers: 0 } };
const parent = { postMessage: vi.fn() };
function message(overrides = {}) {
  window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: parent, data: { type: 'marketing-preview', page: { slug: 'itsco', heroTitle: 'Draft title', branding: { logoUrl: '/uploads/draft-logo.png' } } }, ...overrides }));
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('ITSCO unsaved website preview', () => {
  it('accepts only its own same-origin editor and overlays drafts without replacing directory data', async () => {
    vi.stubGlobal('parent', parent);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    api.get.mockResolvedValue({ data: fixture });
    const wrapper = mount(Itsco, { global: { stubs: { RouterLink: { template: '<a><slot/></a>' }, PublicResourcesMenu: true, PublicProviderProfileEditor: true, ItscoSupportForm: true } } });
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe('Published title');
    message({ origin: 'https://untrusted.example' });
    message({ source: window });
    message({ data: { type: 'marketing-preview', page: { slug: 'kimi', heroTitle: 'Wrong website' } } });
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe('Published title');
    message(); await flushPromises();
    expect(wrapper.find('h1').text()).toBe('Draft title');
    expect(wrapper.find('.its-brand img').attributes('src')).toBe('/uploads/draft-logo.png');
    expect(fixture.content.heroTitle).toBe('Published title');
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'marketing-preview-ready' }, window.location.origin);
    wrapper.unmount();
  });
});
