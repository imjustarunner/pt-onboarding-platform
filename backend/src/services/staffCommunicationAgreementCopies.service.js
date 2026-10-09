import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import pool from '../config/database.js';
import { decryptChatText } from './chatEncryption.service.js';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const notFound = () => Object.assign(new Error('Signed agreement not found.'), { status: 404 });

function readSnapshot(row) {
  const details = parse(row.details);
  const signed = JSON.parse(decryptChatText(details.envelope));
  const hash = createHash('sha256').update(JSON.stringify(signed.disclosure)).digest('hex');
  if (signed.disclosureHash !== hash) throw Object.assign(new Error('The signed copy could not be verified.'), { status: 503 });
  return { reference: details.reference, agencyId: details.agencyId, ...signed };
}
export async function listMyCommunicationAgreements(userId) {
  const [rows] = await pool.execute(`SELECT details FROM security_evidence
    WHERE user_id = ? AND action = 'staff_communication_choices_signed' AND outcome = 'success'
    ORDER BY occurred_at DESC`, [userId]);
  return rows.map(row => {
    const s = readSnapshot(row);
    return { reference:s.reference, agencyId:s.agencyId, brandName:s.disclosure.brandName,
      title:s.disclosure.agreement?.title || 'Personal communication choices',
      signedAt:s.reviewedAt, signerName:s.signerName, version:s.disclosure.version };
  });
}
export async function getMyCommunicationAgreement(userId, reference) {
  if (!/^staff_communications:[0-9a-f-]{36}$/.test(String(reference))) throw notFound();
  // A reference never grants access; always scope the immutable evidence to the authenticated owner.
  const [rows] = await pool.execute(`SELECT details FROM security_evidence
    WHERE user_id = ? AND action = 'staff_communication_choices_signed' AND outcome = 'success'
      AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.reference')) = ? LIMIT 1`, [userId, reference]);
  if (!rows.length) throw notFound();
  return readSnapshot(rows[0]);
}
export async function communicationAgreementPdf(signed) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page, y;
  const safe = value => String(value ?? '').replace(/→/g, ' > ').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\n]/g, '?');
  const addPage = () => { page = pdf.addPage([612,792]); y=744; };
  function paragraph(value, heading=false) {
    const f=heading?bold:font, size=heading?12:10;
    let line='';
    const draw = () => { if(y<54)addPage(); page.drawText(line,{x:48,y,size,font:f});y-=15;line=''; };
    for(const word of safe(value).split(/\s+/)) {
      // Split long identifiers/URLs too, so references cannot overflow the page.
      for(const part of word.match(/.{1,70}/g)||['']) {
        if(f.widthOfTextAtSize(`${line} ${part}`.trim(),size)>516 && line)draw();
        line = `${line} ${part}`.trim();
      }
    }
    if(line)draw();y-=8;
  }
  addPage();
  const d=signed.disclosure;
  paragraph(d.agreement?.title || 'Personal communication choices',true);
  paragraph(`${d.brandName} | ${d.legalName}`);
  paragraph(`Electronically signed by ${signed.signerName} on ${signed.reviewedAt}`);
  paragraph(`Reference: ${signed.reference} | Disclosure version: ${d.version}`);
  paragraph(`Signed disclosure SHA-256: ${signed.disclosureHash}`);
  for(const section of d.agreement?.sections||[]){paragraph(section.title,true);paragraph(section.body);}
  if(d.agreement)paragraph(`Communications Use Agreement acknowledged: ${signed.usageAcknowledged===true?'Yes':'Not included in this earlier signature'}`);
  paragraph('Personal communication choices',true);paragraph(d.text);
  for(const c of d.choices||[]) { paragraph(`${c.label}: ${signed.choices?.[c.key]===true?'Yes':'No'}`,true);paragraph(c.description); }
  for(const c of d.accessRequests||[]) { paragraph(`${c.label}: ${signed.accessRequests?.[c.key]===true?'Yes':'No'}`,true);paragraph(c.description); }
  paragraph(`Kiosk check-in email: ${signed.arrivalEmail===true?'Yes':'No'}; Client Exchange email: ${signed.exchangeEmail===true?'Yes':'No'}`);
  paragraph(`Personal phone at signing: ${signed.phone||'None'}`);
  paragraph(d.future);
  paragraph(`Terms: ${d.termsUrl||'Not published at signing'} | Privacy: ${d.privacyUrl||'Not published at signing'}`);
  for(const p of d.programs||[])paragraph(`Registered program: ${p.brandName} (${p.campaignId}). Terms: ${p.termsUrl}; Privacy: ${p.privacyUrl}`);
  paragraph('This copy preserves the wording and selections at signing. Later preference changes do not alter this record.');
  return Buffer.from(await pdf.save());
}
