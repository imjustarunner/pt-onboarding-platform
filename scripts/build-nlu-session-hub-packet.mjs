import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'backend/package.json'));
const sharp=require('sharp'),{PDFDocument,StandardFonts}=require('pdf-lib');
const out=path.join(root,'deliverables/nlu-session-hub-2026-11-21');
await mkdir(out,{recursive:true});
const brief=await readFile(path.join(root,'docs/qa/NLU-SESSION-HUB-V2-RETEST-2026-11-21.txt'),'utf8');
await writeFile(path.join(out,'NLU-SESSION-HUB-BOT-BRIEF.txt'),brief);
for(const file of ['math-worksheet.pdf','reading-worksheet.pdf'])await copyFile(path.join(root,'docs/qa/fixtures/tutoring-2026-11-01',file),path.join(out,file));
await writeFile(path.join(out,'UPLOAD-LIST.txt'),'Upload one NLU-SESSION-HUB-BOT-BRIEF.txt or PDF reading copy, plus math-worksheet.pdf, reading-worksheet.pdf and math-worksheet-image.png. Then send START SESSION HUB. Credentials remain in the existing QA vault.\n');
const text=await readFile(path.join(root,'docs/qa/fixtures/tutoring-2026-11-01/math-worksheet.txt'),'utf8');
const lines=[];
for(const line of text.split('\n')){if(!line){lines.push('');continue;}let row='';for(const word of line.split(/\s+/)){if((row+' '+word).length>72){lines.push(row);row=word;}else row+=(row?' ':'')+word;}lines.push(row);}
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const height=Math.max(900,lines.length*34+100);
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="'+height+'"><rect width="100%" height="100%" fill="white"/>'+lines.map((l,i)=>'<text x="60" y="'+(70+i*34)+'" font-family="sans-serif" font-size="23" fill="#18394d">'+esc(l)+'</text>').join('')+'</svg>';
await sharp(Buffer.from(svg)).png().toFile(path.join(out,'math-worksheet-image.png'));
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
const all=(await readFile(path.join(out,'NLU-SESSION-HUB-BOT-BRIEF.txt'),'utf8')).normalize('NFKD').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[–—]/g,' - ').replace(/\r/g,'').replace(/\t/g,'  ').replace(/[^\x0A\x20-\x7E]/g,'');
let page,y;
function nextPage(){page=pdf.addPage([612,792]);y=750;}
nextPage();
for(const line of all.split('\n')){let rest=line;do{let end=Math.min(rest.length,102);while(end>1&&font.widthOfTextAtSize(rest.slice(0,end),9)>528)end--;if(y<42)nextPage();page.drawText(rest.slice(0,end),{x:42,y,size:9,font});y-=12;rest=rest.slice(end);}while(rest.length);}
pdf.setTitle('NLU Session Hub - complete QA bot brief');pdf.setCreator('Codex - synthetic QA materials');
await writeFile(path.join(out,'NLU-SESSION-HUB-BOT-BRIEF.pdf'),await pdf.save());
console.log('Built '+pdf.getPageCount()+'-page Session Hub reading copy and synthetic image worksheet.');
