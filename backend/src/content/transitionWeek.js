export const TRANSITION_WEEK = '2026-11-16';
export const TRANSITION_STATUSES = ['unverified', 'in_progress', 'passed', 'failed', 'deferred'];
export const TRANSITION_ROLES = ['Transition lead', 'People Operations / training', 'Records', 'Family support', 'Technology', 'Clinical', 'Billing'];
// IDs are stable. Evidence and assignments live in the encrypted practice board.
const task = (id, day, category, title, role, requires = []) => ({ id, day, category, title, role, requires });
export const TRANSITION_TASKS = [
  task('owners', '16', 'Coordination', 'Assign each workstream an owner, backup and protected work blocks', 'Transition lead'),
  task('rosters', '16', 'Coordination', 'Confirm active provider roster, source-account chart counts and subscriptions', 'Transition lead'),
  task('packet', '16', 'Provider updates', 'Finalize NLU announcements, handbook, individualized amendments and training links', 'People Operations / training'),
  task('packet_test', '16', 'Provider updates', 'Verify one provider update end to end on phone and desktop', 'People Operations / training', ['packet']),
  task('packet_send', '16', 'Provider updates', 'Send NLU updates through the existing reviewed recipient workflow', 'People Operations / training', ['packet_test']),
  task('packet_complete', '18', 'Provider updates', 'Complete required NLU sections and signatures; assign individual exceptions by noon', 'People Operations / training', ['packet_send']),
  task('source_exports', '16', 'Records', 'Confirm all TherapyNotes export categories and cancellation/retrieval terms', 'Records'),
  task('inventory', '16', 'Records', 'Inventory active, inactive, discharged, unassigned and departed-provider charts', 'Records', ['rosters']),
  task('trial', '16', 'Records', 'Rehearse active, inactive, large, school and multi-guardian chart exports/imports', 'Records', ['source_exports']),
  task('archive', '19', 'Records', 'Match source IDs to existing charts and verify every archive volume and exception', 'Records', ['inventory', 'trial']),
  task('restricted', '19', 'Records', 'Review restricted records, original authorship, minors, retention and legal holds', 'Clinical'),
  task('drive', '19', 'Records', 'Verify BAA, restricted Drive originals/manifests, access and file checksums', 'Technology'),
  task('delta', '20', 'Records', 'Capture and reconcile records changed since the first export', 'Records', ['archive']),
  task('restore', '20', 'Records', 'Independently verify manifests and restore Drive plus database/document backups', 'Records', ['drive', 'delta']),
  task('training', '17', 'Training', 'Deliver the 90-minute provider meeting and supervised practice; track actual results', 'People Operations / training'),
  task('ops_training', '17', 'Training', 'Train records, family-support and billing operators using controlled examples', 'People Operations / training'),
  task('families', '17', 'Families', 'Verify recipient authority, contacts, language and disclosure restrictions', 'Family support'),
  task('family_notice', '17', 'Families', 'Explain dates, app access, next appointment, numbers, support and urgent-contact procedure', 'Family support', ['families']),
  task('family_ready', '19', 'Families', 'Confirm every affected family is ready or has a working assisted alternative', 'Family support', ['family_notice']),
  task('phone_test', '16', 'Texting', 'Verify NLU ownership/campaigns and real delivery on both numbers', 'Technology'),
  task('start_test', '16', 'Texting', 'Test no-account START, later linkage, shared phones, siblings, STOP and HELP', 'Technology', ['phone_test']),
  task('start_review', '19', 'Texting', 'Assign and reconcile the pending phone identity-review queue', 'Family support', ['start_test']),
  task('grasshopper_archive', '17', 'Texting', 'Preserve relevant Grasshopper history, attachments, voicemail and opt-outs', 'Records'),
  task('grasshopper_handoff', '19', 'Texting', 'Assign old-inbox monitoring and end duplicate reminders at the agreed handoff', 'Family support', ['grasshopper_archive', 'phone_test']),
  task('google_login', '17', 'Google', 'Prove login, verification and recovery without Google sign-in or Gmail access', 'Technology'),
  task('google_mail', '17', 'Google', 'Verify app inbox/replies, shared inboxes and school contacts', 'Technology'),
  task('google_preserve', '18', 'Google', 'Preserve email and transfer files, forms, recordings and calendar ownership', 'Technology'),
  task('schedules', '18', 'Google', 'Reconcile future visits, recurrence, rooms, busy time and meeting links', 'Clinical'),
  task('google_exit', '19', 'Google', 'Authorized administrator suspends/archives provider access and retests email/recovery', 'Technology', ['google_login', 'google_mail', 'google_preserve', 'schedules']),
  task('security', '19', 'Acceptance', 'Verify tenant isolation, guardian audiences, private files and revoked access', 'Technology'),
  task('clinical_acceptance', '19', 'Acceptance', 'Verify linked appointment/note, save/reload, plans, supervision and actual device joins', 'Clinical', ['training', 'schedules']),
  task('era_inventory', '16', 'Billing', 'Inventory NLU payer, NPI/TIN, current receiver, destination and open claims', 'Billing'),
  task('era_requests', '17', 'Billing', 'Submit authorized payer-specific receiver changes with dated evidence', 'Billing', ['era_inventory']),
  task('era_receipt', '20', 'Billing', 'Verify actual ERA receipt, agency matching, posting and deposit reconciliation', 'Billing', ['era_requests']),
  task('era_monitor', '20', 'Billing', 'Finish required old/new receiver monitoring or verify independent continued access', 'Billing', ['era_receipt']),
  task('financial_reconcile', '20', 'Billing', 'Reconcile unfinished notes, claims, balances, disputes, refunds and secondary coverage', 'Billing'),
  task('closure', '20', 'Closure', 'Obtain lead sign-offs and authorized cancellation confirmation/final billing date', 'Transition lead', ['restore', 'restricted', 'family_ready', 'google_exit', 'security', 'clinical_acceptance', 'era_monitor', 'financial_reconcile']),
  task('friday_report', '20', 'Coordination', 'Publish denominators, accepted/held providers, blockers, owners and next review dates', 'Transition lead')
];

export const TRANSITION_METRICS = ['provider_updates', 'providers', 'source_charts', 'families', 'payer_routes'];
export function emptyTransitionState() {
  return {
    tasks: Object.fromEntries(TRANSITION_TASKS.map(t => [t.id, { status: 'unverified', owner: '', backup: '', evidence: '', nextAction: '' }])),
    metrics: Object.fromEntries(TRANSITION_METRICS.map(id => [id, { total: null, completed: 0, blocked: 0 }])),
    ranking: null, cohorts: {}
  };
}
