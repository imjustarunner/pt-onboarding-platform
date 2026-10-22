import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import {RouterLinkStub} from '@vue/test-utils';
import {enrollmentLibraryLocation} from '../../../utils/enrollmentLibraryLocation.js';
import {MASTER_FORM_CHANNELS} from '../../../constants/masterFormChannels.js';
const api=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),patch:vi.fn()}));
const agencyStore=vi.hoisted(()=>({currentAgency:{id:99,slug:'other-agency'},userAgencies:[{id:2,slug:'itsco'}]}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>agencyStore}));
import SchoolPacket from '../../school/redesign/SchoolPacketTemplateEditor.vue';
import OfficePacket from '../../office/OfficePacketTemplateEditor.vue';
let wrapper;
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{agencyId:2,version:3,html_content:'<p>Saved school packet</p>',packetBrand:{useItscoChrome:true}}});});
afterEach(()=>wrapper?.unmount());
const global={stubs:{RouterLink:RouterLinkStub,HtmlDocumentBuilder:{name:'HtmlDocumentBuilder',props:{modelValue:String,mergeTokens:Array,paperMode:Boolean},emits:['update:modelValue'],template:'<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'}}};

it('routes packet management to its own agency and preserves the variant instead of using another current tenant',()=>{
 expect(enrollmentLibraryLocation({agencyId:2,agencies:[agencyStore.currentAgency,...agencyStore.userAgencies],setting:'school',schoolId:40,locale:'es'})).toEqual({path:'/itsco/library',query:{agencyId:'2',section:'enrollment',setting:'school',schoolId:'40',service:'counseling',audience:'guardian',locale:'es'}});
 expect(enrollmentLibraryLocation({agencyId:7,agencies:[agencyStore.currentAgency]})).toMatchObject({path:'/library',query:{agencyId:'7'}});
 expect(MASTER_FORM_CHANNELS.school.paperAdminPath).toBe('/admin/school-referral-hub');
 for(const key of ['office','tutoring']){expect(MASTER_FORM_CHANNELS[key].hasPrintable).toBe(true);expect(MASTER_FORM_CHANNELS[key].paperAdminPath).toContain('/library?section=enrollment');}
});
it('restores the school template editor and saves the selected language to its own agency',async()=>{
 wrapper=mount(SchoolPacket,{props:{schoolOrganizationId:40,initialLocale:'es'},global});await flushPromises();
 const builder=wrapper.findComponent({name:'HtmlDocumentBuilder'});
 expect(builder.props('modelValue')).toBe('<p>Saved school packet</p>');
 expect(builder.props('paperMode')).toBe(true);
 expect(builder.props('mergeTokens').map(item=>item.token)).toContain('{{SCHOOL_STAFF_TABLE}}');
 expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false);
 expect(wrapper.text()).toContain('Save resource copy');
 expect(api.get).toHaveBeenCalledWith('/public/agency-support/itsco',expect.anything());
 const save=wrapper.findAll('button').find(button=>button.text()==='Save');
 expect(save.element.disabled).toBe(true);
 await builder.find('textarea').setValue('<p>Updated school packet {{SCHOOL_NAME}}</p>');
 api.put.mockResolvedValueOnce({data:{html_content:'<p>Updated school packet {{SCHOOL_NAME}}</p>',version:4}});
 await save.trigger('click');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/school-portal/40/printable-packet/template',{html_content:'<p>Updated school packet {{SCHOOL_NAME}}</p>',locale:'es'});
 expect(wrapper.emitted('saved')).toEqual([[{version:4,locale:'es'}]]);
 expect(save.element.disabled).toBe(true);
 expect(wrapper.text()).toContain('Saved ES as V4 (archived).');
});
it('protects unsaved school edits when switching language',async()=>{
 wrapper=mount(SchoolPacket,{props:{schoolOrganizationId:40},global});await flushPromises();
 await wrapper.findComponent({name:'HtmlDocumentBuilder'}).find('textarea').setValue('<p>Unsaved change</p>');
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 const spanish=wrapper.findAll('button').find(button=>button.text()==='Español');
 try{
  await spanish.trigger('click');await flushPromises();
  expect(wrapper.findComponent({name:'HtmlDocumentBuilder'}).props('modelValue')).toBe('<p>Unsaved change</p>');
  expect(api.get).not.toHaveBeenCalledWith('/school-portal/40/printable-packet/template',{params:{locale:'es'}});
  confirm.mockReturnValue(true);
  await spanish.trigger('click');await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/school-portal/40/printable-packet/template',{params:{locale:'es'}});
 }finally{confirm.mockRestore();}
});
it('retains office downloads and historical versions while moving source editing into the library',async()=>{
 wrapper=mount(OfficePacket,{props:{agencyId:2,variant:'parent',initialLocale:'es'},global});await flushPromises();
 expect(wrapper.findComponent(RouterLinkStub).props('to')).toMatchObject({path:'/itsco/library',query:{agencyId:'2',setting:'office',audience:'guardian',locale:'es'}});
 expect(wrapper.text()).toContain('Download PDF');expect(wrapper.text()).toContain('Version history');
 expect(wrapper.text()).not.toContain('Use office default');expect(wrapper.findAll('button').some(button=>button.text()==='Save')).toBe(false);expect(api.put).not.toHaveBeenCalled();
});
