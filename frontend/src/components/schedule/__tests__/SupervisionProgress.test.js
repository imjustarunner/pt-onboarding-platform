import { expect,it,vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { supervisionProgress } from '../../../utils/supervisionProgress.js';
import Panel from '../SupervisionSuperviseePanel.vue';
it('shows actual individual/group attendance for interns and others outside the prelicensed tracker',async()=>{
 const load=vi.fn().mockResolvedValue({ok:true,individualHours:0.92,groupHours:0.57});
 const progress=await supervisionProgress({enabled:true,isPrelicensed:false},load);
 expect(progress).toMatchObject({mode:'attendance',individualHours:0.92,groupHours:0.57});
 const w=mount(Panel,{props:{...progress,progressMode:progress.mode}});
 expect(w.text()).toContain('0.92 hrs attended');expect(w.text()).toContain('0.57 hrs attended');expect(w.text()).not.toContain('remaining');w.unmount();
 const roster=mount(Panel,{props:{rosterMode:true,participants:[{id:20,name:'Intern',...progress}]}});
 expect(roster.text()).toContain('Recorded attendance');expect(roster.text()).toContain('0.57 hrs');roster.unmount();
});
it('keeps requirement balances for enrolled supervisees and reports attendance failures instead of showing zero',async()=>{
 const load=vi.fn();
 expect(await supervisionProgress({enabled:true,isPrelicensed:true,individualHours:16.95,groupHours:1},load)).toMatchObject({mode:'requirements',individualHours:16.95,groupHours:1});
 expect(load).not.toHaveBeenCalled();load.mockResolvedValue({});
 await expect(supervisionProgress({enabled:false},load)).rejects.toThrow('Unable to load');
});
