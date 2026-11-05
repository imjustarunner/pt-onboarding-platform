export function invoiceSnapshot(invoice) {
  const raw=invoice?.line_items_json;
  if(!raw)return null;
  if(typeof raw==='object')return raw;
  try{return JSON.parse(raw);}catch{return null;}
}
export function invoiceAgreementHeld(invoice) {
  const agreement=invoiceSnapshot(invoice)?.businessAgreement;
  return agreement?.requiresSignatures===true&&(!agreement.signedOn||agreement.ready!==true);
}
export function invoiceAgreementLocation(invoice,slug,fallbackAgencyId) {
  const reference=invoiceSnapshot(invoice)?.businessAgreement?.contractReference;
  const agencyId=Number(invoice?.agency_id||fallbackAgencyId);
  if(typeof reference!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference)
    ||!Number.isSafeInteger(agencyId)||agencyId<1||!slug)return null;
  return{path:`/${encodeURIComponent(slug)}/admin/organization-agreements`,query:{agencyId:String(agencyId),document:reference}};
}
