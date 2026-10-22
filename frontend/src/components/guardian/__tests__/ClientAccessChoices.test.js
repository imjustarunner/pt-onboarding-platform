import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
import api from '../../../services/api';
import Choices from '../ClientAccessChoices.vue';
let state;
beforeEach(()=>{vi.resetAllMocks();state={status:'not_requested',version:0,helpers:[{id:5,name:'Parent'}],agencies:[{id:2,name:'Clinic A'},{id:7,name:'Clinic B'}],choices:[]};api.get.mockImplementation(async()=>({data:state}));api.post.mockImplementation(async()=>{state={...state,status:'requested',version:1};return {data:{status:'requested'}};});});
it('requires confirmation and requests only the selected helper and agency scopes',async()=>{
 const w=mount(Choices);await flushPromises();expect(w.find('button[type=submit]').exists()).toBe(false);expect(w.find('form button').attributes('disabled')).toBeDefined();
 await w.findAll('select')[0].setValue('billing');await w.find('.confirm input').setValue(true);await w.find('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/dependent-portal/independence/request',{version:0,confirmed:true,choices:[{helperUserId:5,agencyId:2,scopes:['billing']},{helperUserId:5,agencyId:7,scopes:[]}]});
 expect(w.text()).toContain('Existing access has not changed yet');expect(w.text()).toContain('Review requested');expect(api.put).not.toHaveBeenCalled();
});
it('revokes all assistance through the independent client action, without a parent approval step',async()=>{
 state.status='active';state.version=4;state.choices=[{helperUserId:5,agencyId:2,scopes:['billing','insurance']}];api.put.mockResolvedValue({data:{saved:true}});
 const w=mount(Choices);await flushPromises();await w.findAll('select')[0].setValue('none');await w.find('.confirm input').setValue(true);await w.find('form').trigger('submit');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/dependent-portal/independence/assistance',expect.objectContaining({version:4,choices:[{helperUserId:5,agencyId:2,scopes:[]},{helperUserId:5,agencyId:7,scopes:[]}]}));expect(api.post).not.toHaveBeenCalled();
});
it('changing a permission clears the prior confirmation and never offers clinical or password access',async()=>{
 const w=mount(Choices);await flushPromises();await w.find('.confirm input').setValue(true);await w.findAll('select')[0].setValue('administrative');
 expect(w.find('.confirm input').element.checked).toBe(false);expect(w.findAll('fieldset input').map(x=>x.attributes('value'))).not.toEqual(expect.arrayContaining(['clinical','messages','password']));
});
it('shows a stale-version failure without claiming permissions changed',async()=>{
 state.status='active';api.put.mockRejectedValue({response:{data:{error:{message:'Access choices changed. Refresh before saving.'}}}});
 const w=mount(Choices);await flushPromises();await w.find('.confirm input').setValue(true);await w.find('form').trigger('submit');await flushPromises();expect(w.find('[role=alert]').text()).toContain('Refresh before saving');expect(w.text()).not.toContain('permissions are updated');
});
