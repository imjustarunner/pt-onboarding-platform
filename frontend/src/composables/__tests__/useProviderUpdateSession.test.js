// @vitest-environment jsdom
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const post=vi.hoisted(()=>vi.fn(async()=>({data:{activeSeconds:15,recording:true}})));
vi.mock('../../services/api',()=>({default:{post}}));
vi.mock('vue',()=>({ref:value=>({value}),onUnmounted:vi.fn()}));
import {useProviderUpdateSession} from '../useProviderUpdateSession';
let sessions=[];
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T14:00:00Z'));post.mockClear();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
afterEach(async()=>{await Promise.all(sessions.map(s=>s.stop()));sessions=[];vi.useRealTimers();});
const start=()=>{const s=useProviderUpdateSession({mode:'token',token:()=> 'test',sectionKey:()=> 'license'});sessions.push(s);s.start();return s;};
it('charges no initial minute, attributes section time and stops at the idle timeout',async()=>{
 const s=start();await vi.advanceTimersByTimeAsync(15000);expect(post.mock.calls[0][1].activeSeconds).toBe(0);expect(post.mock.calls[1][1]).toMatchObject({activeSeconds:15,sectionKey:'license'});
 await vi.advanceTimersByTimeAsync(6*60000);expect(s.paused.value).toBe(true);expect(post.mock.calls.at(-1)[1].activeSeconds).toBe(0);
 expect(post.mock.calls.reduce((sum,c)=>sum+c[1].activeSeconds,0)).toBe(300);
 s.activity();await vi.advanceTimersByTimeAsync(15000);expect(post.mock.calls.at(-1)[1].activeSeconds).toBe(15);
});
it('stops hidden time and flushes a partial final interval',async()=>{
 const s=start();await vi.advanceTimersByTimeAsync(7000);
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));
 await vi.advanceTimersByTimeAsync(60000);expect(post.mock.calls.reduce((sum,c)=>sum+c[1].activeSeconds,0)).toBe(7);
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));
 await vi.advanceTimersByTimeAsync(4000);await s.stop();expect(post.mock.calls.reduce((sum,c)=>sum+c[1].activeSeconds,0)).toBe(11);
});
it('changes attribution at the section boundary',async()=>{
 const s=start();await vi.advanceTimersByTimeAsync(7000);s.changeSection('contact_info');await vi.advanceTimersByTimeAsync(8000);
 expect(post.mock.calls[1][1]).toMatchObject({sectionKey:'license',activeSeconds:7});expect(post.mock.calls[2][1]).toMatchObject({sectionKey:'contact_info',activeSeconds:8});
});
