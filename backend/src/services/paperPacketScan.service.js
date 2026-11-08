import Client from '../models/Client.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import { paperPacketBytes } from './paperPacketBytes.service.js';
import { scanSessionMaterial } from './sessionMaterialScan.service.js';
import { schedulePaperPacketVisionEval, getLatestPaperPacketVisionEval } from './paperPacketVision.service.js';
import { queuePrivatePacketScan } from './privatePacketScanJob.service.js';
export async function checkPaperPacketFile({ clientId, documentId, actorId }, overrides={}) {
  const deps={clients:Client,documents:ClientPhiDocument,read:paperPacketBytes,scan:scanSessionMaterial,schedule:schedulePaperPacketVisionEval,queue:queuePrivatePacketScan,latest:getLatestPaperPacketVisionEval,...overrides};
  const client=await deps.clients.findById(clientId);
  if(!client)throw Object.assign(new Error('Client not found.'),{status:404});
  const source=await deps.documents.findSchoolPaperPacket(clientId,documentId);
  if(!source||source.removed_at||Number(source.client_id)!==Number(clientId)||Number(source.agency_id)!==Number(client.agency_id)||Number(source.school_organization_id)!==Number(client.organization_id))throw Object.assign(new Error('Packet not found for this client.'),{status:404});
  if(source.scan_status==='infected')return {status:'infected',message:'This file did not pass its security check. Choose a different file.'};
  if(source.scan_status!=='clean'){
    const queued=await deps.queue({doc:source,clientId,actorId});
    if(queued)return queued;
  }
  const {doc,buffer}=await deps.read({clientId,documentId,schoolOrganizationId:client.organization_id,requireClean:false});
  const result=doc.scan_status==='clean'?{status:'clean'}:await deps.scan(buffer);
  if(doc.scan_status!=='clean')await deps.documents.updateScanStatusById({id:doc.id,scanStatus:result.status,scanResult:result.reason||null,scannedAt:result.status==='pending'?null:new Date(),storagePath:doc.storage_path});
  const latest=result.status==='clean'?await deps.latest(clientId):null;
  const alreadyRead=Number(latest?.phi_document_id)===Number(doc.id)&&latest?.status==='applied';
  if(result.status==='clean'&&!alreadyRead)deps.schedule({clientId,schoolOrganizationId:client.organization_id,phiDocumentId:doc.id,actorUserId:actorId});
  return {status:result.status,message:result.status==='clean'?(alreadyRead?'File check and packet reading are complete.':'File check complete. Packet reading has been queued.'):result.status==='infected'?'This file did not pass its security check. Choose a different file.':result.reason||'The private file check is pending.'};
}
