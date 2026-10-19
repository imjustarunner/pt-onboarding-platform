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
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{agencyId:2,version:3,packetBrand:{useItscoChrome:true}}});});
afterEach(()=>wrapper?.unmount());
const global={stubs:{RouterLink:RouterLinkStub}};

it('routes packet management to its own agency and preserves the variant instead of using another current tenant',()=>{
 expect(enrollmentLibraryLocation({agencyId:2,agencies:[agencyStore.currentAgency,...agencyStore.userAgencies],setting:'school',schoolId:40,locale:'es'})).toEqual({path:'/itsco/library',query:{agencyId:'2',section:'enrollment',setting:'school',schoolId:'40',service:'counseling',audience:'guardian',locale:'es'}});
 expect(enrollmentLibraryLocation({agencyId:7,agencies:[agencyStore.currentAgency]})).toMatchObject({path:'/library',query:{agencyId:'7'}});
 for(const key of ['school','office','tutoring']){expect(MASTER_FORM_CHANNELS[key].hasPrintable).toBe(true);expect(MASTER_FORM_CHANNELS[key].paperAdminPath).toContain('/library?section=enrollment');}
});
it('replaces the school packet editor with agency-scoped source documents and retains resource settings',async()=>{
 wrapper=mount(SchoolPacket,{props:{schoolOrganizationId:40,initialLocale:'es'},global});await flushPromises();
 expect(wrapper.findComponent(RouterLinkStub).props('to')).toMatchObject({path:'/itsco/library',query:{agencyId:'2',schoolId:'40',setting:'school',locale:'es'}});
 expect(wrapper.text()).toContain('Save resource copy');expect(wrapper.find('html-document-builder').exists()).toBe(false);
 expect(wrapper.findAll('button').some(button=>button.text()==='Save')).toBe(false);expect(api.put).not.toHaveBeenCalled();
 expect(api.get).toHaveBeenCalledWith('/public/agency-support/itsco',expect.anything());
});
it('retains office downloads and historical versions while moving source editing into the library',async()=>{
 wrapper=mount(OfficePacket,{props:{agencyId:2,variant:'parent',initialLocale:'es'},global});await flushPromises();
 expect(wrapper.findComponent(RouterLinkStub).props('to')).toMatchObject({path:'/itsco/library',query:{agencyId:'2',setting:'office',audience:'guardian',locale:'es'}});
 expect(wrapper.text()).toContain('Download PDF');expect(wrapper.text()).toContain('Version history');
 expect(wrapper.text()).not.toContain('Use office default');expect(wrapper.findAll('button').some(button=>button.text()==='Save')).toBe(false);expect(api.put).not.toHaveBeenCalled();
});
