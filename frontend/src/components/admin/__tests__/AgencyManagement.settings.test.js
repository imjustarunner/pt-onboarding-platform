import { shallowMount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRouter, createMemoryHistory } from 'vue-router';
const state=vi.hoisted(()=>({
  agency:{id:377,name:'Synthetic Practice',slug:'synthetic',organization_type:'agency',tax_id:'001234567',tax_id_type:'ein',is_active:true,feature_flags:{}},
  get:vi.fn(),post:vi.fn(),put:vi.fn()
}));
vi.mock('../../../services/api',()=>({default:{get:state.get,post:state.post,put:state.put}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:9,role:'admin'}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:state.agency,agencies:[state.agency],userAgencies:[state.agency]})}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>({platformBranding:{},fetchPlatformBranding:vi.fn(),getOrganizationName:()=> 'Practice'})}));
import AgencyManagement from '../AgencyManagement.vue';
import { SETTINGS_FIELD_TARGETS } from '../../../navigation/settingsFieldTargets';
beforeEach(()=>{
 vi.clearAllMocks();state.get.mockImplementation(async url=>({data:url==='/agencies/377'?state.agency:url==='/agencies'?[state.agency]:[]}));
});
describe('business settings editor',()=>{
 it('loads an existing agency and focuses its tax field without initialization errors or writes',async()=>{
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:organizationSlug/admin/settings',component:{template:'<div />'}}]});
  await router.push('/synthetic/admin/settings');await router.isReady();
  const w=shallowMount(AgencyManagement,{attachTo:document.body,props:{embeddedOrgId:377,embeddedTab:'contact',embeddedField:'tax-id',workspaceMode:true},global:{plugins:[router],stubs:{TaxIdInput:false}}});
  try {
   for(let i=0;i<5;i++)await flushPromises();
   expect(w.find('#agency-tax-id').element.value).toBe('00-1234567');
   expect(document.activeElement.id).toBe('agency-tax-id');
   expect(w.text()).toContain('Editing settings for Synthetic Practice');
   for (const target of SETTINGS_FIELD_TARGETS) {
    const search=w.find('input[placeholder="Tax ID, timezone, address, notifications…"]');await search.setValue(target.label);
    const hit=w.findAll('.workspace-field-results button').find(b=>b.find('strong').text()===target.label);
    expect(hit, target.label).toBeTruthy();await hit.trigger('click');await flushPromises();
    expect(document.activeElement.closest('[data-setting-field]')?.dataset.settingField,target.label).toBe(target.field);
   }
   expect(state.post).not.toHaveBeenCalled();expect(state.put).not.toHaveBeenCalled();
  }finally{w.unmount();}
 });
});
