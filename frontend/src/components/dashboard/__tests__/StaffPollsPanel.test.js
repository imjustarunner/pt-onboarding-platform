import {it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
import api from '../../../services/api';
import Panel from '../StaffPollsPanel.vue';
const poll={id:12,title:'Staff date',question:'Which day?',options:[{key:'1',label:'Tuesday'}],closedAt:null,resultsText:false};
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:[structuredClone(poll)]});api.put.mockResolvedValue({data:{resultsText:true}});});
async function open(){const w=mount(Panel,{props:{agencyId:2}});w.get('details').element.open=true;await w.get('details').trigger('toggle');await flushPromises();return w;}
it('leaves result texts unselected until the participant requests them',async()=>{const w=await open();expect(w.get('input').element.checked).toBe(false);expect(api.put).not.toHaveBeenCalled();await w.get('input').setValue(true);await flushPromises();expect(api.put).toHaveBeenCalledWith('/me/staff-polls/12/results-preference',{resultsText:true},{params:{agencyId:2}});});
it('shows aggregate totals and no vote buttons after closure',async()=>{api.get.mockResolvedValue({data:[{...poll,closedAt:'2026-10-06',results:[{key:'1',label:'Tuesday',total:8}]}]});const w=await open();expect(w.text()).toContain('Tuesday: 8');expect(w.find('input').exists()).toBe(false);expect(w.findAll('button').map(b=>b.text())).toEqual(['Refresh polls']);});
it('restores the saved choice if its update is rejected',async()=>{api.put.mockRejectedValue(new Error('failed'));const w=await open();await w.get('input').setValue(true);await flushPromises();expect(w.get('input').element.checked).toBe(false);expect(w.get('[role=alert]').text()).toContain('Unable');});
