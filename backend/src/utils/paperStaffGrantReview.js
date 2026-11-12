import {isPaperPacketClient} from './paperPacketClient.js';
const object=value=>{if(!value)return{};if(typeof value==='object')return value;try{return JSON.parse(value);}catch{return{};}};
/** New/replacement packet permissions are applied only by the source-bound processor. */
export function paperStaffGrantNeedsProcessing(client){
 if(!isPaperPacketClient(client))return false;const docs=object(client?.onboarding_docs_json),state=docs.paperProcessing||{},source=Number(docs.paperPacketSource?.documentId||state.documentId);
 if(!source)return false;
 return !(state.processedAt&&Number(state.signatureSourceDocumentId||state.documentId)===source);
}
