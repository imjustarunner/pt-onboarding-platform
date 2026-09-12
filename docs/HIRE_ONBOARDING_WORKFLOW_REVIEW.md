# Hire and onboarding workflow review

The intended sequence is application → evaluation → interview → hired → pre-hire → staff review → onboarding → employee submission → staff activation. Application collection, evaluation, interview tracking and Mark hired already exist in the hiring pipeline. This change repairs the transitions and the candidate experience after hiring.

## Implemented behavior

- One personal `/pre-hire/:token` link spans pre-hire and onboarding. Promotion and invitation resend extend the existing token. Onboarding starts manually after pre-hire review and successful package assignment.
- The portal switches between two separate task sets. Closed pre-hire remains viewable. Required work controls submission; completing an individual task does not silently close the process. Password setup prepares credentials and does not activate employment.
- Package assignment uses one transaction and one shared implementation for both staff assignment and promotion. It includes documents, training modules, track modules, custom checklist items and intake forms. Retries reuse existing package tasks. Assignment alone does not advance employment status. Training packages for existing employees remain separate from hire onboarding.
- Contract generation validates missing clauses, unavailable templates, unresolved fields and agency ownership. A document, task and generation are persisted together. Identical content reuses its generation; changed unsigned agreements supersede earlier unsigned versions. Signed agreements are retained. The existing provider-update amendment path remains distinct. Sending pre-hire surfaces contract errors before sending the invite.
- Job-description and company-document acknowledgments retain signature images in PDFs, including the original company document. Background authorization retains its captured signature in the encrypted authorization and a masked signed receipt. Existing signed agreements have a protected retained-PDF endpoint. Historical captures that previously discarded a signature cannot be reconstructed.
- Training quizzes, acknowledgments, responses and knowledge checks work through assigned-module token routes. Server completion checks verify saved required profile fields, acknowledgment, quiz results and knowledge checks. Profile forms continue writing to the existing profile field system. Arbitrary fields outside an assigned questionnaire cannot be submitted via the token.
- Onboarding activity uses server timestamps and sequenced heartbeats. Hidden windows, unfocused tabs, inactivity and long gaps pause recording. Visible playing video counts as activity. A single employee cursor prevents concurrent tabs from independently adding time. Short intervals crossing UTC midnight are split between dates.
- Employee submission atomically saves the onboarding receipt and creates one existing `meeting_training` payroll claim per recorded UTC date. `totalMinutes` follows the payroll engine's payload contract. Retried submissions do not duplicate claims. These are submitted for payroll review, not automatically approved or paid.
- The employee's Tools and Resources library contains retained pre-hire and onboarding receipts, signed documents, submitted questionnaire answers and recorded time. Questionnaire snapshots use the existing intake encryption key. Staff sees submitted onboarding and can use Mark active after review.

## Deployment

The Cloud Run bootstrap automatically runs new migrations before loading the application. Verify `database/migrations/1420_hire_journey_and_activity.sql` succeeds during rollout; apply it explicitly first in environments that do not use that bootstrap. The migration adds lifecycle receipts and activity totals, tags existing package task provenance, and preserves existing task enum members while adding the form/notification types already used by assignment code. The migration was parsed locally; it was not executed against a live database in this work.

The existing guardian/intake encryption key is required for background authorization and archived questionnaire answers. Configure onboarding packages with the actual required I-9/W-4 workflows, profile questionnaires and published training appropriate to the organization. This change does not author new tax forms or unfinished training content, nor does a generic checklist replace employer verification steps.

Only activity observed after deployment can be recorded. External websites, offline work, and work performed while disconnected require People Operations to reconcile time. Do not infer historical pay from page-open timestamps. Intake-link tasks retain the existing explicit employee confirmation behavior; unlike the internal profile questionnaires, external intake submissions are not automatically bound to a candidate task by this change.

Legacy onboarding users without task provenance need a staff review of their assigned package. Generated contracts and package-associated tasks have identifiable provenance; arbitrary historical tasks cannot always be assigned to their original phase reliably.

## Validation

- Focused backend tests cover phase separation, required work, activity replay/idle handling, payroll idempotency and rollback, package assignment retries and rollback, contract generation consistency and validation, and retained PDF signatures.
- Vue tests exercise switching phases, submitting completed work, viewing a prior-phase document, submitted review status, and activity attention rules.
- Production frontend build passes with `NODE_OPTIONS=--max-old-space-size=8192 npm run build --prefix frontend`. The default 4 GB heap was exhausted by this repository's build.
- Local browser checks use mocked candidate data to exercise the portal and mobile layout. They do not substitute for a staging test with real documents, storage, database migrations and payroll configuration.

Recommended staging acceptance: generate a contract with real configured clauses, change an unsigned rate, sign the replacement, finish pre-hire, promote using the same bookmarked link, complete a profile form and training assessment, submit onboarding twice, verify exactly one claim per UTC work date, review the retained library package, then mark active.
