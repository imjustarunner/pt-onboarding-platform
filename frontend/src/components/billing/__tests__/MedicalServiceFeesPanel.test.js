import {mount,flushPromises} from '@vue/test-utils';import {beforeEach,describe,it,expect,vi} from 'vitest';
import Panel from '../MedicalServiceFeesPanel.vue';import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{agreement:null,history:[],canEdit:false,activationEnabled:false}});api.put.mockResolvedValue({data:{revision:1}});});
describe('agency service agreement controls',()=>{
 it('lets billing staff read but not change platform prices',async()=>{const w=mount(Panel,{props:{agencyId:1}});await flushPromises();expect(w.text()).toContain('Live service fees are disabled');expect(w.find('button').exists()).toBe(false);expect(w.findAll('input').every(i=>i.element.disabled)).toBe(true);w.unmount();});
 it('converts an administrator’s percentage to basis points and binds the current agency',async()=>{api.get.mockResolvedValue({data:{agreement:null,history:[],canEdit:true,activationEnabled:false}});const w=mount(Panel,{props:{agencyId:1}});await flushPromises();const percent=w.findAll('label').find(l=>l.text().startsWith('Platform card fee'));await percent.find('input').setValue('1.25');await w.find('form').trigger('submit');await flushPromises();expect(api.put.mock.calls[0][1]).toMatchObject({agencyId:1,cardFeeBps:125,enabled:false});w.unmount();});
});
