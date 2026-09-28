import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Editor from '../VirtualWorkingHoursEditor.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{rows:[{dayOfWeek:'Wednesday',startTime:'08:00',endTime:'09:00',availableForIntake:true,availableForSession:false,frequency:'WEEKLY'}]}});api.put.mockResolvedValue({data:{}});});
describe('virtual hours on behalf of providers',()=>{
 it('uses the selected provider and source agency and preserves the intake-only audience',async()=>{const w=mount(Editor,{props:{providerId:9,agencyId:3}});await flushPromises();await w.findAll('button').find(b=>b.text()==='Save').trigger('click');await flushPromises();expect(api.put).toHaveBeenCalledWith('/availability/providers/9/virtual-working-hours',expect.objectContaining({agencyId:3,rows:[expect.objectContaining({availableForIntake:true,availableForSession:false,sessionType:'INTAKE'})]}));w.unmount();});
 it('does not let a failed load replace published hours with an empty list',async()=>{api.get.mockRejectedValue(Error('offline'));const w=mount(Editor,{props:{providerId:9,agencyId:3}});await flushPromises();expect(w.findAll('button').find(b=>b.text()==='Save').element.disabled).toBe(true);expect(api.put).not.toHaveBeenCalled();w.unmount();});
 it('does not silently delete a row with an invalid time range',async()=>{const w=mount(Editor,{props:{providerId:9,agencyId:3}});await flushPromises();await w.findAll('input[type=time]')[1].setValue('07:00');await w.findAll('button').find(b=>b.text()==='Save').trigger('click');await flushPromises();expect(api.put).not.toHaveBeenCalled();expect(w.text()).toContain('end time later');w.unmount();});
});
it('requires an anchor for four-week availability and sends it for the selected provider',async()=>{
 const w=mount(Editor,{props:{providerId:9,agencyId:3}});await flushPromises();await w.findAll('select')[1].setValue('EVERY_4_WEEKS');
 const save=()=>w.findAll('button').find(b=>b.text()==='Save').trigger('click');await save();expect(api.put).not.toHaveBeenCalled();
 await w.findAll('input[type=date]')[0].setValue('2026-09-30');await save();await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/availability/providers/9/virtual-working-hours',expect.objectContaining({rows:[expect.objectContaining({frequency:'EVERY_4_WEEKS',startDate:'2026-09-30',dayOfWeek:'Wednesday'})]}));w.unmount();
});
