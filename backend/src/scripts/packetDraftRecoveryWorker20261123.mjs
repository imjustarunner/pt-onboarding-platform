// One-time owner-approved recovery. No human application actor or application JWT.
import mysql from 'mysql2/promise';
import { Storage } from '@google-cloud/storage';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { PDFDocument } from 'pdf-lib';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, chown, chmod, access, stat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import DocumentEncryptionService from '../services/documentEncryption.service.js';
import { scanSessionMaterial } from '../services/sessionMaterialScan.service.js';
import { extractPaperPacketDemographics } from '../utils/paperPacketDemographics.util.js';
import { paperDemographicsTableText } from '../utils/paperDemographicsTable.js';
import { extractPaperPacketReviewHints, detectSignaturesFromText, extractVersionLabelFromText } from '../utils/paperPacketVisionParse.util.js';

const approved = [131,133,141,250,251,252,254];
const exec = promisify(execFile);
const automation = 'packet-recovery-20261123';
const socket = '/tmp/pt-clamav/clamd.sock';
let db, daemon;
async function scanner() {
  await mkdir('/tmp/pt-clamav', { recursive: true });
  const uid=Number((await exec('id',['-u','clamav'])).stdout.trim()), gid=Number((await exec('id',['-g','clamav'])).stdout.trim());
  await chown('/tmp/pt-clamav',uid,gid); await chmod('/tmp/pt-clamav',0o700);
  try { await exec('freshclam',['--stdout'],{timeout:45000,maxBuffer:8192}); }
  catch { const daily=await stat('/var/lib/clamav/daily.cld').catch(()=>stat('/var/lib/clamav/daily.cvd')); if(Date.now()-daily.mtimeMs>7*86400000) throw Error('SCANNER_SIGNATURES_STALE'); }
  daemon=spawn('clamd',['--foreground','--config-file=/app/clamd.conf'],{stdio:'ignore'});
  let failed=false;daemon.on('error',()=>{failed=true;});daemon.on('exit',()=>{failed=true;});
  for(let n=0;n<90;n++){if(failed)throw Error('SCANNER_START_FAILED');try{await access(socket);return;}catch{await new Promise(r=>setTimeout(r,1000));}}
  throw Error('SCANNER_START_TIMEOUT');
}
const firstSet = result => result.filter(Array.isArray)[0] || [];
async function call(id, operation, payload={}) {
  const [result] = await db.execute('CALL ops_packet_recovery_20261123(?,?,?,?)', [process.env.PLAN_HASH,id,operation,JSON.stringify(payload)]);
  return firstSet(result);
}
async function identityCall(id,operation,payload={}) {
  const [result]=await db.execute('CALL ops_packet_identity_recovery_20261123(?,?,?,?)',[process.env.PLAN_HASH,id,operation,JSON.stringify(payload)]);
  return firstSet(result);
}
async function renderPages(buffer,count) {
  const directory=await mkdtemp('/tmp/approved-packet-');
  try {
    await new Promise((resolve,reject)=>{
      const child=spawn('gs',['-q','-dSAFER','-dBATCH','-dNOPAUSE','-sDEVICE=png16m','-r150','-dFirstPage=1',`-dLastPage=${Math.min(count,20)}`,`-sOutputFile=${directory}/page-%02d.png`,'-'],{stdio:['pipe','ignore','ignore']});
      const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(Error('PDF_RENDER_TIMEOUT'));},120000);
      child.on('error',()=>{clearTimeout(timeout);reject(Error('PDF_RENDER_UNAVAILABLE'));});
      child.on('close',code=>{clearTimeout(timeout);code===0?resolve():reject(Error('PDF_RENDER_FAILED'));});
      child.stdin.on('error',()=>{});child.stdin.end(buffer);
    });
    const names=(await readdir(directory)).filter(n=>n.endsWith('.png')).sort();
    return await Promise.all(names.map(async(name,index)=>({page:index+1,bytes:await readFile(`${directory}/${name}`)})));
  }finally{await rm(directory,{recursive:true,force:true});}
}
function initialsFor(name) {
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
  if(parts.length<2)return null;
  const part=s=>{const p=s.replace(/[^A-Za-z]/g,'').slice(0,3);return p? p[0].toUpperCase()+p.slice(1).toLowerCase():'';};
  return part(parts[0])+part(parts.at(-1));
}
try {
  if(process.env.APPLY_CHANGES!=='true')throw Error('EXPLICIT_APPLY_REQUIRED');
  db=await mysql.createConnection({socketPath:process.env.DB_SOCKET,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,charset:'utf8mb4_unicode_ci',timezone:'Z'});
  await db.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');
  await scanner();
  const storage=new Storage(), vision=new ImageAnnotatorClient();
  const outcomes=[];
  for(const id of approved){
    try {
      const [doc]=await call(id,'inspect');
      if(!doc)throw Error('APPROVED_DOCUMENT_UNAVAILABLE');
      if(doc.recovery_state==='scanned'){
        const [identity]=await identityCall(id,'status');
        if(identity.initials!=='TBD'){outcomes.push({draftId:id,clientId:doc.recovery_client_id,status:'already_scanned'});continue;}
      }
      console.log(JSON.stringify({event:'approved_packet_scan_started',automation,draftId:id}));
      const [encrypted]=await storage.bucket(process.env.PTONBOARDFILES).file(doc.storage_path).download();
      const buffer=doc.is_encrypted?await DocumentEncryptionService.decryptPhiDocumentBuffer(doc,encrypted,name=>String(name||'').replace(/[^a-zA-Z0-9._-]/g,'_')):encrypted;
      const security=await scanSessionMaterial(buffer,{socketPath:socket});
      if(security.status!=='clean')throw Error(security.status==='infected'?'FILE_INFECTED':'FILE_CHECK_PENDING');
      const pages=[], tables=[];
      if(String(doc.mime_type).includes('pdf')){
        const count=(await PDFDocument.load(buffer)).getPageCount();
        const rendered=await renderPages(buffer,count);
        for(let start=0;start<rendered.length;start+=5){
          const group=rendered.slice(start,start+5);
          const [response]=await vision.batchAnnotateImages({requests:group.map(image=>({image:{content:image.bytes},features:[{type:'DOCUMENT_TEXT_DETECTION'}],imageContext:{languageHints:['en','es']}}))});
          for(let index=0;index<(response.responses||[]).length;index++){
            const item=response.responses[index];
            if(item.error?.code)throw Error(`VISION_PAGE_FAILED_${item.error.code}`);
            const text=item.fullTextAnnotation?.text||item.textAnnotations?.[0]?.description||'';
            pages.push({page:group[index].page,text});
            const table=paperDemographicsTableText(item.fullTextAnnotation);if(table)tables.push(table);
          }
          for(const image of group)image.bytes.fill(0);
        }
      }else{
        const [item]=await vision.documentTextDetection({image:{content:buffer},imageContext:{languageHints:['en','es']}});
        pages.push({page:1,text:item.fullTextAnnotation?.text||''});
        const table=paperDemographicsTableText(item.fullTextAnnotation);if(table)tables.push(table);
      }
      const text=pages.map(p=>p.text).join('\n');
      if(!text.trim())throw Error('NO_OCR_TEXT');
      const student=extractPaperPacketDemographics(text,{demographicsText:tables.join('\n'),locale:'auto'});
      const name=student.fullName?.trim()||null, initials=initialsFor(name);
      const aad=JSON.stringify({type:'referral_ocr',clientId:null,requestId:null,phiDocumentId:doc.id,automation,draftId:id});
      const encryptedText=await DocumentEncryptionService.encryptBuffer(Buffer.from(text),{aad});
      const signatures=detectSignaturesFromText(text),version=extractVersionLabelFromText(text);
      const summary={automationIdentity:automation,sourceDocumentId:doc.id,demographicsAttempted:true,studentIdentitySource:'dependent_name_in_packet',reviewHints:extractPaperPacketReviewHints(text,pages),humanReviewRequired:true};
      const payload={
        studentName:name,studentInitials:initials,dateOfBirth:student.dateOfBirth||null,
        sha256:crypto.createHash('sha256').update(buffer).digest('hex'),
        detectedVersion:version.label||null,roiSignature:!!signatures.roiSignatureDetected,disclosureSignature:!!signatures.disclosureSignatureDetected,
        summary,ocr:{ciphertext:encryptedText.encryptedBuffer.toString('base64'),key:encryptedText.encryptionKeyId,wrapped:encryptedText.encryptionWrappedKeyB64,iv:encryptedText.encryptionIvB64,tag:encryptedText.encryptionAuthTagB64,alg:encryptedText.encryptionAlg,aad}
      };
      const [saved]=doc.recovery_state==='scanned'?await identityCall(id,'apply',payload):await call(id,'import',payload);
      const outcome={draftId:id,clientId:saved.client_id,initials:saved.initials,scanStatus:'clean',identityStatus:saved.identity_status,taskId:saved.task_id};
      outcomes.push(outcome);console.log(JSON.stringify({event:'approved_packet_recovered',automation,...outcome}));
      buffer.fill(0);
    }catch(error){outcomes.push({draftId:id,status:'needs_review',code:typeof error.code==='string'?error.code:String(error.message||'RECOVERY_FAILED').replace(/[^A-Z_]/g,'').slice(0,80)});console.log(JSON.stringify({event:'approved_packet_needs_review',automation,draftId:id,code:outcomes.at(-1).code}));process.exitCode=1;}
  }
  console.log(JSON.stringify({event:'approved_packet_recovery_summary',automation,outcomes}));
}catch(error){console.error(JSON.stringify({event:'approved_packet_recovery_failed',automation,code:typeof error.code==='string'?error.code:String(error.message||'RECOVERY_FAILED').replace(/[^A-Z_]/g,'').slice(0,80)}));process.exitCode=1;}
finally{daemon?.kill('SIGTERM');if(db)await db.end();}
