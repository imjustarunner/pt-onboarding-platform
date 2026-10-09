## Current scope and carrier check — October 8, 2026

The immediate priority is **two-way provider/parent texting** in Messages. Parents
text the agency's care number; authorized providers read and reply in the app.
This does not depend on automated appointment reminders. Appointment announcements,
balance announcements and automated appointment actions are paused in this work.
Keep recordings and transcripts out of outbound text/email notifications.

The owner clarified ITSCO's arrangement as **three separate 719 numbers**:

| Campaign | Number | Purpose |
| --- | --- | --- |
| Campaign 1 — Service Communications | Main line | Calls and existing extensions. Keep the Grasshopper public number in place until a tested port is explicitly scheduled. |
| Campaign 1 — Service Communications | Separate care line | One-to-one provider/client texts, received and answered in the app. |
| Campaign 2 — Staff Notifications and Voting | Separate notification line | App notifications and staff polls; no provider/client conversation content. |

Use temporary 719 numbers for the first two roles and a permanent 719 notification
number. Reuse the already owned **719-716-3661** for one appropriate role after
registration; its final role has not been changed by this update. Campaign linkage
authorizes SMS use; it does not configure calling, extensions or forwarding.

Read-only Vonage inventory verified **October 8, 8:34 PM America/Denver** (staff
number provisioned later that evening; see the update below):

| Organization | Service campaign | Staff notifications / polling campaign |
| --- | --- | --- |
| ITSCO | `VCV2DNM4`, ACTIVE, Account Notification + Customer Care | `VCSVZ9AN`, ACTIVE, Account Notification + Polling/Voting |
| Next Level Up | `VC23QD14`, ACTIVE, Account Notification + Customer Care | None found; polling is not included in the existing campaign |
| Inner Strength | `VCA596DN`, PENDING_REVIEW, Account Notification + Customer Care | None found; polling is not included in the pending campaign |

At that check all four non-terminated campaigns had **zero linked numbers**. Next Level Up and
Inner Strength need a separate Staff Notifications and Voting campaign if adopting
ITSCO's separation. Submit Account Notification + Polling/Voting with each
organization's own program description, signed opt-in flow and published policies.
Do not treat the presence of Account Notification as approval for polling.

### What still enables real one-to-one texting

1. Have Vonage confirm the BAA and healthcare feature for the exact account and
   SMS API transport used here (`vonage.sms.send`), plus the required retention
   and webhook settings. The last HIPAA number-link attempt returned the 403
   below; the inventory check does not establish that this account hold is lifted.
2. Link the chosen care number to that organization's service campaign with the
   required healthcare designation, and verify `LINKED` at Vonage. Correct the
   ITSCO HELP and opt-in example placeholders during this review.
3. Record the verified registration in Texting Numbers, configure signed inbound
   and delivery-status callbacks, assign the shared care number, and review the
   recipient's signed care-texting choice. Parent-initiated disclosure and the
   practice/vendor's responsibilities for handling received messages are separate.
4. Complete the Hub sending rollout: its new-send control is still gated. Test
   parent-to-provider receipt, provider replies, staff identity/agency labeling,
   shared-family routing, STOP/HELP, delivery failures and availability behavior
   with consenting staff and fictional records before patient use.

No numbers were bought, linked, repurposed or activated in the unread-badge change. No texts,
calls or campaign submissions were made. SMS and Calls tabs now display unread
badges and load stored conversations even while new sending/capture awaits
activation; the old “Coming soon” shortcut had hidden stored records in those tabs.

### Staff number linked — October 8, 9:21 PM America/Denver

- Purchased **719-716-3884** for ITSCO's permanent staff notifications and polling line.
  Verified carrier status **LINKED** on brand `BRC2ZW3`, campaign `VCSVZ9AN`.
  Rental quote: EUR 0.93 setup and EUR 0.93/month, plus usage.
- Saved as ITSCO number ID `3`, purpose `notification`, with only `polling` and
  `workforce` registration purposes. `companyEventsSenderNumberId` points to `3`.
  Existing care/main numbers and the HIPAA provisioning hold remain unchanged.
- Configured the number's inbound URL as
  `https://plottwisthq.com/api/vonage/inbound`. The production endpoint was found
  behind catch-all staff authentication (HTTP 401). The accompanying server fix
  mounts Vonage callbacks before that authentication and request-body logging;
  production callbacks still require valid Vonage signatures. Deploy this fix
  before activating texts, and confirm Vonage inbound and receipt signing.
- Enrollment activation is planned for October 9. Agency SMS/polling enable flags
  remain off; no recipients were enrolled and no texts were sent by provisioning.
  Signed recipient choices and administrator review are still required. Linking
  the number does not enable calls, care texts, or appointment announcements.

## Prior compliance check — October 7, 2026

Read [the non-compliance audit](docs/VONAGE_10DLC_NONCOMPLIANCE_AUDIT.md) before activation. Three ACTIVE campaigns have zero linked numbers (ITSCO service, ITSCO staff/voting, NextLevelUp service); Inner Strength is pending review. ITSCO's submitted HELP and opt-in fields contain leftover example text, including an incorrect email and a truncated opt-out instruction. The audit has full replacement wording. The healthcare account hold remains in place.

Every attempted SMS now verifies current Vonage campaign/number readiness and approved use cases before transport. Staff preference saves require the existing administrator-reviewed campaign consent enrollment before activation. Run `npm run sms:audit-vonage` from `backend/` to refresh the carrier inventory without sending texts or changing account settings. A clean audit output is not a compliance guarantee.

## ITSCO local number provisioning — October 6, 2026

- Purchased **719-716-3661** through the configured Vonage account; SMS, MMS, and Voice capabilities verified against owned inventory.
- Carrier quote: **EUR 0.93 setup and EUR 0.93 monthly rental**, excluding usage.
- Requested link to **ITSCO Service Communications**, brand `BRC2ZW3`, campaign `VCV2DNM4`, with `compliance: ["HIPAA"]`.
- Vonage rejected the link with HTTP 403: **“HIPAA numbers are not enabled for your account, please contact us for more details.”**
- The number is saved in ITSCO as **pending and inactive**. No non-HIPAA fallback link was attempted. No texts were sent. Final public-main vs shared-care role remains to be selected.
- At this check, the approved service campaign had **zero linked numbers**. The configured Vonage account previously owned **218-240-8224**; the app-only saved care number **719-249-7304** was not in that account’s owned inventory. Do not treat an app record as carrier ownership or approval.

Send this request through [Vonage API Support](https://api.support.vonage.com/hc/en-us/requests/new):

> Please enable HIPAA numbers for the API account that owns ITSCO brand BRC2ZW3 and campaign VCV2DNM4 (ITSCO Service Communications). We purchased 17197163661 and requested the campaign link with compliance=["HIPAA"]. The API returned HTTP 403: “HIPAA numbers are not enabled for your account, please contact us for more details.” Please confirm any required BAA/account steps and enable the healthcare number feature. Please preserve the approved campaign and do not link this number without HIPAA. Failed request reference: e0d37a8e-f2e1-468a-8cd0-35e83c4edfbc.

After Vonage confirms activation, recheck the campaign and retry the same number’s
HIPAA link; do not purchase another number. Verify carrier status `LINKED`, then
record the verified sender registration and configure the authenticated inbound
SMS webhook before activating the number in the app. No voice port or live calling
is enabled by that SMS registration.

The app’s number search now uses the installed SDK’s single filter object with
`pattern=1719` and `searchPattern=0`. Purchases check Vonage’s response code before
creating an app record. [Vonage number API](https://developer.vonage.com/en/api/numbers)
and [healthcare linking requirements](https://api.support.vonage.com/hc/en-us/articles/4407235273876-10-DLC-Number-linking-guide).

## Approval and public guide update — October 7, 2026

Vonage API verification on October 7 confirms:

| Agency / program | Brand | Campaign | Carrier status | Linked numbers |
| --- | --- | --- | --- | --- |
| ITSCO Staff Notifications and Voting | BRC2ZW3 | VCSVZ9AN | ACTIVE; traffic enabled | 0 |
| Next Level Up Service Communications | BMF4RBM | VC23QD14 | ACTIVE; traffic enabled | 0 |

These campaigns are approved. Neither has a linked number yet; approval alone does not activate app delivery. Preserve healthcare provisioning, number-linkage and consent gates. No number was purchased, linked or activated as part of this guide update. The local database connection closed during registration inspection, so no app registration records were changed.

Each organization’s terms now link to **How messaging works** at `/<organization-slug>/messaging`. The guide is also in policy navigation and published SMS addenda. Known website tenants receive complete branded HTML that works without JavaScript or sign-in; new organizations use their public agency identity through the app route. Clinical guidance applies when the care messaging service is enabled; coaching and platform pages do not represent those businesses as treating practices.

- ITSCO: https://www.itsco.health/itsco/messaging
- Next Level Up: https://nextleveluplcc.com/nlu/messaging
- Inner Strength: https://theinnerstrengthinstitute.com/tisi/messaging

The guide explains shared inboxes, assigned providers, sender verification, after-hours SUPPORT, response expectations, reminder replies, staff alerts and optional voting, privacy, opt-outs, and 988/911 guidance. It does not enroll recipients or promise activation of phone forwarding, voice recording, or transcription.

## Phone setup: prepare now, keep Grasshopper until voice testing passes

The phone workflow editor is under **Settings → Texting Numbers → Phone setup**.
This release saves and simulates a workflow; it does **not** activate Vonage Voice,
port 719-657-7444, forward Grasshopper calls, place calls, or record callers.
The intended main number is a planning field, separate from the public agency
contact and the shared care SMS line. A new SMS campaign is not created by it.

### 1. Pick the organization

Select ITSCO before opening Phone setup. Only a current administrator of that
organization (or a current super administrator) can read or save its workflow.
Private forwarding destinations are encrypted in `agency_phone_workflows`, not
stored in public branding flags. Migration: `1553_agency_phone_workflows.sql`.

### Keep the main line, care line and notification line separate

Use **three distinct phone numbers** for ITSCO, following the campaign mapping above:

| Line | SMS purpose in Texting Numbers | Intended handling |
| --- | --- | --- |
| Public main number | Public main line (organization calls/texts), `tenant_contact` | People contacting ITSCO reach support for general questions, scheduling, and billing. Texts enter agency support review. Calls will use the 0–9 menu when voice is connected. |
| Shared provider/client care number | Provider/client care line (inbox), `clinical_care` | Select this under Shared provider/client care number. Client assignments determine the care team; unassigned and unfamiliar senders go to support review. Providers can share this line. |
| App notifications and polling | Notification / reminders, `notification` | Separate campaign 2 number for app alerts and staff polling. Recipient choices and the registered purpose control delivery. |

“Contact staff” (`provider_contact`) is not the purpose for client care conversations.
The setup screen shows the current saved public SMS numbers and selected shared
care number separately. Saving a phone plan does not buy a number, port a number,
change its SMS campaign, or publish it. It rejects using an active provider/care
number as the planned public main number. Keep 719-657-7444 on Grasshopper until
live voice tests pass and an administrator chooses the port date or a replacement.
See the dated provisioning status at the top of this guide for the newly purchased 719 number.

### 2. Enter the intended main number and hours

Use 719-657-7444 if that is the Grasshopper number you choose to move later.
Choose the business time zone, opening/closing times, and after-hours destination.
The initial hours are examples (Monday–Friday, 9–5); review before saving.
Saving this number does not change your cards, carrier, or inbound calls.

#### Preview the short receptionist greeting

Under **Phone setup → Short receptionist greeting**, select a caller scenario and
request, then choose **Preview receptionist**. This preview uses fictional
scenarios; it does not look up callers, change appointments, or enable AI calling.

| Caller scenario | Opening choices |
| --- | --- |
| Unknown or withheld number | Support, scheduling, billing. Do not lead with appointment cancellation. |
| Recognized number, no upcoming appointments | Support, scheduling, billing. |
| Recognized number with upcoming appointments | Support, cancel or reschedule an appointment, billing. |
| Shared/ambiguous number or unavailable lookup | General support, scheduling, billing greeting. |

All scenarios end with: **“Say support or press zero at any time. If no one is
available, you can leave a message.”** Zero must remain available throughout the
future live assistant and verification steps, with coverage determined by saved
office hours and the after-hours support/voicemail choice. Do not promise 24/7
staffing. The saved opening greeting supplies the agency's name.

Before connecting this to live voice, implement caller lookup scoped to the agency
owning the called main number. Upcoming appointments must come from the current
schedule, excluding cancelled and completed appointments; lookup failure must
fall back to the general greeting. Caller ID is only a menu hint, never identity
verification. Do not announce names, providers, dates, balances, appointment
counts, or that an appointment was found before verifying identity and authority.

Unknown callers may still request cancellation or rescheduling. Verify them or
transfer to staff without confirming whether an account exists. After verification,
offer only appointments they are authorized to manage; if several exist, ask which
one. Require explicit confirmation and recheck the appointment before changing it.
Do not claim success until the change is saved; rescheduling must preserve the
original booking if saving the replacement fails. For school sessions, route absence
reports through the school appointment workflow rather than assuming an office visit.
Until these actions are implemented, staff handles requests and the assistant must
say the appointment has not been changed. Billing requests route to billing support
and unresolved requests require a billing-tagged follow-up ticket.

### 3. Configure keypad choices

| Key | Suggested starting purpose | Setup |
| --- | --- | --- |
| 0 | Support | Always enabled; enter the support team's destinations. |
| 1 | Scheduling | Enter scheduling staff destinations. |
| 2 | Billing | Enter billing staff destinations. This routes a call; it does not enable payment collection. |
| 3 | Provider assistance | Enter staff who can connect the caller to the correct provider. No automatic provider lookup is active. |
| 4–9 | Optional departments or programs | Enable only needed choices and give each a clear label. |

Set **Follow-up ticket category** to Billing for billing options, or General support
for other options. The preview preserves this category if a call falls back to
support; answering a call does not resolve an outstanding request.

Each choice accepts up to five US/Canadian destination numbers. **One at a time**
rings the displayed order; move a destination earlier with the arrow. **All at
once** describes simultaneous ringing. Set 10–45 seconds per destination or group.
Unanswered options can try support or go directly to support voicemail. Support
itself ends in voicemail; it cannot loop to itself. The public main number cannot
be its own forwarding destination. Numbers are configured here only; no test
call is placed by saving.

### 4. Choose music and the final voicemail greeting

Choose an existing focus-music track and use the authenticated browser preview.
The Vonage media delivery integration is still required; do not enter an
app-login-protected music URL as a carrier media URL. Write the support greeting
that should play if nobody accepts. Capturing and securely storing actual
voicemails is not activated by this configuration screen.

Both lines require **voicemail audio plus a transcript** in the completed voice
workflow. Keep the transcript with the voicemail and link the appropriate follow-up
ticket; preserve Billing classification when the caller selected Billing. A failed
or unavailable transcript must leave the audio and callback task accessible. Show
transcripts as machine generated and allow staff to check unclear words against the
audio. Link a client only after identity is established, not from caller ID alone.

The preview includes a recording/transcription notice for the caller. Notifications
must be generic (for example, “New voicemail — open the app”), without transcript
content, balances, or clinical details. Audio and transcripts require authenticated,
agency-scoped access, encryption, and healthcare service/BAA configuration before
patient use. Voicemail recording does not enable recording of answered calls.

**Current limitation:** the existing transcription service is a placeholder; no
live voicemail ingestion or automatic transcripts are operating. The setup now
states this requirement explicitly, rather than displaying an enabled transcription
switch. Complete authenticated carrier callbacks, recording ingestion, transcription
retrieval, secure storage, and failure handling before marking it connected.
Vonage supports recorded-call transcription: [recording and transcription guide](https://developer.vonage.com/en/voice/voice-api/concepts/recording).


### 5. Preview each path

Select a digit and an open/closed/current-hours scenario, then choose **Preview
without calling**. Also try No input and Invalid input; both fall back to support.
The preview shows the no-answer path. Once a staff member accepts a future live
call, later destinations must stop ringing. The specified acceptance behavior is
“press 1 to accept,” preventing a personal voicemail from claiming the call.
That behavior still needs a real Voice implementation and race-condition tests.

### Log current calls as tickets

In **Support Hub → Support review and Spam → Log a phone follow-up**, choose
Billing or General support, select the outcome, and record the necessary callback
details. This works for current Grasshopper calls. It creates an open Ticket Desk
ticket with source Phone. Billing requests appear under Billing; active agency
billing staff and administrators receive an in-app notification (except the
creator). Staff claim or assign the ticket and close it when the request is resolved.
No automatic named assignee is selected.

Notes, caller name, and callback number use the existing encrypted ticket body;
notifications contain no caller details. Retrying a submission reuses the same
request ID, preventing duplicate tickets and notifications. No client is linked
from caller ID alone. Migration: `1554_phone_followup_tickets.sql`.

This is manual logging. Live missed-call and voicemail ingestion still need the
Voice integration before automatic phone tickets can be created.

### 6. Save phone setup

Saves use an expected revision: two administrators cannot silently overwrite each
other. A conflict asks you to reload the saved setup. Preparation mode remains
visible even when every field is complete. Completing the form is not a live
carrier readiness check.

### 7. Providers prepare personal greetings

In the phone/message workspace, open **Communication Settings → My Voicemail
Greetings**. Providers can set their forwarding destination and normal,
after-hours, and vacation greeting text, with browser speech previews. Recorded
greeting uploads are not yet supported. Enabling voicemail is a saved preference;
call capture is still inactive. Staff can clear their forwarding number.

### 8. Complete and test live voice before changing Grasshopper

Use a separate, voice-capable test number. Remaining integration work includes:
Vonage application credentials and signed callbacks; tenant-scoped call state;
verified destinations and caller ID; simultaneous call cancellation/first staff
acceptance; sequential fallback; schedule/absence handling; authorized media
streaming; voicemail ingestion/encryption/access; and reliable per-leg call logs.
Test busy/unanswered/failed calls, personal voicemail interception, after hours,
provider departure, callbacks, and support coverage. Carrier minutes and AI usage
must be metered separately; app payment collection is not enabled by phone setup.
Confirm healthcare configuration and applicable BAA coverage before patient calls.
Do not port or enable recording until the appropriate setup and tests are done.

### 9. Consider conversational AI as a later receptionist option

An initial AI receptionist could say, “I'm ITSCO's automated assistant. Are you
calling about scheduling, billing, or reaching someone?” It would identify the
administrative request and offer a human transfer. Keep the keypad and 0-for-support
fallback. Identity verification is needed before discussing balances or private
appointments; do not collect card details in an ordinary recorded conversation.
The current editor does not install an AI model or enable automatic EHR changes.

### 10. Schedule the main-number transition only after acceptance testing

Keep Grasshopper active until the replacement has passed live tests and the
administrator chooses a port date. Saving or deploying this editor never starts
that port. Existing approved SMS campaigns stay unchanged.

---

# Vonage Communication System Implementation (PT Platform)

> Current registration, signed consent, deployment blockers and proof artifacts: [ITSCO SMS audit](docs/VONAGE_10DLC_ITSCO_AUDIT.md). The shared transport now requires approved program configuration and purpose-specific permission; older opt-in flags alone do not enable sends.


## ITSCO shared care line and separate public main number

- Select the existing **clinical_care** number in Texting Numbers → Agency SMS Settings → **Shared provider/client care number**. This is an agency line, not the personal property of any pool member.
- A recognized client with an active provider assignment routes to that care team. Unassigned clients and other known contacts go to support. Unfamiliar or shared/ambiguous phone numbers go to support review for identification; unfamiliar does not mean spam.
- Individual number assignments do not override client assignments on the shared line. One provider leaving does not disable the shared line for everyone else. If a client loses their active care assignment, support handles their messages until reassignment.
- Default outbound client texting uses the selected shared care line. Consent, STOP, approved campaign purpose and carrier linkage checks still apply.
- Keep a **separate main/public number** for inquiries and the main office contact on provider cards. Use the `tenant_contact` number purpose when adding that number to the app. Purchasing, porting or configuring the public main number is a separate operational step.
- Provider cards omit the internal work/texting line even after SMS or voice is enabled; they retain the agency/main-office contact, provider identity and email. Staff affiliation and private forwarding details remain inside the app.

## Shared provider conversations and out-of-office choices — October 6, 2026

- All active providers assigned to the client share the client SMS history and replies. An unrelated provider cannot initiate client texts through either manual send path, including a linked contact alias. Current agency support/admin staff retain their authorized coverage access.
- A manually authored text starts with the sender's first name from their staff profile, for example: `Michael: Sounds good, see you at 3pm.` The registered business and opt-out footer follow: `ITSCO. Reply STOP to opt out.` Automated reminders retain their existing brand-first format. Enrollment, STOP and carrier approval checks still apply.
- Check each assigned provider's availability independently. Available providers are notified according to their preferences. If all assigned providers are unavailable, save the message for their return and offer: “Reply SUPPORT to request urgent support review. Otherwise, your message will wait in their inbox until they return. Support response times depend on staff availability.”
- The offer and acceptance acknowledgment include: “This texting service is not for crises or emergencies. For suicide or emotional distress, call or text 988. For immediate danger or a medical emergency, call 911.” Urgent means operational priority, not emergency monitoring or a guaranteed response time.
- No response means no automatic support forwarding, safety-net alert, personal-phone mirror or overdue support escalation for that held message. It remains in the app for assigned providers; authorized administrative access is unchanged.
- Only **SUPPORT**, matched to a sent offer on the same agency/number/client/recipient, creates a **high-priority** ticket. Store the acceptance and message reference. Carrier retries do not create another ticket. STOP/HELP run first; appointment and polling Y/N/R remain independent. Offers expire after 48 hours; repeated messages within four hours do not repeat an unanswered offer.
- Alert available agency support/clinical practice assistants immediately with an **urgent in-app notification**, plus browser push and generic SMS where staff enabled those channels. If no support staff are available, use available agency admins. If nobody is available, leave an in-app notice for admins (or support if no admins) and keep checking availability. This uses configured work schedules and vacation status, not a newly implemented on-call roster.
- SMS alert: “Urgent: a support request needs your attention. Sign in to claim it and reply securely: [agency portal URL]”. No client identity, initials, message content or sign-in token is sent. The workforce sender still requires approval, opted-in staff choices and valid delivery configuration. In-app tracking does not depend on SMS approval.
- A worker checks pending requests every minute. Remind available staff about unclaimed requests every 15 minutes; failed delivery is retried on that cadence. A notification read/dismissal or SMS delivery receipt does **not** claim or close the ticket. The ticket remains in the queue until a human handles it. Claiming it stops unclaimed reminders; the claimant must reply through the secure SMS inbox and explicitly close the ticket when handled.

### Staff setup and launch check

1. Configure support/admin membership and actual work availability, timezone and vacation status for this agency. Ensure someone is responsible for checking the queue during support hours.
2. Staff who want phone alerts choose **Message-waiting text alerts** in their communication preferences; browser push is separately optional. Do not infer consent from employment or override STOP.
3. Support opens the urgent notification → **Open ticket** → **Claim**, reviews the linked client's SMS conversation in the app, responds there, and closes the ticket when handled. High-priority tickets appear before lower-priority tickets in the open queue. A ticket comment alone is not an outbound text to the client.
4. After Vonage healthcare provisioning and number/campaign linkage are confirmed, run a consented pilot: all providers away → offer → SUPPORT → one high-priority ticket and urgent support alert → claim → secure reply → close. Confirm no alert without SUPPORT, Y still confirms appointments, away staff are not texted, and STOP prevents subsequent SMS. Check the no-available-staff and carrier-failure cases too.

- The shared care number can support voice extensions once voice is implemented. SMS does not use extensions. This release does not activate the number, change any carrier campaign, or enable voice; HIPAA provisioning and a consenting end-to-end pilot remain required.

## Number ownership, support coverage and Spam — October 6, 2026

This is a new messaging launch. No notification traffic was assumed or sent during this change. The local Cloud SQL proxy was restarted on `127.0.0.1:3307`, and a real read-only query to `onboarding_stage` succeeded. ITSCO has one active `clinical_care` number recorded locally; that is not proof of live carrier linkage.

1. **Choose number ownership.** Start with an agency care number and assignment-based routing; dedicated provider numbers are optional. Texting Numbers supports search/purchase and assignment. A new provider number still needs actual Vonage campaign linkage and app approval configuration; buying or assigning it alone does not authorize traffic. Do not create a different campaign merely because another ITSCO provider needs a number for the same approved program.
2. **Set work availability and absence.** Existing work schedules (including timezone), availability overrides, vacation mode and vacation/away schedule events determine inbound SMS coverage. After-hours/away messages remain recorded for all assigned providers. If all are unavailable, support forwarding requires the client to reply SUPPORT to the offer described above. Routine inbound texts no longer use an urgent flag that bypasses quiet hours. This is work-hours/away coverage, not a guarantee of moment-by-moment free appointment capacity. Voice calls are not connected to this policy yet.
3. **Retain departed providers' numbers.** Incoming texts to a number whose assigned users are no longer active go to support review. The number is retained indefinitely until an administrator explicitly reassigns or releases it. Inactive/terminated staff cannot resolve an outbound sender. No automatic phone-number cancellation or personal-phone forwarding occurs. Existing account offboarding/access controls still apply separately.
4. **Use Support review and Spam.** Open Communications Center → Support Hub, or Texting Numbers. Unknown senders, ambiguous/shared identities, main-number inquiries and messages not assigned to the number's provider are held for review without provider alerts. Reviewers verify the sender and update the correct contact/client assignment; doing so does not create consent. Shared guardian numbers are not silently attached to an arbitrary child's chart.
5. **Block unwanted advertising.** Block sender and move to Spam suppresses future provider delivery from that number across the agency. STOP/HELP handling remains ahead of screening. Narrow, obvious unsolicited SEO/lead-generation offers from unknown senders go to Spam automatically. This is not a guarantee of detecting all advertisements or spoofed caller IDs. Unknown alone is never a reason to delete a potential family's message. Spam is encrypted, reviewable and reversible; Unblock returns it to review.
6. **Review overdue items.** The existing support escalation scheduler runs about every ten minutes. Unanswered texts (labelled unread when unread) enter the support queue after the configured `smsSupportEscalationHours` (default 12 elapsed hours, configurable in Agency SMS Settings). Messages held for provider return are excluded from automatic escalation; support sees them as an escalated request only when the client accepts. Automated acknowledgements do not count as a staff response. The latest unanswered message per thread is queued once. Stored unheard voicemail records can also enter the queue. Support reviews and marks items handled; no private body/audio is forwarded to a personal phone.
7. **Finish voice separately.** The voice adapter and voicemail recording/download remain unimplemented. Inbound calls, call forwarding, click-to-call bridging, new voicemail capture, recording, transcription and voice spam screening are not enabled by this change. Complete the Vonage Voice integration, healthcare account/BAA checks, participant disclosure/recording choices and a consenting pilot before claiming those features work. Do not paste raw clinical recordings into external transcription tools.
8. **Deploy and verify.** Apply `npm run migrate -- --migration=1546` from backend, deploy, and test unknown, blocked, shared-family, after-hours, vacation and departed-provider cases with consenting test participants. Review storage fails closed if encryption or its tables are unavailable, allowing the webhook to retry. Support/admin access is explicitly checked against current agency membership, even when legacy middleware permits broader admin access.

References: [Vonage number linking](https://api.support.vonage.com/hc/en-us/articles/4407235273876-10-DLC-Number-linking-guide). The earlier voice/AI feature descriptions further below describe legacy or planned capabilities; the readiness statement above controls the current launch.

## School and family reminder rollout — October 6, 2026

1. **Confirm the actual service site.** The selected school/service location is distinct from the billing office. Office-booking synchronization preserves `service_location_id`; existing reminders also resolve the linked office event or agency-scoped clinical encounter. A billing office alone is displayed as “Service location needs review.” A child’s school enrollment alone does not make every appointment a school visit.
2. **Collect a real choice in enrollment.** Client enrollment includes the communication step even when an older packet omitted it. Standalone ROI, disclosure and job-application links are not converted into enrollment packets. The recipient chooses Yes or No, signs their choices, and supplies the phone they control when requesting texts. All-No completes the step without a phone. The saved intake includes the practice name, disclosure/version/hash, signature, phone, policy links and server timestamp. Printed intake records include this evidence. Staff voting is not part of a client’s enrollment.
3. **Review existing evidence.** In Texting Numbers → Campaign registration and consent → **Enrollment reminder consent audit**, review the paginated client list. “Legacy Yes” is not an activation count; attendance Y, an imported phone number, treatment consent or school ROI does not establish a text subscription. Current signed reminder choices can prefill **Record a recipient’s documented consent** for the selected number; verify recipient authority and the disclosure before activating. For insufficient older evidence, issue a current signing link by email or in person. Do not text an unconsented recipient to request consent.
4. **Link the ITSCO sender.** In Vonage, link the chosen ITSCO number to the approved ITSCO Service Communications campaign and verify active linkage. In the app, add/select that number under ITSCO, record the actual brand/campaign IDs and approved `reminders` purpose (and `care` for two-way replies if approved), and record verified approval/linkage. Configure the inbound webhook and the registered owner of STOP/HELP. The app’s checkbox does not link a number in Vonage. A workforce/polling sender is not a fallback for family reminders.
5. **Enable the desired SMS rules.** Tenant session notification settings must enable SMS and the intended reminder times. Recipient No choices and STOP take precedence over mandatory reminder rules. Portal guardians can change their own reminder channels, additional reminders and provider-update preferences. Each other recipient needs their own permission; listing another adult in an intake does not enroll that adult.
6. **Run a small consented test.** Check a school booking that bills through the office. Expect the school in the appointment view and an informational message: “A school visit is scheduled for [local date/time]. No confirmation is needed. If your child will be absent or plans change, please let our team know. Continue to report school absences to the school as usual.” The SMS transport adds the practice name and STOP instructions. Verify office visits retain their confirmation flow, school Y/N/R does not cancel or charge anyone, an absence message reaches staff, and STOP plus portal opt-out suppress later sends. Already queued school confirmation text is replaced at delivery.
7. **Release gradually after those checks.** No reply to a school reminder is not a cancellation, no-show or consent to texting. School reply reviews do not automatically apply fees. Keep details minimal and use authenticated portal pages for private information. A reminder is not permission to disclose clinical information to school staff. Reporting an absence to the practice does not replace the school’s attendance process.

At implementation time, the local database at `127.0.0.1:3307` refused connections, so no live family consent totals were verified. No number was purchased/linked and no test or bulk SMS was sent as part of this change. Carrier configuration and a consented delivery test remain operational steps.

References: [Vonage campaign requirements](https://api.support.vonage.com/hc/en-us/articles/12132309081500-10DLC-Campaign-requirements) and [HHS reminder/confidential-communication guidance](https://www.hhs.gov/hipaa/for-professionals/faq/may-health-care-providers-leave-messages/index.html).


This document summarizes the complete migration from Twilio to Vonage, the rebranding of SSC to SSTC, and the implementation of the "Stellar" communication suite.

## 1. Core Architecture
The system handles SMS, Voice (NCCO), and Video (OpenTok) through a unified backend routing layer.

- **Primary Brand**: PT Platform
- **Tenant Support**: Multi-tenant white-labeling is supported via `BrandingProvider.vue` and `Agency` feature flags.
- **Provider-Client Linking**: One number can route to multiple providers based on the client relationship.

## 2. SMS & Messaging Features

### Messages surface (staff)
- Primary UI: **Messages** at `/:slug/messages` and `/messages` — lands on the **employee Messages Dashboard**, then inbox via `?view=workspace`.
- Role-gated inbox tabs: team chat, **SMS** (clinical inbox, page layout). Tickets are **not** in Messages (see Communications Center / `/tickets` for CPA).
- **Communications Center** (`/admin/communications`) for admin/support/superadmin: Support Hub + ops Messages Dashboard modes.
- Legacy SMS hub URL `/admin/communications/sms` still works; Engagement Feed stays under `/admin/communications/feed` (nested under the Center). See `docs/MESSAGES_AND_COMMUNICATIONS_CENTER.md`.

### Number purposes (`twilio_numbers.number_purpose`)

| Purpose | Owner | Role |
|---------|--------|------|
| `platform_contact` | Platform (`agency_id` NULL) | Contact Plot Twist HQ |
| `tenant_contact` | Agency | Public “call/text the org” number (may differ from care DID) |
| `clinical_care` | Agency | Care inbox + CPA ownership |
| `notification` | Agency | Reminders, appointment confirmations, system SMS (legacy `appointment_verify` maps here) |
| `provider_contact` | Agency (optional assign to user) | Contacting providers (staff-facing), not clinical client inbox |

Directory phone on `agencies.phone_number` remains a fallback listing; Vonage DIDs live only in `twilio_numbers`.

### Care routing (agency numbers + CPA)
- Prefer **agency `clinical_care` numbers** with **assignment-based ownership** via `client_provider_assignments` (primary CPA = thread owner; co-providers eligible).
- Thread metadata in `sms_care_threads`: `owner_user_id`, `care_state` (`observing` | `under_care` | `escalated` | `closed`), `support_access` (`none` | `observe` | `respond`), optional `support_ticket_id`.
- Inbox visibility is caseload/care-thread scoped for providers (not “everyone on the number pool”).
- `notification`, `tenant_contact`, `platform_contact`, and `provider_contact` **never** enter the clinical SMS inbox.
- Optional later: personal Vonage number per high-volume provider.

### Encrypted SMS profile audit (HIPAA)
- Table `sms_profile_audit` stores AES-GCM ciphertext (same key stack as support tickets / chat encryption).
- Written whenever inbound/outbound SMS matches a **client** `contact_phone` or a **guardian** `users.phone_number` / `personal_phone` / `work_phone`, regardless of number purpose.
- Dual-write: clinical ops still use `message_logs` (plaintext for now); audit table is the compliance ledger.
- APIs (decrypt only for authorized callers; never log plaintext):
  - Staff: `GET /api/clients/:id/sms-audit`
  - Guardian: `GET /api/guardian-portal/sms-audit`
- UI: Client Communications **SMS audit** section; guardian portal **Text history** panel.

### Unified Messaging Hub
- Supports both **Clients** and **Agency Contacts**.
- Contacts can be converted to `Client` or `Guardian` accounts with one click.
- **MMS Support**: Outbound images, PDFs, and Word documents are supported via the Vonage Messages API (wiring still maturing).

### Auto-Reply & Escalation Rules
- **Unanswered Message Rule**: Configurable per-agency (e.g., 20 minutes). If a provider doesn't reply, an auto-reply offers to forward to support.
- **Out-of-office support choice**: A client replies **SUPPORT** to a matching sent offer → open one high-priority support ticket and set the care thread to `escalated` with support `respond`. No response leaves the message waiting for the assigned providers. Y/N/R replies are not support acceptance. Available support staff receive urgent app alerts, with optional generic SMS/push; unclaimed requests are reminded every 15 minutes.
- Manual forward from the SMS thread also creates/claims a ticket and escalates care state.
- **Vacation Mode**: Check all assigned providers. The out-of-office offer is sent only when none is available; one provider being away does not divert a second available provider’s conversation.
- **Return-from-OOO Digest**: Providers receive an SMS summary of missed messages when their vacation/OOO period ends.

### AI Suite (Gemini)
- **Smart Replies**: 3 AI-suggested responses appear in the thread for quick provider replies.
- **Voicemail Transcription**: Incoming voicemails are automatically transcribed and sent as notifications.

## 3. Voice & IVR (NCCO)
The system uses Vonage NCCO for dynamic call flow:
- **Extension Routing**: Main number prompts for a 3-digit extension.
- **Personal Routing**: If a personal number is called, it rings the provider's forwarding phone.
- **Smart Voicemail**: Plays different greetings for Working Hours, Out of Office, and Vacation.

## 4. UI/UX Design ("Stellar")
- **Glass Morphism**: Used in the Communications Hub sidebar and thread headers.
- **Modern Animations**: Typing indicators, floating empty states, and smooth transitions.
- **Interactive Previews**: 
  - Agency admins can preview the SMS auto-reply mockup in settings.
  - Providers can preview their TTS (Text-to-Speech) voicemail greetings.

## 5. Deployment Configuration

### Environment Variables (.env)
```bash
# Vonage Credentials
VONAGE_API_KEY=xxx
VONAGE_API_SECRET=xxx
VONAGE_APPLICATION_ID=xxx
VONAGE_PRIVATE_KEY_PATH=./secrets/private.key
VONAGE_SIGNATURE_SECRET=xxx

# Webhooks
VONAGE_SMS_WEBHOOK_URL=https://plottwisthq.com/api/vonage/inbound
VONAGE_VOICE_ANSWER_URL=https://plottwisthq.com/api/voice-video/voice/answer
VONAGE_VOICE_EVENT_URL=https://plottwisthq.com/api/voice-video/voice/event
```

### Vonage Application Webhooks
- **Voice Answer**: `GET https://plottwisthq.com/api/voice-video/voice/answer`
- **Voice Event**: `POST https://plottwisthq.com/api/voice-video/voice/event`
- **RTC Event**: `POST https://plottwisthq.com/api/voice-video/voice/event`
- **Captions (Video)**: `POST https://plottwisthq.com/api/voice-video/voice/transcription`

## 6. 10DLC registration

Start with the [current campaign walkthrough](docs/VONAGE_10DLC_CAMPAIGN_WALKTHROUGH.md).
Each campaign has dashboard steps 1–6 and post-approval step 7. Next Level Up comes first,
followed by ITSCO, optional marketing, and AuricWell's own account-access program.

Practice employee video/session reminders and client session-login links belong under that
practice's Service Communications campaign when disclosed and consented. AuricWell hosting
does not change the sender. Billing is an optional expansion requiring matching consent and
implementation before use. See the walkthrough's dated proof/readiness findings.

- [SMS audit and implementation history](docs/VONAGE_10DLC_ITSCO_AUDIT.md)
- [Historical provider-number engineering plan](docs/VONAGE_10DLC_PROVIDER_NUMBER_PLAN.md) — old campaign copy is superseded.

---
*Registration documentation updated: 2026-10-05. Other implementation sections retain their own validation scope.*

## Provider choices and phone workflow — October 6, 2026

Provider Update → Notification Preferences, Fall Update → Text choices, onboarding, and My Preferences share the same signed, organization-specific phone choices. Each category starts at No: staff reminders/announcements; generic message-waiting alerts; optional polls/voting. All No is a valid completed review. Staff can change choices in My Preferences without an administrator opting in on their behalf. Signatures, the displayed notice and timestamp are encrypted and appended to security evidence; ordinary preference edits cannot replace them. A new phone or changed program requires another review. Campaign approval, number linking, recipient permission and STOP remain independent delivery checks. Choices saved before a usable sender exists show pending; staff review/save again once setup is ready. No campaign registration is created or altered by this form.

Client SMS to the assigned business number remains in the app. Declining personal-phone alerts does not turn off that inbox or change a client's consent. Message-waiting texts contain generic wording and a normal authenticated portal link, not a client's initials, message body or reusable login token. Poll results are visible in the app after closing; a results SMS remains a separate per-poll choice. Changing an SMS preference never deletes communication history.

**Current implementation limits:** raw client-message forwarding is disabled. There is no active personal-phone reply relay. Voice calling and voicemail transcription remain unimplemented provider stubs. Recording cannot be enabled in call settings. The current release does not place calls, record participants, provision numbers, move numbers between campaigns, send enrollment messages on behalf of staff without their signed selection, or claim that existing SMS/voice account settings establish HIPAA compliance.

### Intended relay workflow (not launched)

Providers may share the agency care number, with client assignment determining shared SMS visibility. Dedicated provider numbers are optional. Extensions route voice; SMS uses the underlying business number. Never expose the provider's personal number to the client. A dedicated relay sender/conversation identity must not share an ambiguous reply route with attendance votes, appointment Y/N/R replies or client threads.

Require a separate opt-in for full message forwarding, independently of generic alerts. Only enable it after the practice verifies the relevant Vonage account/subaccount, BAA, number configuration, device safeguards, recording/transcription subprocessors where applicable, and permitted campaign content. Initials and message content can remain PHI; a staff signature alone does not authorize every disclosure.

Allow one active relayed client conversation per provider phone across agencies, enforced by a database uniqueness constraint and transaction/lock. Save incoming messages to the correct app thread immediately. Queue subsequent conversations without forwarding their content until the current one closes. Require explicit provider acceptance with a session identifier; send opening and closing notices. Bind every reply to that session and authorized client. Plain SMS has no reliable native thread binding: after switching clients, require a reply/session code or explicit re-acceptance so delayed replies cannot be delivered to the next client. STOP/HELP always take precedence. Refuse and retain ambiguous or stale replies; never guess a client from message text. Provider opt-out, loss of assignment, a changed phone and session expiry suspend forwarding immediately; queued items remain visible in the app.

Record the open/accepted/closed timestamps, actors, delivery states, every inbound/outbound message and attachments where supported. On close, attach a versioned conversation artifact to the correct client chart, with references to original messages, access controls, retention/legal-hold handling and audited access. Preserve amendments and late arrivals separately. Apply the same chart-linked close/archive contract to email threads; email chart linkage must be verified rather than inferred from matching names or addresses. This automatic close-to-chart workflow is not implemented by the current consent release.

### Intended calls, voicemail and recordings (not launched)

Click Call in an authorized client record, select the authorized contact, ring the provider's verified private phone, and require the provider to accept before dialing the client. This prevents a personal voicemail greeting from connecting to the client. Present the business number as caller ID. Inbound business calls can ring the provider or an extension; unanswered calls go to the app's voicemail, not the provider's personal voicemail. Log call attempts, answered/ended times, participants, direction, business number, actor, disposition and duration against the client ID. Do not associate an unidentified caller with a chart based solely on a shared household number.

Default recording and transcription to off. Before recording any conversation, give a clear notice to every participant and collect the configured affirmative acceptance; preserve evidence with the call log. A generic “may be recorded” sentence does not implement consent handling. Offer a path to continue without recording or transcription. Consent withdrawal stops capture. Announce that voicemail will be recorded before the caller leaves it. Store audio and transcripts as encrypted, access-controlled chart artifacts, with authenticated streaming/download, retention, legal holds and access auditing. Treat transcripts as machine-generated until reviewed; do not automatically promote them into signed clinical notes. Recording/transcription should remain unavailable unless the specific services and subprocessors are covered by the organization's verified healthcare arrangement.

Sources checked: [HHS mobile/cloud safeguards and BAAs](https://www.hhs.gov/hipaa/for-professionals/faq/do-the-hipaa-rules-allow-health-care-providers-to-use-mobile-devices-to-access-ephi-in-a-cloud/index.html), [HHS audio-only communications guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/hipaa-audio-telehealth/index.html), [Vonage number-linking and HIPAA configuration](https://api.support.vonage.com/hc/en-us/articles/4407235273876-10-DLC-Number-linking-guide), [Vonage recording and transcription API](https://developer.vonage.com/en/voice/voice-api/concepts/recording).

## Client Exchange match alerts (October 2026)

The Provider Update and My Dashboard communication choices share `exchangeMatches` SMS consent and a separate `exchangeEmail` choice. Both start off; the app inbox is automatic. Only Open providers matching the requested format receive new-listing alerts. Unknown clinical preferences may match, but known mismatches and explicit insurance exclusions do not. These alerts do not assign a client or notify existing listings retroactively.

SMS uses the approved workforce campaign, existing enrollment/STOP checks, channel master switches, and contact hours. The default text is a generic new-match alert with an authenticated Client Exchange link. It contains no clinical summary. `CLIENT_EXCHANGE_CLINICAL_SMS_AGENCY_IDS` is an empty-by-default comma-separated agency allowlist for brief age, presenting-concern/diagnosis, and therapy-type summaries. Enable an agency only after verifying its healthcare messaging arrangement, delivery protections and recipient access; signing a BAA alone does not make ordinary SMS secure. No agency is enabled by this change. Names, initials and dates of birth are omitted from both email and SMS summaries; omission alone is not a claim of HIPAA de-identification.

Emails use the agency Notifications identity, its no-reply identity (or `no-reply@` on the sender domain), and the staff work/account email, with the concise summary and authenticated app link. Test using mocks or read-only previews; do not send sample clinical referrals to live recipients.
