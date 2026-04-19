#!/usr/bin/env node
/**
 * Rebuild the combined "full packet" PDF for an intake submission whose
 * `combined_pdf_path` is missing (because the background bundling step
 * crashed after the per-template signed PDFs were written, etc.).
 *
 * Strategy: find every signed PDF associated with the submission — first
 * via intake_submission_documents (canonical) and then falling back to
 * client_phi_documents — read the PDFs from storage, merge them with
 * pdf-lib, save the bundle alongside the per-template files, and write
 * the new path/hash back onto the submission row.
 *
 * Usage:
 *   node --env-file=.env src/scripts/rebuildIntakeBundle.js --submission=262
 *   node --env-file=.env src/scripts/rebuildIntakeBundle.js --submission=262 --dry-run
 *   node --env-file=.env src/scripts/rebuildIntakeBundle.js --submission=262 --force
 */
import 'dotenv/config';
import pool from '../config/database.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import StorageService from '../services/storage.service.js';
import DocumentSigningService from '../services/documentSigning.service.js';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const FORCE = argv.includes('--force');
const SUB_ID = (() => {
  const a = argv.find((x) => x.startsWith('--submission='));
  if (!a) return null;
  const n = parseInt(a.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

if (!SUB_ID) {
  console.error('Usage: node src/scripts/rebuildIntakeBundle.js --submission=<id> [--dry-run] [--force]');
  process.exit(2);
}

async function listSignedPdfPaths(submissionId) {
  // Prefer intake_submission_documents — that's the source of truth for the
  // per-template packet artifacts the background bundling step would have
  // merged. Fall back to client_phi_documents (which is what staff browse
  // through in the UI) if the canonical table is empty.
  let paths = [];
  try {
    const [docs] = await pool.execute(
      `SELECT id, document_template_id, signed_pdf_path
         FROM intake_submission_documents
        WHERE intake_submission_id = ?
          AND signed_pdf_path IS NOT NULL
        ORDER BY id ASC`,
      [submissionId]
    );
    paths = docs.map((d) => d.signed_pdf_path).filter(Boolean);
  } catch (e) {
    console.warn('intake_submission_documents lookup failed:', e?.message || e);
  }

  if (!paths.length) {
    const [phi] = await pool.execute(
      `SELECT id, storage_path
         FROM client_phi_documents
        WHERE intake_submission_id = ?
          AND storage_path IS NOT NULL
          AND LOWER(COALESCE(mime_type, '')) LIKE 'application/pdf%'
        ORDER BY id ASC`,
      [submissionId]
    );
    paths = phi.map((d) => d.storage_path).filter(Boolean);
  }

  return paths;
}

async function main() {
  const sub = await IntakeSubmission.findById(SUB_ID);
  if (!sub) {
    console.error(`No intake_submissions row id=${SUB_ID}`);
    process.exit(1);
  }
  console.log(`Submission ${sub.id} status=${sub.status} client_id=${sub.client_id} combined_pdf_path=${sub.combined_pdf_path || 'NULL'}`);

  if (sub.combined_pdf_path && !FORCE) {
    console.log('combined_pdf_path already set; pass --force to rebuild anyway.');
    await pool.end();
    return;
  }

  const pdfPaths = await listSignedPdfPaths(SUB_ID);
  console.log(`Found ${pdfPaths.length} signed PDF path(s):`);
  pdfPaths.forEach((p) => console.log('  -', p));
  if (!pdfPaths.length) {
    console.error('No signed PDFs found — cannot rebuild bundle.');
    await pool.end();
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('DRY-RUN: would merge the above into intake-bundle-' + SUB_ID + '.pdf and update intake_submissions.');
    await pool.end();
    return;
  }

  console.log('Downloading source PDFs from storage...');
  const buffers = [];
  for (const p of pdfPaths) {
    const t0 = Date.now();
    const buf = await StorageService.readIntakeSignedDocument(p);
    console.log(`  ✓ ${p} (${buf.length} bytes, ${Date.now() - t0}ms)`);
    buffers.push(buf);
  }

  console.log('Merging via pdf-lib...');
  const tMerge = Date.now();
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  const mergedPdf = Buffer.from(await merged.save());
  console.log(`  ✓ merged ${buffers.length} PDFs → ${mergedPdf.length} bytes (${Date.now() - tMerge}ms)`);

  const bundleHash = DocumentSigningService.calculatePDFHash(mergedPdf);
  console.log(`Uploading bundle to storage (sha=${bundleHash.slice(0, 12)}… size=${mergedPdf.length}B)...`);
  const tUp = Date.now();
  const bundleResult = await StorageService.saveIntakeBundle({
    submissionId: SUB_ID,
    fileBuffer: mergedPdf,
    filename: `intake-bundle-${SUB_ID}.pdf`
  });
  console.log(`  ✓ uploaded → ${bundleResult.relativePath} (${Date.now() - tUp}ms)`);

  console.log('Updating intake_submissions.combined_pdf_path...');
  await IntakeSubmission.updateById(SUB_ID, {
    combined_pdf_path: bundleResult.relativePath,
    combined_pdf_hash: bundleHash
  });

  console.log(`OK — wrote bundle to ${bundleResult.relativePath} (sha=${bundleHash})`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('rebuildIntakeBundle failed:', err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
