# Pre-hire setup and portal overhaul — September 19, 2026

Local changes only. Nothing committed, pushed, deployed, or sent to candidates. Existing unrelated work is preserved.

## Setup model

Pre-hire and onboarding have separate preparation flows. A saved setup supplies defaults; a document collection supplies reusable documents; the person’s retained packet records the selected steps and resources. Employment agreements are generated from the contract configuration and reviewed before invitation.

- Pre-hire wizard: Person & job → Pre-hire steps → Contract & cosigners → Review & invite.
- Onboarding wizard: Contents → Invitation → Review. Only active onboarding collections are selectable. Promotion validates membership in the selected agency rather than selecting the user’s first agency.
- Selected collection contents load from the actual package API. Pre-hire imports documents only; videos and other pre-hire resources are explicit steps. Older employee onboarding/profile training is classified as onboarding, even if old metadata assigned it during pre-hire.
- Links open the selected job, collection, document template, contract editor, hiring settings, handbook, or existing personal portal. Editors open in another tab so the setup remains available. Collection and contract refresh controls reload edited sources.
- Pre-hire review lists built-in steps, extra resources, selected job documents, uploaded employee files, contract review status and cosigners. Missing resources prevent sending.

## Contracts and documents

- Candidate and tenant values are editable before preview. Compact imported placeholders such as `{{COMPANYNAME}}` resolve from canonical token values. Canonical edits replace stale aliases. Tenant name/address are not substituted with hardcoded ITSCO defaults.
- Preview and generation use the same token inputs. Edits invalidate review. A hash of the rendered agreement detects template/rate changes after review; generation checks it again. Missing required values stop assignment.
- Cosigners are assigned only to the employment agreement. A generated agreement replaces the legacy agreement selection rather than adding two contract tasks.
- Existing malformed unsigned HTML agreements are blocked from signing and must be regenerated. Signed agreements are preserved; contract generation continues to reject replacing a signed agreement.
- Native PDF text, multiline, checkbox, select and signature fields are detected when uploading a new template and when opening/signing an older template without definitions. Native fields are filled and flattened in the retained PDF. Mapped text wraps and shrinks within its field; answers too large to fit legibly are rejected instead of clipped.
- Flat/scanned forms cannot reliably supply field locations automatically. Configure their reusable layout once in Documents Library. Radio-group auto-detection is not included in this change.
- Portal document preview uses page/zoom controls with a bundled PDF worker rather than the browser’s large thumbnail panel. The full-PDF link remains available.

## Portal fixes

- Replaced an inert nested HTML template that hid the job description and acknowledgement controls.
- Older retained packets with an empty handbook recover the agency handbook setting; a retained nonempty handbook remains unchanged. Google Docs links have both an embedded preview and an explicit open action.
- Personal portal links, staff links, regenerated links and invitation paths use the agency app host.
- Initial sign-in verification has a centered, light screen. Actual inactivity lock/PIN behavior is preserved.

## Verification

- 135 backend hiring tests passed, including contract merge/review consistency, phase separation, handbook recovery, PDF fields and signed output.
- 26 frontend tests passed, including both setup wizards, portal rendering, initial session verification, application and meeting regressions.
- 9 existing tenant URL tests passed.
- Chrome checks with mocked API responses: desktop and 390px mobile wizards, no horizontal overflow, review gating, two-page PDF navigation and local worker loading; no page errors. No invitations were sent.
- Production frontend compilation passed with an 8GB Node heap and existing large-chunk warnings. `copyPublicDir: false` avoided copying 2.3GB of unchanged public media on the nearly full local disk; deployment/build configuration was not changed.
- `git diff --check` passed.

## Remaining integration checks

Existing production agreements and packets are not rewritten by this local change. Regenerate malformed unsigned agreements using the corrected preview flow after deployment. Confirm the affected applicant’s retained files still exist in storage: code cannot reconstruct a genuinely missing original. Google document sharing must allow the candidate to view the handbook. Actual agency data, external document access and delivered invitations still need an integration check after deployment.
