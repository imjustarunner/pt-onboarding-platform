import {it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn()}));vi.mock('../../../services/api',()=>({default:api}));vi.mock('../../../store/branding',()=>({useBrandingStore:()=>({})}));
vi.mock('../../../composables/useProviderUpdateSession',()=>({useProviderUpdateSession:()=>({changeSection:vi.fn(),flush:vi.fn(),activeSeconds:{value:0},timeError:{value:''}})}));
vi.mock('../ProviderUpdateSectionPanel.vue',()=>({default:{name:'TestSectionEditor',props:['section'],emits:['saved'],template:'<div>{{section.key}}</div>'}}));
import Dashboard from '../ProviderUpdateDashboard.vue';
beforeEach(()=>{vi.clearAllMocks();Element.prototype.scrollIntoView=vi.fn();});
it('moves from a completed full page to the next page and focuses its top',async()=>{
 const sections=['admin_update','handbook'].map(key=>({key,completed:false,meta:{title:key}}));api.get.mockResolvedValue({data:{recipient:{},sections}});
 const w=mount(Dashboard,{props:{token:'test'},global:{stubs:{ProviderUpdateHelp:true}}});await flushPromises();await w.get('.pu-nav-item').trigger('click');
 w.findComponent({name:'TestSectionEditor'}).vm.$emit('saved',{sections:sections.map(s=>({...s,completed:s.key==='admin_update'}))});await flushPromises();
 expect(w.findComponent({name:'TestSectionEditor'}).props('section').key).toBe('handbook');expect(w.get('.pu-nav-item.active').text()).toContain('Handbook');expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({behavior:'smooth',block:'start'});w.unmount();
});
it('blocks navigation out of a profile page with missing top-three selections',async()=>{
 const sections=['specialties','handbook'].map(key=>({key,completed:false,meta:{title:key}}));api.get.mockResolvedValue({data:{recipient:{},sections}});
 const w=mount(Dashboard,{props:{token:'test'},global:{stubs:{ProviderUpdateHelp:true}}});await flushPromises();await w.get('.pu-nav-item').trigger('click');await w.findAll('.pu-nav-item')[1].trigger('click');await flushPromises();
 expect(w.findComponent({name:'TestSectionEditor'}).props('section').key).toBe('specialties');expect(w.text()).toContain('Complete specialties before continuing');w.unmount();
});
