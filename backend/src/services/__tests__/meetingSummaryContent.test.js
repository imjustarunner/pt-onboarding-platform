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
  it('does not publish an empty or truncated summary as complete',async()=>{
    mocks.call.mockResolvedValueOnce({text:'partial',finishReason:'MAX_TOKENS'});
    await expect(generateMeetingSummaryContent('evidence','CPA')).rejects.toThrow('did not finish');
    mocks.call.mockResolvedValueOnce({text:''});
    await expect(generateMeetingSummaryContent('evidence','CPA')).rejects.toThrow('no content');
  });
});
