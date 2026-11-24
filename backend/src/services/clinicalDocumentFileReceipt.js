import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
import {sharedFile} from './clinicalDocumentShareSources.js';
import StorageService from './storage.service.js';

const pdfText=value=>String(value||'').normalize('NFKD').replace(/[^\x20-\x7e]/g,'').slice(0,180);

export async function requestFilePdf(item) {
  const file=await sharedFile(item);
  const original=await StorageService.readObjectBuffer(file.storage_path);
  if(!item.evidence_encrypted)return original;
  const evidence=JSON.parse(maybeDecryptNotePayload(item.evidence_encrypted));
  const pdf=await PDFDocument.load(original);
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  const page=pdf.addPage([612,792]);
  const write=(value,y,size=12)=>page.drawText(pdfText(value),{x:60,y,size,font,color:rgb(.08,.17,.30)});
  write('AuricWell',730,23);
  write('Electronic signature receipt',690,18);
  write(file.title||'Document',650,14);
  write('Signed on '+new Date(item.completed_at).toISOString(),625);
  write('Signed by '+evidence.name,600);
  write('Document reference '+item.source_version,575,9);
  const signature=await pdf.embedPng(Buffer.from(evidence.signature.split(',')[1],'base64'));
  const ratio=Math.min(440/signature.width,110/signature.height,1);
  page.drawImage(signature,{x:60,y:420,width:signature.width*ratio,height:signature.height*ratio});
  write('The signer reviewed the document and agreed to sign it electronically.',380);
  return Buffer.from(await pdf.save());
}
