# School district correction, September 29, 2026

Grant Beacon Middle school (organization 425) had `district_name = Denver Public
Schools` while its stable `district_id = 2` already referenced ITSCO's `DPS`
district. The school overview built filter tabs from the literal profile label,
so one real district appeared as two groups.

The Grant Beacon email-routing repair script explicitly supplied `Denver Public
Schools`; migration 1369 also used that label as a fallback. Those repairs came
after migration 1365's district normalization. Grant Beacon has no retained
school onboarding invite, so there is no evidence here of a staff member typing
a new district. The current school onboarding form already uses a dropdown.

Other paths could reproduce the same issue: outreach synchronization on
onboarding submission and bulk school imports wrote district names verbatim.
Outreach entries legitimately use the full district name.

Changes:

- Normalize established aliases at every remaining school-profile writer:
  onboarding (including outreach synchronization), bulk imports, and email
  reconciliation. The agency editor already normalized its writes.
- Use DPS in the Grant Beacon email reconciliation script.
- Validate onboarding district selections on the server before any writes.
  Allow the dropdown choices and an existing custom district; reject arbitrary
  new labels with an instruction to contact the agency.
- Normalize overview responses so legacy aliases cannot create duplicate tabs.
- Migration 1508 repairs known DPS/D11/D12 profile labels without changing
  school identities, affiliations, district IDs, or unrelated district names.

Live verification found migration 1508 successfully applied, Grant Beacon under
DPS with district ID 2 preserved, and no remaining Denver Public Schools or
Colorado Springs School District 11 profile labels. The migration was picked up
by the running migration machinery during this session; no separate manual
record update was necessary.

Validation: six district utility tests and two onboarding service tests pass,
including repeat outreach sync and rejecting invented districts before writes.
JavaScript syntax checks and `git diff --check` pass.

Release packaging uses the exact prior live backend image,
`sha256:0a02c7a821166355cf13003e905e2618768885016e73be073789eac9f0639232`,
plus only the six changed runtime source files and migration 1508. Each changed
source file's committed base was checked against deployed commit
`54a68d52075e2e53186dd5c4acda03545784d16f` and matched. No unrelated workspace
changes are included.

Release completed: Cloud Build `17054446-3a84-4990-9f44-b7282b701911`
produced image
`sha256:513c32f2926b6bd88bc4db9e594de98152be18786f1fedd7630bb782475b3f20`.
Revision `onboarding-backend-district-fix-20260929` passed `/readyz` with
`phase: app` before promotion, then received 100% of live traffic. Cloud Run
reported Ready, ConfigurationsReady, and RoutesReady. Final database assertions
confirmed Grant Beacon is DPS/district 2, migration 1508 succeeded, and the known
duplicate full-name labels are absent.

The default Cloud Build account lacked read permission on the backend image
repository. The successful build used the existing `github-deployer` account;
no IAM permissions were changed. The previous revision remains available for
rollback: `onboarding-backend-g36582838759a1`.
