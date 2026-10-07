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

- Existing code: the entire step is hidden, including from the completion count. No password, login, confirmation or reset is requested.
- Missing code: a valid, unexpired staff invitation may initialize a new six-digit code without an account password. It is shown once and is not saved in update answers. Existing codes cannot be overwritten. Resetting an existing code still uses account settings.
- Preview tokens cannot create codes or save anything. Initial creation remains rate limited and atomically refuses existing credentials.

Typical Availability replaces Work Hours and Preferred Days. It loads and updates the existing public profile summary using the same day/period checkbox editor as the profile. It does not create bookable appointments or alter school assignments.

## Before the weekly send

1. Review and attach the administrative update. None existed for ITSCO in the
   configured database when this preview was prepared.
2. Publish/select the intended handbook digest and attach the actual amendments,
   or disable those sections if none are due. A placeholder is not a completed
   contract review.
3. Review relevance of the enabled sections and audiences: especially license,
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

## October 7 follow-up: editable schedule, contact hours and matching

- The full invitation is editable. The separate preview remains read-only, with working document links and no delivery actions. The license now opens directly in a new tab, avoiding popup blocking and disabled form buttons.
- Office Schedule includes **When may the app contact me?** It shows saved windows and timezone; default is Monday–Friday 7 a.m.–7 p.m. Providers may keep that, choose Anytime, or edit individual daily windows. These are routine notification windows, separate from typical clinical availability and appointment booking. Saving replaces older quiet-hours rules without enrolling any messaging channel. Existing urgent/reminder exceptions remain in effect.
- School Availability shows current hours and assigned/total client spots. Staff can request different weekdays, hours and capacity within the updater. Requests use the existing school approval workflow; current assignments stay in force pending approval.
- Legacy age labels map to canonical age ranges. Duplicate plain labels are no longer offered. Confirming focus choices persists canonical values; no bulk rewrite of staff profiles is run on deploy.
- Each of the four clinical categories supports up to three highlighted areas and separate explicit exclusions. Unhighlighted, unexcluded areas remain eligible for a fit discussion. Public profiles label provider-selected highlights and expand other eligible areas without claiming specialized expertise. Earlier positive profile selections remain recorded unless explicitly excluded.
- Optional per-client enrollment preferences cover specialties, ages, communities/populations, and approaches, capped at three each. A community selection is not a declaration of identity, is never required, and is stored with the protected intake. Preferences appear in the clinical intake summary. Public finder preferences stay in browser state rather than URL parameters. Matching excludes explicit provider exclusions and ranks highlighted matches; availability, service-type and existing clinical review gates remain intact.
- Client action rows explain missing parent/guardian contact date, contact outcome and first completed service date, or the relevant returning-client action. Future appointments must not be recorded as completed services.

Verification: focused backend and Vue tests cover passwordless initial setup, preview write blocking, assignment ownership, contact-hour validation, age normalization, matching exclusions/highlights, and specific client actions. The production frontend build succeeds. The existing private license PDF returned HTTP 200 in a read-only check. No invitations or SMS were sent, and no Aunya profile or schedule values were changed during verification.


## Weekly calendar and live public profile

The former Office Schedule section is now **Weekly Calendar & Public Availability**.
The provider can:

1. Browse a seven-day calendar in the agency's time zone. It distinguishes public openings, private office reservations, and unavailable time. Commitments are labeled without client names or meeting details.
2. Select an unoccupied recurring office hour and choose **In person**, **Virtual**, **In person or virtual**, or **Keep private / occupied**. This changes publication for future occurrences of that assignment, keeping its recurrence and room reservation. Occupied occurrences remain protected.
3. Add a one-hour virtual window for one future date or every week from that date. Existing saved windows are preserved. Client appointments, school commitments, holds, and connected-calendar busy time continue to suppress conflicts; this page cannot create meetings, appointments, or additional room reservations.
4. Remove a saved virtual window for one date or that date and future occurrences. The full saved window is identified in the confirmation controls; this does not cancel existing client appointments.
5. Check agency-specific **Profile availability settings** if a format or new-client availability is disabled. This cannot grant a care-provider assignment or change another agency's shared schedule.
6. Open **View my live profile**, copy the public link, or generate/download its QR code. The shareable URL identifies only the public profile; it contains no updater token. Existing profile routes support each eligible provider. Profiles with multiple public services offer a service selector. An explicitly disabled public service remains disabled.

Saved publication changes invalidate the existing public availability snapshots through database triggers. The website calculates real openings from the same schedule; availability can be displayed even when direct online time selection is disabled. Profile display and booking permissions remain separate. Providers still need a configured public service/profile for their agency.

**When may the app contact me?** remains below this calendar and controls notification delivery hours separately. The updater no longer exposes office cancellation, room reassignment, meeting creation, or a full scheduling editor from this section. Those existing workflows remain available in the normal app.

Read-only previews can navigate weeks, inspect time blocks, open the profile and download its QR code. They cannot publish, change preferences, or confirm completion. Their calendar reads do not materialize office events. An ordinary provider invitation can save its own authorized changes. No invitations, emails, texts, or real provider availability changes were sent/applied during this feature's verification.
