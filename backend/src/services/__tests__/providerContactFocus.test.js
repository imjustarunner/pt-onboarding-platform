import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(async()=>[[]])}}));
vi.mock('../../models/UserWorkSchedule.model.js',()=>({default:{getForUser:vi.fn(async()=>({})),upsertForUser:vi.fn()}}));
vi.mock('../../models/UserPreferences.model.js',()=>({default:{findByUserId:vi.fn(async()=>({})),update:vi.fn()}}));
import {validateContactHours,saveContactHours} from '../providerUpdateContactHours.service.js';
import Work from '../../models/UserWorkSchedule.model.js';import Prefs from '../../models/UserPreferences.model.js';
import {FOCUS_GROUPS,validateFocus,validateMatchingPreferences,focusMatch,publishedFocus} from '../../../../frontend/src/navigation/providerFocus.js';
import {providerActionItems} from '../../utils/clientLifecycleAction.js';
const emptyFocus=()=>({top:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,[]])),excluded:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,[]]))});
it('validates daily hours, rejects overlaps and invalid days, and permits adjacent windows',()=>{
 const value={mode:'custom',timezone:'America/Denver',blocks:[{dayOfWeek:1,startTime:'09:00',endTime:'12:00'},{dayOfWeek:1,startTime:'12:00',endTime:'17:00'}]};expect(validateContactHours(value).blocks).toHaveLength(2);
 for(const patch of [{blocks:[]},{timezone:'fake/zone'},{blocks:[{dayOfWeek:7,startTime:'09:00',endTime:'17:00'}]},{blocks:[value.blocks[0],{...value.blocks[1],startTime:'11:00'}]}])expect(()=>validateContactHours({...value,...patch})).toThrow();
 expect(validateContactHours({mode:'default',timezone:'America/Denver'}).blocks).toHaveLength(5);expect(validateContactHours({mode:'anytime',timezone:'America/Denver'}).blocks).toEqual([]);
});
it('saves contact hours without opting into messaging or changing appointment availability',async()=>{
 await saveContactHours(9,{mode:'anytime',timezone:'America/Denver'});
 expect(Work.upsertForUser).toHaveBeenCalledWith(9,{timezone:'America/Denver',isActive:false,blocks:[]});expect(Prefs.update).toHaveBeenCalledWith(9,{quiet_hours_enabled:false,allow_notifications_outside_work_schedule:true});
});
it('requires explicit exclusions to remove a match; top three change ranking and public highlights',()=>{
 const input=emptyFocus();input.top.populations=['Veterans'];input.excluded.populations=['Couples'];const focus=validateFocus(input);
 expect(focusMatch(focus,{populations:['Families']})).toEqual({eligible:true,score:0});expect(focusMatch(focus,{populations:['Veterans']})).toEqual({eligible:true,score:1});expect(focusMatch(focus,{populations:['Couples']})).toEqual({eligible:false,score:0});
 const published=publishedFocus('populations',focus,['Veterans','Couples']);expect(published.top).toEqual(['Veterans']);expect(published.more).toContain('Families');expect(published.more).not.toContain('Couples');
});
it('rejects conflicting or oversized provider highlights and client preferences',()=>{
 const f=emptyFocus();f.top.populations=['Families'];f.excluded.populations=['Families'];expect(()=>validateFocus(f)).toThrow();expect(()=>validateMatchingPreferences({specialties:['Anxiety','Depression','ADHD','Stress']})).toThrow();expect(()=>validateMatchingPreferences({populations:['unsupported']})).toThrow();expect(validateMatchingPreferences({})).toEqual({specialties:[],ageGroups:[],populations:[],modalities:[]});
});
it('shows only unfinished contact steps and avoids claiming services took place',()=>{
 const action={actionKey:'provider_intake'};const all=providerActionItems({},action);expect(all).toHaveLength(3);expect(all[2]).toContain('actually takes place');const pending=providerActionItems({parents_contacted_at:'2026-10-01',parents_contacted_successful:1},action);expect(pending).toHaveLength(1);expect(pending[0]).toContain('Do not enter a future');
});
