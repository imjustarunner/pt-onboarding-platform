import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs/promises';
import { attendanceLetterText } from '../../../frontend/src/navigation/attendanceLetter.js';
export async function attendanceLetterPdf(plan) {
  const content = attendanceLetterText(plan), pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await fs.readFile(new URL('../assets/fonts/Montserrat-Regular.ttf',import.meta.url)),{subset:true});
  let page = pdf.addPage([612,792]), y = 728;
  const lines = (text,size=11) => {
    const words = String(text || '').split(/\s+/);let line='';
    const draw = value => {if(y<65){page=pdf.addPage([612,792]);y=728;}page.drawText(value,{x:54,y,size,font,color:rgb(.12,.2,.25)});y-=size*1.6;};
    for(const word of words){const next=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(next,size)>504&&line){draw(line);line=word;}else line=next;}
    if(line)draw(line);y-=10;
  };
  lines(plan.branding?.name || 'Care team',14);lines(content.title,20);y-=12;
  for(const paragraph of content.body)lines(paragraph);
  y-=15;
  if(content.signer?.evidence?.signature){const image=await pdf.embedPng(Buffer.from(content.signer.evidence.signature.split(',')[1],'base64'));const scale=Math.min(180/image.width,55/image.height);if(y<150){page=pdf.addPage([612,792]);y=728;}page.drawImage(image,{x:54,y:y-55,width:image.width*scale,height:image.height*scale});y-=70;}
  lines(content.signature,10);if(plan.data.contactPhone)lines(`Contact: ${plan.data.contactPhone}`,10);
  pdf.setTitle(content.title);return Buffer.from(await pdf.save());
}
