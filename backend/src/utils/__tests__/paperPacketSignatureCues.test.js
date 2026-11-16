import {it,expect} from 'vitest';
import {detectSignaturesFromText,detectDenyStaffFromText,detectPacketLanguage,extractPaperPacketReviewHints,extractVersionLabelFromText} from '../paperPacketVisionParse.util.js';
it('does not mistake printed consent wording after blank signature lines for signatures',()=>{
 const text="Sign here — required Client's or Responsible Party's Signature Date ACKNOWLEDGEMENT AND CONSENT SUMMARY By signing below, I acknowledge and consent to the following documents. "+'Printed notice. '.repeat(40)+"Sign here — required (all signatures on this page) Your Printed Name Relationship to dependent AND authority to consent Client's or Responsible Party's Signature Date Signature of Parent/Guardian #2 (if applicable) Date Pages 6 and on — for your records only Please retain these documents for your personal records.";
 expect(detectSignaturesFromText(text)).toMatchObject({roiSignatureDetected:false,disclosureSignatureDetected:false});
});
it('retains dated signature cues without claiming to authenticate the signer',()=>{
 const text="Sign here — required QA ONLY Client's or Responsible Party's Signature 11/08/2026 Date "+'x'.repeat(500)+" Sign here — required (all signatures on this page) QA ONLY Client's or Responsible Party's Signature 11/08/2026 Date";
 expect(detectSignaturesFromText(text)).toMatchObject({roiSignatureDetected:true,disclosureSignatureDetected:true});
});

it('reads a dated long two-guardian block without borrowing the following section date',()=>{
 const title='Sign here — required (all signatures on this page)';
 const longBlock=title+' Your Printed Name '+ 'Guardian details '.repeat(28)+' Signature Date 11/08/2026';
 expect(detectSignaturesFromText('Sign here — required Signature Date ACKNOWLEDGEMENT AND CONSENT SUMMARY '+longBlock)).toMatchObject({roiSignatureDetected:false,disclosureSignatureDetected:true});
 expect(detectSignaturesFromText('Sign here — required Signature Date ACKNOWLEDGEMENT AND CONSENT SUMMARY '+title+' Signature Date PAGES 6 AND ON Effective date 11/08/2026')).toMatchObject({roiSignatureDetected:false,disclosureSignatureDetected:false});
});
it('distinguishes the printed default-permission instruction from actual and ambiguous denials',()=>{
 const staff=[{id:4,fullName:'Jamie QA'}];
 expect(detectDenyStaffFromText('All listed staff are authorized unless Deny is checked.\nDeny\nJamie QA',staff)).toEqual({denyStaffUserIds:[],unmatchedDenyHints:[]});
 expect(detectDenyStaffFromText('[x] Deny Jamie QA',staff).denyStaffUserIds).toEqual([4]);
 expect(detectDenyStaffFromText('Deny: checked - unknown staff',staff).unmatchedDenyHints).toHaveLength(1);
});

it('identifies Spanish packets, their printed version and calendar dates on actual PDF pages',()=>{
 const pages=[{page:5,text:'Nombre del dependiente\nSexo del dependiente\nConsentimiento para divulgar\nFirme aquí — requerido\nFirma del tutor\nFecha 11/03/2026'},{page:6,text:'Reconocimiento y consentimiento\nPaquete Versión: 1.02\nFirme aquí — requerido\nFirma del tutor\nFecha 11/04/2026'}];
 const body=pages.map(page=>page.text).join('\n');
 expect(detectPacketLanguage(body)).toBe('es');
 expect(extractVersionLabelFromText(body).label).toBe('1.02');
 expect(extractPaperPacketReviewHints(body,pages)).toMatchObject({locale:'es',roi:{signedDate:'2026-11-03',page:5},disclosure:{signedDate:'2026-11-04',page:6}});
});
it('does not choose a packet language for unrecognized source text or invent a page',()=>{
 expect(detectPacketLanguage('illegible')).toBeNull();
 expect(extractPaperPacketReviewHints('Sign here — required Date 11/03/2026').roi).toEqual({signedDate:'2026-11-03'});
});
