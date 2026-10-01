import { createHash } from 'node:crypto';
import DocumentSigningService from './documentSigning.service.js';
import StorageService from './storage.service.js';
import { PDFDocument } from 'pdf-lib';

export const documentHash = document => createHash('sha256').update(JSON.stringify(document)).digest('hex');
export const escapeAgreementHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function validateAgreementSignature(input, { name, userId = null, clientId = null, ip = null, userAgent = null } = {}) {
  if (input?.accepted !== true) throw Object.assign(new Error('Confirm that you have read and agree to the document.'), { status: 400 });
  const typedName = String(input.typedName || '').trim();
  const image = String(input.signatureData || '');
  if ((!typedName || image) && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image)) throw Object.assign(new Error('Type your full name or draw your signature.'), { status: 400 });
  if (typedName.length > 255 || image.length > 300000) throw Object.assign(new Error('Signature is too large.'), { status: 400 });
  if (image && !Buffer.from(image.split(',')[1] || '', 'base64').subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Object.assign(new Error('Use a PNG signature image.'), { status: 400 });
  return { name: String(name || typedName), typedName: typedName || null, image: image || null, userId, clientId, signedAt: new Date().toISOString(), ip, userAgent: String(userAgent || '').slice(0, 512), accepted: true };
}
export function renderRecordingAgreement(document, signatures = []) {
  const e = escapeAgreementHtml;
  const terms=String(document.text||'').replace(/^SUPERVISION AGREEMENT\s*\n/,'').split(/\n{2,}/).filter(Boolean).map(block=>{const lines=block.split('\n');if(/^[IVX]+\. /.test(lines[0]))return `<h2>${e(lines.shift())}</h2><p class="terms">${e(lines.join('\n'))}</p>`;return `<p class="terms">${e(block)}</p>`;}).join('');
  const color = /^#[a-f0-9]{6}$/i.test(document.color || '') ? document.color : '#126253';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    @page{size:Letter;margin:20mm}body{font:11pt/1.55 Arial,sans-serif;color:#233342;margin:0}
    header{border-top:9px solid ${color};padding:24px 0 18px;border-bottom:1px solid #dce5e4}h1{font-size:27pt;line-height:1.15;color:${color};margin:10px 0}
    .agency{font-size:12pt;letter-spacing:1px;text-transform:uppercase;color:${color}}.parties{padding:16px;background:#f0f6f4;margin:20px 0;border-radius:8px}
    @media screen{body{padding:24px}}.terms{white-space:pre-wrap;margin:10px 0 18px}h2{font-size:15pt;color:${color}}.signature{break-inside:avoid;border-top:1px solid #b9ccc7;padding:14px 0;margin-top:20px}.signature img{max-width:240px;max-height:90px}
    .typed{font:italic 24pt Georgia,serif}footer{font-size:8pt;color:#5a6b75;overflow-wrap:anywhere;margin-top:30px}.meta{font-size:10pt;color:#54656a}
    </style></head><body><header><div class="agency">${e(document.agencyName)}</div><h1>${e(document.title)}</h1><div class="meta">Version ${e(document.version)} · Confidential agreement</div></header>
    <section class="parties">${(document.parties || []).map(p => `<div><strong>${e(p.role)}:</strong> ${e(p.name)}${p.credentials ? ` · ${e(p.credentials)}` : ''}${p.email ? `<br><span class="meta">${e(p.email)}</span>` : ''}</div>`).join('<br>')}</section>
    ${document.html ? `<section>${document.html}</section>` : `<section>${terms}</section>`}
    <h2>Electronic signatures</h2><p>Signing confirms agreement to the document above. Either participant may pause transcription at any time.</p>
    ${signatures.map(s => `<section class="signature"><strong>${e(s.role)} · ${e(s.name)}</strong><br>${s.image ? `<img src="${s.image}" alt="Signature">` : `<div class="typed">${e(s.typedName)}</div>`}<div class="meta">Signed ${e(s.signedAt)} · Electronic signature</div></section>`).join('') || '<p>Awaiting signatures.</p>'}
    <footer>Document fingerprint (SHA-256): ${documentHash(document)}<br>Signatures are retained with this document and their signing dates.</footer></body></html>`;
}
export async function saveRecordingAgreementPdf(document, signatures, filename) {
  const html = renderRecordingAgreement(document, signatures);
  let bytes = await DocumentSigningService.convertHTMLToPDF(html, { disableFallback: true });
  if (document.templateType === 'pdf') {
    const original = await StorageService.readObject(document.templatePath);
    if (createHash('sha256').update(original).digest('hex') !== document.templateHash) throw Object.assign(new Error('The consent document changed. Request a new copy before signing.'),{status:409});
    const pdf = await PDFDocument.load(original), certificate = await PDFDocument.load(bytes);
    const pages = await pdf.copyPages(certificate,certificate.getPageIndices());for(const page of pages)pdf.addPage(page);
    bytes = Buffer.from(await pdf.save());
  }
  const saved = await StorageService.saveAdminDoc(bytes, filename, 'application/pdf');
  return { path: saved.relativePath, hash: createHash('sha256').update(bytes).digest('hex') };
}
