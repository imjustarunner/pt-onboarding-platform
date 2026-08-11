import pool from '../config/database.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import {
  ensureSchoolIntakeReviewTaskList,
  listSchoolIntakeReviewBackfillCandidates,
  maybeCreateSchoolIntakeReviewTask
} from '../services/schoolIntakeReviewTask.service.js';

async function resolveClientIndex(submissionId, clientId) {
  const [rows] = await pool.execute(
    `SELECT client_id FROM intake_submission_clients
     WHERE intake_submission_id = ?
     ORDER BY id ASC`,
    [Number(submissionId)]
  );
  const idx = (rows || []).findIndex((row) => Number(row.client_id) === Number(clientId));
  return idx >= 0 ? idx : 0;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || String(process.env.CONFIRM || '') !== '1';
  const sinceArg = process.argv.find((a) => a.startsWith('--since='));
  const since = sinceArg ? sinceArg.slice('--since='.length) : (process.env.SINCE || '2026-08-06');

  const candidates = await listSchoolIntakeReviewBackfillCandidates({ since });
  console.log(`[schoolIntakeReviewBackfill] candidates since ${since}: ${candidates.length}`);

  if (dryRun) {
    for (const row of candidates) {
      const submission = await IntakeSubmission.findById(row.submission_id);
      const intakeData = submission?.intake_data || submission?.payload || {};
      const { resolveSchoolIntakeInsuranceCategory } = await import('../services/schoolIntakeReviewTask.service.js');
      const insuranceCategory = resolveSchoolIntakeInsuranceCategory({
        client: {
          insurance_type_key: row.insurance_type_key,
          insurance_type_label: row.insurance_type_label
        },
        intakeData
      });
      console.log(
        `  would process client #${row.client_id} submission #${row.submission_id} (${row.school_name}) insurance=${insuranceCategory} submitted ${row.submitted_at}`
      );
    }
    console.log('Dry run — re-run with CONFIRM=1 to create tasks.');
    process.exit(0);
  }

  const list = await ensureSchoolIntakeReviewTaskList({ actorUserId: 501 });
  console.log(`[schoolIntakeReviewBackfill] using task list #${list.id} (${list.name})`);

  let created = 0;
  let skipped = 0;
  for (const row of candidates) {
    const submission = await IntakeSubmission.findById(row.submission_id);
    if (!submission) {
      skipped += 1;
      continue;
    }
    const link = submission.intake_link_id
      ? await IntakeLink.findById(submission.intake_link_id)
      : null;
    if (!link) {
      skipped += 1;
      continue;
    }
    const intakeData = submission.intake_data || submission.payload || {};
    const clientIndex = await resolveClientIndex(row.submission_id, row.client_id);
    const result = await maybeCreateSchoolIntakeReviewTask({
      clientId: row.client_id,
      submissionId: row.submission_id,
      clientIndex,
      link,
      intakeData,
      actorUserId: 501,
      submittedAt: row.submitted_at
    });
    if (result.created) {
      created += 1;
      console.log(`  created task #${result.taskId} for client #${row.client_id} (${row.school_name})`);
    } else {
      skipped += 1;
      console.log(`  skipped client #${row.client_id}: ${result.reason || 'unknown'}`);
    }
  }

  console.log(`[schoolIntakeReviewBackfill] done created=${created} skipped=${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[schoolIntakeReviewBackfill] error:', err?.message || err);
  process.exit(1);
});
