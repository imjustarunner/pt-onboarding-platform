# TISI imported services and appointment billing

September 25, 2026. These changes prepare workflow and UI; they do not certify a payer connection or transmit claims.

## Imported Note Aid to-dos

For The Inner Strength Institute (agency 377), pasting a service to-do into Note Aid and saving the import creates a **planned clinical session** before a note draft exists. Progress and intake service items qualify. Treatment plans, termination notes and other non-service documentation do not create claim work.

The permanent link is independent of the personal work queue. Its identity includes agency, client, importing provider, service date, code, note kind and supplied time label. Re-importing or rebuilding the queue reuses the linked session. Concurrent imports serialize at the provider/client/date scope. Existing sessions with the same service identity require explicit linking rather than silently creating another encounter. When the existing session is already scheduled, open it in Note Aid instead of importing a second copy.

The import retains the service date and any pasted time label; it does not invent actual start/end times, duration, location, network status, charges or a completed encounter. Review those details in Note Aid. Signing a service note for an imported service dated today or earlier marks that planned encounter complete and uses the existing claim-draft workflow. Missing diagnosis, billing configuration or other requirements can leave the signed note in the missing-claim queue. Existing original-claim checks remain authoritative. Amendments do not authorize another original.

Removing a work-queue item does not delete its clinical session or an existing claim. The queue is a personal task list; clinical and billing records are retained. Imports that fail server validation are not activated locally or silently saved through the fallback sync path.

Billing Workspace → select TISI → Claims/Workspace shows imported planned services that do not yet have a claim. Note Aid also includes an expandable insurance and claim-progress panel.

## Appointment Billing access and behavior

Authorized clinical staff can see the appointment Billing tab. The API checks agency membership and client-record access before loading claim/insurance data. Guardians and unrelated client users cannot use the staff endpoint. Provider/provider-plus roles retain no financial billing access.

The clinical response explicitly contains insurance names/member identifiers, note/claim linkage, lifecycle status, cosign requirements and field-based correction guidance. Raw payer messages, free-text review results, charges and ledger amounts are excluded at the server boundary. A financial reviewer can open the exact payer response in the billing workspace. Note changes follow the existing signed amendment/addendum process.

Statuses distinguish planned, unsigned, signed awaiting claim preparation, billing review, supervisor cosign, amendment holds, awaiting submission, submitted, rejection/denial, acceptance, payment and void/adjustment. A stored `ready` value alone does not establish current readiness: the endpoint uses the current review when available. Actual transmission still performs its independent mandatory checks. Acceptance never implies payment.

Financially authorized staff additionally see recorded claim-line charges, units/modifiers, posted patient responsibility, net payments, remaining patient balance and refund-review amounts. A final zero patient responsibility remains zero even when an earlier payment awaits refund. Primary and secondary charges represent the same service and are not summed. Missing insurance reimbursement data is not inferred from charge totals. Existing audited billing actions are opened with the correct agency and claim scope; this release does not add automatic ERA posting or payer replacements.

## Additional payer setup

The main migration adds **CO BCBS** and **UnitedHealthcare** to TISI's agency payer setup list. These are requested carrier names from the owner's screenshots, not confirmed electronic routing IDs, plan/network names, fees, contracted rates or enrollment approvals. Patient member IDs and sample rates from the screenshots are not seeded.

Billing staff can request additional payer names per agency and search the Claim.MD directory from that list. Confirm the exact payer/product from the patient's card, select the correct agency billing office/group NPI, and complete the existing claims, ERA and eligibility workflows separately. The established CCHA setup and reported EFT arrangement are retained.

## Deployment and verification

Apply main migration `1494_payer_setup_requests.sql` and clinical migration `023_note_aid_planned_claims.sql` before using these features. The migration seeds only agency 377 whose name contains “strength”; it does not change another tenant. No production migration, live enrollment, eligibility request, claim submission or card charge was run during this change.

Verification includes provider financial redaction and client/agency authorization tests, lifecycle/correction tests, UI permission and stale-scope tests, existing Claim.MD/supervision/amendment regression tests, and a disposable MySQL test of actual migrations and five concurrent imports. The MySQL test also verifies repeat payer migrations are idempotent and tenant-scoped. Run that test only against a freshly reset `127.0.0.1:33316/family_billing_test` database with `PLANNED_CLAIM_MYSQL_TEST=1`; payer calls are not involved.
