import {beforeEach,describe,it,expect,vi} from 'vitest';
import crypto from 'node:crypto';
vi.hoisted(()=>{process.env.GCP_PROJECT_ID='translation-test';});
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../geminiText.service.js',()=>({callGeminiText:vi.fn()}));
import pool from '../../config/database.js';
import {callGeminiText} from '../geminiText.service.js';
import {getOrCreateTranslation} from '../aiTranslation.service.js';
const original='A place to build confidence and develop tools for growing up.';
const hash=crypto.createHash('md5').update(original).digest('hex');
const request={sourceType:'inline_string',sourceId:0,field:hash,originalText:original,targetLang:'es',rejectFallback:true};
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValue([[]]);});
describe('saved complete Spanish copy',()=>{
 it('refreshes legacy Gemini text and saves the complete translation once',async()=>{
  pool.execute.mockImplementation(async sql=>[sql.startsWith('SELECT')?[{source_hash:hash,translated_text:'Un lugar para',translation_engine:'gemini:vertex:gemini-2.5-flash'}]:[]]);
  callGeminiText.mockResolvedValue({text:'Un lugar para desarrollar confianza y herramientas para crecer.',modelName:'gemini-2.5-flash',provider:'vertex',finishReason:'STOP'});
  const [a,b]=await Promise.all([getOrCreateTranslation(request),getOrCreateTranslation(request)]);
  expect(a).toBe(b);expect(a).toContain('para crecer.');expect(callGeminiText).toHaveBeenCalledTimes(1);
  expect(callGeminiText).toHaveBeenCalledWith(expect.objectContaining({thinkingBudget:0,maxOutputTokens:2048}));
  expect(pool.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO translations'))[1][6]).toBe('v2:gemini:vertex:gemini-2.5-flash');
 });
 it('returns the saved full version without calling AI',async()=>{
  pool.execute.mockResolvedValue([[{source_hash:hash,translated_text:'Versión completa.',translation_engine:'v2:gemini:vertex:gemini-2.5-flash'}]]);
  expect(await getOrCreateTranslation(request)).toBe('Versión completa.');expect(callGeminiText).not.toHaveBeenCalled();
 });
 it('never saves a truncated response',async()=>{
  callGeminiText.mockResolvedValue({text:'Un lugar para',finishReason:'MAX_TOKENS'});
  await expect(getOrCreateTranslation(request)).rejects.toThrow('temporarily unavailable');
  expect(pool.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO translations'))).toBe(false);
 });
});

// Preserve the configuration used by every non-translation Gemini caller.
it('limits the thinking override to supported Flash translations', async () => {
 const { translationGenerationConfig } = await vi.importActual('../geminiText.service.js');
 const options = { modelName: 'gemini-2.5-flash', temperature: 0.2, maxOutputTokens: 2048 };
 expect(translationGenerationConfig(options)).toEqual({ temperature: 0.2, maxOutputTokens: 2048 });
 expect(translationGenerationConfig({ ...options, thinkingBudget: 0 }).thinkingConfig).toEqual({ thinkingBudget: 0 });
 expect(translationGenerationConfig({ ...options, modelName: 'gemini-2.5-pro', thinkingBudget: 0 }).thinkingConfig).toBeUndefined();
});
