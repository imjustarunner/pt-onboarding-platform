# Local workspace reconciliation

Compared root workspace HEAD `4fe6beaf` with fetched `origin/main` `0ed11f79` on September 28, 2026. This report does not modify, delete or commit those local files.

The root branch has 9 commits not reachable from main and is 59 commits behind main. Content comparison is essential because some changes were independently integrated.

## Root-only commit history

```
4fe6beaf Add staff availability workspace and group public openings by date
f01ba215 Align published provider availability with reserved offices and staff scheduling
d7672acc Add reviewed fax intake and bidirectional client referral links
a5804985 Fix tenant workspace identity and redesign HQ login
da87a0dd Include full Note Aid KB training and require clinical phrasing.
86592dd7 Fix FCC voice durations and expose searchable event pictures
9d6dda78 Keep FCC voice and calendar entry responsive on iPad
c5caef6f Add household-scoped voice event drafts to Family Command Center
cf7218b9 Fix school notice schema lookup and supervision reply verification
```

## Different from main; review required (33)

- `backend/package-lock.json` (M)
- `backend/package.json` (M)
- `backend/src/controllers/auth.controller.js` (M)
- `backend/src/controllers/publicIntake.controller.js` (M)
- `backend/src/routes/familyLedger.routes.js` (M)
- `backend/src/server.js` (M)
- `backend/src/services/familyLedger/payments.js` (M)
- `backend/src/services/familyLedger/receivables.js` (M)
- `backend/src/services/familyLedger/views.js` (M)
- `frontend/scripts/build-public-domains.mjs` (M)
- `frontend/src/App.vue` (M)
- `frontend/src/components/SessionLockScreen.vue` (M)
- `frontend/src/router/index.js` (M)
- `frontend/src/services/api.js` (M)
- `frontend/src/store/auth.js` (M)
- `frontend/src/utils/__tests__/activityTracker.test.js` (M)
- `frontend/src/utils/activityTracker.js` (M)
- `frontend/src/utils/loginRedirect.js` (M)
- `frontend/src/utils/sharePreview.js` (M)
- `frontend/src/views/ChangePasswordView.vue` (M)
- `frontend/src/views/LoginView.vue` (M)
- `frontend/src/views/PublicIntakeSigningView.vue` (M)
- `frontend/src/views/ResetPasswordView.vue` (M)
- `frontend/src/views/admin/FamilyBillingDesk.vue` (M)
- `frontend/src/views/public/ItscoPublicWebsite.vue` (M)
- `backend/src/routes/schoolCareBridge.routes.js` (??)
- `backend/vitest.client-lifecycle.config.js` (??)
- `backend/vitest.schoolcarebridge.config.js` (??)
- `frontend/scripts/verify-schoolcarebridge.mjs` (??)
- `frontend/src/components/admin/SchoolCareBridgeProgramBilling.vue` (??)
- `frontend/src/components/billing/CollectionHandoff.vue` (??)
- `frontend/src/views/public/SchoolCareBridgeWebsite.vue` (??)
- `frontend/src/views/school/SchoolCareBridgeEntryView.vue` (??)

## Not on main; retained (52)

- `assets/EmailSignatures/innerstrengthemailfooter.png` (??)
- `assets/EmailSignatures/innerstrengthemailheader.png` (??)
- `assets/EmailSignatures/itscoemailfooter.png` (??)
- `assets/EmailSignatures/itscoemailheader.png` (??)
- `assets/EmailSignatures/mentalrangeemailfooter.png` (??)
- `assets/EmailSignatures/mentalrangeemailheader.png` (??)
- `assets/EmailSignatures/mh4kidzemailfooter.png` (??)
- `assets/EmailSignatures/mh4kidzemailheader.png` (??)
- `assets/EmailSignatures/nextlevelupemailfooter.png` (??)
- `assets/EmailSignatures/nextlevelupemailheader.png` (??)
- `assets/EmailSignatures/plottwistcoemailfooter.png` (??)
- `assets/EmailSignatures/plottwistcoemailheader.png` (??)
- `assets/PrintingAssets/ITSCO Brand/ITSCOGeneral2.afdesign` (??)
- `assets/WelcomeImages/ChatGPT Image Sep 18, 2026, 01_09_23 PM.png` (??)
- `assets/WelcomeImages/ChatGPT Image Sep 18, 2026, 01_09_30 PM.png` (??)
- `assets/WelcomeImages/ChatGPT Image Sep 18, 2026, 01_09_33 PM.png` (??)
- `assets/WelcomeImages/ChatGPT Image Sep 18, 2026, 01_09_36 PM.png` (??)
- `assets/WelcomeImages/ChatGPT Image Sep 18, 2026, 01_10_03 PM.png` (??)
- `assets/WelcomeImages/fall1.png` (??)
- `assets/WelcomeImages/fall2.png` (??)
- `assets/WelcomeImages/fall3.png` (??)
- `assets/WelcomeImages/fall4.png` (??)
- `assets/WelcomeImages/winter1.png` (??)
- `assets/WelcomeImages/winter2.png` (??)
- `assets/WelcomeImages/winter3.png` (??)
- `assets/WelcomeImages/winter4.png` (??)
- `assets/mh4kidzwebsiteassets/MH4KidzLogoemoticon.png` (??)
- `backend/src/routes/auricwell.routes.js` (??)
- `backend/src/scripts/auricwellImportWorker.js` (??)
- `backend/src/scripts/auricwellOperator.js` (??)
- `database/migrations/1495_auricwell_product.sql` (??)
- `deliverables/hq-login-verification/desktop-dark.png` (??)
- `deliverables/hq-login-verification/desktop-light.png` (??)
- `deliverables/hq-login-verification/initial-dark.png` (??)
- `deliverables/hq-login-verification/initial-light.png` (??)
- `deliverables/hq-login-verification/mobile-dark.png` (??)
- `deliverables/hq-login-verification/mobile-light.png` (??)
- `deliverables/hq-login-verification/small-dark.png` (??)
- `deliverables/hq-login-verification/small-light.png` (??)
- `deliverables/hq-login-verification/tablet-dark.png` (??)
- `deliverables/hq-login-verification/tablet-light.png` (??)
- `deliverables/hq-login-verification/wide-dark.png` (??)
- `deliverables/hq-login-verification/wide-light.png` (??)
- `docs/ITSCO_CLIENT_TASK_RECONCILIATION_2026_09_25.md` (??)
- `docs/public-websites/cloud/2026-09-15/all-domains-plan.md` (??)
- `docs/public-websites/cloud/2026-09-15/https-proxy-before.json` (??)
- `docs/public-websites/cloud/2026-09-15/url-map-before.json` (??)
- `docs/public-websites/cloud/2026-09-15/url-map-before.yaml` (??)
- `docs/public-websites/cloud/2026-09-15/url-map-websites-proposed.json` (??)
- `docs/public-websites/cloud/2026-09-15/validation.json` (??)
- `docs/public-websites/itsco-search-priorities-2026-09-14.csv` (??)
- `docs/public-websites/search-console-launch-handoff-2026-09-14.md` (??)

## Directory or missing; retained (25)

- `assets/Latinxwebsiteassets/` (??)
- `assets/NLUwebsiteassets/` (??)
- `assets/kimiwebsiteassets/` (??)
- `auricwell/` (??)
- `backend/src/assets/auricwell/` (??)
- `backend/src/routes/__tests__/` (??)
- `backend/src/services/auricwell/` (??)
- `deliverables/auricwell-verification/` (??)
- `deliverables/itsco-at-a-glance/` (??)
- `deliverables/itsco-school-partnership/` (??)
- `deliverables/latinx-platform-agreement/` (??)
- `deliverables/mental-health-platform-agreement/` (??)
- `deliverables/plottwist-employment-agreement/` (??)
- `deliverables/plottwistco-stripe-branding/` (??)
- `deliverables/plottwisthq-feature-guide/` (??)
- `deliverables/plottwisthq-handout/` (??)
- `deliverables/plottwisthq-login-concept/` (??)
- `deliverables/plottwisthq-qa/` (??)
- `deliverables/provider-availability-verification/` (??)
- `deliverables/tenant-login-verification/` (??)
- `docs/public-websites/search-console/` (??)
- `docs/schoolcarebridge/` (??)
- `frontend/public/assets/schoolcarebridge/` (??)
- `frontend/src/components/schoolcarebridge/` (??)
- `phishing-response-recipients/` (??)

## Already on main (same contents) (52)

- `.github/workflows/deploy-backend.yml` (M)
- `backend/src/services/__tests__/intakeUnfinishedReminder.service.test.js` (M)
- `backend/src/services/__tests__/sessionSecurity.service.test.js` (M)
- `backend/src/services/clientLifecycleStatus.service.js` (M)
- `backend/src/services/clientOnboardingTask.service.js` (M)
- `backend/src/services/familyLedger/collections.js` (M)
- `backend/src/services/intakeUnfinishedReminder.service.js` (M)
- `backend/src/services/passwordRecovery.service.js` (M)
- `backend/src/services/sessionSecurity.service.js` (M)
- `backend/src/utils/__tests__/clientLifecycleAction.test.js` (M)
- `backend/src/utils/__tests__/fallReadiness.test.js` (M)
- `backend/src/utils/__tests__/sessionSecurityPolicy.test.js` (M)
- `backend/src/utils/clientLifecycleAction.js` (M)
- `backend/src/utils/fallReadiness.js` (M)
- `backend/src/utils/sessionSecurityPolicy.js` (M)
- `docs/security/session-inactivity-lock.md` (M)
- `frontend/server.js` (M)
- `frontend/src/components/StatusPromptModal.vue` (M)
- `frontend/src/components/__tests__/SessionLockScreen.test.js` (M)
- `frontend/src/components/admin/PlatformBillingManagement.vue` (M)
- `frontend/src/store/indirectTimeSession.js` (M)
- `frontend/src/store/sessionLock.js` (M)
- `frontend/src/utils/completePasswordTokenLogin.js` (M)
- `frontend/src/utils/orgScopedPath.js` (M)
- `frontend/src/utils/publicBrowserBranding.js` (M)
- `frontend/src/utils/publicDomainRouting.js` (M)
- `frontend/src/utils/publicWebsiteEditing.js` (M)
- `frontend/src/utils/publicWebsitePath.js` (M)
- `frontend/src/utils/statusPromptBridge.js` (M)
- `frontend/src/utils/uploadsUrl.js` (M)
- `frontend/src/views/admin/PublicMarketingPagesAdminView.vue` (M)
- `frontend/src/views/public/Mh4kidzPublicWebsite.vue` (M)
- `backend/src/controllers/__tests__/schoolCareBridgeIdentify.test.js` (??)
- `backend/src/services/__tests__/clientLifecycleTaskSync.test.js` (??)
- `backend/src/services/__tests__/clientOnboardingTask.test.js` (??)
- `backend/src/services/__tests__/collectionDomain.test.js` (??)
- `backend/src/services/__tests__/collectionHandoff.mysql.test.js` (??)
- `backend/src/services/__tests__/schoolCareBridgeRouting.test.js` (??)
- `backend/src/services/familyLedger/collectionDomain.js` (??)
- `backend/src/services/familyLedger/collectionHandoff.js` (??)
- `backend/src/services/schoolCareBridgeRouting.service.js` (??)
- `database/migrations/1494_management_collections.sql` (??)
- `database/migrations/1504_schoolcarebridge_foundation.sql` (??)
- `docs/billing/management-collections-handoff.md` (??)
- `frontend/src/components/__tests__/StatusPromptModal.test.js` (??)
- `frontend/src/components/billing/__tests__/CollectionHandoff.test.js` (??)
- `frontend/src/styles/schoolCareBridge.css` (??)
- `frontend/src/utils/__tests__/noteAidIndirectSession.test.js` (??)
- `frontend/src/utils/__tests__/schoolCareBridge.test.js` (??)
- `frontend/src/utils/__tests__/statusPromptBridge.test.js` (??)
- `frontend/src/utils/schoolCareBridge.js` (??)
- `frontend/src/views/school/SchoolCareBridgeSessionEnded.vue` (??)

## Next action

Files already identical to main need no additional push. Different files and root-only commits must be reviewed against their intended workstream before merging. Untracked directories, including the unrelated AuricWell work, are retained. No cleanup or mass commit is appropriate solely from this comparison.

This SchoolCareBridge release is developed in a separate main-based worktree. Its commit and deployment status are independent of the root workspace changes.

## Three-way review of the 33 differing files

### Added locally; differs from main and no exact version found in main history.

- `backend/vitest.client-lifecycle.config.js`

### Contains a distinct local delta that merges cleanly with main; review before committing.

- `backend/package-lock.json`
- `backend/package.json`

### Contains overlapping local/main edits; requires intentional reconciliation.

- `backend/src/server.js`
- `frontend/src/router/index.js`
- `frontend/src/views/LoginView.vue`
- `frontend/src/views/admin/FamilyBillingDesk.vue`
- `frontend/src/views/public/ItscoPublicWebsite.vue`

### Exact local contents exist in main history; main has a newer version.

- `backend/src/controllers/publicIntake.controller.js`
- `backend/src/routes/familyLedger.routes.js`
- `backend/src/services/familyLedger/payments.js`
- `backend/src/services/familyLedger/views.js`
- `frontend/src/components/SessionLockScreen.vue`
- `frontend/src/utils/loginRedirect.js`
- `frontend/src/views/PublicIntakeSigningView.vue`
- `backend/src/routes/schoolCareBridge.routes.js`
- `backend/vitest.schoolcarebridge.config.js`
- `frontend/scripts/verify-schoolcarebridge.mjs`
- `frontend/src/components/admin/SchoolCareBridgeProgramBilling.vue`
- `frontend/src/components/billing/CollectionHandoff.vue`
- `frontend/src/views/public/SchoolCareBridgeWebsite.vue`
- `frontend/src/views/school/SchoolCareBridgeEntryView.vue`

### Local delta is already incorporated on main; remaining differences are newer main changes.

- `backend/src/controllers/auth.controller.js`
- `backend/src/services/familyLedger/receivables.js`
- `frontend/scripts/build-public-domains.mjs`
- `frontend/src/App.vue`
- `frontend/src/services/api.js`
- `frontend/src/store/auth.js`
- `frontend/src/utils/__tests__/activityTracker.test.js`
- `frontend/src/utils/activityTracker.js`
- `frontend/src/utils/sharePreview.js`
- `frontend/src/views/ChangePasswordView.vue`
- `frontend/src/views/ResetPasswordView.vue`

## Expanded untracked directories

The complete recursive inventory is in `untracked-file-inventory.json`. This expands the directory entries above without changing any files. Counts: 236 not on main, 23 same as main, 9 differs from main.
