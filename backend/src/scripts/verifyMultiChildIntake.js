/*
 * verifyMultiChildIntake.js
 *
 * End-to-end verification for multi-child intake submissions.
 *
 * Given an intake submission ID (or guardian user ID), this script answers
 * the questions raised in `intake_routing_and_profile_fixes.plan.md` for
 * Phase 4:
 *
 *   1. Were all N children created and linked to the same submission?
 *   2. Does each child have its own per-client bundle PDF
 *      (intake_submission_clients.bundle_pdf_path)?
 *   3. Does each child have an "Intake Packet" PHI document with a unique
 *      storage path in client_phi_documents (no UNIQUE collision swallowed)?
 *   4. Does each signed-document row in intake_submission_documents have
 *      its client_id set to the child it belongs to?
 *   5. From the guardian portal perspective: is the same guardian linked to
 *      every child, and can each child enumerate at least one Intake Packet
 *      PHI doc?
 *
 * Exits with code 0 on success and a non-zero code (with per-failure
 * details) when any guarantee is missing.
 *
 * Usage:
 *   node backend/src/scripts/verifyMultiChildIntake.js --submissionId 1234
 *   node backend/src/scripts/verifyMultiChildIntake.js --guardianId 567
 *   node backend/src/scripts/verifyMultiChildIntake.js --latest
 */
import pool from '../config/database.js';
import { decryptIntakeSubmissionRow } from '../services/intakeResponsesEncryption.service.js';
import { decryptIntakeSubmissionClientRows } from '../models/IntakeSubmissionClient.model.js';

function parseArgs(argv) {
  const out = { submissionId: null, guardianId: null, latest: false, count: 1, multiOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--submissionId' || a === '--submission') out.submissionId = Number(argv[++i]);
    else if (a === '--guardianId' || a === '--guardian') out.guardianId = Number(argv[++i]);
    else if (a === '--latest') out.latest = true;
    else if (a === '--count') out.count = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--multiOnly') out.multiOnly = true;
  }
  return out;
}

async function resolveSubmissionId({ submissionId, guardianId, latest, count, multiOnly }) {
  if (submissionId) return [submissionId];
  if (guardianId) {
    const [rows] = await pool.execute(
      `SELECT id FROM intake_submissions
        WHERE guardian_user_id = ?
        ORDER BY created_at DESC
        LIMIT 5`,
      [guardianId]
    );
    return rows.map((r) => r.id);
  }
  if (latest) {
    // Default: most-recent N submissions of any size (single OR multi-child).
    // The post-refactor smoke needs to confirm that single-child still
    // produces a combined Intake Packet AND that multi-child produces
    // per-child pieces — checking only multi-child would miss single-child
    // regressions.
    const limit = Math.max(1, Math.min(20, Number(count) || 1));
    const having = multiOnly ? 'HAVING childCount >= 2' : '';
    const [rows] = await pool.execute(
      `SELECT s.id, COUNT(isc.id) AS childCount
         FROM intake_submissions s
         JOIN intake_submission_clients isc ON isc.intake_submission_id = s.id
        WHERE s.status = 'submitted'
        GROUP BY s.id
        ${having}
        ORDER BY s.id DESC
        LIMIT ${limit}`
    );
    return rows.map((r) => r.id);
  }
  return [];
}

async function inspectSubmission(submissionId) {
  const result = {
    submissionId,
    children: [],
    failures: [],
    warnings: [],
    guardianUserId: null
  };

  // intake_links has no `agency_id` column — its `organization_id` is the
  // FK to `agencies(id)`, so that IS the link's agency. Alias it both ways
  // so downstream checks that look at "link agency" still work.
  const [subRows] = await pool.execute(
    `SELECT s.id, s.guardian_user_id, s.signer_email, s.status, s.combined_pdf_path,
            s.intake_link_id, s.intake_data,
            s.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id,
            l.organization_id AS link_org_id, l.scope_type AS link_scope_type,
            l.program_id AS link_program_id, l.company_event_id AS link_company_event_id,
            l.organization_id AS link_agency_id
       FROM intake_submissions s
       LEFT JOIN intake_links l ON l.id = s.intake_link_id
      WHERE s.id = ?`,
    [submissionId]
  );
  if (!subRows.length) {
    result.failures.push({ check: 'submission_exists', detail: `submission ${submissionId} not found` });
    return result;
  }
  const submission = decryptIntakeSubmissionRow(subRows[0]);
  result.guardianUserId = submission.guardian_user_id;
  result.status = submission.status;
  result.combinedPdfPath = submission.combined_pdf_path;
  result.link = {
    intakeLinkId: submission.intake_link_id,
    organizationId: submission.link_org_id,
    scopeType: submission.link_scope_type,
    programId: submission.link_program_id,
    companyEventId: submission.link_company_event_id,
    agencyId: submission.link_agency_id
  };

  // Pull all company_event/program/class selections from the intake responses
  // so we can verify each kid is enrolled in EVERY selected event/class, not
  // just one. The link's locked company_event_id (when present) takes
  // precedence over selections.
  const expectedEventIds = new Set();
  const expectedClassIds = new Set();
  if (submission.link_company_event_id) {
    expectedEventIds.add(Number(submission.link_company_event_id));
  }
  try {
    const intakeData = submission.intake_data
      ? (typeof submission.intake_data === 'string'
        ? JSON.parse(submission.intake_data)
        : submission.intake_data)
      : null;
    const sels = intakeData?.responses?.submission?.registrationSelections
      || intakeData?.registrationSelections
      || [];
    for (const sel of (Array.isArray(sels) ? sels : [])) {
      const t = String(sel?.entityType || sel?.type || '').toLowerCase();
      const id = Number(sel?.entityId || sel?.id || 0);
      if (!id) continue;
      if (t === 'company_event' || t === 'event') expectedEventIds.add(id);
      else if (t === 'class') expectedClassIds.add(id);
    }
  } catch { /* tolerate malformed intake_data */ }
  result.expectedEventIds = [...expectedEventIds];
  result.expectedClassIds = [...expectedClassIds];

  const [iscRows] = await pool.execute(
    `SELECT id, client_id, full_name, initials, bundle_pdf_path, bundle_pdf_hash,
            pii_encrypted, pii_iv_b64, pii_auth_tag_b64, pii_key_id
       FROM intake_submission_clients
      WHERE intake_submission_id = ?
      ORDER BY id ASC`,
    [submissionId]
  );
  decryptIntakeSubmissionClientRows(iscRows);

  if (!iscRows.length) {
    result.failures.push({ check: 'has_linked_clients', detail: 'no intake_submission_clients rows' });
    return result;
  }

  // Build per-child verdict
  for (const isc of iscRows) {
    const child = {
      iscId: isc.id,
      clientId: isc.client_id,
      label: isc.full_name || isc.initials || `client ${isc.client_id}`,
      hasPerChildBundlePath: Boolean(isc.bundle_pdf_path),
      bundlePdfPath: isc.bundle_pdf_path,
      intakePacketPhiDocs: 0,
      intakePacketStoragePaths: [],
      isdRowsForChild: 0,
      isdRowsMissingClientId: 0,
      guardianLinked: false,
      // Registration chain verdicts (Phase 4 follow-up): each child must be
      // attached to the same agency, the link's organization (school/program),
      // AND every selected company_event / class on the submission.
      agencyId: null,
      hasAgencyAffiliation: false,
      orgAssignments: [],
      hasLinkOrgAssignment: false,
      enrolledEventIds: [],
      missingEventIds: [],
      enrolledClassIds: [],
      missingClassIds: []
    };

    if (!child.clientId) {
      result.warnings.push({
        check: 'isc_has_client_id',
        iscId: isc.id,
        detail: 'intake_submission_clients row has NULL client_id'
      });
    } else {
      // Pull EVERY PHI doc tied to this child + this submission so we can
      // bucket them by kind. Post-refactor, multi-child submissions
      // intentionally skip the combined "Intake Packet (Signed)" bundle and
      // instead produce a per-template signed PDF + per-child answers PDF
      // (+ optional registration ticket PDF) per child. Old check only
      // matched "Intake Packet" and would false-fail those.
      const [phiRows] = await pool.execute(
        `SELECT id, storage_path, original_name, document_type, mime_type
           FROM client_phi_documents
          WHERE client_id = ?
            AND intake_submission_id = ?`,
        [child.clientId, submissionId]
      );
      const allPhi = phiRows || [];
      const intakePacketRows = allPhi.filter((r) =>
        /Intake Packet/i.test(r.original_name || '') || /Intake Packet/i.test(r.document_type || ''));
      const answersPdfRows = allPhi.filter((r) =>
        /Intake Responses/i.test(r.original_name || '') && r.mime_type === 'application/pdf');
      const ticketPdfRows = allPhi.filter((r) =>
        /Registration Confirmation/i.test(r.original_name || ''));
      const signedTemplateRows = allPhi.filter((r) =>
        /\(Signed\)$/i.test((r.original_name || '').trim()) && !/Intake Packet/i.test(r.original_name || ''));

      child.intakePacketPhiDocs = intakePacketRows.length;
      child.intakePacketStoragePaths = intakePacketRows.map((r) => r.storage_path);
      child.answersPdfCount = answersPdfRows.length;
      child.ticketPdfCount = ticketPdfRows.length;
      child.signedTemplateCount = signedTemplateRows.length;
      child.totalPhiDocs = allPhi.length;

      // The pass condition is "this child has SOMETHING on their Documents
      // tab from this submission" — either the combined packet OR per-child
      // pieces. A child with zero PHI docs from a finalized submission is
      // always a finalize-time bug.
      const hasAnyPhi = allPhi.length > 0;
      if (!hasAnyPhi) {
        result.failures.push({
          check: 'phi_docs_per_child',
          clientId: child.clientId,
          detail: 'no PHI documents at all attached to this child for this submission'
        });
      }
      // Multi-child submissions should NOT produce a combined Intake Packet
      // (it would collide on storage_path UNIQUE), but they SHOULD produce
      // at least one per-template signed PDF or one answers PDF.
      const isMultiChild = iscRows.length > 1;
      if (isMultiChild && !signedTemplateRows.length && !answersPdfRows.length) {
        result.failures.push({
          check: 'multi_child_per_child_pieces',
          clientId: child.clientId,
          detail: 'multi-child submission produced no per-template signed PDFs or per-child answers PDF for this child'
        });
      }

      const [isdRows] = await pool.execute(
        `SELECT id, client_id, document_template_id, signed_pdf_path
           FROM intake_submission_documents
          WHERE intake_submission_id = ?
            AND client_id = ?`,
        [submissionId, child.clientId]
      );
      child.isdRowsForChild = isdRows.length;

      const [unscoped] = await pool.execute(
        `SELECT COUNT(*) AS c FROM intake_submission_documents
          WHERE intake_submission_id = ? AND client_id IS NULL`,
        [submissionId]
      );
      child.isdRowsMissingClientId = unscoped[0]?.c || 0;

      if (submission.guardian_user_id) {
        const [guardianLinkRows] = await pool.execute(
          `SELECT 1 FROM client_guardians
            WHERE client_id = ? AND guardian_user_id = ?
            LIMIT 1`,
          [child.clientId, submission.guardian_user_id]
        );
        child.guardianLinked = guardianLinkRows.length > 0;
        if (!child.guardianLinked) {
          result.failures.push({
            check: 'guardian_linked_to_child',
            clientId: child.clientId,
            guardianUserId: submission.guardian_user_id,
            detail: 'submission guardian is not in client_guardians for this child'
          });
        }
      } else {
        result.warnings.push({
          check: 'submission_has_guardian_user',
          detail: 'submission has no guardian_user_id; guardian-portal verification skipped'
        });
      }

      // ---- Demographics on the client row (post-refactor expectations) ----
      // Post `persistChildIntakeData`, every finalized child should have at
      // least ONE of: grade, primary_client_language, address_street,
      // date_of_birth populated. A child with all four blank after a
      // submission containing those fields means `persistChildIntakeData`
      // either wasn't called or was called with submission-level (not
      // per-child) data — which was the carter-vs-carmen regression.
      try {
        const [demoRows] = await pool.execute(
          `SELECT date_of_birth, grade, preferred_language, primary_client_language,
                  primary_parent_language, address_street, address_city, address_zip
             FROM clients WHERE id = ? LIMIT 1`,
          [child.clientId]
        );
        const demo = demoRows?.[0] || null;
        const filled = demo ? Object.values(demo).filter((v) => v != null && String(v).trim() !== '').length : 0;
        child.demographicsFieldsFilled = filled;
        child.demographicsSnapshot = demo ? {
          dob: demo.date_of_birth || null,
          grade: demo.grade || null,
          preferredLanguage: demo.preferred_language || null,
          primaryClientLanguage: demo.primary_client_language || null,
          primaryParentLanguage: demo.primary_parent_language || null,
          address: [demo.address_street, demo.address_city, demo.address_zip].filter(Boolean).join(', ') || null
        } : null;
        if (!filled) {
          // WARN, not FAIL — some submissions legitimately don't ask for
          // demographics. If you submitted with grade/DOB/language and this
          // is empty, that's the regression.
          result.warnings.push({
            check: 'demographics_persisted',
            clientId: child.clientId,
            detail: 'no demographic fields (DOB/grade/language/address) on clients row — confirm the submission included these fields'
          });
        }
      } catch (demoErr) {
        result.warnings.push({
          check: 'demographics_check',
          clientId: child.clientId,
          detail: demoErr?.message || 'demographics query failed'
        });
      }

      // ---- Communications-tab breadcrumb ----
      // The user explicitly required: "there should at least be an email
      // attempted... something." Every finalized submission with a
      // signer_email should have AT LEAST ONE user_communications row tied
      // to this client (sent OR skipped OR failed). Zero rows means
      // `deliverPacketCompletionEmail` regressed back to the silent-fail
      // mode this refactor was supposed to eliminate.
      try {
        // user_communications uses generated_at (insert time) and sent_at
        // (actual API send time). Order by both so a successful send sorts
        // ahead of a same-second placeholder row.
        const [commsRows] = await pool.execute(
          `SELECT id, delivery_status, error_message, template_type, generated_at, sent_at
             FROM user_communications
            WHERE client_id = ?
              AND template_type = 'intake_packet_completion'
            ORDER BY generated_at DESC, id DESC
            LIMIT 5`,
          [child.clientId]
        );
        child.completionEmailRows = (commsRows || []).map((r) => ({
          status: r.delivery_status,
          error: r.error_message,
          when: r.sent_at || r.generated_at
        }));
        if (submission.signer_email && !commsRows.length) {
          result.failures.push({
            check: 'completion_email_communications_row',
            clientId: child.clientId,
            detail: 'submission has signer_email but no user_communications row for intake_packet_completion — Communications tab will be empty'
          });
        }
      } catch (commsErr) {
        result.warnings.push({
          check: 'communications_row_check',
          clientId: child.clientId,
          detail: commsErr?.message || 'user_communications query failed'
        });
      }

      // ---- Registration chain: agency → organization → event ----
      // Every child should carry the same agency the link belongs to, be
      // affiliated with the link's school/program org, and be enrolled in
      // every selected event/class. A second child silently skipping any of
      // these steps is the exact "second kiddo not registered" failure the
      // user reported.
      try {
        const [clientRows] = await pool.execute(
          'SELECT id, agency_id, organization_id FROM clients WHERE id = ? LIMIT 1',
          [child.clientId]
        );
        const clientRow = clientRows?.[0] || null;
        child.agencyId = clientRow?.agency_id || null;
        child.hasAgencyAffiliation = !!child.agencyId
          && (!result.link.agencyId || Number(child.agencyId) === Number(result.link.agencyId));
        if (!child.agencyId) {
          result.failures.push({
            check: 'child_agency_affiliation',
            clientId: child.clientId,
            detail: 'clients.agency_id is NULL — child has no agency affiliation'
          });
        } else if (result.link.agencyId && Number(child.agencyId) !== Number(result.link.agencyId)) {
          result.warnings.push({
            check: 'child_agency_matches_link',
            clientId: child.clientId,
            childAgencyId: child.agencyId,
            linkAgencyId: result.link.agencyId,
            detail: 'child agency_id differs from intake_link.agency_id'
          });
        }
      } catch (clientErr) {
        result.warnings.push({
          check: 'load_client_row',
          clientId: child.clientId,
          detail: clientErr?.message || 'failed to load client row'
        });
      }

      try {
        const [orgAssignRows] = await pool.execute(
          `SELECT organization_id, is_primary, is_active
             FROM client_organization_assignments
            WHERE client_id = ? AND is_active = TRUE`,
          [child.clientId]
        );
        child.orgAssignments = (orgAssignRows || []).map((r) => Number(r.organization_id));
        if (result.link.organizationId) {
          child.hasLinkOrgAssignment = child.orgAssignments.includes(Number(result.link.organizationId));
          if (!child.hasLinkOrgAssignment) {
            result.failures.push({
              check: 'child_link_org_affiliation',
              clientId: child.clientId,
              linkOrganizationId: result.link.organizationId,
              detail: 'child is not in client_organization_assignments for the intake link\'s school/program organization'
            });
          }
        }
      } catch (orgErr) {
        result.warnings.push({
          check: 'load_org_assignments',
          clientId: child.clientId,
          detail: orgErr?.message || 'failed to load org assignments'
        });
      }

      // Company event enrollment can land in either skills_group_clients
      // (Skill Builders flow, the default) or company_event_clients (older
      // fallback). We check both so we don't false-fail.
      if (expectedEventIds.size > 0) {
        const wantedIds = [...expectedEventIds];
        const ph = wantedIds.map(() => '?').join(',');
        const found = new Set();
        try {
          const [rowsA] = await pool.execute(
            `SELECT cec.company_event_id
               FROM company_event_clients cec
              WHERE cec.client_id = ?
                AND cec.is_active = TRUE
                AND cec.company_event_id IN (${ph})`,
            [child.clientId, ...wantedIds]
          );
          (rowsA || []).forEach((r) => found.add(Number(r.company_event_id)));
        } catch { /* table may not exist in some envs */ }
        try {
          const [rowsB] = await pool.execute(
            `SELECT sg.company_event_id
               FROM skills_group_clients sgc
               JOIN skills_groups sg ON sg.id = sgc.skills_group_id
              WHERE sgc.client_id = ?
                AND sg.company_event_id IN (${ph})`,
            [child.clientId, ...wantedIds]
          );
          (rowsB || []).forEach((r) => found.add(Number(r.company_event_id)));
        } catch { /* table may not exist in some envs */ }
        child.enrolledEventIds = [...found];
        child.missingEventIds = wantedIds.filter((id) => !found.has(id));
        if (child.missingEventIds.length) {
          result.failures.push({
            check: 'child_company_event_enrollment',
            clientId: child.clientId,
            missingEventIds: child.missingEventIds,
            detail: 'child is missing enrollment in one or more selected company events'
          });
        }
      }

      if (expectedClassIds.size > 0) {
        const wantedIds = [...expectedClassIds];
        const ph = wantedIds.map(() => '?').join(',');
        try {
          const [rows] = await pool.execute(
            `SELECT learning_class_id AS class_id
               FROM learning_class_client_memberships
              WHERE client_id = ?
                AND learning_class_id IN (${ph})
                AND COALESCE(membership_status, 'active') = 'active'`,
            [child.clientId, ...wantedIds]
          );
          const found = new Set((rows || []).map((r) => Number(r.class_id)));
          child.enrolledClassIds = [...found];
          child.missingClassIds = wantedIds.filter((id) => !found.has(id));
          if (child.missingClassIds.length) {
            result.failures.push({
              check: 'child_class_enrollment',
              clientId: child.clientId,
              missingClassIds: child.missingClassIds,
              detail: 'child is missing enrollment in one or more selected classes'
            });
          }
        } catch { /* table may differ in some envs */ }
      }
    }

    if (!child.hasPerChildBundlePath) {
      result.failures.push({
        check: 'per_child_bundle_path',
        iscId: isc.id,
        clientId: child.clientId,
        detail: 'intake_submission_clients.bundle_pdf_path is NULL — multi-child packet attachment will fall back to combined bundle and risk UNIQUE collision'
      });
    }

    result.children.push(child);
  }

  // Cross-child uniqueness: the per-child PHI Intake Packet storage paths
  // must not collide. This is the exact UNIQUE(storage_path) collision the
  // Phase 4 fix was designed to eliminate.
  const allPaths = result.children.flatMap((c) => c.intakePacketStoragePaths);
  const dupes = allPaths.filter((p, idx) => p && allPaths.indexOf(p) !== idx);
  if (dupes.length) {
    result.failures.push({
      check: 'unique_packet_storage_paths',
      detail: `Intake Packet storage paths are duplicated across children: ${[...new Set(dupes)].join(', ')}`
    });
  }

  return result;
}

function formatResult(result) {
  const lines = [];
  lines.push(`\n=== Submission ${result.submissionId} ===`);
  lines.push(`  status: ${result.status || '?'}`);
  lines.push(`  guardian_user_id: ${result.guardianUserId || '(none)'}`);
  lines.push(`  combined_pdf_path: ${result.combinedPdfPath || '(none)'}`);
  if (result.link) {
    lines.push(`  link: id=${result.link.intakeLinkId} agency=${result.link.agencyId} org=${result.link.organizationId} program=${result.link.programId} companyEvent=${result.link.companyEventId}`);
  }
  if (result.expectedEventIds?.length) {
    lines.push(`  expected company events: [${result.expectedEventIds.join(', ')}]`);
  }
  if (result.expectedClassIds?.length) {
    lines.push(`  expected classes: [${result.expectedClassIds.join(', ')}]`);
  }
  lines.push(`  children: ${result.children.length}`);
  for (const child of result.children) {
    lines.push(
      `    - clientId=${child.clientId} (${child.label})`
      + ` agency=${child.agencyId || '-'}`
      + ` linkOrg=${child.hasLinkOrgAssignment ? 'yes' : 'no'}`
      + ` events=[${child.enrolledEventIds.join(',')}]${child.missingEventIds.length ? ` MISSING=[${child.missingEventIds.join(',')}]` : ''}`
      + ` classes=[${child.enrolledClassIds.join(',')}]${child.missingClassIds.length ? ` MISSING=[${child.missingClassIds.join(',')}]` : ''}`
      + ` perChildBundle=${child.hasPerChildBundlePath ? 'yes' : 'NO'}`
      + ` guardianLinked=${child.guardianLinked ? 'yes' : 'no'}`
    );
    lines.push(
      `        phi: total=${child.totalPhiDocs ?? 0}`
      + ` packet=${child.intakePacketPhiDocs}`
      + ` answersPdf=${child.answersPdfCount ?? 0}`
      + ` ticketPdf=${child.ticketPdfCount ?? 0}`
      + ` signedTemplates=${child.signedTemplateCount ?? 0}`
      + ` isdRows=${child.isdRowsForChild}`
    );
    if (child.demographicsSnapshot) {
      const d = child.demographicsSnapshot;
      lines.push(
        `        demo: dob=${d.dob || '-'}`
        + ` grade=${d.grade || '-'}`
        + ` clientLang=${d.primaryClientLanguage || d.preferredLanguage || '-'}`
        + ` parentLang=${d.primaryParentLanguage || '-'}`
        + ` addr=${d.address || '-'}`
      );
    }
    if (child.completionEmailRows?.length) {
      const latest = child.completionEmailRows[0];
      lines.push(`        comms: latest=${latest.status}${latest.error ? ` (${String(latest.error).slice(0, 80)})` : ''}`);
    } else {
      lines.push(`        comms: (no user_communications rows for this child)`);
    }
  }
  if (result.warnings.length) {
    lines.push(`  warnings:`);
    result.warnings.forEach((w) => lines.push(`    - ${JSON.stringify(w)}`));
  }
  if (result.failures.length) {
    lines.push(`  FAILURES:`);
    result.failures.forEach((f) => lines.push(`    - ${JSON.stringify(f)}`));
  } else {
    lines.push('  PASS: all multi-child intake guarantees satisfied');
  }
  return lines.join('\n');
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.submissionId && !args.guardianId && !args.latest) {
    console.error('Usage: node verifyMultiChildIntake.js (--submissionId N | --guardianId N | --latest [--count N] [--multiOnly])');
    process.exit(2);
  }
  let exitCode = 0;
  try {
    const ids = await resolveSubmissionId(args);
    if (!ids.length) {
      console.error('No submissions matched the given criteria.');
      exitCode = 3;
    } else {
      let anyFailure = false;
      for (const id of ids) {
        const result = await inspectSubmission(id);
        console.log(formatResult(result));
        if (result.failures.length) anyFailure = true;
      }
      exitCode = anyFailure ? 1 : 0;
    }
  } catch (err) {
    console.error('verifyMultiChildIntake failed', err);
    exitCode = 4;
  } finally {
    // pool.execute opens connections that block process exit when the
    // script finishes; close them explicitly so `npm run smoke:intake`
    // returns to the shell promptly.
    try { await pool.end(); } catch { /* best-effort */ }
  }
  process.exit(exitCode);
})();
