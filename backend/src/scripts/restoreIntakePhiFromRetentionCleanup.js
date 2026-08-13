/**
 * Restore client PHI documents deleted by the old 1-day intake retention job.
 * Objects may still exist in GCS soft-delete (7-day window).
 *
 * Dry run (report only):
 *   node backend/src/scripts/restoreIntakePhiFromRetentionCleanup.js
 * Apply for auto-detected gaps + optional explicit submissions:
 *   CONFIRM=1 node backend/src/scripts/restoreIntakePhiFromRetentionCleanup.js
 *   CONFIRM=1 SUBMISSION_IDS=736 node backend/src/scripts/restoreIntakePhiFromRetentionCleanup.js
 */
import pool from '../config/database.js';
import StorageService from '../services/storage.service.js';
import { attachSignedPdfToClient } from '../services/phiDocumentAttachment.service.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import ClientNotes from '../models/ClientNotes.model.js';

const confirm = String(process.env.CONFIRM || '').trim() === '1';
const envSubmissionIds = String(process.env.SUBMISSION_IDS || '')
  .split(/[,\s]+/)
  .map((s) => Number.parseInt(s, 10))
  .filter((n) => Number.isFinite(n) && n > 0);

const templateTitles = {
  38: { title: 'Disclosure Agreement (Signed)', type: 'school' },
  40: { title: 'Informed Consent / School ROI (Signed)', type: 'school' },
  51: { title: 'Policy and Services (Signed)', type: 'school' },
  70: { title: 'HIPAA Privacy Policy (Signed)', type: 'hipaa' }
};

function describeFile(name) {
  const base = name.split('/').pop();
  if (name.includes('/bundle/')) {
    return { title: 'Full School Packet (Signed)', type: 'packet', mime: 'application/pdf', originalName: base };
  }
  if (name.includes('intake-answers') && name.endsWith('.pdf')) {
    return { title: 'Intake Responses', type: 'Intake Responses', mime: 'application/pdf', originalName: base };
  }
  if (name.includes('intake-answers') && name.endsWith('.txt')) {
    return { title: 'Intake Responses', type: 'Intake Responses', mime: 'text/plain', originalName: base };
  }
  if (name.includes('clinical-summary')) {
    return { title: 'Clinical Intake Summary', type: 'Clinical Summary', mime: 'text/plain', originalName: base };
  }
  const m = name.match(/\/(\d+)\/intake-\d+-/);
  if (m) {
    const tid = Number(m[1]);
    const meta = templateTitles[tid] || { title: base, type: 'school' };
    return { title: meta.title, type: meta.type, mime: 'application/pdf', originalName: base, templateId: tid };
  }
  return {
    title: base,
    type: 'school',
    mime: name.endsWith('.txt') ? 'text/plain' : 'application/pdf',
    originalName: base
  };
}

async function findRestoreCandidates() {
  const [rows] = await pool.execute(
    `SELECT s.id AS submission_id, s.client_id, s.submitted_at,
            c.initials, c.identifier_code, c.agency_id, c.organization_id,
            a.slug AS school_slug, a.name AS school_name,
            (SELECT COUNT(*) FROM client_phi_documents p WHERE p.client_id = s.client_id) AS phi_count,
            (SELECT COUNT(*) FROM intake_submission_documents d WHERE d.intake_submission_id = s.id) AS isd_count
     FROM intake_submissions s
     JOIN clients c ON c.id = s.client_id
     LEFT JOIN agencies a ON a.id = c.organization_id
     WHERE s.status = 'submitted'
       AND s.client_id IS NOT NULL
       AND s.submitted_at >= '2026-08-01'
     ORDER BY s.submitted_at`
  );
  const auto = rows.filter((r) => Number(r.phi_count) === 0 && Number(r.isd_count) > 0);
  const merged = new Map();
  for (const r of auto) merged.set(Number(r.submission_id), r);

  for (const r of rows) {
    if (envSubmissionIds.includes(Number(r.submission_id))) {
      merged.set(Number(r.submission_id), r);
    }
  }

  // Deleted submission rows but GCS soft-delete still has artifacts (submissionId:clientId pairs).
  const pairEnv = String(process.env.RESTORE_PAIRS || '').trim();
  if (pairEnv) {
    for (const chunk of pairEnv.split(/[,\s]+/).filter(Boolean)) {
      const [subId, clientId] = chunk.split(':').map((x) => Number.parseInt(x, 10));
      if (!subId || !clientId) continue;
      const [clientRows] = await pool.execute(
        `SELECT c.id AS client_id, c.initials, c.identifier_code, c.agency_id, c.organization_id,
                a.slug AS school_slug, a.name AS school_name
         FROM clients c
         LEFT JOIN agencies a ON a.id = c.organization_id
         WHERE c.id = ?`,
        [clientId]
      );
      const c = clientRows?.[0];
      if (!c) continue;
      merged.set(subId, {
        submission_id: subId,
        client_id: clientId,
        submitted_at: null,
        initials: c.initials,
        identifier_code: c.identifier_code,
        agency_id: c.agency_id,
        organization_id: c.organization_id,
        school_slug: c.school_slug,
        school_name: c.school_name,
        phi_count: 0,
        isd_count: 0
      });
    }
  }

  return [...merged.values()];
}

async function restoreGroup(group, softFiles, bucket) {
  const submissionId = Number(group.submission_id);
  const clientId = Number(group.client_id);
  const label = `${group.initials || '?'} (${group.identifier_code || clientId}) @ ${group.school_slug || group.school_name || 'school'}`;
  const prefix = `intake_signed/${submissionId}/`;

  const byName = new Map();
  for (const f of softFiles.filter((x) => String(x.name || '').startsWith(prefix))) {
    byName.set(f.name, { file: f, soft: true });
  }
  const [live] = await bucket.getFiles({ prefix });
  for (const f of live) {
    if (!byName.has(f.name)) byName.set(f.name, { file: f, soft: false });
  }

  console.log(`\n=== ${label} — submission ${submissionId} — ${byName.size} GCS object(s) ===`);
  if (!byName.size) {
    console.log('  (no GCS objects found — may be past soft-delete window)');
    return { restored: 0, attached: 0, skipped: 0 };
  }

  let restored = 0;
  let attached = 0;
  let skipped = 0;

  for (const [name, rec] of byName) {
    if (rec.soft) {
      const generation = rec.file.metadata?.generation;
      try {
        await bucket.file(name).restore({ generation });
        console.log('  restored GCS', name);
        restored += 1;
      } catch (e) {
        const exists = await StorageService.objectExists(name);
        if (exists) console.log('  already live', name);
        else {
          console.log('  RESTORE FAIL', name, e?.message || e);
          continue;
        }
      }
    }

    const exists = await StorageService.objectExists(name);
    if (!exists) {
      console.log('  missing after restore', name);
      continue;
    }

    const existing = await ClientPhiDocument.findByStoragePath(name);
    if (existing) {
      console.log('  phi row exists', name);
      skipped += 1;
      continue;
    }

    const meta = describeFile(name);
    if (meta.templateId === 40 && Number(rec.file.metadata?.size || 0) < 200000) {
      meta.title = 'Smart School ROI (Signed)';
      meta.type = 'school_roi';
    }

    const result = await attachSignedPdfToClient({
      clientId,
      storagePath: name,
      originalName: meta.originalName,
      documentTitle: meta.title,
      documentType: meta.type,
      mimeType: meta.mime,
      intakeSubmissionId: submissionId,
      agencyIdOverride: Number(group.agency_id),
      schoolOrganizationIdOverride: Number(group.organization_id),
      scanStatus: 'clean',
      auditMetadata: { restoredFromGcsSoftDelete: true, submissionId },
      callerLabel: 'retention_cleanup_restore'
    });
    if (result.ok) {
      console.log('  attached', meta.title, name);
      attached += 1;
    } else {
      console.log('  attach FAIL', result.reason, name);
    }
  }

  if (attached > 0) {
    try {
      await ClientNotes.create(
        {
          client_id: clientId,
          author_id: 501,
          category: 'administrative',
          urgency: 'low',
          is_internal_only: true,
          message:
            'Packet restored from Google Cloud Storage recycle bin (soft-deleted by the old 1-day intake retention job). Signed documents and intake answers were reattached to this profile.'
        },
        { hasAgencyAccess: true, canViewInternalNotes: true }
      );
      console.log('  internal restore note added');
    } catch (e) {
      console.log('  note failed', e?.message || e);
    }
  }

  return { restored, attached, skipped };
}

async function main() {
  const candidates = await findRestoreCandidates();
  console.log(`Found ${candidates.length} submission(s) with signed docs in DB but zero PHI on client.`);
  for (const c of candidates) {
    console.log(
      `  #${c.submission_id} client ${c.client_id} ${c.initials} (${c.identifier_code}) ${c.school_slug} submitted ${c.submitted_at}`
    );
  }

  if (!confirm) {
    console.log('\nDry run only — re-run with CONFIRM=1 to restore from GCS soft-delete and reattach PHI.');
    return;
  }

  const bucket = await StorageService.getGCSBucket();
  const [softFiles] = await bucket.getFiles({ prefix: 'intake_signed/', softDeleted: true });
  console.log(`GCS soft-deleted intake_signed objects: ${softFiles.length}`);

  let totalAttached = 0;
  for (const group of candidates) {
    const r = await restoreGroup(group, softFiles, bucket);
    totalAttached += r.attached;
  }

  console.log(`\nDone. PHI documents attached: ${totalAttached}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
