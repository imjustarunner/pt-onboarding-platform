import {matchConfiguredPayer,withConfiguredPayer,medicaidMemberIdNeedsDiscovery,isColoradoMedicaidPolicy,clientSubscriber} from './paperInsuranceReview.js';
import {policyIsMedicaid} from './insurancePaymentPolicy.js';

export function preparePacketPolicy(policy,payers,patient) {
  const selected=payers.find(p=>String(p.id)===String(policy?.payerCatalogId));
  const matched=selected || matchConfiguredPayer(policy,payers);
  let next=matched?withConfiguredPayer({...policy},matched):{...policy};
  if(medicaidMemberIdNeedsDiscovery(next,patient))next={...next,...clientSubscriber(patient),paperReportedMemberId:next.paperReportedMemberId || next.memberId || '',memberId:''};
  return next;
}
export function preparePacketDraft(insurance,packet,payers,patient) {
  let primary={...(insurance?.primary || {})},secondary=insurance?.secondary?{...insurance.secondary}:null,reordered=false;
  // Repair the recognisable old single-policy import in the local draft only.
  // A saved draft and every later staff correction remain authoritative.
  if(!insurance?.paperDraftSaved && packet?.primary && packet?.secondary?.memberId && !secondary && primary.memberId===packet.secondary.memberId
    && (policyIsMedicaid(primary)||isColoradoMedicaidPolicy(primary)) && !policyIsMedicaid(packet.primary)) {
    primary={...packet.primary};secondary={...packet.secondary};reordered=true;
  }
  if(!primary.insurerName&&!primary.memberId&&!primary.payerId&&packet?.primary)primary={...packet.primary};
  if(!secondary&&packet?.secondary)secondary={...packet.secondary};
  return {primary:preparePacketPolicy(primary,payers,patient),secondary:secondary?preparePacketPolicy(secondary,payers,patient):null,reordered};
}
