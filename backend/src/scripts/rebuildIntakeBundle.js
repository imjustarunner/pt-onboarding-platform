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
import IntakeSubmissionClient from '../models/IntakeSubmissionClient.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import Client from '../models/Client.model.js';
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
  console.log(`  ✓ wrote bundle to ${bundleResult.relativePath} (sha=${bundleHash})`);

  await ensurePerClientArtifacts({
    submissionId: SUB_ID,
    submission: sub,
    combinedBundlePath: bundleResult.relativePath,
    combinedBundleBuffer: mergedPdf,
    combinedBundleHash: bundleHash
  });

  await pool.end();
}

/**
 * For every child on the submission, make sure they have:
 *   1. intake_submission_clients.bundle_pdf_path set (per-child packet PDF).
 *   2. A client_phi_documents row of type 'Intake Packet' pointing at that
 *      bundle so it appears in the client's file.
 * For single-child submissions we reuse the combined bundle for both. For
 * multi-child submissions we recreate the per-client packet from the docs
 * the script can find (intake_submission_documents filtered by client_id,
 * falling back to the full set).
 */
async function ensurePerClientArtifacts({ submissionId, submission, combinedBundlePath, combinedBundleBuffer, combinedBundleHash }) {
  const [iscRows] = await pool.execute(
    `SELECT id, client_id, bundle_pdf_path, bundle_pdf_hash
       FROM intake_submission_clients
      WHERE intake_submission_id = ?
      ORDER BY id ASC`,
    [submissionId]
  );

  // Single-client submissions: the canonical row is intake_submissions.client_id.
  // Some legacy school-ROI flows never wrote an intake_submission_clients row;
  // fall back to the submission's client_id so we still backfill the PHI doc.
  let virtualSingleChild = null;
  if (!iscRows.length && submission?.client_id) {
    virtualSingleChild = { id: null, client_id: submission.client_id, bundle_pdf_path: null };
  }
  const targets = iscRows.length ? iscRows : (virtualSingleChild ? [virtualSingleChild] : []);
  if (!targets.length) {
    console.log('No per-client targets to backfill (no intake_submission_clients rows and no submission.client_id).');
    return;
  }

  const isMulti = targets.length > 1;
  console.log(`Backfilling per-client artifacts (${targets.length} child${targets.length === 1 ? '' : 'ren'}, ${isMulti ? 'multi' : 'single'}-child)...`);

  for (const target of targets) {
    const clientId = target.client_id;
    if (!clientId) {
      console.log('  - (skipping unbound child row)');
      continue;
    }

    let perClientPath = target.bundle_pdf_path || null;
    let perClientHash = target.bundle_pdf_hash || null;

    if (!perClientPath) {
      if (!isMulti) {
        // Single-child: per-client bundle == combined bundle.
        perClientPath = combinedBundlePath;
        perClientHash = combinedBundleHash;
      } else {
        // Multi-child: try to find PDFs filtered to this child.
        const [childDocs] = await pool.execute(
          `SELECT id, signed_pdf_path
             FROM intake_submission_documents
            WHERE intake_submission_id = ?
              AND signed_pdf_path IS NOT NULL
              AND client_id = ?
            ORDER BY id ASC`,
          [submissionId, clientId]
        );
        const childPaths = childDocs.map((d) => d.signed_pdf_path).filter(Boolean);
        if (!childPaths.length) {
          console.log(`  - client ${clientId}: no per-child signed docs found, skipping per-client bundle`);
          continue;
        }
        const childBuffers = [];
        for (const p of childPaths) {
          childBuffers.push(await StorageService.readIntakeSignedDocument(p));
        }
        const { PDFDocument } = await import('pdf-lib');
        const merged = await PDFDocument.create();
        for (const buf of childBuffers) {
          const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
          const pages = await merged.copyPages(doc, doc.getPageIndices());
          pages.forEach((p) => merged.addPage(p));
        }
        const mergedClientPdf = Buffer.from(await merged.save());
        perClientHash = DocumentSigningService.calculatePDFHash(mergedClientPdf);
        const result = await StorageService.saveIntakeClientBundle({
          submissionId,
          clientId,
          fileBuffer: mergedClientPdf,
          filename: `intake-client-${clientId}.pdf`
        });
        perClientPath = result.relativePath;
      }

      if (target.id) {
        await IntakeSubmissionClient.updateById(target.id, {
          bundle_pdf_path: perClientPath,
          bundle_pdf_hash: perClientHash
        });
      }
      console.log(`  ✓ client ${clientId}: per-child bundle = ${perClientPath}`);
    } else {
      console.log(`  - client ${clientId}: per-child bundle already set (${perClientPath})`);
    }

    // Now ensure the "Intake Packet" PHI document row exists for this client
    // pointing at the per-client bundle.
    const [existing] = await pool.execute(
      `SELECT id FROM client_phi_documents
        WHERE client_id = ?
          AND intake_submission_id = ?
          AND (document_type = 'Intake Packet' OR original_name LIKE 'Intake Packet%')
        LIMIT 1`,
      [clientId, submissionId]
    );
    if (existing.length) {
      console.log(`  - client ${clientId}: Intake Packet PHI doc already exists (id=${existing[0].id})`);
      continue;
    }

    let clientRow = null;
    try {
      clientRow = await Client.findById(clientId, { includeSensitive: true });
    } catch { /* best effort */ }
    const agencyId = clientRow?.agency_id || null;
    const orgId = clientRow?.organization_id || clientRow?.school_organization_id || agencyId || null;

    try {
      const phiDoc = await ClientPhiDocument.create({
        clientId,
        agencyId,
        schoolOrganizationId: orgId,
        intakeSubmissionId: submissionId,
        storagePath: perClientPath,
        originalName: 'Intake Packet (Signed)',
        documentTitle: 'Intake Packet',
        documentType: 'Intake Packet',
        mimeType: 'application/pdf',
        uploadedByUserId: null,
        scanStatus: 'clean',
        expiresAt: submission?.retention_expires_at || null
      });
      await PhiDocumentAuditLog.create({
        documentId: phiDoc.id,
        clientId,
        action: 'uploaded',
        actorUserId: null,
        actorLabel: 'public_intake_recovery',
        ipAddress: null,
        metadata: { submissionId, kind: 'intake_packet', source: 'rebuildIntakeBundle' }
      });
      console.log(`  ✓ client ${clientId}: created Intake Packet PHI doc (id=${phiDoc.id})`);
    } catch (e) {
      const dup = e?.code === 'ER_DUP_ENTRY' || /duplicate/i.test(e?.message || '');
      console.error(`  ✗ client ${clientId}: failed to create Intake Packet PHI doc${dup ? ' (duplicate storage_path)' : ''}: ${e?.message || e}`);
    }
  }
}

main().catch(async (err) => {
  console.error('rebuildIntakeBundle failed:', err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
