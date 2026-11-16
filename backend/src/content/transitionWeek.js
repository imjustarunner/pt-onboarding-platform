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
export const TRANSITION_PRACTICES = [
  { id: 6, slug: 'nlu', name: 'Next Level Up', focus: 'Provider updates first; Google and TherapyNotes exit, family readiness, texting and ERA handoff.' },
  { id: 2, slug: 'itsco', name: 'ITSCO', focus: 'Lowest weekly session volume first, five providers per group. Google first, then TherapyNotes; keep the subscription active for remaining groups.' },
  { id: 377, slug: 'tisi', name: 'Inner Strength', focus: 'Complete historical records, backups, clinical/billing handoff and independent TherapyNotes closure.' }
];
export const TRANSITION_VIDEO_STATUSES = ['not_started', 'recording', 'editing', 'in_review', 'published', 'blocked'];
const video = (id, title, role, day, minutes, outcome, agencies = [6,2,377]) => ({ id, title, role, dueDate: `2026-11-${day}`, minutes, outcome, agencies });
export const TRANSITION_VIDEOS = [
  video('login', 'Sign in, verification and recovery without Google', 'Technology', '16', 5, 'Demonstrate own-account login, approved verification, recovery and shared-device lock.', [6,2]),
  video('provider_update', 'Complete your provider update and required signatures', 'People Operations / training', '16', 6, 'Open the correct packet, review real amendments, save, return and verify completion.', [6]),
  video('daily_workspace', 'Your daily app workspace and support', 'People Operations / training', '16', 5, 'Find My Schedule, My Work, Tasks, Messages, My Learning and report a useful issue.'),
  video('scheduling', 'Book, reschedule and cancel the correct appointment', 'Clinical', '17', 8, 'Demonstrate occurrence versus series, time zone, rooms, conflicts and notifications.'),
  video('school_schedule', 'School planning and real appointments', 'Clinical', '17', 7, 'Link the school slot to one canonical occurrence and review closures/capacity.', [2]),
  video('telehealth', 'Join telehealth and test the family device', 'Technology', '17', 5, 'Two controlled participants actually join with usable microphone/camera and a fallback.'),
  video('notes_plans', 'Charts, intake, notes and treatment plans', 'Clinical', '17', 10, 'Open the correct linked draft, save/reload, preserve source dates and review goals.'),
  video('sign_supervision', 'Signatures, cosigning and supervision', 'Clinical', '17', 6, 'Explain author/reviewer permissions and separate attendance, time, notes and payroll.'),
  video('family_access', 'Family invitations, welcome and guardian privacy', 'Family support', '17', 7, 'Show separate guardian access, current recipients, welcome templates and assisted alternatives.'),
  video('sms_start', 'Text START before account creation; STOP and HELP', 'Technology', '17', 7, 'Show original phone consent, pending identity review, current authority and suppression.'),
  video('messages', 'Portal messages, email and optional phone relay', 'Technology', '17', 7, 'Review every named audience, distinguish secure portal from email, and show safe reply routing.'),
  video('source_export', 'Export every required TherapyNotes record category', 'Records', '16', 8, 'Include inactive/discharged/unassigned charts and identify categories outside the clinical PDF.'),
  video('archive_import', 'Match charts and upload/download the medical archive', 'Records', '17', 8, 'Preserve chart identity, authorship and dates; verify all volumes, manifests and retries.'),
  video('drive_restore', 'Restricted Drive backup and restore verification', 'Technology', '17', 7, 'Verify approved storage, access, checksums, independent restoration and delta exports.'),
  video('google_handoff', 'App email, calendar ownership and Google retirement', 'Technology', '17', 8, 'Prove mail, recovery and future meetings still work after authorized suspension.', [6,2]),
  video('billing', 'Claims, insurance and balances during cutover', 'Billing', '17', 9, 'Route coverage problems, preserve open claims/copays and prevent duplicate billing.'),
  video('era', 'ERA receiver changes and reconciliation', 'Billing', '17', 8, 'Separate claims, ERA and EFT; verify actual receipt, matching, deposits and monitoring.', [6,377]),
  video('cohorts', 'ITSCO groups of five and monitored acceptance', 'Transition lead', '17', 7, 'Verify session counts, freeze named groups and complete Google/clinical/observation stages.', [2]),
  video('closure', 'Go/no-go, downtime and subscription closure', 'Transition lead', '19', 7, 'Check evidence, name the temporary working system, reconcile and preserve source access.')
];
const videoReady = task('videos_ready', '17', 'Training videos', 'Record, independently review and publish every required training video', 'People Operations / training');
const cohortTasks = [
  task('cohort_ranking', '16', 'ITSCO groups of five', 'Verify the complete ITSCO roster and session counts; freeze named groups of five', 'Transition lead', ['rosters']),
  task('cohort_google', '17', 'ITSCO groups of five', 'Complete the first group’s Google handoff and access retirement', 'Technology', ['cohort_ranking']),
  task('cohort_ehr', '18', 'ITSCO groups of five', 'Accept the first group’s charts, families, schedules and TherapyNotes workflow handoff', 'Clinical', ['cohort_google']),
  task('cohort_observation', '19', 'ITSCO groups of five', 'Complete the first group’s monitored workday and assign first-session support', 'Clinical', ['cohort_ehr']),
  task('retain_access', '20', 'Closure', 'Keep ITSCO TherapyNotes access for remaining providers, archives and billing', 'Transition lead', ['rosters'])
];
export function transitionVideoCatalog(agencyId) {
  return TRANSITION_VIDEOS.filter(item => !agencyId || item.agencies.includes(Number(agencyId)));
}
export function transitionTaskCatalog(agencyId) {
  if (!agencyId) return TRANSITION_TASKS;
  const id = Number(agencyId), skipped = new Set(id === 2 ? ['packet','packet_test','packet_send','packet_complete','era_requests','era_receipt','era_monitor','closure'] : id === 377 ? ['packet','packet_test','packet_send','packet_complete','google_login','google_mail','google_preserve','google_exit'] : []);
  const catalog = TRANSITION_TASKS.filter(t => !skipped.has(t.id)).map(t => ({ ...t, title: t.title.replaceAll('NLU ', ''), requires: t.requires.filter(key => !skipped.has(key)) }));
  const closure = catalog.find(t => t.id === 'closure');
  if (closure) { closure.title = `Obtain ${TRANSITION_PRACTICES.find(p => p.id === id)?.name || 'practice'} sign-offs and TherapyNotes cancellation confirmation/final billing date`; closure.requires.push('videos_ready'); }
  if (id === 377) {
    const routes = catalog.find(t => t.id === 'era_requests');
    if (routes) routes.title = 'Resolve remaining Inner Strength ERA receiver handoffs; preserve already activated routes';
    const schedule = catalog.find(t => t.id === 'schedules');
    if (schedule) schedule.category = 'Scheduling';
  }
  catalog.splice(catalog.findIndex(t => t.id === 'training'), 0, videoReady);
  if (id === 2) catalog.push(...cohortTasks);
  return catalog;
}
export function emptyTransitionVideo() { return { status: 'not_started', owner: '', reviewer: '', dueDate: '', url: '', evidence: '', nextAction: '', completedAt: null, completedByUserId: null }; }
export function emptyTransitionState() {
  return {
    tasks: Object.fromEntries([...TRANSITION_TASKS, videoReady, ...cohortTasks].map(t => [t.id, { status: 'unverified', owner: '', backup: '', evidence: '', nextAction: '' }])),
    metrics: Object.fromEntries(TRANSITION_METRICS.map(id => [id, { total: null, completed: 0, blocked: 0 }])),
    videos: Object.fromEntries(TRANSITION_VIDEOS.map(v => [v.id, { ...emptyTransitionVideo(), dueDate: v.dueDate }])),
    ranking: null, cohorts: {}
  };
}
export function hydrateTransitionState(state) {
  const defaults = emptyTransitionState();
  return { ...defaults, ...state, tasks: { ...defaults.tasks, ...state.tasks }, metrics: { ...defaults.metrics, ...state.metrics }, videos: { ...defaults.videos, ...state.videos } };
}
