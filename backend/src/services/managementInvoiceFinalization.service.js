import crypto from 'node:crypto';
import { decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { agreementHash } from './auricwell/agreements.js';
import { agreementForMonth } from './businessLifecyclePolicy.js';
import { invoiceAgreement, isUnsignedInvoiceProposal } from './businessInvoiceHold.js';

const failure = () => Object.assign(new Error('The linked management agreement needs signature or retained-copy integrity review before this invoice can be finalized.'), { status: 409, statusCode: 409 });
const decode = row => decryptFamilyBilling(row.payload, `organization-agreement:${row.agency_id}:${row.kind}:${row.id}`);

export async function managementInvoiceExecution(invoice, lifecycle, billingMonth, db, { lock = false } = {}) {
  if (!isUnsignedInvoiceProposal(invoice)) return null;
  const pricing = agreementForMonth(lifecycle, billingMonth);
  const reference = invoiceAgreement(invoice)?.contractReference;
  if (!pricing || pricing.contractReference !== reference) return null;
  return managementAgreementExecution(invoice.agency_id, pricing, billingMonth, db, { lock });
}

export async function managementAgreementExecution(agencyId, pricing, billingMonth, db, { lock = false } = {}) {
  const reference = pricing?.contractReference;
  if (!pricing || pricing.status !== 'active' || !pricing.signedOn || pricing.startMonth > billingMonth
    || (pricing.endMonth && pricing.endMonth < billingMonth)
    || !/^[a-f0-9-]{36}$/i.test(String(reference || ''))) return null;
  const [[row]] = await db.execute(`SELECT * FROM organization_agreement_records WHERE agency_id=? AND kind='agreement' AND id=?${lock ? ' FOR UPDATE' : ''}`, [agencyId, reference]);
  if (!row) return null;
  const document = decode(row);
  if (document.status !== 'completed') return null;
  const signers = document.signers || [], signatures = document.signatures || [];
  if (document.type !== 'management_agreement' || document.patientId || signers.length !== 2
    || new Set(signers.map(signer => signer.accountId)).size !== 2 || signatures.length !== 2
    || !document.contentHash || document.contentHash !== agreementHash(document)
    || !signers.every(signer => signatures.some(signature => signature.accountId === signer.accountId
      && signature.contentHash === document.contentHash && signature.signedAt))) throw failure();
  const lastSignature = signatures.map(signature => String(signature.signedAt).slice(0, 10)).sort().at(-1);
  if (pricing.signedOn !== lastSignature) return null;
  const [[retainedRow]] = await db.execute(`SELECT * FROM organization_agreement_records WHERE agency_id=? AND kind='agreement_pdf' AND source_key=?${lock ? ' FOR UPDATE' : ''}`, [agencyId, reference]);
  if (!retainedRow) throw failure();
  const retained = decode(retainedRow);
  const pdfBytes = Buffer.from(retained.base64 || '', 'base64');
  const pdfHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');
  if (!pdfBytes.length || retained.agreementId !== reference || retained.contentHash !== document.contentHash || retained.pdfHash !== pdfHash) throw failure();
  return { documentId: reference, revision: Number(row.revision), contentHash: document.contentHash,
    retainedPdfHash: pdfHash, signerAccountIds: signers.map(signer => signer.accountId), signedOn: lastSignature };
}
