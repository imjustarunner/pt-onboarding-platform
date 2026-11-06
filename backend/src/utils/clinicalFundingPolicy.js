const normalized=value=>String(value||'').trim().toUpperCase();
const parse=value=>{if(value&&typeof value==='object')return value;try{return JSON.parse(value||'{}')||{};}catch{return {};}};

export function isProBonoServiceCode(value) {
  return /^PRO[\s_-]*BONO(?:[\s_-]*SERVICE)?$/.test(normalized(value));
}

/** Funding is independent of delivery method and the underlying clinical code. */
export function isProBonoFunding({serviceCode,metadata,billing}={}) {
  const meta=parse(metadata),contact=parse(meta.contactMeta);
  return isProBonoServiceCode(serviceCode)
    || [meta.fundingDisposition,meta.billingDisposition,meta.billing_disposition,meta.contactBillingDisposition,contact.billing_disposition,billing?.settlementMode,billing?.settlement_mode].some(value=>String(value||'').toLowerCase()==='pro_bono');
}

/** Call with persisted source metadata. Never infer a service from duration. */
export function resolveProBonoDocumentationService({serviceCode,metadata}={}) {
  const meta=parse(metadata);
  if(!isProBonoServiceCode(serviceCode))return {serviceCode:normalized(serviceCode)||null,provenance:serviceCode?'actual_service':null};
  for(const key of ['underlyingServiceCode','underlyingClinicalServiceCode','primaryClinicalServiceCode','clinicalServiceCode']){
    const selected=normalized(meta[key]);
    if(selected&&!isProBonoServiceCode(selected)&&/^(?:\d{5}|[A-Z]\d{4})$/.test(selected)&&!['90785','90840','99051'].includes(selected))return {serviceCode:selected,provenance:`saved_metadata.${key}`};
  }
  return {serviceCode:null,provenance:null};
}

export function proBonoClientBilling(billing={}) {
  return {...billing,settlementMode:'pro_bono',settlement_mode:'pro_bono',amountCents:0,amount_cents:0,paymentStatus:'waived',payment_status:'waived',packageEntitlementId:null,package_entitlement_id:null};
}
