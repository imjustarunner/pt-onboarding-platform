# Pre-hire and onboarding portal redesign

The emailed personal link now opens only the employee's current process. Pre-hire submission closes that package for review. People Operations starts onboarding manually; the same link then opens onboarding with a left-side link to the completed pre-hire package. Onboarding submission retains the package and submits recorded active time for payroll review. Staff activation remains a separate action.

## Interface previews

These are local browser captures using synthetic applicant data, not production employee records. Logos, colors, banner and copy are driven by tenant configuration. The fixture uses an existing ITSCO logo; changing the tenant logo updates the portal.

- [Onboarding account setup](portal-previews/onboarding.png)
- [Completed pre-hire awaiting review](portal-previews/prehire-review.png)
- [Inline pre-employment information](portal-previews/prehire-profile.png)
- [Phone layout](portal-previews/mobile.png)

## Implemented workflow

- Tenant navigation, current-step progress, status and support rail, inline questionnaires, embedded training, My Documents and People Operations messaging. Future phases are hidden until staff opens them. Password setup does not activate employment.
- Pre-hire starts with the existing encrypted background-check authorization. The applied job description is retained in the selected packet and shown with signature capture. Employment agreements open as actual branded PDFs, with retained signed PDFs available afterward.
- Preferred work email, copyable personal link, inline pre-employment profile fields, optional resume and required professional headshot. Profile fields write to the existing employee information model; headshots also update the profile photo. Uploads are limited to 10 MB and headshots are decoded and re-encoded before storage.
- Configurable handbook viewer, downloadable/uploadable D11 step, videos, acknowledgement signatures, meetings and other resources. Checklist state follows saved forms, signatures, uploads and task completion.
- Agency defaults, job-specific additions and individual packet choices compose the person's retained packet. Assigning a supervisor is distinct from selecting supervisory duties for the new hire. The latter requires an approved contract clause and signature template, adds the role, includes the clause in the generated agreement and assigns the acknowledgement.
- Onboarding uses the existing profile-questionnaire and training integrations inside the step workspace. Pre-employment fields are excluded from those portal questionnaires and cannot overwrite closed pre-hire through the old form routes.
- Onboarding document assignment retains its source and field definitions. Mapped employee inputs and required-field validation are supplied for the bundled W-4, I-9 employee section, direct deposit and insurance election PDFs. A legacy payroll form with no employee input mappings is blocked from assignment.
- Inline submissions are encrypted and associated with the employee. Signed acknowledgements and uploads remain in the employee library alongside assigned documents, questionnaire answers, training completion and time claims. Closing a phase rechecks required saved submissions under the same user lock used for step writes.
- Active onboarding time uses server-observed heartbeats. Tracking pauses for hidden/unfocused/idle pages and pre-hire archive browsing. Embedded training owns its activity session; the parent pauses to avoid double counting. Native video and supported YouTube/Vimeo playback keep an attended video session active. Submission creates payroll review claims idempotently; it does not execute payment.

## Deployment and tenant setup

1. Apply `database/migrations/1464_hire_portal_workflow.sql` using the normal migration runner, after the earlier hire-journey migrations. Configure the existing guardian/intake encryption key and private file storage.
2. In Hiring & Pre-Hire settings, configure the tenant logo/branding, handbook viewer URL, packet resources and reusable packet templates. Use job settings for job-specific additions, then review the composed packet on Start Pre-Hire.
3. For ITSCO, the updated `backend/src/scripts/seedItscoHireOnboardingDocs.js` can create the 2026 form templates/packages. It switches agency defaults to the new packages and carries forward modules, training focuses, checklist items and intake links from the previous default onboarding package. It preserves existing historical templates and assignments. Review the selected package before running the seed in the target environment.
4. Supply the actual D11 blank form, marketplace coverage notice, family practice sheet, Drive handbook viewer and meeting scheduler URLs. Supply the approved supervisory duties clause and separate acknowledgement template before enabling supervisory duties. Required resources without sources block sending. No placeholder legal documents were authored.
5. Attach published training and the intended existing profile questionnaires. Training content that has not been authored is not manufactured or silently marked complete. Review carried-forward custom checklist items and external forms for semantic duplicates; their contents cannot be inferred from the local repository.
6. Run a staging journey with real tenant configuration: generate and review the agreement, sign pre-hire, confirm read-only review, promote using the bookmarked link, complete onboarding and submit twice, verify one payroll claim per recorded UTC work date, check the employee library, then activate manually. Verify actual invitation sender and email rendering in the tenant's mail environment.

The migration and seed were **not run against a live database** during this implementation. No real candidate email, account provisioning, storage upload or payroll payment was sent/executed by local verification.

The app embeds the handbook without an app download button. Google Drive's owner must disable viewer download/copy/print if required; an iframe alone cannot enforce Drive permissions. External scheduling opens the configured scheduler and records the employee's confirmed meeting time; it does not fabricate calendar bookings. External/offline work and disconnected sessions need People Operations time reconciliation.

I-9 employee Section 1 completion is not employer verification of Section 2. Staff must complete the employer process separately before activation. The Colorado withholding certificate is offered with a required review acknowledgement and an optional election upload, matching the form's optional employee-election model.

## Source forms

- [IRS W-4, 2026](https://www.irs.gov/pub/irs-pdf/fw4.pdf), bundled as `w4_2026.pdf`.
- [USCIS I-9, edition 01/20/25](https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf), bundled as `i9_2025.pdf`.
- [Colorado DR 0004, 2026](https://tax.colorado.gov/sites/tax/files/documents/DR_0004_2026.pdf), linked from the packet. The official source denied automated download locally, so no local copy is asserted.

## Verification

Focused tests cover packet inheritance/readiness, supervisor separation, phase permissions, required form answers, retained sources, encrypted saves, transactional completion, training, contract generation, interview permissions, time accounting and payroll idempotency. Vue tests cover phase navigation, completed packages, document access, submission and pausing an in-flight activity request. The frontend production build passes with an 8 GB Node heap. Local Chrome checks report no browser errors or horizontal overflow at phone width. A synthetic W-4 was rendered and visually checked for employee-field placement.

See also [the original workflow review](../HIRE_ONBOARDING_WORKFLOW_REVIEW.md) and [interview workflow review](../INTERVIEW_WORKFLOW_REVIEW.md).
