import { enrollmentReceiptCards } from './enrollmentReceiptCards.js';
// Shared by Overview, Records and Documents so support sees the same scoped files.
export async function operationalClientDocuments(api, clientId, {school=false}={}) {
 const options={skipGlobalLoading:true};
 const {data:receipts}=await api.get(`/phi-documents/clients/${clientId}/enrollment-receipts`,options);
 const artifacts=enrollmentReceiptCards(receipts);
 if(school){
  const [{data:roi},{data:paper}]=await Promise.all([
   api.get(`/clients/${clientId}/school-roi-access`,options),
   api.get(`/clients/${clientId}/paper-packet-documents`,options)
  ]);
  artifacts.push(...(roi.school_roi_signing?.completed_documents||[]).map(doc=>({id:`signed-roi-${doc.id}`,kind:'roi',kindLabel:'Signed school ROI',title:'Release of information',viewKey:`signed-roi-${doc.id}`,signedAt:doc.signed_at,available:true})));
  artifacts.push(...(paper.documents||[]).map(doc=>({id:`paper-${doc.id}`,kind:'packet',kindLabel:'Uploaded paper packet',title:doc.original_name||'Original paper packet',viewKey:doc.scan_status==='clean'?`paper-${doc.id}`:null,available:doc.scan_status==='clean',scanStatus:doc.scan_status||'pending',uploadedAt:doc.uploaded_at||doc.created_at})));
 }
 return artifacts;
}
