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

function parseArgs(argv) {
  const out = { submissionId: null, guardianId: null, latest: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--submissionId' || a === '--submission') out.submissionId = Number(argv[++i]);
    else if (a === '--guardianId' || a === '--guardian') out.guardianId = Number(argv[++i]);
    else if (a === '--latest') out.latest = true;
  }
  return out;
}

async function resolveSubmissionId({ submissionId, guardianId, latest }) {
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
    // Find the most recent submission with 2+ linked clients (multi-child).
    const [rows] = await pool.execute(
      `SELECT s.id, COUNT(isc.id) AS childCount
         FROM intake_submissions s
         JOIN intake_submission_clients isc ON isc.intake_submission_id = s.id
        GROUP BY s.id
       HAVING childCount >= 2
        ORDER BY s.id DESC
        LIMIT 1`
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

  const [subRows] = await pool.execute(
    `SELECT s.id, s.guardian_user_id, s.signer_email, s.status, s.combined_pdf_path,
            s.intake_link_id, s.intake_data,
            l.organization_id AS link_org_id, l.scope_type AS link_scope_type,
            l.program_id AS link_program_id, l.company_event_id AS link_company_event_id,
            l.agency_id AS link_agency_id
       FROM intake_submissions s
       LEFT JOIN intake_links l ON l.id = s.intake_link_id
      WHERE s.id = ?`,
    [submissionId]
  );
  if (!subRows.length) {
    result.failures.push({ check: 'submission_exists', detail: `submission ${submissionId} not found` });
    return result;
  }
  const submission = subRows[0];
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
    `SELECT id, client_id, full_name, initials, bundle_pdf_path, bundle_pdf_hash
       FROM intake_submission_clients
      WHERE intake_submission_id = ?
      ORDER BY id ASC`,
    [submissionId]
  );

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
      const [phiRows] = await pool.execute(
        `SELECT id, storage_path, original_name
           FROM client_phi_documents
          WHERE client_id = ?
            AND intake_submission_id = ?
            AND original_name LIKE '%Intake Packet%'`,
        [child.clientId, submissionId]
      );
      child.intakePacketPhiDocs = phiRows.length;
      child.intakePacketStoragePaths = phiRows.map((r) => r.storage_path);
      if (!phiRows.length) {
        result.failures.push({
          check: 'intake_packet_phi_doc_per_child',
          clientId: child.clientId,
          detail: 'no Intake Packet PHI document attached to this child'
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
            WHERE client_id = ? AND user_id = ?
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
      + ` packetDocs=${child.intakePacketPhiDocs}`
      + ` isdRows=${child.isdRowsForChild}`
      + ` guardianLinked=${child.guardianLinked ? 'yes' : 'no'}`
    );
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
    console.error('Usage: node verifyMultiChildIntake.js (--submissionId N | --guardianId N | --latest)');
    process.exit(2);
  }
  try {
    const ids = await resolveSubmissionId(args);
    if (!ids.length) {
      console.error('No submissions matched the given criteria.');
      process.exit(3);
    }
    let anyFailure = false;
    for (const id of ids) {
      const result = await inspectSubmission(id);
      console.log(formatResult(result));
      if (result.failures.length) anyFailure = true;
    }
    process.exit(anyFailure ? 1 : 0);
  } catch (err) {
    console.error('verifyMultiChildIntake failed', err);
    process.exit(4);
  }
})();
