import {beforeEach,it,expect,vi} from 'vitest';
import {mount,shallowMount,flushPromises} from '@vue/test-utils';
import {defineComponent} from 'vue';
const m=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),post:vi.fn(),flush:vi.fn(),draft:vi.fn(),focus:vi.fn(),timeError:{value:''}}));
vi.mock('../../../services/api',()=>({default:m}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{}})}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>({displayLogoUrl:null})}));
vi.mock('../../../composables/useProviderUpdateSession',()=>({useProviderUpdateSession:()=>({flush:m.flush,start:vi.fn(),stop:vi.fn(),changeSection:vi.fn(),timeError:m.timeError,activeSeconds:{value:0}})}));
import Dashboard from '../ProviderUpdateDashboard.vue';
import Section from '../ProviderUpdateSectionPanel.vue';
const bundle={recipient:{id:1,agencyId:2,providerUserId:22},sections:[{key:'profile_blurb',data:{blurb:'Original'},meta:{title:'Profile'},completed:false}],progress:{total:1,completed:0,percent:0},resumeSectionKey:'profile_blurb'};
const Editor=defineComponent({name:'ProviderUpdatePagePanel',setup(_,ctx){ctx.expose({saveDraft:m.draft,focusSection:m.focus});return ()=>null;}});
beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({data:bundle});m.put.mockResolvedValue({data:bundle});m.post.mockResolvedValue({data:{saved:true}});m.draft.mockResolvedValue(true);m.timeError.value='';Element.prototype.scrollIntoView=vi.fn();});
function dashboard(){return mount(Dashboard,{props:{token:'invite',agencyId:2},global:{stubs:{ProviderUpdatePagePanel:Editor,ProviderUpdateHelp:true}}});}
const saveButton=w=>w.findAll('button').find(b=>b.text()==='Save and come back later');
it('restores the saved section and saves progress before displaying the return link',async()=>{const w=dashboard();await flushPromises();expect(m.focus).toHaveBeenCalledWith('profile_blurb');await saveButton(w).trigger('click');await flushPromises();expect(m.draft).toHaveBeenCalled();expect(m.flush).toHaveBeenCalled();expect(m.post).toHaveBeenCalledWith('/public/provider-update/invite/save-for-later',expect.objectContaining({agencyId:2}));expect(w.text()).toContain('same link in your invitation email');expect(w.get('.pu-return input').attributes('readonly')).toBeDefined();w.unmount();});
it('does not report saved progress if the current draft fails',async()=>{m.draft.mockResolvedValue(false);const w=dashboard();await flushPromises();await saveButton(w).trigger('click');await flushPromises();expect(m.post).not.toHaveBeenCalled();expect(w.find('.pu-return').exists()).toBe(false);expect(w.text()).toContain('could not be saved');w.unmount();});
it('saves incomplete text without completing a section or changing untouched answers',async()=>{const w=shallowMount(Section,{props:{section:bundle.sections[0],token:'invite',agencyId:2,recipient:bundle.recipient}});await flushPromises();expect(await w.vm.saveDraft()).toBe(true);expect(m.put).not.toHaveBeenCalled();await w.get('textarea').setValue('My unfinished introduction');expect(await w.vm.saveDraft()).toBe(true);expect(m.put).toHaveBeenCalledWith('/public/provider-update/invite/sections/profile_blurb',{completed:false,status:'in_progress',data:{blurb:'My unfinished introduction'}});w.unmount();});
it('shows failed draft writes instead of claiming success',async()=>{m.put.mockRejectedValue({response:{data:{error:{message:'Please reconnect'}}}});const w=shallowMount(Section,{props:{section:bundle.sections[0],token:'invite',agencyId:2,recipient:bundle.recipient}});await flushPromises();await w.get('textarea').setValue('Draft');expect(await w.vm.saveDraft()).toBe(false);expect(w.text()).toContain('Please reconnect');w.unmount();});
