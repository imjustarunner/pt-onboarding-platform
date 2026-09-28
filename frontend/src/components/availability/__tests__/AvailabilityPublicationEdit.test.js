import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Editor from '../AvailabilityPublicationEdit.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{patch:vi.fn(),delete:vi.fn()}}));
const row={id:18,kind:'weekly',agencyId:2,dayOfWeek:'Monday',startTime:'16:00',endTime:'17:00',frequency:'EVERY_4_WEEKS',startDate:'2030-01-07',careTypes:['COUPLES']};
const render=(action='move',overrides={})=>mount(Editor,{props:{row:{...row,...overrides},action,providerId:9}});
beforeEach(()=>{vi.resetAllMocks();api.patch.mockResolvedValue({data:{ok:true}});api.delete.mockResolvedValue({data:{ok:true}});});
describe('opening occurrence editor',()=>{
 it('submits a future move with explicit anchor and selected care types',async()=>{const w=render();await w.find('input[type=radio][value=future]').setValue();const dates=w.findAll('input[type=date]');await dates[0].setValue('2030-01-07');await dates[1].setValue('2030-01-09');await w.findAll('input[type=time]')[0].setValue('15:00');await w.findAll('button')[1].trigger('click');await flushPromises();expect(api.patch).toHaveBeenCalledWith('/availability/providers/9/publications/weekly/18',expect.objectContaining({agencyId:2,scope:'future',occurrenceDate:'2030-01-07',startDate:'2030-01-09',startTime:'15:00',careTypes:['COUPLES']}));expect(w.emitted('saved')).toHaveLength(1);});
 it('never offers a series operation for a one-time opening',async()=>{const w=render('delete',{frequency:'ONCE'});expect(w.findAll('input[type=radio]')).toHaveLength(0);await w.findAll('button')[1].trigger('click');await flushPromises();expect(api.delete).toHaveBeenCalledWith(expect.any(String),{params:expect.objectContaining({scope:'single'})});});
 it('keeps the dialog open if the target office is unavailable',async()=>{api.patch.mockRejectedValue({response:{data:{error:{message:'Reserve the target office time first.'}}}});const w=render('move',{kind:'inPerson',startAt:'2030-01-07T23:00:00Z',endAt:'2030-01-08T00:00:00Z',seriesId:'a'});await w.findAll('button')[1].trigger('click');await flushPromises();expect(w.find('[role=alert]').text()).toContain('Reserve the target office');expect(w.emitted('saved')).toBeUndefined();});
});
