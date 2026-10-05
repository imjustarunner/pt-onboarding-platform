# School onboarding welcome and Technology support

ITSCO sends one branded welcome per school after either initial portal onboarding is submitted or a collaborative update is finalized. Both paths enqueue before recording completion; the worker confirms the saved completion before sending. There is no historical-school backfill.

The minute worker waits for an active school, its configured `@itsco.health` group, a real Google Directory group, and the active Technology sender. Missing group/configuration is checked again after five minutes. Global and tenant email settings remain respected.

- To: the school's group address; CC: `schools@itsco.health`.
- From and Reply-To: the agency's Technology identity (`Technology@itsco.health`).
- Template: `school_onboarding_welcome`; the standard sender adds ITSCO header, footer, and department signature.
- Copy: school-specific portal link, EN/ES digital and paper enrollment, referrals, clinicians, permitted student access, school-admin staff management, group-email explanation, and Technology support.

Migration `1539_school_onboarding_welcome.sql` creates the delivery queue and inbound receipt table and maps Technology addresses to their department identities. Deploy it before the backend code. The unique `(agency_id, school_organization_id)` key and atomic send claim prevent repeat welcomes across retries, multiple completions, and multiple server instances.

`school_onboarding_welcome_emails` records status, recipient, communication ID, and last error. Pending jobs can wait safely for group setup. `held` means delivery requires review: inspect the linked `user_communications` record and Gmail Sent before retrying. A worker restart reconciles confirmed sends; uncertain network outcomes are never blindly resent.

Technology inbound mail creates or updates a Technology ticket assigned to the uniquely resolved active Michael Mendez administrator. Replies are scoped by tenant, sender, and thread. Message receipts deduplicate repeated polling and duplicate Google Group copies. Attachments use the existing ticket storage. Auto-replies and the department's own outgoing copies are ignored, and this route generates no AI response. Human ticket answers use Technology as From/Reply-To. Portal tickets explicitly categorized as Technology have the same owner.

Validation:

```sh
frontend/node_modules/.bin/vitest run --config backend/vitest.school-welcome.config.js
```

The optional MySQL test requires `RUN_SCHOOL_WELCOME_MYSQL=1` and `SCHOOL_WELCOME_TEST_ENV` pointing to a configured environment file. It verifies real SQL inside a transaction that is rolled back; outbound email and notifications are mocked. It sends no messages and leaves no ticket or welcome-job records.

## October 5 delivery update

School welcomes use the Notifications identity, Reply-To `support@itsco.health`, and CC `schools@itsco.health`. Verified replies referencing a sent school welcome are routed to Technology tickets assigned to Michael; other Support email retains its existing handling. The SchoolCareBridge link temporarily uses `https://plottwisthq.com/schoolcarebridge` while the dedicated domain awaits its certificate. Schools with existing referrals receive an acknowledgment that they have already started.

The one-time catch-up includes completions within the last 21 days only, excludes prior welcomes and post-completion client/intake/upload or staff mutation activity, and requires a provisioned group. Login, logout, session timeout, password-reset requests and roster views alone are not submissions. Keller is an explicitly requested exception to the inactivity filter. Recheck activity and prior delivery immediately before sending; never blindly retry uncertain delivery.
