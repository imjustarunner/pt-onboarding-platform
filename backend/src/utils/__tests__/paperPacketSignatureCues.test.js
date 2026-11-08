import {it,expect} from 'vitest';
import {detectSignaturesFromText} from '../paperPacketVisionParse.util.js';
it('does not mistake printed consent wording after blank signature lines for signatures',()=>{
 const text="Sign here — required Client's or Responsible Party's Signature Date ACKNOWLEDGEMENT AND CONSENT SUMMARY By signing below, I acknowledge and consent to the following documents. "+'Printed notice. '.repeat(40)+"Sign here — required (all signatures on this page) Your Printed Name Relationship to dependent AND authority to consent Client's or Responsible Party's Signature Date Signature of Parent/Guardian #2 (if applicable) Date Pages 6 and on — for your records only Please retain these documents for your personal records.";
 expect(detectSignaturesFromText(text)).toMatchObject({roiSignatureDetected:false,disclosureSignatureDetected:false});
});
it('retains dated signature cues without claiming to authenticate the signer',()=>{
 const text="Sign here — required QA ONLY Client's or Responsible Party's Signature 11/08/2026 Date "+'x'.repeat(500)+" Sign here — required (all signatures on this page) QA ONLY Client's or Responsible Party's Signature 11/08/2026 Date";
 expect(detectSignaturesFromText(text)).toMatchObject({roiSignatureDetected:true,disclosureSignatureDetected:true});
});
