import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import View from '../LegalDocumentView.vue';
const state = vi.hoisted(() => ({route:null, branding:null, api:{get:vi.fn(),post:vi.fn()}}));
vi.mock('vue-router',()=>({useRoute:()=>state.route}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>state.branding}));
vi.mock('../../../services/api',()=>({default:state.api}));
beforeEach(()=>{
  vi.clearAllMocks();
  state.route=reactive({meta:{legalDocType:'privacypolicy'},params:{organizationSlug:'itsco'}});
  state.branding={platformBranding:{privacy_policy_url:'https://docs.google.com/document/d/old/preview'},initializePortalTheme:vi.fn(),fetchPlatformBranding:vi.fn()};
  state.api.get.mockResolvedValue({data:{role:'super_admin'}});
});
describe('native ITSCO legal routes',()=>{
  it('opens without a session, remote document, or platform-wide editor',async()=>{
    const w=mount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();
    expect(w.get('h1').text()).toBe('ITSCO Privacy Policy');
    expect(w.find('iframe').exists()).toBe(false);
    expect(w.find('.legal-editor').exists()).toBe(false);
    expect(state.api.get).not.toHaveBeenCalled();
    expect(state.branding.initializePortalTheme).not.toHaveBeenCalled();
    const print=vi.spyOn(window,'print').mockImplementation(()=>{});
    await w.get('.print-button').trigger('click');expect(print).toHaveBeenCalledOnce();print.mockRestore();w.unmount();
  });
  it('updates documents during navigation and does not show ITSCO text for another organization',async()=>{
    const w=mount(View,{global:{stubs:{RouterLink:true}}});
    state.route.meta.legalDocType='platformhipaa';await flushPromises();
    expect(w.get('h1').text()).toBe('ITSCO HIPAA Notice of Privacy Practices');
    state.route.params.organizationSlug='nlu';state.route.meta.legalDocType='privacypolicy';await flushPromises();
    expect(w.get('h1').text()).toBe('Next Level Up Privacy Policy');
    expect(w.text()).not.toContain('PO@ITSCO.health');
    expect(w.find('iframe').exists()).toBe(false);w.unmount();
  });
});
