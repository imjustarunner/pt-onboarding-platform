import api from '../services/api';
import { openPrivateAttachment } from './openPrivateAttachment.js';

// A notification identifies one source, not whichever document happens to be
// first in a client list. The ordinary private reader retains all current ROI,
// document, quarantine and audit checks on the server.
export async function openSchoolPacketNotification({clientId,documentId,filename}, {isCurrent=()=>true}={}) {
  const cid=Number(clientId),did=Number(documentId);
  if(!Number.isSafeInteger(cid)||cid<1||!Number.isSafeInteger(did)||did<1)throw new Error('The packet notification is missing its client or document.');
  return openPrivateAttachment(async({signal})=>{
    const response=await api.get(`/phi-documents/${did}/view`,{params:{clientId:cid},responseType:'blob',signal,skipGlobalLoading:true});
    if(!String(response.headers?.['content-type']||'').includes('application/json'))return response;
    const data=response.data instanceof Blob?JSON.parse(await response.data.text()):response.data;
    if(!data?.url)throw new Error(data?.error?.message||'The packet could not be opened.');
    const url=new URL(data.url,window.location.origin);
    if(url.protocol!=='https:'||url.username||url.password)throw new Error('The packet link is unavailable.');
    // Legacy non-encrypted files use a server-authorized, expiring storage URL.
    // Never forward app cookies or the app authorization header to that origin.
    const file=await fetch(url.href,{credentials:'omit',signal});
    if(!file.ok)throw new Error('The packet link expired or could not be opened. Choose the notification again.');
    return {data:await file.blob(),headers:{'content-type':file.headers.get('content-type')||'application/pdf','content-disposition':'inline'}};
  },filename||`packet-${did}.pdf`,{isCurrent});
}
