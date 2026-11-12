/** A replacement changes the evidence source, never already entered family data. */
export function paperProcessingForReplacement(previous = {}, documentId) {
  const changed=Number(previous.documentId)!==Number(documentId);
  if(!changed)return {...previous,documentId:Number(documentId)};
  const historical=previous.documentId?{documentId:previous.documentId,processedAt:previous.processedAt||null,packetEvaluationId:previous.packetEvaluationId||null,consentReview:previous.consentReview||null,invitations:previous.invitations||{},workingDraftEnc:previous.workingDraftEnc||null}:null;
  return {...previous,documentId:Number(documentId),completedSteps:(previous.completedSteps||[]).filter(key=>key!=='consents'),invitations:previous.invitations||{},processedAt:null,processedByUserId:null,consentReview:null,signatureSourceDocumentId:null,packetEvaluationId:null,workingDraftEnc:null,previousPackets:[...(previous.previousPackets||[]),...(historical?[historical]:[])]};
}
