import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import {reactive} from 'vue';
import Website from '../ItscoPublicWebsite.vue';
import api from '../../../services/api';

const route=reactive({params:{section:'providers'},query:{},fullPath:'/p/itsco/providers'});
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: vi.fn() })
}));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: null }) }));
const provider = { id: 1, displayName: 'Example Provider', firstName: 'Example', lastName: 'Provider', acceptingNewClients: true, schools: [], insurances: [], specialties: [], ageGroups: [], populations: [], modalities: [], details: {} };
let wrapper;
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('public directory background availability', () => {
  it('renders the provider heading and search immediately on a first visit without a loading screen or false empty results', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    let resolveWebsite;
    api.get.mockImplementation(url => url.endsWith('website-data') ? new Promise(resolve => { resolveWebsite = resolve; }) : Promise.resolve({data:{providers:[]}}));
    wrapper = mount(Website, {global:{stubs:{RouterLink:{props:['to'],template:'<a><slot/></a>'},PublicResourcesMenu:true,PublicProviderProfileEditor:true}}});
    expect(wrapper.find('h1').text()).toBe('Real People. A Brighter Tomorrow.');
    expect(wrapper.find('input[type="search"]').exists()).toBe(true);
    expect(wrapper.find('.its-profile-placeholders').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Loading ITSCO');
    expect(wrapper.text()).not.toContain('No matching providers');
    resolveWebsite({data:{agency:{id:1},providers:[provider],districts:[],team:[],metrics:{}}});await flushPromises();
    expect(wrapper.find('.its-profile-placeholders').exists()).toBe(false);
    expect(wrapper.find('.its-provider-card').text()).toContain('Example Provider');
  });
  it('keeps providers searchable during slow requests, and offers retry after a timeout', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const pending = [];
    api.get.mockImplementation((url) => url.endsWith('website-data')
      ? Promise.resolve({ data: { agency: { id: 1 }, providers: [provider], districts: [], team: [], metrics: {} } })
      : new Promise((resolve, reject) => pending.push({ resolve, reject })));
    wrapper = mount(Website, { global: { stubs: {
      RouterLink: { props: ['to'], template: '<a><slot/></a>' },
      ItscoInternships: true, PublicResourcesMenu: true, PublicProviderProfileEditor: true
    } } });
    await flushPromises();
    expect(pending).toHaveLength(2);
    expect(wrapper.text()).toContain('Checking current appointment availability');
    expect(wrapper.find('.its-provider-card').text()).toContain('Example Provider');
    await wrapper.find('input[type="search"]').setValue('Example');
    expect(wrapper.find('.its-provider-card').exists()).toBe(true);
    for (const [, config] of api.get.mock.calls) {
      expect(config).toMatchObject({ skipGlobalLoading: true, timeout: 60000 });
    }
    pending.forEach(({ reject }) => reject(new Error('timeout')));
    await flushPromises();
    expect(wrapper.text()).not.toContain('Checking current appointment availability');
    expect(wrapper.text()).toContain('Some online appointment times could not be checked');
    expect(wrapper.find('.its-provider-card').exists()).toBe(true);
    await wrapper.findAll('button').find(button => button.text() === 'Retry availability').trigger('click');
    expect(pending).toHaveLength(4);
    pending.slice(2).forEach(({ resolve }) => resolve({ data: { providers: [] } }));
    await flushPromises();
    expect(wrapper.text()).not.toContain('Some online appointment times could not be checked');
    route.query={search:'Example'};await flushPromises();expect(pending).toHaveLength(4);
    route.query={search:'Example',day:'weekends'};await flushPromises();expect(pending).toHaveLength(6);
    expect(api.get.mock.calls.at(-1)[1].params.day).toBe('weekends');
    pending.slice(4).forEach(({resolve})=>resolve({data:{providers:[]}}));await flushPromises();
    vi.unstubAllGlobals();
  });
});
