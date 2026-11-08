import crypto from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import pool from '../config/database.js';
const prefix = 'private_scan_queued:';
export async function queuePrivatePacketScan({ doc, clientId, actorId }, overrides={}) {
  const { db=pool, jobName=process.env.PRIVATE_PACKET_SCAN_JOB, request=async(url,body)=>{
    const client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();
    return client.request({url,method:'POST',data:body,timeout:20000});
  }, now=Date.now }=overrides;
  if(!/^projects\/[^/]+\/locations\/[^/]+\/jobs\/[^/]+$/.test(jobName||''))return null;
  const previous=String(doc.scan_result||'');
  if(previous.startsWith(prefix)&&now()-Number(previous.split(':')[1])<10*60*1000)return {status:'pending',message:'The private file check is queued or running. Refresh in a few minutes.'};
  const marker=`${prefix}${now()}:${crypto.randomUUID()}`;
  const [claimed]=await db.execute('UPDATE client_phi_documents SET scan_status=\'pending\', scan_result=? WHERE id=? AND client_id=? AND scan_result <=> ? AND COALESCE(scan_status,\'\') NOT IN (\'clean\',\'infected\') AND removed_at IS NULL',[marker,doc.id,clientId,doc.scan_result??null]);
  if(!claimed.affectedRows)return {status:'pending',message:'The file check state changed. Refresh before retrying.'};
  try {
    await request(`https://run.googleapis.com/v2/${jobName}:run`,{overrides:{taskCount:1,timeout:'300s',containerOverrides:[{name:'scanner',env:[
      {name:'PACKET_SCAN_DOCUMENT_ID',value:String(doc.id)},{name:'PACKET_SCAN_CLIENT_ID',value:String(clientId)},
      {name:'PACKET_SCAN_ACTOR_ID',value:String(actorId)},{name:'PACKET_SCAN_MARKER',value:marker}
    ]}]}});
    return {status:'pending',message:'Private file check queued. Refresh in a few minutes; the packet will open after it passes.'};
  } catch {
    // An ambiguous transport failure may still have launched the job. Retain
    // the ten-minute lease instead of automatically sending duplicate work.
    return {status:'pending',message:'The file-check request has an unknown outcome. Wait a few minutes and refresh before retrying.'};
  }
}
