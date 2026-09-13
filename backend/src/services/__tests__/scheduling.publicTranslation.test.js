import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(async()=>[[]])}}));
vi.mock('../geminiText.service.js',()=>({callGeminiText:vi.fn()}));
vi.mock('axios',()=>({default:{post:vi.fn(async()=>{throw new Error('Synthetic provider unavailable');})}}));
import {callGeminiText} from '../geminiText.service.js';
import {batchTranslate} from '../aiTranslation.service.js';
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
const items=[{sourceType:'inline_string',sourceId:0,field:'public-label',originalText:'Find support'}];
describe('public translation failure reporting',()=>{
 it('does not misreport an upstream failure as a successful English translation',async()=>{vi.stubEnv('GEMINI_API_KEY','synthetic');vi.spyOn(console,'warn').mockImplementation(()=>{});callGeminiText.mockRejectedValue(new Error('Synthetic unavailable'));expect(await batchTranslate(items,'es',{rejectFallback:true})).toEqual({});expect(await batchTranslate(items,'es')).toEqual({'0:public-label':'Find support'});});
 it('keeps legitimate unchanged organization names as successful translations',async()=>{vi.stubEnv('GEMINI_API_KEY','synthetic');callGeminiText.mockResolvedValue({text:'ITSCO',provider:'synthetic',modelName:'test'});expect(await batchTranslate([{...items[0],originalText:'ITSCO'}],'es',{rejectFallback:true})).toEqual({'0:public-label':'ITSCO'});});
});
