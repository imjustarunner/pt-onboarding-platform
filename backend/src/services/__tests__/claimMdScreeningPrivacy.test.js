import { beforeEach, describe, expect, it, vi } from 'vitest';
const call = vi.hoisted(() => vi.fn());
vi.mock('../geminiText.service.js', () => ({callGeminiText:call}));
import {redactedScreeningText,screeningEnglish} from '../h0002Translation.service.js';
import {validateScreeningDraft,applyScreeningTranscription,screeningLocation,screeningPresentingProblem} from '../h0002ReviewDetails.js';
import {getClientIpAddress} from '../../utils/ipAddress.util.js';
const source={sourceLanguage:'es',sourceHash:'v1',identifiers:['Example Person','SAMPLECODE','Example School'],summary:'Example Person: reporta preocupación. SAMPLECODE. Example School. Contacto sample@example.com 303-555-0100 2010-01-02'};
beforeEach(()=>{call.mockReset();call.mockResolvedValue({text:'Reports worry.',finishReason:'STOP'});});
describe('screening translation privacy',()=>{
 it('redacts known names, codes, school and common contact identifiers locally',()=>{const text=redactedScreeningText(source);for(const value of ['Example','Person','SAMPLECODE','School','sample@example.com','303-555-0100','2010-01-02'])expect(text).not.toContain(value);expect(redactedScreeningText(source,text)).toBe(text);expect(call).not.toHaveBeenCalled();});
 it('requires explicit review before transmitting any text',async()=>{await expect(screeningEnglish(source,{reviewedText:'Reporta preocupación.'})).rejects.toMatchObject({status:400});expect(call).not.toHaveBeenCalled();});
 it.each(['Example Person reporta preocupación.','Person reporta preocupación.','sample@example.com','303-555-0100','2010-01-02'])('blocks remaining identifier %s even after confirmation',async text=>{await expect(screeningEnglish(source,{reviewedText:text,noIdentifiersConfirmed:true})).rejects.toMatchObject({status:400});expect(call).not.toHaveBeenCalled();});
 it('sends only the reviewed text to the sensitive Vertex-only transport',async()=>{const reviewedText='[removed] reporta preocupación.';expect(await screeningEnglish(source,{reviewedText,noIdentifiersConfirmed:true})).toMatchObject({status:'translated'});expect(call).toHaveBeenCalledOnce();expect(call.mock.calls[0][0]).toMatchObject({prompt:reviewedText,vertexOnly:true,sensitive:true});expect(JSON.stringify(call.mock.calls)).not.toContain('Example Person');});
 it('keeps a failed or truncated translation unavailable without returning the raw source',async()=>{call.mockResolvedValue({text:'Partial',finishReason:'MAX_TOKENS'});expect(await screeningEnglish(source,{reviewedText:'Preocupación.',noIdentifiersConfirmed:true})).toEqual({status:'unavailable',text:''});});
 it('does not call a translation service for English sources',async()=>{await screeningEnglish({...source,sourceLanguage:'en'},{});expect(call).not.toHaveBeenCalled();});
});
describe('screening draft and paper validation',()=>{
 it('does not save signature attestations in a draft',()=>{const result=validateScreeningDraft({sourceHash:'v1',presentingProblem:'Concern',accurateAndComplete:true,safetyReviewed:true},source);expect(result.accurateAndComplete).toBeUndefined();expect(result.safetyReviewed).toBeUndefined();});
 it('rejects stale source and invented paper fields',()=>{expect(()=>validateScreeningDraft({sourceHash:'old'},source)).toThrow('changed');expect(()=>validateScreeningDraft({sourceHash:'v1',paperResponses:{unknown:'value'}},source)).toThrow('paper response');});
 it('never scores missing paper answers as zero',()=>{const s={...source,pscItems:Array.from({length:17},(_,i)=>({key:`psc_${i+1}`,label:`Q${i+1}`})),clinicalFields:[]};const result=applyScreeningTranscription(s,{sourceHash:'v1',paperTranscription:true,paperResponses:{psc_1:0}});expect(result.psc.answered).toBe(1);expect(result.psc.complete).toBe(false);expect(result.psc.total).toBeNull();});
 it('proposes client location and requires a supported selection',()=>{expect(screeningLocation({packetMethod:'paper',clientType:'school',schoolName:'School'}).code).toBe('03');expect(screeningLocation({packetMethod:'digital'}).code).toBe('10');expect(()=>screeningLocation({}, {placeOfService:'99'})).toThrow('supported');});
 it('keeps specific reported safety concerns bold in the shared problem text',()=>{expect(screeningPresentingProblem({presentingProblem:'Worry',safetyConcern:'Reported history of neglect'})).toContain('**Reported safety concern: Reported history of neglect**');});
 it('handles Express requests without headers during signature auditing',()=>{expect(()=>getClientIpAddress({ip:'127.0.0.1'})).not.toThrow();});
});
