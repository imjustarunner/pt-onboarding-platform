import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const mocks=vi.hoisted(()=>({route:{params:{},query:{agencyId:'2',versionId:'42'},hash:'#handbook-testing-services'},store:{userAgencies:[{id:2,slug:'itsco',name:'ITSCO'},{id:6,slug:'nlu',name:'Next Level Up'}],currentAgency:{id:6},fetchUserAgencies:vi.fn(async()=>{})},get:vi.fn(async()=>({data:{handbook:{sections:[]}}}))}));
vi.mock('vue-router',()=>({useRoute:()=>mocks.route,useRouter:()=>({push:vi.fn()})}));
vi.mock('../../store/agency',()=>({useAgencyStore:()=>mocks.store}));
vi.mock('../../services/api',()=>({default:{get:mocks.get}}));
vi.mock('../../components/handbook/WorkplaceHandbookReader.vue',()=>({default:{props:['agencyId'],template:'<div class="main-handbook">{{agencyId}}</div>'}}));
vi.mock('../../components/handbook/WorkplaceHandbookHistory.vue',()=>({default:{template:'<div />'}}));
vi.mock('../../components/documents/ContractHandbookModal.vue',()=>({default:{props:['open','agencyId','sectionSlug','expectedVersionId'],template:'<div v-if="open" class="cited-policy"><span>{{agencyId}} / {{expectedVersionId}} / {{sectionSlug}}</span><button @click="$emit(\'close\')">Close</button></div>'}}));
import View from '../WorkplaceHandbookView.vue';
beforeEach(()=>{vi.clearAllMocks();mocks.route.query={agencyId:'2',versionId:'42'};mocks.route.hash='#handbook-testing-services';});
const render=()=>mount(View,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});
it('opens an exported contract citation at its original company and version despite another working company',async()=>{
 const w=render();await flushPromises();expect(w.get('.main-handbook').text()).toBe('2');expect(w.get('.cited-policy').text()).toContain('2 / 42 / testing-services');await w.get('.cited-policy button').trigger('click');expect(w.find('.cited-policy').exists()).toBe(false);expect(w.get('.main-handbook').text()).toBe('2');w.unmount();
});
it('does not substitute the current company for an inaccessible referenced company',async()=>{
 mocks.route.query={agencyId:'377',versionId:'42'};const w=render();await flushPromises();expect(w.find('.cited-policy').exists()).toBe(false);expect(w.find('.main-handbook').exists()).toBe(false);expect(w.text()).toContain('could not be loaded');w.unmount();
});
it('keeps ordinary handbook reading free of an unversioned or malformed modal',async()=>{
 mocks.route.query={};const w=render();await flushPromises();expect(w.find('.cited-policy').exists()).toBe(false);expect(w.get('.main-handbook').text()).toBe('6');w.unmount();
});
