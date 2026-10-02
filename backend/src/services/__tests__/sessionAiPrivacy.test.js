import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('../geminiText.service.js',()=>({callGeminiText:m.call}));
vi.mock('google-auth-library',()=>({GoogleAuth:class{async getAccessToken(){return 'synthetic-token';}}}));
import {createSessionPrivacyContext,callPrivateSessionText} from '../sessionAiPrivacy.service.js';
const ok=findings=>({ok:true,json:async()=>({result:{findings}})});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('GCP_PROJECT_ID','synthetic-project');vi.stubEnv('CLINICAL_AI_PRIVACY_APPROVED','true');vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));m.call.mockResolvedValue({text:'Summary',finishReason:'STOP'});});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('session AI privacy boundary',()=>{
 it('removes known names locally and detected Unicode identifiers before the model, retaining stable local attribution',async()=>{
  const fetchImpl=vi.fn(async(_url,options)=>{
   const text=JSON.parse(options.body).item.value;
   expect(text).not.toMatch(/Amy|amy@example.com/);
   const bytes=Buffer.from(text),needle=Buffer.from('Zoë García'),start=bytes.indexOf(needle);
   return ok(start<0?[]:[{location:{byteRange:{start:String(start),end:String(start+needle.length)}}}]);
  });
  const privacyContext=createSessionPrivacyContext({clientNames:['Amy'],fetchImpl,tokenProvider:async()=> 'test'});
  const text=await privacyContext.redact('[Amy] Contact Zoë García at amy@example.com.');
  await callPrivateSessionText({privacyContext,prompt:text,vertexOnly:false,sensitive:false});
  const sent=m.call.mock.calls[0][0];
  expect(sent.prompt).not.toMatch(/Amy|Zoë|García|example.com/);
  expect(sent).toMatchObject({vertexOnly:true,sensitive:true});
  expect(privacyContext.restore(text)).toBe('[Client] Contact [REDACTED] at [REDACTED].');
 });
 it.each([{ok:false,json:async()=>({private:'Never log this'})}, {ok:true,json:async()=>({result:{findingsTruncated:true}})}, {ok:true,json:async()=>({})}, ok([{location:{byteRange:{end:'999999'}}}])])('does not send anything to the model after failed or incomplete inspection',async response=>{
  const privacyContext=createSessionPrivacyContext({fetchImpl:async()=>response,tokenProvider:async()=> 'test'});
  await expect(callPrivateSessionText({privacyContext,prompt:'Identifying evidence'})).rejects.toMatchObject({code:'SESSION_PRIVACY_UNAVAILABLE'});
  expect(m.call).not.toHaveBeenCalled();
 });
 it('blocks before network when encryption or operator approval is missing',async()=>{
  const fetchImpl=vi.fn();const privacyContext=createSessionPrivacyContext({fetchImpl});
  vi.stubEnv('CLINICAL_AI_PRIVACY_APPROVED','');await expect(privacyContext.redact('evidence')).rejects.toThrow('Secure session processing');
  vi.stubEnv('CLINICAL_AI_PRIVACY_APPROVED','true');vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64','');await expect(privacyContext.redact('evidence')).rejects.toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();expect(m.call).not.toHaveBeenCalled();
 });
 it('inspects overlapping windows without losing Unicode or leaking a name across their boundary',async()=>{
  const name='Zoë García',text='é'.repeat(11998)+name+' remaining';
  const fetchImpl=vi.fn(async(_url,opts)=>{const b=Buffer.from(JSON.parse(opts.body).item.value),n=Buffer.from(name),start=b.indexOf(n);return ok(start<0?[]:[{location:{byteRange:{start,end:start+n.length}}}]);});
  const privacy=createSessionPrivacyContext({contentType:'meeting',fetchImpl,tokenProvider:async()=> 'test'});
  const result=await privacy.redact(text);expect(result).not.toContain(name);expect(privacy.restore(result)).toBe(text);expect(fetchImpl).toHaveBeenCalledTimes(2);
 });
 it('retains non-session participant names under one shared policy and uses Client/Provider for sessions',async()=>{
  const fetchImpl=vi.fn(async(_url,options)=>{const body=JSON.parse(options.body);expect(body.inspectConfig.infoTypes.some(t=>t.name==='PERSON_NAME')).toBe(false);return ok([]);});
  const meeting=createSessionPrivacyContext({contentType:'meeting',fetchImpl,tokenProvider:async()=> 'test'});
  expect(await meeting.redact('[Amy Jones] Pat Smith will update the agenda.')).toBe('[Amy Jones] Pat Smith will update the agenda.');
  const session=createSessionPrivacyContext({clientNames:['Amy Jones','AJ'],providerNames:['Pat Smith'],fetchImpl:async()=>ok([]),tokenProvider:async()=> 'test'});
  const text=await session.redact('[Amy Jones] Pat Smith helped AJ.');
  expect(text).toBe('[Client] Provider helped Client.');expect(session.restore(text)).toBe(text);
 });
 it('does not propagate provider errors or their content',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>ok([])));m.call.mockRejectedValue(new Error('Private transcript echoed'));
  await expect(callPrivateSessionText({prompt:'private'})).rejects.toThrow('Secure session generation failed');
 });
});
