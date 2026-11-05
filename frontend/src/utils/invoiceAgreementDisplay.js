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
// The server independently rechecks this before generating an unstored review PDF.
export function invoiceReviewPdfAvailable(invoice) {
  const agreement=invoiceSnapshot(invoice)?.businessAgreement;
  return agreement?.requiresSignatures===true&&agreement.ready===false&&!agreement.signedOn
    &&invoice.status==='draft'&&invoice.payment_status==='unpaid'
    &&!invoice.qbo_invoice_id&&!invoice.qbo_bill_id&&!invoice.qbo_payment_id
    &&!invoice.payment_reference&&!invoice.payment_method_id&&!invoice.paid_at
    &&!invoice.auto_charge_attempted_at&&!invoice.invoice_sent_at
    &&(!invoice.invoice_delivery_status||invoice.invoice_delivery_status==='not_sent');
}
export function invoiceAgreementLocation(invoice,slug,fallbackAgencyId) {
  const reference=invoiceSnapshot(invoice)?.businessAgreement?.contractReference;
  const agencyId=Number(invoice?.agency_id||fallbackAgencyId);
  if(typeof reference!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference)
    ||!Number.isSafeInteger(agencyId)||agencyId<1||!slug)return null;
  return{path:`/${encodeURIComponent(slug)}/admin/organization-agreements`,query:{agencyId:String(agencyId),document:reference}};
}
