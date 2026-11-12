import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import {paperProcessingForReplacement} from '../utils/paperProcessingReplacement.js';
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export async function withPaperProcessingClientLock(clientId,action,database=pool,existingConnection=null){
 const connection=existingConnection||await database.getConnection(),lock=`paper-packet-processing:${Number(clientId)}`;let acquired=false;
 try{const [[result]]=await connection.execute('SELECT GET_LOCK(?, 5) AS acquired',[lock]);acquired=Number(result?.acquired)===1;if(!acquired)throw fail('This packet is already being processed. Please wait and refresh.');return await action(connection);}
 finally{try{if(acquired)await connection.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{if(!existingConnection)connection.release();}}
}
/** Read only after acquiring Finish's client lock; preserve the just-completed old source as history. */
export async function replacePaperProcessingSource({clientId,agencyId,schoolId,documentId,draftId,actorId},{clients=Client,database=pool,connection=null}={}){
 return withPaperProcessingClientLock(clientId,async db=>{
  // Use the lock connection for the production read/write: parallel uploads
  // cannot exhaust the pool by holding a lock while waiting for another slot.
  const client=clients===Client?(await db.execute('SELECT id,agency_id,organization_id,onboarding_docs_json FROM clients WHERE id=?',[clientId]))[0][0]:await clients.findById(clientId,{includeSensitive:true});
  if(!client||Number(client.agency_id)!==Number(agencyId)||Number(client.organization_id)!==Number(schoolId))throw fail('The client school or agency changed before this packet could be attached.');
  let docs=client.onboarding_docs_json||{};if(typeof docs==='string')docs=JSON.parse(docs);
  if(Number(docs.paperPacketSource?.documentId)===Number(documentId))return {changed:false};
  const next={...docs,paperPacketSource:{documentId:Number(documentId),draftId:Number(draftId)},...(docs.paperProcessing?{paperProcessing:paperProcessingForReplacement(docs.paperProcessing,documentId)}:{})};
  if(clients===Client){const [saved]=await db.execute('UPDATE clients SET onboarding_docs_json=?,updated_by_user_id=? WHERE id=? AND agency_id=? AND organization_id=?',[JSON.stringify(next),actorId||null,clientId,agencyId,schoolId]);if(Number(saved.affectedRows)!==1)throw fail('The client changed before this packet could be attached.');}
  else await clients.update(clientId,{onboarding_docs_json:JSON.stringify(next)},actorId||null);return {changed:true};
 },database,connection);
}
