#!/usr/bin/env node
/**
 * Rebuild the per-child + combined intake-packet PDFs for one or more
 * submissions, prepending the intake-responses ("answers") PDF before the
 * signed documents so each packet contains every intake answer (PSC-17,
 * clinical questions, demographics, guardian info, registration selections,
 * waivers, insurance, etc.) as a dedicated section ahead of all the signed
 * templates.
 *
 * Behavior:
 * - Multi-child submissions: each child gets a fully isolated per-child
 *   bundle = [answers-for-this-child, ...this-child's-signed-docs]. The
 *   combined bundle is NOT generated and combined_pdf_path is set to NULL —
 *   PHI from sibling children must never coexist in one file.
 * - Single-child submissions: combined bundle == per-child bundle =
 *   [answers, ...signed-docs], pointed at by both combined_pdf_path on the
 *   submission and bundle_pdf_path on the only intake_submission_clients row.
 * - The legacy registration-ticket cover page is NOT regenerated here; it
 *   requires live context (event placeholders, receipt-token issuance, org
 *   resolution) that this offline script does not have. Existing packets
 *   that had a ticket cover lose it during rebuild — that's an acceptable
 *   trade to recover the missing intake-answers pages.
 *
 * Usage:
 *   node --env-file=.env src/scripts/rebuildIntakeBundle.js --submission=262
 *   node --env-file=.env src/scripts/rebuildIntakeBundle.js --submission=262 --dry-run
 *   node --env-file=.env src/scripts/rebuildIntakeBundle.js --submission=262 --force
 *   node --env-file=.env src/scripts/rebuildIntakeBundle.js --all
 *   node --env-file=.env src/scripts/rebuildIntakeBundle.js --all --dry-run
 *   node --env-file=.env src/scripts/rebuildIntakeBundle.js --all --limit=10
 */
import 'dotenv/config';
import pool from '../config/database.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeSubmissionClient from '../models/IntakeSubmissionClient.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import Client from '../models/Client.model.js';
import StorageService from '../services/storage.service.js';
import DocumentSigningService from '../services/documentSigning.service.js';
import { compressPdfBuffer } from '../services/pdfCompression.service.js';
import { buildAnswersPdfBuffer } from '../controllers/publicIntake.controller.js';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const FORCE = argv.includes('--force');
const ALL = argv.includes('--all');
const SUB_ID = (() => {
  const a = argv.find((x) => x.startsWith('--submission='));
  if (!a) return null;
  const n = parseInt(a.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();
const LIMIT = (() => {
  const a = argv.find((x) => x.startsWith('--limit='));
  if (!a) return null;
  const n = parseInt(a.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

if (!SUB_ID && !ALL) {
  console.error('Usage: node src/scripts/rebuildIntakeBundle.js --submission=<id> [--dry-run] [--force]');
  console.error('   or: node src/scripts/rebuildIntakeBundle.js --all [--dry-run] [--limit=N]');
  process.exit(2);
}

async function listSignedPdfPathsForSubmission(submissionId) {
  // Source-of-truth for per-template signed PDFs is intake_submission_documents.
  // client_phi_documents only enters as a fallback for older rows that didn't
  // populate intake_submission_documents.signed_pdf_path. Returns rows with
  // both the signed path AND the client_id so callers can group per child.
  let rows = [];
  try {
    const [docs] = await pool.execute(
      `SELECT id, document_template_id, signed_pdf_path, client_id
         FROM intake_submission_documents
        WHERE intake_submission_id = ?
          AND signed_pdf_path IS NOT NULL
        ORDER BY id ASC`,
      [submissionId]
    );
    rows = docs.filter((d) => d.signed_pdf_path);
  } catch (e) {
    console.warn('intake_submission_documents lookup failed:', e?.message || e);
  }

  if (!rows.length) {
    const [phi] = await pool.execute(
      `SELECT id, storage_path AS signed_pdf_path, client_id
         FROM client_phi_documents
        WHERE intake_submission_id = ?
          AND storage_path IS NOT NULL
          AND LOWER(COALESCE(mime_type, '')) LIKE 'application/pdf%'
        ORDER BY id ASC`,
      [submissionId]
    );
    rows = phi.filter((d) => d.signed_pdf_path);
  }

  return rows;
}

async function loadAllSubmittedSubmissionIds({ limit }) {
  const [rows] = await pool.execute(
    `SELECT id FROM intake_submissions
      WHERE LOWER(COALESCE(status, '')) = 'submitted'
      ORDER BY id ASC${limit ? ` LIMIT ${limit}` : ''}`
  );
  return rows.map((r) => r.id);
}

async function mergeBuffersToPdf(buffers) {
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    if (!buf) continue;
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return Buffer.from(await merged.save());
}

async function rebuildOneSubmission(submissionId) {
  const sub = await IntakeSubmission.findById(submissionId);
  if (!sub) {
    console.error(`[skip] no intake_submissions row id=${submissionId}`);
    return { submissionId, status: 'missing' };
  }

  const status = String(sub.status || '').toLowerCase();
  if (status !== 'submitted') {
    console.log(`[skip] submission ${submissionId} status=${status} (not 'submitted')`);
    return { submissionId, status: 'not-submitted' };
  }

  const link = sub.intake_link_id ? await IntakeLink.findById(sub.intake_link_id) : null;
  if (!link) {
    console.warn(`[skip] submission ${submissionId} has no resolvable intake_link (link_id=${sub.intake_link_id}); answers PDF cannot be built without field index`);
    return { submissionId, status: 'no-link' };
  }

  // intake_data is decrypted automatically by IntakeSubmission.findById when the
  // INTAKE_RESPONSES_ENCRYPTION_KEY env is configured. If decryption silently
  // failed this row will be unreadable — surface that explicitly.
  let intakeData = null;
  if (sub.intake_data) {
    try {
      intakeData = typeof sub.intake_data === 'string' ? JSON.parse(sub.intake_data) : sub.intake_data;
    } catch (e) {
      console.warn(`[warn] submission ${submissionId} intake_data is not valid JSON; answers PDF will be empty (${e?.message || e})`);
      intakeData = null;
    }
  }

  const docRows = await listSignedPdfPathsForSubmission(submissionId);
  if (!docRows.length) {
    console.warn(`[skip] submission ${submissionId} has no signed PDFs to merge`);
    return { submissionId, status: 'no-signed-pdfs' };
  }

  // Group signed PDFs by client_id. The same template signed by guardian once
  // for all children may show up under each child's row in
  // intake_submission_documents (per-child copies) or under one shared
  // client_id. We treat anything without a client_id as "submission-wide."
  const perClientPaths = new Map();
  const submissionWidePaths = [];
  for (const r of docRows) {
    if (r.client_id) {
      if (!perClientPaths.has(r.client_id)) perClientPaths.set(r.client_id, []);
      perClientPaths.get(r.client_id).push(r.signed_pdf_path);
    } else {
      submissionWidePaths.push(r.signed_pdf_path);
    }
  }

  // Resolve the intake_submission_clients rows once so we know the canonical
  // per-child ordering and can write back bundle_pdf_path / hash later.
  const clientRows = await IntakeSubmissionClient.listBySubmissionId(submissionId);
  // Single-child fallback (legacy school-ROI flow may not have created an
  // intake_submission_clients row): synthesize a virtual entry from the
  // submission's client_id so we still produce a bundle for that child.
  const targets = clientRows.length
    ? clientRows
    : (sub.client_id ? [{ id: null, client_id: sub.client_id, bundle_pdf_path: null }] : []);
  if (!targets.length) {
    console.warn(`[skip] submission ${submissionId} has no targetable client rows`);
    return { submissionId, status: 'no-clients' };
  }

  const isMulti = targets.length > 1;
  console.log(`[submission ${submissionId}] status=${status} clients=${targets.length} (${isMulti ? 'multi' : 'single'}-child) signedDocs=${docRows.length} combined_pdf_path=${sub.combined_pdf_path || 'NULL'}`);

  if (sub.combined_pdf_path && !FORCE) {
    console.log(`  combined bundle already set; skipping (pass --force to rebuild anyway)`);
    return { submissionId, status: 'already-bundled', skipped: true };
  }

  const perClientBundleResults = [];
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const clientId = target.client_id;
    if (!clientId) {
      console.log(`  [client #${i}] no client_id — skipping`);
      continue;
    }

    // Pick paths for this child:
    // - Single-child: include BOTH explicit per-client docs AND submission-
    //   wide docs (older rows often leave client_id NULL on the template
    //   document row, so an explicit+wide union recovers the full packet).
    // - Multi-child: include ONLY the explicit per-client docs. Submission-
    //   wide documents would otherwise get duplicated across every child's
    //   packet, and for shared-signature templates we'd rather lose a page
    //   here than leak one child's signed copy into another child's bundle.
    const explicitChildPaths = perClientPaths.get(clientId) || [];
    const childPaths = isMulti
      ? explicitChildPaths
      : Array.from(new Set([...explicitChildPaths, ...submissionWidePaths]));
    if (!childPaths.length) {
      console.log(`  [client ${clientId}] no signed PDFs found — skipping per-child bundle`);
      continue;
    }

    let perChildAnswersPdf = null;
    try {
      perChildAnswersPdf = await buildAnswersPdfBuffer({ link, intakeData, clientIndex: i });
    } catch (e) {
      console.warn(`  [client ${clientId}] answers PDF build failed: ${e?.message || e}`);
      perChildAnswersPdf = null;
    }
    if (!perChildAnswersPdf) {
      console.warn(`  [client ${clientId}] answers PDF returned empty — bundle will only contain signed docs`);
    }

    const childPdfBuffers = [];
    if (perChildAnswersPdf) childPdfBuffers.push(perChildAnswersPdf);
    for (const p of childPaths) {
      try {
        childPdfBuffers.push(await StorageService.readIntakeSignedDocument(p));
      } catch (e) {
        console.warn(`  [client ${clientId}] failed to read ${p}: ${e?.message || e}`);
      }
    }

    if (childPdfBuffers.length === 0) {
      console.warn(`  [client ${clientId}] no buffers to merge — skipping`);
      continue;
    }

    const mergedClientPdfRaw = await mergeBuffersToPdf(childPdfBuffers);
    // Compress the rebuilt bundle the same way the live finalize path does,
    // so rebuilt packets are the same size as freshly-finalized ones.
    const { buffer: mergedClientPdf, compressed, originalSize, compressedSize } = await compressPdfBuffer(
      Buffer.isBuffer(mergedClientPdfRaw) ? mergedClientPdfRaw : Buffer.from(mergedClientPdfRaw),
      { label: `rebuild-${submissionId}-client-${clientId}` }
    );
    const mergedHash = DocumentSigningService.calculatePDFHash(mergedClientPdf);
    const sizeNote = compressed
      ? `${originalSize}B → ${compressedSize}B compressed`
      : `${mergedClientPdf.length} bytes (uncompressed)`;
    console.log(`  [client ${clientId}] merged ${childPdfBuffers.length} PDFs → ${sizeNote}${perChildAnswersPdf ? ' (with answers prefix)' : ''}`);

    if (DRY_RUN) {
      perClientBundleResults.push({ clientId, dryRun: true, size: mergedClientPdf.length });
      continue;
    }

    const result = await StorageService.saveIntakeClientBundle({
      submissionId,
      clientId,
      fileBuffer: mergedClientPdf,
      filename: `intake-client-${clientId}.pdf`
    });

    if (target.id) {
      await IntakeSubmissionClient.updateById(target.id, {
        bundle_pdf_path: result.relativePath,
        bundle_pdf_hash: mergedHash
      });
    }
    perClientBundleResults.push({
      clientId,
      bundlePath: result.relativePath,
      bundleHash: mergedHash,
      buffer: mergedClientPdf
    });
    console.log(`  [client ${clientId}] saved per-child bundle → ${result.relativePath}`);

    // Make sure this child has an "Intake Packet" PHI document pointing at
    // the new bundle so it shows up in their file. If one already exists from
    // an earlier finalize, leave it alone (the storage_path will get rewritten
    // on the next manual upload — out of scope for backfill).
    try {
      const [existing] = await pool.execute(
        `SELECT id FROM client_phi_documents
          WHERE client_id = ?
            AND intake_submission_id = ?
            AND (document_type = 'Intake Packet' OR original_name LIKE 'Intake Packet%')
          LIMIT 1`,
        [clientId, submissionId]
      );
      if (!existing.length) {
        let clientRow = null;
        try {
          clientRow = await Client.findById(clientId, { includeSensitive: true });
        } catch { /* best effort */ }
        const agencyId = clientRow?.agency_id || null;
        const orgId = clientRow?.organization_id || clientRow?.school_organization_id || agencyId || null;
        const phiDoc = await ClientPhiDocument.create({
          clientId,
          agencyId,
          schoolOrganizationId: orgId,
          intakeSubmissionId: submissionId,
          storagePath: result.relativePath,
          originalName: 'Intake Packet (Signed)',
          documentTitle: 'Intake Packet',
          documentType: 'Intake Packet',
          mimeType: 'application/pdf',
          uploadedByUserId: null,
          scanStatus: 'clean',
          expiresAt: sub?.retention_expires_at || null
        });
        await PhiDocumentAuditLog.create({
          documentId: phiDoc.id,
          clientId,
          action: 'uploaded',
          actorUserId: null,
          actorLabel: 'rebuild_intake_bundle',
          ipAddress: null,
          metadata: { submissionId, kind: 'intake_packet', source: 'rebuildIntakeBundle' }
        });
        console.log(`  [client ${clientId}] created Intake Packet PHI doc id=${phiDoc.id}`);
      }
    } catch (e) {
      console.warn(`  [client ${clientId}] PHI doc ensure failed: ${e?.message || e}`);
    }
  }

  if (DRY_RUN) {
    console.log(`  DRY-RUN: would have ${isMulti ? 'set combined_pdf_path=NULL and produced per-child bundles' : 'pointed combined_pdf_path at the per-child bundle'}`);
    return { submissionId, status: 'dry-run', perClient: perClientBundleResults.length };
  }

  if (isMulti) {
    // Multi-child: no combined bundle; null it out so readers fall back to
    // per-child bundles cleanly.
    if (sub.combined_pdf_path) {
      await IntakeSubmission.updateById(submissionId, {
        combined_pdf_path: null,
        combined_pdf_hash: null
      });
      console.log(`  cleared combined_pdf_path (multi-child submissions don't get a combined bundle)`);
    }
  } else {
    // Single-child: combined bundle == per-child bundle. Reuse the only
    // per-child result so the database has consistent paths and there's no
    // duplicate storage write.
    const only = perClientBundleResults[0];
    if (only?.bundlePath) {
      await IntakeSubmission.updateById(submissionId, {
        combined_pdf_path: only.bundlePath,
        combined_pdf_hash: only.bundleHash
      });
      console.log(`  set combined_pdf_path → ${only.bundlePath} (single-child: same as per-child bundle)`);
    } else {
      console.warn(`  single-child but no per-child bundle was produced; combined_pdf_path left as-is`);
    }
  }

  return { submissionId, status: 'rebuilt', perClient: perClientBundleResults.length, isMulti };
}

async function main() {
  let submissionIds = [];
  if (ALL) {
    submissionIds = await loadAllSubmittedSubmissionIds({ limit: LIMIT });
    console.log(`[batch] processing ${submissionIds.length} submitted submission(s)${LIMIT ? ` (limit=${LIMIT})` : ''}${DRY_RUN ? ' (dry-run)' : ''}`);
  } else {
    submissionIds = [SUB_ID];
  }

  const summary = { total: submissionIds.length, rebuilt: 0, skipped: 0, failed: 0, byStatus: {} };
  for (const id of submissionIds) {
    try {
      const r = await rebuildOneSubmission(id);
      summary.byStatus[r.status] = (summary.byStatus[r.status] || 0) + 1;
      if (r.status === 'rebuilt') summary.rebuilt += 1;
      else if (r.skipped) summary.skipped += 1;
    } catch (e) {
      summary.failed += 1;
      console.error(`[error] submission ${id}: ${e?.message || e}`);
      console.error(e?.stack || '');
    }
  }

  console.log('\n[batch summary]', JSON.stringify(summary, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
