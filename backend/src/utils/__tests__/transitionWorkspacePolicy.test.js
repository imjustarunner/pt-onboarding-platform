import {expect,it} from 'vitest';
import {emptyTransitionState,transitionVideoCatalog} from '../../content/transitionWeek.js';
import {updateTransitionItem,editTransitionVideo} from '../transitionWorkspacePolicy.js';
import {validateTransitionState} from '../transitionWeekPolicy.js';
const staff=[{id:1,name:'Example provider'},{id:2,name:'Records worker'}],now=new Date('2026-11-18T18:00:00Z');
const item=(state,patch,kind='clients',key='1:8',agencyId=2)=>updateTransitionItem(state,{kind,key,patch},staff,99,now,agencyId);
it('records completed work under the actual actor and keeps separate records/schedule owners',()=>{
 let state=item(emptyTransitionState(),{recordsOwnerUserId:1,scheduleOwnerUserId:2,checks:{upToDate:true,schedule:true}});
 expect(state.workspace.clients['1:8']).toMatchObject({recordsOwnerUserId:1,scheduleOwnerUserId:2,checks:{upToDate:{done:true,by:99,at:now.toISOString()},schedule:{done:true,by:99}}});
 expect(state.workspace.people).toEqual({});
 state=item(state,{checks:{upToDate:false}});expect(state.workspace.clients['1:8'].checks.upToDate.done).toBe(false);
});
it('requires in-practice staff, a responsible owner, valid dates and allowed steps',()=>{
 const state=emptyTransitionState();
 for(const patch of [{recordsOwnerUserId:88},{checks:{upToDate:true}},{dueDate:'2026-02-30'},{checks:{fake:true}}])expect(()=>item(state,patch)).toThrow();
 expect(()=>item(state,{},'people','999')).toThrow('active employee');
 expect(()=>item(state,{},'clients','__proto__')).toThrow('valid checklist');
});
it('does not allow final completion until all client work is checked and preserves prior check timestamps',()=>{
 let state=item(emptyTransitionState(),{recordsOwnerUserId:1,scheduleOwnerUserId:2,checks:{upToDate:true}});
 expect(()=>item(state,{checks:{transitioned:true}})).toThrow('Finish');
 state=item(state,{checks:{records:true,schedule:true,familyReady:true,transitioned:true}});
 expect(state.workspace.clients['1:8'].checks.upToDate.at).toBe(now.toISOString());
 expect(()=>item(state,{checks:{schedule:false}})).toThrow('Finish');
});
it('allows Inner Strength completion without unrequested Google steps',()=>{
 const checks=Object.fromEntries(['clients_current','records','schedules','families','training','therapynotes','transitioned'].map(k=>[k,true]));
 expect(item(emptyTransitionState(),{ownerUserId:1,checks},'people','1',377).workspace.people[1].checks.transitioned.done).toBe(true);
 expect(()=>item(emptyTransitionState(),{ownerUserId:1,checks},'people','1',2)).toThrow('Finish');
});
it('holds group edits until names and order are confirmed',()=>{
 expect(()=>item(emptyTransitionState(),{ownerUserId:1},'groups','1')).toThrow('Confirm');
 const state=emptyTransitionState();state.ranking={rows:[{providerId:1,cohort:1}]};
 expect(item(state,{ownerUserId:2,checks:{meeting:true}},'groups','1').workspace.groups[1].checks.meeting.by).toBe(99);
});
it('adds/removes/restores videos without deleting their evidence and cannot add client-supplied IDs',()=>{
 let state=editTransitionVideo(emptyTransitionState(),{operation:'add',id:'login',title:'Local training',dueDate:'2026-11-20'},2,99,now);
 const id=state.customVideos[0].id;expect(id).toMatch(/^custom_/);expect(state.customVideos[0].createdByUserId).toBe(99);
 state.videos[id].evidence='Keep this review';state=editTransitionVideo(state,{operation:'remove',id},2,99);
 expect(transitionVideoCatalog(2,state).some(v=>v.id===id)).toBe(false);expect(state.videos[id].evidence).toBe('Keep this review');
 state=editTransitionVideo(state,{operation:'restore',id},2,99);expect(transitionVideoCatalog(2,state).some(v=>v.id===id)).toBe(true);
 expect(()=>editTransitionVideo(state,{operation:'remove',id:'provider_update'},2,99)).toThrow('practice');
});
it('validates custom video publication and ignores forged workspace edits on legacy saves',()=>{
 const previous=editTransitionVideo(emptyTransitionState(),{operation:'add',title:'New',dueDate:'2026-11-20'},2,99);
 const input=structuredClone(previous);input.workspace.people['999']={checks:{transitioned:{done:true}}};
 expect(validateTransitionState(input,previous,2,99).workspace.people).toEqual({});
 const id=previous.customVideos[0].id;input.videos[id].status='published';expect(()=>validateTransitionState(input,previous,2,99)).toThrow('creator');
});
it('rejects protocol-relative, backslash and active-content video links',()=>{
 for(const url of ['javascript:alert(1)','//evil.test/v','/\\evil.test/v','https://u:p@example.test/v','https://example.test/\nvideo']){
  const input=emptyTransitionState();input.videos.login.url=url;expect(()=>validateTransitionState(input,emptyTransitionState(),2,99)).toThrow('HTTPS');
 }
});
