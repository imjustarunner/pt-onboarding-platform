import {describe,it,expect} from 'vitest';
import {defaultPhoneWorkflow,normalizePhoneWorkflow,phoneWorkflowIssues,isPhoneWorkflowOpen,previewPhoneWorkflow,phoneMenuPrompt} from '../phoneWorkflow.service.js';
import {validateProviderVoicemailSettings} from '../providerVoicemailSettings.service.js';
const configured=()=>{const c=defaultPhoneWorkflow('ITSCO');c.mainNumber='719-657-7444';c.menu[0].targets=[{label:'Support A',phone:'7195550111'},{label:'Support B',phone:'7195550222'}];c.menu[2].targets=[{label:'Billing',phone:'7195550333'}];return normalizePhoneWorkflow(c);};
describe('phone routing preparation',()=>{
 it('supports all ten digits with support always available',()=>{const c=configured();expect(c.menu.map(o=>o.key)).toEqual(['0','1','2','3','4','5','6','7','8','9']);expect(c.mainNumber).toBe('+17196577444');expect(phoneMenuPrompt(c)).toContain('For Billing, press 2.');expect(phoneMenuPrompt(c)).not.toContain('press 9');});
 it('preserves destination order and falls back once to support then voicemail',()=>{const p=previewPhoneWorkflow(configured(),{digit:'2',hours:'open'});expect(p.callsPlaced).toBe(false);expect(p.steps.map(s=>s.type)).toEqual(['greeting','ring','fallback','ring','voicemail']);expect(p.steps[3].targets.map(t=>t.label)).toEqual(['Support A','Support B']);});
 it('represents simultaneous ringing as one group with first staff acceptance',()=>{const c=configured();c.menu[0].ringMode='simultaneous';const p=previewPhoneWorkflow(c,{digit:'0',hours:'open'});expect(p.steps.filter(s=>s.type==='ring')).toHaveLength(1);expect(p.steps[1]).toMatchObject({mode:'simultaneous',seconds:20});expect(p.steps[1].onAnswer).toContain('first accepting');});
 it.each(['none','invalid','9'])('routes missing, invalid or disabled selection %s to support',digit=>{const p=previewPhoneWorkflow(configured(),{digit,hours:'open'});expect(p.steps.find(s=>s.type==='ring').key).toBe('0');});
 it('skips the menu after hours and honors selected coverage',()=>{const c=configured();expect(previewPhoneWorkflow(c,{hours:'closed'}).steps.map(s=>s.type)).toEqual(['notice','voicemail']);c.afterHours='support';expect(previewPhoneWorkflow(c,{hours:'closed'}).steps.map(s=>s.type)).toEqual(['notice','ring','voicemail']);});
 it('uses business timezone and daylight saving at opening and closing boundaries',()=>{const c=configured();expect(isPhoneWorkflowOpen(c,new Date('2026-10-06T14:59:00Z'))).toBe(false);expect(isPhoneWorkflowOpen(c,new Date('2026-10-06T15:00:00Z'))).toBe(true);expect(isPhoneWorkflowOpen(c,new Date('2026-10-06T23:00:00Z'))).toBe(false);expect(isPhoneWorkflowOpen(c,new Date('2026-12-01T15:00:00Z'))).toBe(false);expect(isPhoneWorkflowOpen(c,new Date('2026-12-01T16:00:00Z'))).toBe(true);expect(isPhoneWorkflowOpen(c,new Date('2026-10-11T17:00:00Z'))).toBe(false);});
 it('supports all hours and explicit no-destination fallback without pretending ready',()=>{const c=defaultPhoneWorkflow();c.businessHoursEnabled=false;expect(isPhoneWorkflowOpen(c,new Date('2026-10-11T03:00:00Z'))).toBe(true);expect(phoneWorkflowIssues(c).length).toBe(5);expect(previewPhoneWorkflow(c,{digit:'1',hours:'open'}).steps.at(-1).type).toBe('voicemail');});
 it.each([
  c=>{c.menu[0].enabled=false;},c=>{c.menu[0].fallback='support';},c=>{c.menu[1].key='0';},
  c=>{c.menu[0].targets[0].phone=c.mainNumber;},c=>{c.menu[0].targets.push(c.menu[0].targets[0]);},
  c=>{c.menu[2].targets[0].phone='911';},c=>{c.menu[2].targets[0].phone='7195550111 ext 99';},
  c=>{c.menu[2].ringSeconds=900;},c=>{c.timeZone='not/a/timezone';},c=>{c.hours[1].end='08:00';},c=>{c.live=true;}
 ])('rejects loops, unsafe destinations, invalid hours or accidental activation',change=>{const c=configured();change(c);expect(()=>normalizePhoneWorkflow(c)).toThrow();});
 it('rejects malformed simulation inputs',()=>{expect(()=>previewPhoneWorkflow(configured(),{hours:'bad'})).toThrow();expect(()=>previewPhoneWorkflow(configured(),{digit:'22'})).toThrow();});
});
describe('provider voicemail preferences',()=>{
 it('normalizes an explicit forwarding number and can clear it',()=>{expect(validateProviderVoicemailSettings({forward_to_phone:'(719) 555-0111'})).toEqual({forward_to_phone:'+17195550111'});expect(validateProviderVoicemailSettings({forward_to_phone:''})).toEqual({forward_to_phone:null});});
 it('retains omitted preferences and only handles permitted fields',()=>{expect(validateProviderVoicemailSettings({userId:99,voicemail_message:' Hello '})).toEqual({voicemail_message:'Hello'});});
 it.each([{voicemail_message:123},{voicemail_ooo_message:'x'.repeat(1001)},{forward_to_phone:'javascript:bad'}])('rejects invalid greeting and forwarding values',body=>{expect(()=>validateProviderVoicemailSettings(body)).toThrow();});
});
