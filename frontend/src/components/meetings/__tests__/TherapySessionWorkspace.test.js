import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,afterEach} from 'vitest';
import Workspace from '../TherapySessionWorkspace.vue';
it('keeps AuricWell and tenant identity visible and hides treatment plans from unverified office guests',async()=>{const request=vi.fn(async()=>({artifacts:[]}));const w=mount(Workspace,{props:{request,isHost:true,branding:{agencyName:'Practice A',officeProduct:'auricwell'}},global:{stubs:{VideoSessionRoom:{inheritAttrs:false,template:'<div />'}}}});await flushPromises();expect(w.text()).toContain('AuricWell');expect(w.text()).toContain('Practice A');expect(w.text()).not.toContain('Treatment plan');w.unmount();});
it('loads every page of session content and persists chats to the session API',async()=>{const request=vi.fn(async(path,opts)=>{if(opts.method==='POST')return {artifact:{id:3,role:'client',...opts.body}};return path==='?afterId=0'?{artifacts:[{id:1,type:'chat',role:'provider',payload:{text:'First'}}],hasMore:true,nextCursor:1}:{artifacts:[{id:2,type:'chat',role:'provider',payload:{text:'Second'}}],hasMore:false,nextCursor:2};});const w=mount(Workspace,{props:{request},global:{stubs:{VideoSessionRoom:{inheritAttrs:false,template:'<div />'}}}});await flushPromises();await w.findAll('button').find(b=>b.text()==='Chat').trigger('click');expect(w.text()).toContain('First');expect(w.text()).toContain('Second');await w.find('input[aria-label=Message]').setValue('My response');await w.find('.chat-form').trigger('submit');await flushPromises();expect(request).toHaveBeenCalledWith('',{method:'POST',body:{type:'chat',payload:{text:'My response'}}});expect(w.text()).toContain('My response');w.unmount();});
it('offers verified clients their own treatment plan rating after the provider shares it',async()=>{const request=vi.fn(async()=>({artifacts:[{id:8,type:'share',role:'provider',payload:{mode:'treatment',title:'My goals',goals:[{id:1,text:'Goal one'}]}}]}));const w=mount(Workspace,{props:{request,identified:true},global:{stubs:{VideoSessionRoom:{inheritAttrs:false,template:'<div />'}}}});await flushPromises();expect(w.text()).toContain('Save my rating');expect(w.text()).toContain('Goal one');w.unmount();});

afterEach(()=>vi.useRealTimers());
it('starts the office timer on admission and preserves its start across reconnects',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-13T03:00:00Z'));
 const options={props:{request:vi.fn(async()=>({artifacts:[]})),startedAt:null},global:{stubs:{VideoSessionRoom:{inheritAttrs:false,template:'<div />'}}}};
 let w=mount(Workspace,options);await flushPromises();await vi.advanceTimersByTimeAsync(60000);
 expect(w.find('.therapy-clock').text()).toBe('00:00');expect(w.text()).toContain('Ready for your guest');
 const startedAt=new Date().toISOString();await w.setProps({startedAt});await vi.advanceTimersByTimeAsync(65000);expect(w.find('.therapy-clock').text()).toBe('01:05');
 w.unmount();w=mount(Workspace,{...options,props:{...options.props,startedAt}});await flushPromises();expect(w.find('.therapy-clock').text()).toBe('01:05');w.unmount();
 w=mount(Workspace,options);await flushPromises();expect(w.find('.therapy-clock').text()).toBe('00:00');w.unmount();
});
