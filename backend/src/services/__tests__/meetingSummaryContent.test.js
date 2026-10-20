vi.mock('google-auth-library',()=>({GoogleAuth:class{async getAccessToken(){return 'synthetic';}}}));
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('../geminiText.service.js',()=>({callGeminiText:mocks.call}));
import { splitMeetingTranscript,generateMeetingSummaryContent,meetingSummaryPrompt } from '../meetingSummaryContent.service.js';
beforeEach(()=>{vi.stubEnv('GCP_PROJECT_ID','test');vi.stubEnv('CLINICAL_AI_PRIVACY_APPROVED','true');vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({result:{findings:[]}})})));});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
beforeEach(()=>{mocks.call.mockReset();mocks.call.mockResolvedValue({text:'## Overview\nSection facts',modelName:'test',finishReason:'STOP'});});
describe('complete meeting summaries',()=>{
  it('preserves every character including the final section of a long transcript',()=>{
    const text='[A] Discuss policy\n'.repeat(6000)+'[B] Final task for Pat';
    expect(splitMeetingTranscript(text).join('')).toBe(text);
    expect(splitMeetingTranscript(text).at(-1)).toContain('Final task for Pat');
  });
  it('summarizes all chunks before consolidation and uses secure model calls',async()=>{
    await generateMeetingSummaryContent('x'.repeat(48000)+'FINAL FACT','supervision');
    expect(mocks.call).toHaveBeenCalledTimes(4);
    expect(mocks.call.mock.calls[2][0].prompt).toContain('FINAL FACT');
    expect(mocks.call.mock.calls[3][0].prompt).toContain('Consolidate these chronological');
    for(const [args] of mocks.call.mock.calls) expect(args).toMatchObject({vertexOnly:true,sensitive:true,maxOutputTokens:8192});
  });
  it('asks for separate topics, procedures, named tasks and clearly labeled suggestions',()=>{
    const prompt=meetingSummaryPrompt('Evidence','CPA');
    for(const section of ['Topics discussed','Facts','Processes and procedures','Tasks by person','Suggested next steps','Unassigned'])expect(prompt).toContain(section);
  });
  it('focuses supervision summaries on substantive topics and does not infer an unrecorded phone conversation',()=>{
    const prompt=meetingSummaryPrompt('Hello. Can you hear me? Let’s try by phone.','supervision');
    expect(prompt).toContain('Omit greetings, small talk');
    expect(prompt).toContain('no substantive discussion was captured');
    expect(prompt).toContain('Never infer what happened later by phone');
    expect(prompt).toContain('never numeric account IDs');
  });
  it('does not publish an empty or truncated summary as complete',async()=>{
    mocks.call.mockResolvedValueOnce({text:'partial',finishReason:'MAX_TOKENS'}).mockResolvedValueOnce({text:'still partial',finishReason:'MAX_TOKENS'});
    await expect(generateMeetingSummaryContent('evidence','CPA')).rejects.toThrow('did not finish');
    mocks.call.mockResolvedValueOnce({text:''});
    await expect(generateMeetingSummaryContent('evidence','CPA')).rejects.toThrow('no content');
  });
});

it('restores bracketless model output before publishing a meeting summary',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{
  const bytes=Buffer.from(JSON.parse(options.body).item.value),name=Buffer.from('Aunya'),start=bytes.indexOf(name);
  return {ok:true,json:async()=>({result:{findings:start<0?[]:[{location:{byteRange:{start,end:start+name.length}}}]}})};
 }));
 mocks.call.mockImplementation(async({prompt})=>({text:`## Overview\n${prompt.match(/PRIVATE_[a-z]+_\d+/)[0]} described the onboarding process.`,finishReason:'STOP'}));
 expect((await generateMeetingSummaryContent('[Aunya] Here is the onboarding process.','CPA')).text).toBe('## Overview\nAunya described the onboarding process.');
});
it('rejects an unresolvable token instead of saving code-like participant names',async()=>{
 mocks.call.mockResolvedValue({text:'PRIVATE_unknown_1 agreed.',finishReason:'STOP'});
 await expect(generateMeetingSummaryContent('[Ryn] I agree.','CPA')).rejects.toThrow('unresolved participant references');
});

it('retries an exhausted output budget once and publishes only the completed summary',async()=>{
 mocks.call.mockResolvedValueOnce({text:'partial',finishReason:'MAX_TOKENS'}).mockResolvedValueOnce({text:'Complete recap',finishReason:'STOP'});
 expect((await generateMeetingSummaryContent('Evidence','training')).text).toBe('Complete recap');expect(mocks.call.mock.calls.at(-1)[0].maxOutputTokens).toBe(16384);
});
