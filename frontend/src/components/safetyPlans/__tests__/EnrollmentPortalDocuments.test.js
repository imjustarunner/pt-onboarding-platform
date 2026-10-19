import {mount,shallowMount,flushPromises} from '@vue/test-utils';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
import EnrollmentPortalDocuments from '../../enrollment/EnrollmentPortalDocuments.vue';
import ShareDialog from '../../enrollment/EnrollmentDocumentShareDialog.vue';
import SafetyPlanDocument from '../SafetyPlanDocument.vue';
import PhiDocumentsPanel from '../../admin/PhiDocumentsPanel.vue';
import ClientMedicalRecordsTab from '../../admin/ClientMedicalRecordsTab.vue';
import ClientDocumentsTab from '../../admin/clientChart/ClientDocumentsTab.vue';
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:8,role:'provider'}})}));
vi.mock('../../../composables/useClientEncounterNote.js',()=>({useClientEncounterNote:()=>({openingId:null,openClinicalNote:vi.fn()})}));
let wrapper;
const catalog={branding:{name:'Synthetic Agency'},client:{id:41,name:'Synthetic Client'},documents:[{key:'privacy',title:'Privacy notice'},{key:'insurance',title:'Insurance information'}]};
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(url=>Promise.resolve({data:url.includes('/catalog')?catalog:url==='/clinical-forms'?{plans:[{id:71,documentName:'Named consent',title:'Privacy notice',version:2,sharedCount:1,signedCount:1,pendingSignatures:0,reviewStatus:'pending'}]}:[]}));api.post.mockResolvedValue({data:{id:72}});});
afterEach(()=>wrapper?.unmount());
async function mountPortal(){wrapper=mount(EnrollmentPortalDocuments,{props:{clientId:41,agencyId:2},global:{stubs:{SafetyPlansPanel:{props:['clientId','agencyId','initialRecordId','recordOnly'],template:'<div class="document-editor">Document editor</div>'}}}});await flushPromises();}
it('shows named documents with portal status and creates an auto-linked source snapshot',async()=>{
 await mountPortal();expect(wrapper.text()).toContain('AuricWell');expect(wrapper.text()).toContain('Named consent');expect(wrapper.text()).toContain('1 shared');
 await wrapper.find('.document-cards button').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/enrollment-portal/clients/41/documents',expect.objectContaining({agencyId:2,foundationKey:'privacy',context:{channel:'office',audience:'guardian',service:'counseling',locale:'en'},data:expect.objectContaining({personLabel:'Synthetic Client',documentName:'Privacy notice'})}));
 expect(api.post.mock.calls[0][1]).not.toHaveProperty('html');expect(wrapper.find('.document-editor').exists()).toBe(true);
});
it('clears the previous client records when the new client is denied access',async()=>{
 await mountPortal();api.get.mockRejectedValue({response:{status:403,data:{error:{message:'Denied'}}}});
 await wrapper.setProps({clientId:42});await flushPromises();expect(wrapper.text()).not.toContain('Named consent');expect(wrapper.text()).not.toContain('Synthetic Client');expect(wrapper.text()).toContain('Denied');
});
it('exposes a leave guard during creation and preserves unsaved portal answers until discard is accepted',async()=>{
 let finish;api.post.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const confirmDiscard=vi.fn(()=>false);
 wrapper=mount(EnrollmentPortalDocuments,{props:{clientId:41,agencyId:2},global:{stubs:{SafetyPlansPanel:{template:'<div class="document-editor">Unsaved answers</div>',methods:{confirmDiscard}}}}});
 await flushPromises();expect(wrapper.vm.prepareToLeave()).toBe(true);
 await wrapper.find('.document-cards button').trigger('click');expect(wrapper.vm.prepareToLeave()).toBe(false);
 finish({data:{id:72}});await flushPromises();expect(wrapper.vm.prepareToLeave()).toBe(false);expect(confirmDiscard).toHaveBeenCalled();
 const back=wrapper.findAll('button').find(button=>button.text().includes('All portal documents'));
 await back.trigger('click');expect(wrapper.find('.document-editor').exists()).toBe(true);
 confirmDiscard.mockReturnValue(true);expect(wrapper.vm.prepareToLeave()).toBe(true);
 await back.trigger('click');await flushPromises();expect(wrapper.find('.document-editor').exists()).toBe(false);
});
it('guards the medical record tabs before unmounting portal or clinical answers',async()=>{
 const prepareToLeave=vi.fn(()=>false),confirmDiscard=vi.fn(()=>false);
 wrapper=shallowMount(ClientMedicalRecordsTab,{props:{clientId:41,agencyId:2},global:{stubs:{EnrollmentPortalDocuments:{template:'<div class="portal-editor" />',methods:{prepareToLeave}},SafetyPlansPanel:{template:'<div class="clinical-editor" />',methods:{confirmDiscard}}}}});
 await flushPromises();const tabs=wrapper.findAll('.medical-document-tabs button');
 await tabs[1].trigger('click');expect(prepareToLeave).toHaveBeenCalled();expect(wrapper.find('.portal-editor').exists()).toBe(true);
 prepareToLeave.mockReturnValue(true);await tabs[1].trigger('click');expect(wrapper.find('.clinical-editor').exists()).toBe(true);
 await tabs[2].trigger('click');expect(confirmDiscard).toHaveBeenCalled();expect(wrapper.find('.clinical-editor').exists()).toBe(true);
 confirmDiscard.mockReturnValue(true);await tabs[2].trigger('click');expect(wrapper.find('.clinical-editor').exists()).toBe(false);expect(wrapper.find('.paper-enrollment-upload').exists()).toBe(true);
});
it('keeps the portal section expanded when its editor blocks closing',async()=>{
 const prepareToLeave=vi.fn(()=>false);
 wrapper=shallowMount(ClientDocumentsTab,{props:{clientId:41,client:{agency_id:2}},global:{stubs:{EnrollmentPortalDocuments:{template:'<div class="portal-editor" />',methods:{prepareToLeave}}}}});
 await flushPromises();const details=wrapper.find('details'),summary=details.find('summary');
 await summary.trigger('click');expect(wrapper.find('.portal-editor').exists()).toBe(true);
 await summary.trigger('click');expect(prepareToLeave).toHaveBeenCalled();expect(details.element.open).toBe(true);expect(wrapper.find('.portal-editor').exists()).toBe(true);
 details.element.open=false;await details.trigger('toggle');expect(details.element.open).toBe(true);expect(wrapper.find('.portal-editor').exists()).toBe(true);
 prepareToLeave.mockReturnValue(true);await summary.trigger('click');expect(details.element.open).toBe(false);expect(wrapper.find('.portal-editor').exists()).toBe(false);
});
it('renders the official source read-only and removes active HTML and fake inputs',()=>{
 wrapper=mount(SafetyPlanDocument,{props:{modelValue:{personLabel:'Synthetic'},template:{key:'enrollment-document',title:'Privacy',sourceHtml:'<h2>Official source</h2><script>bad()</script><input value="Forged"><p onclick="bad()">Read it</p>',sections:[]},branding:{name:'Synthetic Agency'},editable:true}});
 expect(wrapper.find('.enrollment-source').text()).toContain('Official source');expect(wrapper.find('.enrollment-source input').exists()).toBe(false);expect(wrapper.find('.enrollment-source script').exists()).toBe(false);expect(wrapper.find('.enrollment-source p').attributes('onclick')).toBeUndefined();
});
it('lets assigned providers upload paper enrollment under the explicit type and retains that type for subsequent files',async()=>{
 wrapper=mount(PhiDocumentsPanel,{props:{clientId:41,section:'files',embedded:true,defaultDocumentType:'full_paper_enrollment'}});await flushPromises();
 expect(wrapper.text()).toContain('Choose files');
 const input=wrapper.find('input[type=file]');Object.defineProperty(input.element,'files',{value:[new File(['synthetic'],'paper.pdf',{type:'application/pdf'})]});
 await input.trigger('change');await flushPromises();
 expect(api.post.mock.calls[0][0]).toBe('/phi-documents/clients/41/upload');expect(api.post.mock.calls[0][1].get('documentType')).toBe('full_paper_enrollment');expect(api.post.mock.calls[0][1].get('documentTitle')).toBe('Full paper enrollment');expect(wrapper.find('input[list=phi-doc-type-list]').element.value).toBe('full_paper_enrollment');
});

it('starts an independently shared library document through the agency-scoped client picker',async()=>{
 wrapper=mount(ShareDialog,{props:{document:{agencyId:2,key:'privacy',title:'Privacy notice',channel:'school',audience:'self',service:'tutoring',locale:'en'}},global:{stubs:{NoteAidClientPicker:{name:'NoteAidClientPicker',props:['agencyId','searchAllTenants'],emits:['update:modelValue'],template:'<button class="pick-client" @click="$emit(\'update:modelValue\',41)">Choose synthetic client</button>'},SafetyPlansPanel:true}}});
 const picker=wrapper.findComponent({name:'NoteAidClientPicker'});expect(picker.props('agencyId')).toBe(2);expect(picker.props('searchAllTenants')).toBe(false);
 await wrapper.find('.pick-client').trigger('click');await wrapper.find('button.primary').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/enrollment-portal/clients/41/documents',expect.objectContaining({context:{channel:'school',audience:'self',service:'tutoring',locale:'en'},foundationKey:'privacy'}));expect(wrapper.emitted('done')[0][0]).toEqual({clientId:41,recordId:72});
});

it('blocks leaving while a client snapshot is being created and honors unsaved answers before closing',async()=>{
 let finishCatalog;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finishCatalog=resolve;}));
 const confirmDiscard=vi.fn(()=>false);
 wrapper=mount(ShareDialog,{props:{document:{agencyId:2,key:'privacy',title:'Privacy notice',channel:'office'}},global:{stubs:{
  NoteAidClientPicker:{emits:['update:modelValue'],template:'<button class="pick-client" @click="$emit(\'update:modelValue\',41)">Choose client</button>'},
  SafetyPlansPanel:{template:'<div>Editable document</div>',methods:{confirmDiscard}}
 }}});
 await wrapper.find('.pick-client').trigger('click');await wrapper.find('button.primary').trigger('click');
 expect(wrapper.vm.prepareToLeave()).toBe(false);
 await wrapper.find('[aria-label="Close document sharing"]').trigger('click');expect(wrapper.emitted('close')).toBeUndefined();
 finishCatalog({data:catalog});await flushPromises();
 expect(wrapper.vm.prepareToLeave()).toBe(false);expect(confirmDiscard).toHaveBeenCalled();
 await wrapper.find('.enrollment-share-overlay').trigger('click');expect(wrapper.emitted('close')).toBeUndefined();
 confirmDiscard.mockReturnValue(true);expect(wrapper.vm.prepareToLeave()).toBe(true);
 await wrapper.find('[aria-label="Close document sharing"]').trigger('click');expect(wrapper.emitted('close')).toHaveLength(1);
});
