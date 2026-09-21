import { applyDocumentAnnotations } from '../utils/pdfDocumentAnnotations.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { randomUUID, createHash } from 'node:crypto';
import pool from '../config/database.js';
import StorageService from './storage.service.js';

export async function buildSignedReceipt({ title, body, signerName, signatureData, source = null, sourceName = 'original-document', documentAnnotations = [], signedAt = new Date().toISOString() }) {
  if (!/^data:image\/(png|jpeg);base64,/.test(String(signatureData || ''))) {
    throw Object.assign(new Error('Capture a valid signature before submitting.'), { status: 400 });
  }
  const pdf = source && Buffer.from(source).subarray(0, 4).toString() === '%PDF'
    ? await PDFDocument.load(source) : await PDFDocument.create();
  if (source && Buffer.from(source).subarray(0, 4).toString() !== '%PDF') {
    await pdf.attach(source, sourceName, { description: 'Original document acknowledged by the signer' });
  }
  await applyDocumentAnnotations(pdf, documentAnnotations, signatureData);
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

export async function savePrehireSignedReceipt({ userId, agencyId, itemKey, title, docType, body, signerName, signatureData, sourcePath = null, sourceName = null, source = null, documentAnnotations = [] }) {
  source = sourcePath ? await StorageService.readObject(sourcePath) : source;
  const pdf = await buildSignedReceipt({ title, body, signerName, signatureData, source, documentAnnotations, sourceName: sourceName || 'original-document' });
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


// Receipt-only documents retain the original file and an audit receipt, without a signature.
export async function buildDocumentReceipt({ title, recipientName, userId, source, sourceName, acknowledgedAt }) {
  const pdf = await PDFDocument.create();
  const digest = createHash('sha256').update(source).digest('hex');
  await pdf.attach(source, sourceName || 'original-document', { description: 'Original document received' });
  const text = `${title}\nReceipt acknowledged by ${recipientName} (user ${userId})\nAcknowledged at ${acknowledgedAt}\nDocument SHA-256: ${digest}\nAcknowledgment of receipt only; no signature was requested.`;
  await pdf.attach(Buffer.from(text, 'utf8'), 'receipt.txt', { mimeType: 'text/plain' });
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let y = 740;
  for (const line of text.normalize('NFKD').replace(/[^\x20-\x7e\n]/g, '-').split('\n').flatMap(s => s.match(/.{1,85}/g) || [''])) {
    page.drawText(line, { x: 42, y, size: 10, font }); y -= 16;
  }
  return Buffer.from(await pdf.save());
}

export async function savePrehireDocumentReceipt({ userId, agencyId, doc, recipientName }) {
  const source = await StorageService.readObject(doc.filePath);
  const acknowledgedAt = new Date().toISOString();
  const itemKey = `prehire_doc_${doc.id}`.slice(0, 120);
  const receipt = await buildDocumentReceipt({ title: doc.title, recipientName, userId, source, sourceName: doc.fileName, acknowledgedAt });
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[user]] = await db.execute('SELECT status FROM users WHERE id = ? FOR UPDATE', [userId]);
    const [[journey]] = await db.execute('SELECT prehire_completed_at FROM hire_journeys WHERE user_id = ?', [userId]);
    if (!['PROSPECTIVE', 'PENDING_SETUP', 'PREHIRE_OPEN'].includes(user?.status) || journey?.prehire_completed_at) {
      throw Object.assign(new Error('Your pre-hire submissions are closed. Contact People Operations for corrections.'), { status: 409 });
    }
    const [[existing]] = await db.execute('SELECT completed_on FROM hiring_prehire_checklist_items WHERE user_id = ? AND agency_id = ? AND item_key = ?', [userId, agencyId, itemKey]);
    if (!existing?.completed_on) {
      for (const [bytes, name, mime, title] of [
        [source, doc.fileName || 'document.pdf', doc.mimeType || 'application/pdf', doc.title],
        [receipt, 'receipt.pdf', 'application/pdf', `${doc.title} — receipt acknowledged`]
      ]) {
        const saved = await StorageService.saveAdminDoc(bytes, `prehire-receipt-${userId}-${randomUUID()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`, mime);
        await db.execute(`INSERT INTO user_admin_docs (user_id, title, doc_type, note_text, storage_path, original_name, mime_type, created_by_user_id, is_legal_hold)
          VALUES (?, ?, 'prehire_document_receipt', ?, ?, ?, ?, ?, 1)`,
          [userId, String(title).slice(0, 255), `Receipt acknowledged by ${recipientName} at ${acknowledgedAt}. ${itemKey}`, saved.relativePath, name, mime, userId]);
      }
      await db.execute(`INSERT INTO hiring_prehire_checklist_items (user_id, agency_id, item_key, title, instructions, completed_on)
        VALUES (?, ?, ?, ?, ?, CURDATE()) ON DUPLICATE KEY UPDATE completed_on = COALESCE(completed_on, CURDATE())`,
        [userId, agencyId, itemKey, doc.title, `Receipt acknowledged at ${acknowledgedAt}; original file and receipt retained.`]);
    }
    await db.commit();
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
  return { acknowledgedAt, itemKey };
}
