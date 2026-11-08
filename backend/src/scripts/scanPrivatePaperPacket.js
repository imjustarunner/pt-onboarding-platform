import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import { access, mkdir, chown, chmod, stat } from 'node:fs/promises';
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import { paperPacketBytes } from '../services/paperPacketBytes.service.js';
import { scanSessionMaterial } from '../services/sessionMaterialScan.service.js';
import { evaluateAndApplyPaperPacketVision } from '../services/paperPacketVision.service.js';

const clientId=Number(process.env.PACKET_SCAN_CLIENT_ID),documentId=Number(process.env.PACKET_SCAN_DOCUMENT_ID),actorId=Number(process.env.PACKET_SCAN_ACTOR_ID)||null;
const marker=process.env.PACKET_SCAN_MARKER;
let daemon,conn,locked=false;
async function startScanner(){
  // No uploaded filenames, document contents or credentials go to logs.
  await mkdir('/tmp/pt-clamav',{recursive:true});
  // The dedicated job runs the scanner as its unprivileged Alpine account.
  const uid=Number((await exec('id',['-u','clamav'])).stdout.trim()),gid=Number((await exec('id',['-g','clamav'])).stdout.trim());
  await chown('/tmp/pt-clamav',uid,gid);await chmod('/tmp/pt-clamav',0o700);
  try { await exec('freshclam',['--stdout'],{timeout:45000,maxBuffer:8192}); } catch {
    const daily=await stat('/var/lib/clamav/daily.cld').catch(()=>stat('/var/lib/clamav/daily.cvd'));
    if(Date.now()-daily.mtimeMs>7*24*60*60*1000)throw Error('Scanner signatures need an update.');
  }
  daemon=spawn('clamd',['--foreground','--config-file=/app/clamd.conf'],{stdio:'ignore'});
  let daemonFailed=false;daemon.on('error',()=>{daemonFailed=true;});daemon.on('exit',()=>{daemonFailed=true;});
  const socket='/tmp/pt-clamav/clamd.sock';
  for(let attempt=0;attempt<90;attempt++){
    if(daemonFailed)throw Error('Private scanner could not start.');
    try{await access(socket);break;}catch{await new Promise(resolve=>setTimeout(resolve,1000));}
  }
}
try {
  const selfTest=process.env.PACKET_SCAN_SELF_TEST==='1';
  if(selfTest){
    await startScanner();
    const clean=await scanSessionMaterial(Buffer.from('Synthetic private scanner check'),{socketPath:'/tmp/pt-clamav/clamd.sock'});
    const sample=Buffer.from('X5O!P%@AP[4'+String.fromCharCode(92)+'PZX54(P^)7CC)7}$EICAR'+'-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
    const infected=await scanSessionMaterial(sample,{socketPath:'/tmp/pt-clamav/clamd.sock'});
    console.log(JSON.stringify({event:'private_packet_scanner_self_test',clean:clean.status,antivirusTest:infected.status}));
    if(clean.status!=='clean'||infected.status!=='infected')process.exitCode=1;
  }else{
  if(!clientId||!documentId||!String(marker||'').startsWith('private_scan_queued:'))throw Error('Missing private scan request.');
  conn=await pool.getConnection();
  const [[lock]]=await conn.execute('SELECT GET_LOCK(?,0) AS acquired',[`private_packet_scan:${documentId}`]);
  locked=Number(lock.acquired)===1;
  if(locked){
    const doc=await ClientPhiDocument.findSchoolPaperPacket(clientId,documentId);
    if(doc&&!doc.removed_at&&doc.scan_result===marker&&doc.scan_status==='pending'){
      const client=await Client.findById(clientId);
      if(!client||Number(doc.agency_id)!==Number(client.agency_id))throw Error('Packet scope changed.');
      await startScanner();
      const {buffer}=await paperPacketBytes({clientId,documentId,schoolOrganizationId:client.organization_id,requireClean:false});
      const result=await scanSessionMaterial(buffer,{socketPath:'/tmp/pt-clamav/clamd.sock'});
      await ClientPhiDocument.updateScanStatusById({id:documentId,scanStatus:result.status,scanResult:result.reason||null,scannedAt:result.status==='pending'?null:new Date(),storagePath:doc.storage_path});
      console.log(JSON.stringify({event:'private_packet_scan_finished',status:result.status}));
      if(result.status==='clean')await evaluateAndApplyPaperPacketVision({clientId,schoolOrganizationId:client.organization_id,phiDocumentId:documentId,actorUserId:actorId});
      if(result.status==='pending')process.exitCode=1;
    }
  }
  }
} catch {
  console.error('Private packet scan did not complete. The file remains pending unless a completed result was saved.');process.exitCode=1;
} finally {
  daemon?.kill('SIGTERM');
  if(locked)await conn.execute('SELECT RELEASE_LOCK(?)',[`private_packet_scan:${documentId}`]).catch(()=>{});
  conn?.release();await pool.end();
}

process.exit(process.exitCode || 0);
