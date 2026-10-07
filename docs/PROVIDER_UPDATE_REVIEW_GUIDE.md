# Provider Update review and weekly send

Updated October 7, 2026. This release updates the existing read-only preview; refresh it after deployment completes. ITSCO's October draft is unsent. A separate, seven-day
read-only preview represents Aunya. No email or SMS has been sent to her.

## Review the actual staff view

1. Open **ITSCO → Admin → Provider Update** (`/itsco/admin/provider-update`).
2. Edit **ITSCO Provider Update — October 2026**, then select **Preview full**.
3. Choose **Aunya Albinana** under **Preview as**.
4. Select **Create read-only token link**, then open the resulting link in a private
   browser window. This displays the real recipient interface, not just page cards.
5. Check each page. Preview controls cannot save answers, sign, enroll, track working
   time, upload documents or change Aunya's profile. Her ordinary invitation will
   use a separate editable token. Preview links expire after seven days; closing
   the preview draft revokes its link. Preview drafts cannot be sent as invitations
   and preview recipients are excluded from payroll and staff dashboards.

Do not forward a preview link: it contains the selected staff member's information.
The link is returned only to an agency administrator and is not stored in this guide.

## Texting & Communication Choices

This is its own overview card, enabled by default. Each question is separate:

- Request access to client texting inside the app.
- Request future forwarding and replies through a personal phone.
- Opt in or out of staff reminders and announcements, including meeting/session
  links, assigned videos/training and supervisor updates.
- Opt in or out of generic message-waiting alerts.
- Opt in or out of optional polls/voting. Their own response remains available in the app;
  aggregate results and optional results texts are available when the organizer shares them.

All may be No. A signed review is required for completion. The access and forwarding
answers are recorded requests; they grant no permissions and activate no relay.
Forwarding remains off. Personal-phone SMS consent is separate from client consent,
provider access and signed enrollment review. Pending carrier/number setup stays
visible; neither this update nor its signature overrides STOP. Admins can see the
five responses under **Past pushes → View → Texting choices** after staff submits.

## Six-digit Quick View passcode

The old kiosk PIN step has been replaced. The emailed updater token opens the
update interface; it is not the six-digit Quick View passcode.

- Existing, unlocked code: staff confirms they can access Quick View; no reset is
  required.
- Missing code: the updater can create a new six-digit code after checking the recipient’s account password. It displays the new code once, uses a rate limit, and cannot replace an existing code. SSO-only staff and locked/existing-code resets use **My Dashboard → My Preferences →
  Privacy & Quick View**, using the existing authenticated setup/reset flow. Staff
  returns to the updater and refreshes status before confirming.
- The server checks actual Quick View status before completing the step. It never
  displays an existing code or stores a code in the update answers. An old kiosk
  acknowledgment does not satisfy the new Quick View step.

Typical Availability replaces Work Hours and Preferred Days. It loads and updates the existing public profile summary using the same day/period checkbox editor as the profile. It does not create bookable appointments or alter school assignments.

## Before the weekly send

1. Review and attach the administrative update. None existed for ITSCO in the
   configured database when this preview was prepared.
2. Publish/select the intended handbook digest and attach the actual amendments,
   or disable those sections if none are due. A placeholder is not a completed
   contract review.
3. Review relevance of the 16 remaining sections and audiences: especially license,
   supervision, school/client work and amendments. Pay Portal Check, Training Acknowledgments and duplicate Preferred Days are removed. The preview shows
   the enabled packet; turning a section off removes its completion requirement.
4. Contact/address, profile blurb, display credential, specialties and typical availability load saved records and persist confirmed changes. Supervision and school schedule changes remain review requests. The photo is displayed with photo guidance; replacing it uses Account Info. License files open using short-lived private URLs. Missing blurbs offer an editable example, without inventing credentials.
5. Verify the People Ops sending identity and choose **Selected people only** for
   the first real invitation. Sending is a separate explicit action; creating a
   preview does not send or assign contract tasks.
6. Review that recipient's completion and texting requests before the broader send.

Current review validates the token interface and section behavior. It does not
claim that every linked training, handbook, contract or administrative document is
ready, or that SMS forwarding/voice is active.

## October 7 local verification and remaining preparation

- Read-only Aunya record check: contact fields, blurb, credential, photo and uploaded license present; two school assignments; nine assigned clients with outstanding lifecycle actions.
- Supervision shows reported starting hours, imported/period hours, finalized app credits, calculated total and stored balance. At verification, Aunya’s recorded total was 64.09 hours with no discrepancy; app credits alone were zero. Corrections do not overwrite credits.
- Office schedule labels use AM/PM. Client actions use current school-year dispositions and active assignments; lookup errors are visible rather than an empty success.
- Amendment Agreement cannot be completed without assigned completed signature tasks. Select the actual intended amendment before sending.
- The October draft URL is an administrator-only editor and intentionally requires login. Staff use their own invitation tokens. A read-only preview never changes PINs, preferences, profile data, signatures, attendance or time.
- The additive poll-review migration was applied before this release. No recipient data was updated and no invitations were sent.

## ITSCO team polls and team texts

Use the existing Company Events / team messaging workspace and the approved ITSCO staff polling/workforce sender. This change does not register or alter a carrier campaign, buy a number, bypass opt-outs or send anything.

1. Create/edit a staff event or poll. Select the existing staff/group audience and enter the question.
2. Configure 2–12 answer choices. Each has a reply code (for example `1` or `MON`) and a display label. Reserved SMS commands cannot be poll options.
3. Enable written answers if wanted. In SMS, participants prefix a written answer with the poll code; unrelated care messages are not automatically treated as votes. In the app, they can type their answer.
4. Choose whether to share final aggregate results. Participants can see their own submitted response regardless. This is identified polling, not anonymous polling.
5. Use **Results & review replies**. Assign a reply to a category or exclude it, with a reason. The original reply and append-only review history remain intact. A newer reply invalidates the earlier categorization.
6. Review unclassified answers before closing. Unclassified/excluded replies do not count toward answer totals. Final-results texts require both shared results and that participant’s separate results-text request and SMS consent.
7. Team announcements continue through the existing direct-message audience/group and delivery controls.

Deployment prerequisite: apply `database/migrations/1555_staff_poll_response_reviews.sql` before starting the updated backend. This migration was applied to the deployed database on October 7 before publishing the release. Categorization, exclusions, new-reply reset and audit history were tested using disposable connection-local MySQL temporary tables.
