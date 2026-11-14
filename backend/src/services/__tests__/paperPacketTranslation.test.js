import {it,expect,vi} from 'vitest';import {translatePaperResponses} from '../paperPacketTranslation.service.js';
const source=()=>({sourceLocale:'es',fullName:'José Prueba',memberId:'A123456',responses:[{key:'medicalInformation',label:'Medical information',sourceText:'José Prueba no tiene alergias. Toma 5 mg. A123456.',englishText:'',status:'pending'}]});
const translator=()=>vi.fn(async options=>{const data=JSON.parse(options.prompt);return {finishReason:'STOP',text:JSON.stringify({answers:data.answers.map(a=>({key:a.key,sourceLocale:'es',englishText:a.sourceText.replace('no tiene alergias','has no allergies').replace('Toma','Takes')}))})};});
it('uses the private Vertex transport and restores unchanged names, numbers and member IDs',async()=>{
 const translate=translator(),result=await translatePaperResponses(source(),{translate});
 expect(translate).toHaveBeenCalledWith(expect.objectContaining({vertexOnly:true,sensitive:true,jsonMode:true,temperature:0}));
 const request=translate.mock.calls[0][0];expect(request.prompt).not.toContain('José');expect(request.prompt).not.toContain('A123456');expect(request.prompt).not.toContain(' 5 ');
 expect(result.responses[0]).toMatchObject({sourceText:source().responses[0].sourceText,englishText:'José Prueba has no allergies. Takes 5 mg. A123456.',sourceLocale:'es',status:'translated'});expect(result.translationReviewed).toBe(false);
});
it('handles Spanish written into an English form',async()=>{const value=source();value.sourceLocale='en';expect((await translatePaperResponses(value,{translate:translator()})).translationStatus).toBe('translated');});
it.each(['error','truncated','identifier_changed','missing_key'])('keeps the original and a pending English field when translation fails: %s',async failure=>{
 const translate=vi.fn(async()=>{if(failure==='error')throw Error('Unavailable');return {finishReason:failure==='truncated'?'MAX_TOKENS':'STOP',text:JSON.stringify({answers:[{key:failure==='missing_key'?'other':'medicalInformation',sourceLocale:'es',englishText:'Invented identifying name'}]})};});
 const value=source(),result=await translatePaperResponses(value,{translate});expect(result.translationStatus).toBe('unavailable');expect(result.responses[0].sourceText).toBe(value.responses[0].sourceText);expect(result.responses[0].englishText).toBe('');
});
it('retains an English original verbatim instead of accepting a model rewrite',async()=>{
 const value={sourceLocale:'en',responses:[{key:'medicalInformation',sourceText:'No allergies.',status:'original'}]};
 const result=await translatePaperResponses(value,{translate:async()=>({finishReason:'STOP',text:JSON.stringify({answers:[{key:'medicalInformation',sourceLocale:'en',englishText:'A rewritten answer'}]})})});expect(result.responses[0].englishText).toBe('No allergies.');expect(result.translationStatus).toBe('original');
});
