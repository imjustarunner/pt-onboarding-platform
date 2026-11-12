import { enrollmentReceiptCards } from './enrollmentReceiptCards.js';
// Shared by Overview, Records and Documents so support sees the same scoped files.
export async function operationalClientDocuments(api, clientId, {school=false}={}) {
 const options={skipGlobalLoading:true};
 const {data:receipts}=await api.get(`/phi-documents/clients/${clientId}/enrollment-receipts`,options);
 const artifacts=enrollmentReceiptCards(receipts);
 if(school){
  const [{data:roi},{data:paper},attachmentResult]=await Promise.all([
   api.get(`/clients/${clientId}/school-roi-access`,options),
   api.get(`/clients/${clientId}/paper-packet-documents`,options),
   api.get(`/phi-documents/clients/${clientId}/school-attachments`,options).catch(()=>({data:[],unavailable:true}))
  ]);
  artifacts.push(...(roi.school_roi_signing?.completed_documents||[]).map(doc=>({id:`signed-roi-${doc.id}`,kind:'roi',kindLabel:'Signed school ROI',title:'Release of information',viewKey:`signed-roi-${doc.id}`,signedAt:doc.signed_at,available:true})));
  const attachments=attachmentResult.data;if(attachmentResult.unavailable)artifacts.push({id:'school-attachments-unavailable',kind:'school_attachment',kindLabel:'School-uploaded documents',title:'School-uploaded files could not load. Refresh to try again.',available:false});
  artifacts.push(...(Array.isArray(attachments)?attachments:[]).filter(doc=>!(paper.documents||[]).some(packet=>Number(packet.id)===Number(doc.id))).map(doc=>({id:`school-file-${doc.id}`,kind:'school_attachment',kindLabel:'School-uploaded document',title:doc.document_title||doc.original_name||'School attachment',viewKey:`school-file-${doc.id}`,available:true,uploadedAt:doc.uploaded_at||doc.created_at})));
  artifacts.push(...(paper.documents||[]).map(doc=>({id:`paper-${doc.id}`,kind:'packet',kindLabel:'Uploaded paper packet',title:doc.original_name||'Original paper packet',viewKey:doc.scan_status==='clean'?`paper-${doc.id}`:null,available:doc.scan_status==='clean',scanStatus:doc.scan_status||'pending',uploadedAt:doc.uploaded_at||doc.created_at})));
 }
 return artifacts;
}
