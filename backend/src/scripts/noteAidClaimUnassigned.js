/**
 * One-off: assign provider_id = created_by_user_id for unassigned NOTE_AID_MINIMAL clients.
 * Usage: node backend/src/scripts/noteAidClaimUnassigned.js [--agency=ID] [--all]
 */
import {
  backfillNoteAidProviderAssignments
} from '../services/noteAidClientLifecycle.service.js';

async function main() {
  const args = process.argv.slice(2);
  let agencyId = null;
  let onlyMine = false;
  let actorUserId = null;
  for (const a of args) {
    if (a.startsWith('--agency=')) agencyId = Number(a.slice('--agency='.length)) || null;
    if (a === '--all') onlyMine = false;
    if (a.startsWith('--actor=')) actorUserId = Number(a.slice('--actor='.length)) || null;
  }
  const result = await backfillNoteAidProviderAssignments({
    agencyId,
    actorUserId,
    onlyMine
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
