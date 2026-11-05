export function invoiceAgreement(invoice) {
  const raw = invoice?.line_items_json;
  const snapshot = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return snapshot?.businessAgreement || null;
}

export function agreementInvoiceOnHold(invoice) {
  const agreement = invoiceAgreement(invoice);
  return agreement?.requiresSignatures === true
    && (!agreement.signedOn || agreement.ready !== true);
}

export function assertAgreementInvoiceReady(invoice) {
  if (agreementInvoiceOnHold(invoice)) {
    throw Object.assign(new Error('This management invoice is a review draft. Complete both agreement signatures and finalize its billing terms before collecting payment, syncing, or sending it.'), {
      status: 409, statusCode: 409, code: 'BUSINESS_AGREEMENT_SIGNATURES_REQUIRED'
    });
  }
}

export function assertManagementBillingPeriodReady(lifecycle, billingMonth) {
  const active = (lifecycle?.agreements || []).filter(agreement => agreement.status === 'active'
    && agreement.startMonth <= billingMonth).sort((a, b) => b.startMonth.localeCompare(a.startMonth))[0];
  if (active?.signedOn && active.contractReference && (!active.endMonth || active.endMonth >= billingMonth)) return active;
  const pending = (lifecycle?.agreements || []).some(agreement => agreement.status === 'draft'
    && agreement.requiresSignatures === true && agreement.startMonth <= billingMonth
    && (!agreement.endMonth || agreement.endMonth >= billingMonth));
  if (pending) throw Object.assign(new Error('Management billing is awaiting both agreement signatures and active signed pricing. Finalize the management agreement before generating this billing period.'), {
    status: 409, statusCode: 409, code: 'BUSINESS_AGREEMENT_SIGNATURES_REQUIRED'
  });
  return null;
}

// Only an untouched, explicitly unsigned proposal may be repriced. An ordinary
// draft invoice still freezes its original financial terms.
export function isUnsignedInvoiceProposal(invoice) {
  const agreement = invoiceAgreement(invoice);
  return agreement?.requiresSignatures === true && agreement.ready === false && !agreement.signedOn
    && invoice.status === 'draft' && invoice.payment_status === 'unpaid'
    && !invoice.qbo_invoice_id && !invoice.qbo_bill_id && !invoice.qbo_payment_id
    && !invoice.payment_reference && !invoice.payment_method_id && !invoice.paid_at
    && !invoice.auto_charge_attempted_at && !invoice.invoice_sent_at
    && (!invoice.invoice_delivery_status || invoice.invoice_delivery_status === 'not_sent');
}
