// Source-reviewed readiness, not a record of a practice's completed migration.
export const auricwellTransitionReviewedDate = 'November 10, 2026';

export const auricwellTransitionSteps = [
  { title: 'Choose the provider', detail: 'Use Import Providers first, then keep one provider selected while moving through their active caseload, one client at a time.' },
  { title: 'Resolve the client’s identity', detail: 'Find the existing chart, including school clients. Review a match or explicitly create a new client. Keep the same client ID, school enrollment, guardians and clinical history.' },
  { title: 'Paste and review the chart', detail: 'Use separate boxes for demographics and additional contacts, insurance, intake, and the latest treatment plan. Compare existing values before applying changes; preserve original clinical dates and authorship.' },
  { title: 'Preserve the medical history', detail: 'Export the client’s medical PDF from the previous EHR, attach it to the same chart, then reopen and download it to verify the archive. Historical note extraction is optional.' },
  { title: 'Bring over the week’s agenda', detail: 'Paste the provider’s agenda, confirm the week and timezone, resolve each client, and review proposed appointments, recurrences and conflicts before booking.' },
  { title: 'Reconcile and switch over', detail: 'Check caseload, contacts, coverage, records and future appointments. Link school planning to the booked sessions from the agreed start date, with one appointment per occurrence.' }
];

export const auricwellTransitionReadiness = [
  {
    id: 'providers', title: 'Provider import', status: 'available',
    current: 'Import Providers already exists in the provider directory.',
    remaining: 'Reuse it, then carry the selected provider through the client-by-client transition workspace. Confirm each client’s assignment.'
  },
  {
    id: 'identity', title: 'Existing clients and school records', status: 'partial',
    current: 'The transition workbench searches existing charts, keeps school clients on the same chart, and requires review before creating a new client. Failed and uncertain lookups stop the import.',
    remaining: 'Review identities and demographic conflicts explicitly. Saved records are durable; visit progress labels reset on reload. Stable source-ID mapping remains a later improvement.'
  },
  {
    id: 'contacts', title: 'Demographics and additional contacts', status: 'available',
    current: 'The workbench parses demographics and additional contacts, compares current chart values, and saves only reviewed choices using existing records.',
    remaining: 'Review unrecognized lines and uncertain contact matches manually. Custody, disclosure and guardian access remain separate; importing a contact sends no invitation and does not enable reminders.'
  },
  {
    id: 'insurance', title: 'Insurance paste', status: 'available',
    current: 'The workbench reviews primary/secondary policy and subscriber paste, merging nonempty fields into canonical coverage.',
    remaining: 'Check payer mapping, policy dates and subscriber identity. Coverage stays unverified; importing does not trigger eligibility work or submit claims.'
  },
  {
    id: 'clinical', title: 'Intake and latest treatment plan', status: 'available',
    current: 'Transition mode saves unsigned historical drafts with original date, author and raw source text. Exact retries reuse the imported record; unrelated or finalized intakes are protected.',
    remaining: 'Complete clinical review in the existing chart before approving current care. Source text is limited to 48 KB per pasted intake or plan; larger originals belong in the medical archive.'
  },
  {
    id: 'archive', title: 'Medical PDF storage and download', status: 'available',
    current: 'The workbench accepts client-specific PDFs up to 256 MB/5,000 pages, creates ordered volumes below 25 MB, and uploads them with a page/checksum manifest to the existing protected chart storage.',
    remaining: 'Open/download every volume and verify completeness. A page that alone exceeds the limit needs a smaller source export. The prior-EHR fallback is recorded as pending; historical session extraction is separate.'
  },
  {
    id: 'history', title: 'Separate historical sessions from a PDF', status: 'planned',
    current: 'The separate prototype can review page ranges, but it does not establish imported sessions in the shared clinical record.',
    remaining: 'Defer this until archive storage works. Any later extraction must review client, note boundaries, service date and author; retain source pages and prevent duplicate notes or new claims from historical imports.'
  },
  {
    id: 'agenda', title: 'Paste a weekly agenda', status: 'available',
    current: 'The agenda tool previews explicit client/date/time/service/location/recurrence, checks conflicts, then creates shared appointments after confirmation. Persisted source identity protects retries.',
    remaining: 'Resolve unmatched clients and school slots before confirmation. School sessions require the transition setup; office room reservations continue through existing Office Scheduling.'
  },
  {
    id: 'school', title: 'School schedule and actual appointments', status: 'setup',
    current: 'Explicit school-slot links show canonical dated appointments in the school week. Authorized school time edits move that occurrence; provider recurrence changes appear through the same canonical records.',
    remaining: 'Apply migration 1786, enable provider booking through the existing rollout control, then review the school transition date and links. School edits handle one occurrence; staffing/day templates remain separately reviewed.'
  },
  {
    id: 'cutover', title: 'Provider transition acceptance', status: 'planned',
    current: 'Existing import and scheduling tools provide the foundation; this plan does not certify a completed transition.',
    remaining: 'Record the source EHR, start date, operator, per-step results and unresolved items. Reconcile counts and representative charts, confirm appointment-to-note access, and decide which system owns future scheduling and historical records.'
  }
];

export const auricwellArchiveOptions = [
  { title: 'Store a complete client history', detail: 'Choose a PDF up to 256 MB and 5,000 pages. Files that fit are preserved unchanged; larger files are divided into complete page volumes. Review the client identity before upload.' },
  { title: 'Automatic ordered volumes', detail: 'The app saves volumes below 25 MB with a source-page and checksum manifest. Retrying resumes saved volumes; verify every volume opens and downloads. A single page over the limit needs a smaller export.' },
  { title: 'Temporary fallback: retain the previous EHR', detail: 'If a complete export cannot be stored and verified, keep historical records accessible in TherapyNotes (or the source EHR). Track the client, record location, responsible person and outstanding export; do not mark the archive complete.' }
];

export const auricwellSchoolScheduleRules = [
  'Before the transition date, an untimed school placement can remain planning and consume the existing school capacity without inventing an appointment time.',
  'After transition, a timed client placement must create or link the actual appointment. Planning and its linked appointment consume the school slot once.',
  'Provider recurring changes must update the linked school days and times. School time changes must move that same booked occurrence, with explicit one-visit or future-series scope.',
  'Changing display order alone must not reschedule a client. An untimed placement stays visibly unbooked until the required appointment details are supplied.',
  'Use existing scheduling checks for availability, conflicts, closed days and protected clinical records. Preserve completed visits and individual exceptions.',
  'Test cancellations, weekday moves, multiple visits on one day, multiple schools, concurrent edits and retries. Match by stored identity, not just client name or date.'
];

export const auricwellTransitionAcceptance = [
  'An existing school client keeps the same chart ID; reviewed demographics and contacts improve the record without removing enrollment, guardians or history.',
  'A missing or ambiguous client lookup cannot create a new chart silently. Repeating a partially completed import does not duplicate the client, assignment or completed steps.',
  'Primary/secondary insurance, subscriber information, original intake and plan dates, and pending clinical reviews survive import and are visible in the chart.',
  'A representative large medical file is complete, readable and downloadable, or its explicitly tracked fallback remains open.',
  'The pasted week matches the source agenda, opens the correct client from each appointment, and resumes safely after a partial failure.',
  'Provider and authorized school edits change the same appointment and appear in both views; slot capacity, cancellations and recurring exceptions remain correct.',
  'The transition owner reconciles client and future-visit counts, scheduling ownership, reminder/feed handoff and historical record access before retiring the previous workflow.'
];
