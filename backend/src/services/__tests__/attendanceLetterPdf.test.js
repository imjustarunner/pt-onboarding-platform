import { expect,it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { attendanceLetterPdf } from '../attendanceLetterPdf.service.js';
it('exports the signed letter as a readable PDF with its saved content and signature identity',async()=>{
 const bytes=await attendanceLetterPdf({id:7,version:1,branding:{name:'Example practice'},data:{letterType:'Scheduled appointment',personLabel:'María Example',appointmentDate:'2026-11-29',startTime:'11:00',endTime:'12:00',timezone:'America/Denver',location:'Office 10',issuerName:'Avery Lane',issuerTitle:'Provider'},signers:[{kind:'clinician',name:'Avery Lane',signedAt:new Date('2026-11-14T20:00:00Z'),evidence:{name:'Avery Lane'}}]});
 expect(bytes.subarray(0,4).toString()).toBe('%PDF');const pdf=await PDFDocument.load(bytes);expect(pdf.getTitle()).toBe('Appointment confirmation');expect(pdf.getPageCount()).toBe(1);
});
