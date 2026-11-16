export const PORTAL_ACCESS_MODES = ['care', 'payment_only', 'payer_plus', 'none'];
const clinicalFlags = ['canViewDocs', 'canSignDocs', 'canViewLinks', 'canViewProgramMaterials', 'canViewProgress', 'canMessage'];

export function relationshipAccessMode(link) {
  if (Number(link?.access_enabled) !== 1) return 'none';
  let permissions = link?.permissions_json || {};
  if (typeof permissions === 'string') { try { permissions = JSON.parse(permissions); } catch { return 'none'; } }
  return permissions.billingOnly === true ? (permissions.billingDetailLevel === 'payer_plus' ? 'payer_plus' : 'payment_only') : 'care';
}

/** Payment access never grants clinical authority or clears an existing restriction. */
export function permissionsForAccessMode(previous, mode) {
  if (!PORTAL_ACCESS_MODES.includes(mode)) throw Object.assign(new Error('Choose a valid portal access level.'), { status: 400 });
  let p;try{p=typeof previous === 'string' ? JSON.parse(previous) : { ...(previous || {}) };}catch{throw Object.assign(new Error('Stored portal permissions need review before changing access.'),{status:409});}
  if(!p||typeof p!=='object'||Array.isArray(p))throw Object.assign(new Error('Stored portal permissions need review before changing access.'),{status:409});
  if (['payment_only', 'payer_plus'].includes(mode)) {
    if (!p.billingOnly) p.beforeBillingOnly = Object.fromEntries(clinicalFlags.filter(key => key in p).map(key => [key, p[key]]));
    for (const key of clinicalFlags) p[key] = false;
    p.billingOnly = true;
    p.billingDetailLevel = mode;
  } else if (mode === 'care') {
    const restored = p.beforeBillingOnly || {};
    if (p.billingOnly) for (const key of clinicalFlags) {
      if (key in restored) p[key] = restored[key]; else delete p[key];
    }
    delete p.beforeBillingOnly;
    delete p.billingOnly;
    delete p.billingDetailLevel;
  }
  return p;
}

export function presentPaymentOnlyBalance(balance, mode) {
  if (!['payment_only', 'payer_plus'].includes(mode)) return balance;
  const result = {
    receivableId: balance.receivableId, allocationId: balance.allocationId, clientId: balance.clientId,
    serviceDate: balance.serviceDate, dueDate: balance.dueDate, currency: balance.currency,
    dueCents: balance.dueCents, balanceCents: balance.balanceCents, billingState: balance.billingState,
    isOwnShare: balance.isOwnShare, canPay: balance.canPay, canArrangePayments: false,
    autoPayAvailable: balance.autoPayAvailable, paymentStatus: balance.paymentStatus,
    description: balance.visitType === 'virtual' ? 'Virtual visit' : balance.visitType === 'office' ? 'Office visit' : 'Visit',
    accessMode: mode
  };
  if (mode === 'payer_plus') Object.assign(result, {
    description: balance.description, serviceCode: balance.serviceCode,
    amountCents: balance.amountCents, paidCents: balance.paidCents, totalCents: balance.totalCents,
    billedCents: balance.billedCents ?? null, adjustmentCents: balance.adjustmentCents ?? null,
    insurancePaidCents: balance.insurancePaidCents ?? null
  });
  return result;
}

export function presentPaymentOnlyReceipt(receipt, mode) {
  if (mode !== 'payment_only') return receipt;
  return Object.fromEntries(['receiptNumber','agencyName','portalBrand','amountCents','currency','receivedAt','serviceDate','payerName','method','remainingAtPaymentCents','refunds','refundedCents','netPaidCents'].filter(key=>key in receipt).map(key=>[key,receipt[key]]));
}
