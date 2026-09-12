import { PDFDocument, StandardFonts } from 'pdf-lib';
import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import StorageService from './storage.service.js';

export async function buildSignedReceipt({ title, body, signerName, signatureData, source = null, sourceName = 'original-document', signedAt = new Date().toISOString() }) {
  if (!/^data:image\/(png|jpeg);base64,/.test(String(signatureData || ''))) {
    throw Object.assign(new Error('Capture a valid signature before submitting.'), { status: 400 });
  }
  const pdf = source && Buffer.from(source).subarray(0, 4).toString() === '%PDF'
    ? await PDFDocument.load(source) : await PDFDocument.create();
  if (source && Buffer.from(source).subarray(0, 4).toString() !== '%PDF') {
    await pdf.attach(source, sourceName, { description: 'Original document acknowledged by the signer' });
  }
  const fullText = `${title}\n\n${body}\n\nSigned by ${signerName}\nSigned at ${signedAt}`;
  // Preserve the exact Unicode text as well as a printable receipt.
  await pdf.attach(Buffer.from(fullText, 'utf8'), 'acknowledgment.txt', { mimeType: 'text/plain' });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const printable = fullText.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e\n]/g, '-');
  let page = pdf.addPage([612, 792]);
  let y = 740;
  for (const line of printable.split('\n').flatMap((text) => text.match(/.{1,85}(?:\s|$)|.{1,85}/g) || [''])) {
    if (y < 60) { page = pdf.addPage([612, 792]); y = 740; }
    page.drawText(line.trimEnd(), { x: 42, y, size: 10, font }); y -= 15;
  }
  if (y < 160) { page = pdf.addPage([612, 792]); y = 740; }
  const signature = signatureData.startsWith('data:image/png') ? await pdf.embedPng(signatureData) : await pdf.embedJpg(signatureData);
  const size = signature.scaleToFit(260, 100);
  page.drawImage(signature, { x: 42, y: y - size.height - 15, ...size });
  return Buffer.from(await pdf.save());
}

export async function savePrehireSignedReceipt({ userId, agencyId, itemKey, title, docType, body, signerName, signatureData, sourcePath = null, sourceName = null }) {
  const source = sourcePath ? await StorageService.readObject(sourcePath) : null;
  const pdf = await buildSignedReceipt({ title, body, signerName, signatureData, source, sourceName: sourceName || 'original-document' });
  const fileName = `prehire-signed-${userId}-${randomUUID()}.pdf`;
  const saved = await StorageService.saveAdminDoc(pdf, fileName, 'application/pdf');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    await db.execute(
      `INSERT INTO user_admin_docs (user_id, title, doc_type, note_text, storage_path, original_name, mime_type, created_by_user_id, is_legal_hold)
       VALUES (?, ?, ?, ?, ?, ?, 'application/pdf', ?, 1)`,
      [userId, title, docType, `Signed by ${signerName}. ${itemKey}`, saved.relativePath, fileName, userId]);
    await db.execute(
      `INSERT INTO hiring_prehire_checklist_items (user_id, agency_id, item_key, title, instructions, completed_on)
       VALUES (?, ?, ?, ?, ?, CURDATE()) ON DUPLICATE KEY UPDATE completed_on = COALESCE(completed_on, CURDATE())`,
      [userId, agencyId, itemKey, title, `Signed copy retained: ${fileName}`]);
    await db.commit();
  } catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
}
