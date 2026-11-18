import {expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import Checklist from '../TransitionChecklist.vue';
import {CLIENT_STEPS,previewTransitionGroups,safeTransitionVideoUrl} from '../transitionPresentation';
const staff=[{id:1,name:'Example Records'},{id:2,name:'Example Scheduling'}];
it('submits separate assignees and preserves an unsaved draft when another record saves',async()=>{
 const saveItem=vi.fn().mockResolvedValue({});const w=mount(Checklist,{props:{kind:'clients',itemKey:'1:7',people:staff,steps:CLIENT_STEPS,row:{},saveItem}});
 await w.findAll('select')[0].setValue(1);await w.findAll('select')[1].setValue(2);await w.findAll('input[type=checkbox]')[0].setValue(true);
 await w.setProps({row:{note:'server-side previous note'}});expect(w.findAll('select')[0].element.value).toBe('1');
 await w.get('form').trigger('submit');await flushPromises();expect(saveItem).toHaveBeenCalledWith(expect.objectContaining({action:'workspace_item',kind:'clients',key:'1:7',patch:expect.objectContaining({recordsOwnerUserId:1,scheduleOwnerUserId:2,checks:expect.objectContaining({upToDate:true})})}));expect(w.emitted('dirty').at(-1)).toEqual([false]);w.unmount();
});
it('retains changes and shows the failure when validation rejects completion',async()=>{
 const w=mount(Checklist,{props:{kind:'clients',itemKey:'1:7',people:staff,steps:CLIENT_STEPS,row:{},saveItem:vi.fn().mockRejectedValue(Error('Assign the responsible person first.'))}});
 await w.get('input[type=checkbox]').setValue(true);await w.get('form').trigger('submit');await flushPromises();expect(w.text()).toContain('Assign the responsible person');expect(w.get('input[type=checkbox]').element.checked).toBe(true);expect(w.text()).toContain('Unsaved changes');w.unmount();
});
it('sorts known counts first, ties by upcoming count and ID, and keeps unknowns unranked',()=>{
 const people=Array.from({length:7},(_,i)=>({id:i+1,name:`Example ${i+1}`}));
 const rows=previewTransitionGroups(people,[{providerId:1,completedFourWeeks:4,upcomingWeek:3},{providerId:2,completedFourWeeks:0,upcomingWeek:0},{providerId:3,completedFourWeeks:4,upcomingWeek:2}]);
 expect(rows.slice(0,3).map(p=>p.providerId)).toEqual([2,3,1]);expect(rows.filter(p=>p.cohort===1)).toHaveLength(5);expect(rows[3].weeklyAverage).toBe(null);expect(rows.every(p=>p.rank===null)).toBe(true);
});
it('allows watch links but rejects active content and deceptive slash URLs',()=>{
 for(const url of ['javascript:alert(1)','//evil.test','/\\evil.test','https://u:p@example.test/v'])expect(safeTransitionVideoUrl(url)).toBe(null);
 expect(safeTransitionVideoUrl('/my-learning/video')).toBe('/my-learning/video');expect(safeTransitionVideoUrl('https://example.test/video')).toBe('https://example.test/video');
});
it('preserves request options while pinning every chart/file call to the selected practice',async()=>{
 const {transitionRequestScope}=await import('../../../utils/transitionRequestScope');const api={get:vi.fn(),post:vi.fn(),put:vi.fn()},scoped=transitionRequestScope(api,()=>377);
 scoped.get('/phi-documents/1/view',{responseType:'blob'});scoped.post('/clients/1/notes',{message:'Example'});scoped.put('/clients/1/provider',{provider_id:2});
 expect(api.get).toHaveBeenCalledWith('/phi-documents/1/view',{responseType:'blob',headers:{'X-Agency-Id':'377'}});
 expect(api.post.mock.calls[0][2].headers['X-Agency-Id']).toBe('377');expect(api.put.mock.calls[0][2].headers['X-Agency-Id']).toBe('377');
});
