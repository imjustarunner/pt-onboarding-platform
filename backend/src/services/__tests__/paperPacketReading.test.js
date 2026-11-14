import {it,expect,vi} from 'vitest';
vi.mock('../demographicsImport.service.js',()=>({decryptDemographicsPayload:value=>value}));
import {paperReadingForStaff,paperReadingSnapshot,reviewedPaperReadingPatch,preservePaperReadingReview} from '../paperPacketReading.service.js';
const candidate=()=>({documentId:9,readAt:'2026-11-14T20:00:00Z',sourceLocale:'es',fullName:'José Prueba',administrativeSex:'Male',guardianName:'María Prueba',guardianRelationship:'Mother',responses:[{key:'medicalInformation',label:'Medical information',sourceText:'No tiene alergias.',englishText:'No allergies.',sourceLocale:'es',status:'translated'}]});
it('retains a reviewed translation on a reread of the same source and archives it if the source changes',()=>{
 const value=candidate();value.reviewedEnglishResponses={snapshotId:paperReadingSnapshot(value),answers:{medicalInformation:'Reviewed English.'},reviewedByUserId:8};
 const next={...candidate(),readAt:'later',responses:[{...value.responses[0],englishText:'Different machine draft.'}]};
 expect(preservePaperReadingReview(next,value).reviewedEnglishResponses).toEqual(value.reviewedEnglishResponses);
 next.responses[0].sourceText='Otra respuesta.';const changed=preservePaperReadingReview(next,value);expect(changed.reviewedEnglishResponses).toBeUndefined();expect(changed.englishResponseHistory[0].answers.medicalInformation).toBe('Reviewed English.');
 const edited=reviewedPaperReadingPatch({paper_packet_demo_candidate_enc:value},{snapshotId:paperReadingSnapshot(value),reviewed:true,answers:{medicalInformation:'A staff correction.'}},8,{encrypt:v=>v,documentId:9});expect(edited.englishResponseHistory[0].answers.medicalInformation).toBe('Reviewed English.');
});
it('places English values in form fields while retaining the original identity and Spanish response',()=>{
 const value=candidate(),reading=paperReadingForStaff({paper_packet_demo_candidate_enc:value});expect(reading.fields).toMatchObject({firstName:'José',lastName:'Prueba',gender:'Male'});expect(reading.parent1).toMatchObject({firstName:'María',relationshipTitle:'Mother'});expect(reading.responses[0].sourceText).toBe('No tiene alergias.');expect(reading.reviewedAt).toBeNull();
});
it('records an attributed human review against the exact packet snapshot and preserves the source',()=>{
 const value=candidate(),encrypt=vi.fn(value=>value);const saved=reviewedPaperReadingPatch({paper_packet_demo_candidate_enc:value},{snapshotId:paperReadingSnapshot(value),reviewed:true,answers:{medicalInformation:'No known allergies.'}},8,{encrypt,documentId:9});
 expect(saved.responses[0].sourceText).toBe('No tiene alergias.');expect(saved.reviewedEnglishResponses).toMatchObject({answers:{medicalInformation:'No known allergies.'},reviewedByUserId:8});expect(paperReadingForStaff({paper_packet_demo_candidate_enc:saved}).responses[0].englishText).toBe('No known allergies.');
});
it('rejects another packet, stale readings, empty translations and injected fields',()=>{
 const value=candidate(),client={paper_packet_demo_candidate_enc:value},base={snapshotId:paperReadingSnapshot(value),reviewed:true,answers:{medicalInformation:'No allergies.'}};
 expect(()=>reviewedPaperReadingPatch(client,base,8,{encrypt:v=>v,documentId:10})).toThrow('reading changed');
 expect(()=>reviewedPaperReadingPatch(client,{...base,snapshotId:'old'},8,{encrypt:v=>v,documentId:9})).toThrow('reading changed');
 expect(()=>reviewedPaperReadingPatch(client,{...base,answers:{medicalInformation:''}},8,{encrypt:v=>v,documentId:9})).toThrow('Review each');
 expect(()=>reviewedPaperReadingPatch(client,{...base,answers:{...base.answers,diagnosis:'Invented'}},8,{encrypt:v=>v,documentId:9})).toThrow('only the responses');
 expect(reviewedPaperReadingPatch(client,{reviewed:false},8,{encrypt:v=>v,documentId:9})).toBeNull();
});
