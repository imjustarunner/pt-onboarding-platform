# Vonage 10DLC — campaign-by-campaign dashboard walkthrough

> **October 7 compliance check:** Read the [current carrier/account audit](VONAGE_10DLC_NONCOMPLIANCE_AUDIT.md) before launch. ITSCO service, ITSCO staff/voting and NextLevelUp service are approved but have no linked numbers. Inner Strength is still pending. The audit includes the ITSCO HELP/opt-in field corrections and administrator-reviewed staff activation steps. Do not submit duplicate campaigns for these approved programs.

> **School and family enrollment (October 6):** Follow the [school/family rollout steps](../VONAGE_SMS_IMPLEMENTATION.md#school-and-family-reminder-rollout--october-6-2026) for actual service-location handling, signed choices, the legacy-consent audit, number linkage and school absence notices. These remain reminder messages under the practice’s approved service purposes; do not move them to the staff polling campaign. Validate actual registered coverage before sending.


> **Internal voting (October 6):** Use the [ITSCO internal voting packet](VONAGE_10DLC_ITSCO_INTERNAL_VOTING.md) for a new, separate Low Volume Mixed campaign with Polling and Voting plus Account Notification, covering staff announcements, supervisor/team messages and optional final-results texts. Keep the approved service campaign unchanged. Every agency can generate its own packet and publish branded SMS review pages from Texting Numbers → Campaign registration and consent → Generate a new campaign and branded SMS pages after this feature is deployed.


Updated October 5, 2026. **Start with Next Level Up Service Communications below.**
This is the current registration worksheet. It replaces the old copy/paste field sheets
in the ITSCO audit and the older four-campaign provider-number plan. Historical audit
findings remain in those documents; do not combine their old field text with this guide.

This guide accompanies the deployed consent and policy implementation. Deployment status
is tracked separately; editing this file does not change carrier registrations. External vetting is user-reported for ITSCO, Next Level Up, and AuricWell.
Campaign approval, number linking, and recipient enrollment are separate steps.

## October 5 implementation follow-up — current status

The earlier 401 finding below explains the original failure. The fix is deployed:
`/sms-consent/example/:brandSlug` and its anonymous API support ITSCO, NLU, Inner Strength,
and AuricWell with strict brand/program selection. Anonymous browser checks passed for
NLU client/staff, Inner Strength client, and ITSCO optional-billing examples on October 5.

The new disclosure version `2026-10-05.1` explicitly covers session/video/training notices
and adds **billing** as an independent optional client choice. The sending gate, registration
UI and subscription confirmations recognize billing. Staff receive workforce choices, not
client billing choices. Existing signed evidence is not expanded or rewritten; changed
unsigned/unreviewed requests need a fresh matching disclosure. Automated balance-change
SMS production is not added by this work; do not claim it is enabled merely because consent
and registration now support it.

The base service samples remain valid without billing. To include billing, configure the
billing purpose, obtain the appropriate new consent, verify the actual billing send workflow,
and use the billing addition. The default operations example omits billing. Append `&billing=1` to the client example
URL to show the additional independent billing choice for a registration that includes it.
Use that same URL and explicitly describe the billing choice in the submitted message flow.

Inner Strength now has [brand-registration Step 0 and campaign steps 1–7](#the-inner-strength-institute-service-communications).
SchoolCareBridge/AuricWell notice changes and the [agreement packet](legal/schoolcarebridge/README.md)
are separate from 10DLC approval. No carrier brand/campaign was submitted by these changes.

## Choose the sender before choosing the campaign

| The message is about… | Brand / campaign | Recipient permission |
| --- | --- | --- |
| Next Level Up appointments, cancellations, client session access, administrative replies | Next Level Up / Service Communications | Client or authorized guardian: reminders and/or care |
| Next Level Up employee schedules, supervision, team/video meetings and session-access reminders | Next Level Up / the same Service Communications campaign | Staff: workforce |
| ITSCO appointments, client session access, administrative replies | ITSCO / Service Communications | Client or authorized guardian: reminders and/or care |
| ITSCO employee schedules, supervision, team/video meetings and session-access reminders | ITSCO / the same Service Communications campaign | Staff: workforce |
| An assigned employee training-video notice | The employing practice / Service Communications, once the actual producer and disclosure cover it | Staff: workforce |
| A routine update to the practice's own billing account / statement | That practice / Service Communications, after the billing-consent work below | Explicit consent covering billing/account updates |
| Optional practice offers or program announcements | That practice / Program Announcements | Separate marketing consent |
| AuricWell's own platform account-access messages | AuricWell / Account Access, only if actually sent | Platform account-security consent |

**A link opening AuricWell does not change the sender.** A Next Level Up appointment or
employee meeting remains Next Level Up traffic even when AuricWell provides the software.
Explain the hosting relationship and include the actual domains in the application.
Neither an AuricWell brand nor its consent is an umbrella for independent practices.
A portal-login/session link is not automatically an OTP/2FA message.

You do not need a separate employee campaign for the scope above. Employees have their
own consent choice within their employer's service program. A campaign-wide STOP stops
all subscriptions in that campaign for that phone, across its numbers. A separate staff
campaign is an optional design change if you need a separate STOP boundary; it is not
part of this worksheet. In-app notifications and email alone do not require 10DLC.

### Reading order

1. [Next Level Up Service Communications — steps 1–7](#next-level-up-service-communications)
2. [ITSCO Service Communications — steps 1–7](#itsco-service-communications)
3. [Next Level Up Program Announcements — steps 1–7](#next-level-up-program-announcements)
4. [ITSCO Program Announcements — steps 1–7](#itsco-program-announcements)
5. [Inner Strength Service Communications](#the-inner-strength-institute-service-communications)
6. [Inner Strength Program Announcements](#the-inner-strength-institute-program-announcements)
7. [AuricWell Account Access — steps 1–7](#auricwell-account-access)
8. [Evidence and implementation status](#evidence-and-implementation-status)

Steps 1–6 match the Vonage screenshots. Step 7 is the post-approval app/number setup.
Follow only the sheet for the campaign you are creating.

### Ownership selection — applies to every sheet

Choose **My own campaign** when the Vonage registrant owns that legal business. Choose
**Reseller campaign** with the registered reseller ID when registering an independently
owned customer's business. Common app administrators or an affiliation do not prove
legal ownership. Preserve the verified legal record in Vonage; do not guess an EIN,
legal suffix, or ownership relationship from a website name.

### Current scope and consent

The branded public pages are nonsubmitting review copies of the same signed-consent disclosure.
They do not enroll visitors. Actual enrollment uses a private link, covered phone, required
Yes/No choices, electronic signature and administrative review. All choices may be No.
The operations default shows care/reminders for clients and workforce for staff. Add
`&billing=1` to a client example URL when the sender registration includes billing. Marketing
uses a separate program and number. AuricWell's example is account security only.

The disclosure version changed. Do not rewrite previously signed evidence or treat an old
reminder subscription as billing permission. Issue a fresh form if a pending request's
hash no longer matches. Confirm the exact legal entity for Inner Strength before filing
its brand; the registration guide describes both the trade-name and subsidiary cases.

## Next Level Up Service Communications

**Use this for client service texts and this practice's employee notifications.**
Status of consent proof: fixed in the October 5 implementation; deployment verification is recorded in the status section.

### Step 1 — Use case

| Field | Enter/select |
| --- | --- |
| Brand | Next Level Up |
| Use case | Mixed |
| Sub-use cases | Customer Care; Account Notification |

Use the choices offered by this externally vetted brand's qualification screen. For ITSCO,
plan around the reported 500–2,000 outbound texts on a busy day; count SMS segments and
check carrier limits against the actual vetting result. NLU volume has not been separately
confirmed. Do not assume Low Volume Mixed gives the same capacity as Mixed.

### Step 2 — Campaign details

**My own campaign / Reseller campaign:** apply the ownership rule above.

**Campaign name:**

```text
Next Level Up Service Communications
```

**Campaign description — base scope, without billing:**

```text
NEXTLEVELUP, LLC, known to recipients as Next Level Up, uses AuricWell to send nonpromotional service communications. Clients and authorized guardians who opt in receive appointment reminders, confirmations, rescheduling and cancellation notices, session-access or portal-login links, and two-way administrative support. Employees and contractors who separately opt in receive work schedule changes, supervision and team/video-session reminders, and session-access notifications. Messages may contain practice portal or meeting links and a practice callback number. Each recipient receives only the message types they accepted. Marketing and promotional offers are excluded.
```

### Step 3 — Message flow (Call to action)

On the prerequisites page, click Next. On the form, fill these fields:

| Field | Enter/select |
| --- | --- |
| Message frequency | Recurring |
| Brand name / DBA | Next Level Up — use exactly this spelling in messages |
| Consent collected | Online (website, mobile app) |
| Text-to-join | Leave unchecked for the baseline `allowRestart=false` setup |
| Live operator / Point of Sale / Other | Leave unchecked unless actually used and separately evidenced |
| Online URL | https://app.nextleveluplcc.com/sms-consent/example/nlu?program=operations&audience=client |
| Privacy Policy Link | https://nextleveluplcc.com/nlu/privacypolicy |
| Terms & Conditions Link | https://nextleveluplcc.com/nlu/terms |
| Policy compliance acknowledgment | Check only after inspecting the actual published policies |
| Add Carrier Disclaimer | Check; keep the same disclaimer on the form and in the flow |

**Online URL status:** implemented for this brand; check the release verification in the status section.

**How will you obtain consent from the subscriber?** Use this text only when the
published forms and configured activation process match it:

```text
Next Level Up provides a private online SMS consent form during onboarding or by email or in person. Clients or authorized guardians choose Yes or No separately for care-team administrative messages and appointment reminders; staff receive a separate workforce-notifications choice. No answer is preselected, and all answers may be No without affecting access to services. The signer enters the covered phone number, confirms authority, and electronically signs. An authorized administrator reviews the signed evidence before activating only accepted message types. The exact disclosure, choices, signature and timestamp are retained. Subscription confirmations name the selected purpose: care-team messages, appointment reminders, or workforce notifications. Client reminder messages may include session-access links; workforce messages may include supervision, team/video-session and schedule notices. Client review copy: https://app.nextleveluplcc.com/sms-consent/example/nlu?program=operations&audience=client Staff review copy: https://app.nextleveluplcc.com/sms-consent/example/nlu?program=operations&audience=staff These review copies do not enroll visitors. Message frequency varies. Message and data rates may apply. Text HELP for help. Text STOP to opt-out. Carriers are not liable for delayed or undelivered messages. Support: 719-377-6577. Privacy: https://nextleveluplcc.com/nlu/privacypolicy Terms: https://nextleveluplcc.com/nlu/terms.
```

A recipient-initiated question permits a bounded reply about that request; it does not
activate recurring reminders or workforce subscriptions. Y/N/R appointment replies also
do not create recurring consent. Disclose any additional enrollment mechanism if used.

### Step 4 — Content attributes

**Opt-in keyword:** leave blank for this online-only enrollment setup. Do not list Y or
YES: those are appointment replies. Configure app `allowRestart=false` for this setup.
If START/UNSTOP reactivation is enabled instead, declare it as text-to-join/re-opt-in,
add those keywords and the real reactivation response; do not claim an online-only flow.

**Opt-in Message:**

```text
Next Level Up: You subscribed to appointment reminders. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.
```

The app sends purpose-specific confirmations. Staff receive the same text with
“workforce notifications” instead of “appointment reminders”; care recipients receive
“care-team messages.” Include these variants in the message-flow explanation. Selecting
one purpose never grants the others.

**Opt-out keywords:** keep the dashboard defaults and add STOPALL and OPTOUT to match
the app. Full list: `STOP, END, QUIT, CANCEL, UNSUBSCRIBE, REVOKE, OPT OUT, STOPALL, OPTOUT`.
Exact CANCEL stops SMS. Use N for an appointment cancellation.

**Opt-out Message:**

```text
Next Level Up: You are unsubscribed and will receive no further messages from this program. Reply HELP for help.
```

**Help keywords:** `HELP, INFO`.

**Help Message:**

```text
Next Level Up: For help, contact 719-377-6577. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.
```

**Opt-Out Assist:** the baseline here uses the app's keyword handler (`keywordOwner=application`).
If you enable Vonage Opt-Out Assist, set `keywordOwner=vonage`, align response text,
and verify STOP reaches the app's suppression ledger. Use one response owner.

### Step 5 — Sample messages

Paste one message per field. These are proposed examples, not evidence that an automation
is enabled. Confirm the corresponding reminder/meeting workflow and destination before use.
Dates and times below are illustrative; never include a real client's information in the application.

**Sample 1 — appointment reminder and Y/N/R:**

```text
Next Level Up: Your appointment is Tuesday at 3:00 PM. Reply Y to confirm, N to cancel, or R to request a new time. Reply STOP to opt out.
```

**Sample 2 — client session and portal login:**

```text
Next Level Up: Your video appointment is Tuesday at 3:00 PM. Sign in at https://app.nextleveluplcc.com to access your session. Reply STOP to opt out.
```

**Sample 3 — provider schedule change:**

```text
Next Level Up: Your provider needs to reschedule your upcoming appointment. Reply R to request a new time, or reply with a question for our team. Reply STOP to opt out.
```

**Sample 4 — cancellation and callback:**

```text
Next Level Up: Your Tuesday 3:00 PM appointment has been canceled. Reply or call 719-377-6577 for help arranging another appointment. Reply STOP to opt out.
```

**Sample 5 — employee video/session notification:**

```text
Next Level Up: Your staff video session begins at 2:00 PM. Sign in at https://app.nextleveluplcc.com to open your session. Reply STOP to opt out.
```

| Checkbox | Select |
| --- | --- |
| Embedded links | Yes |
| Embedded phone number | Yes — sample 4 contains a callback number |
| Age gated | No for this described administrative program |
| Direct lending | No for this described program |

Y confirms; N attempts cancellation and routes failures to staff; R records a request and
notifies staff to arrange another time. R does not book a replacement slot. An automated
cancellation notice is not an invitation to confirm the canceled appointment.

The five-message limit means you do not need one sample for every notification subtype.
Include at least one for each selected sub-use case and represent both client and staff
traffic. The description and consent still need to match the full scope.

**Other employee wording** (replace sample 5 only if more representative; do not add a sixth field):

```text
Next Level Up: Your work schedule has changed. Sign in at https://app.nextleveluplcc.com to review the update. Reply STOP to opt out.
```

**Assigned training videos — optional scope, not verified as an enabled SMS producer:**

```text
Next Level Up: A new employee training video is assigned to you. Sign in at https://app.nextleveluplcc.com to review your assigned training. Reply STOP to opt out.
```

Before using that training example, add assigned-training notifications to the description,
make them explicit in staff consent, and verify the actual training notification sends SMS.
Promotional videos sent to clients are marketing, even if the content is educational.

**Direct session links versus the portal-home examples:** the app can generate personal
meeting/join/Quick View links. If enabled, include an actual generated URL structure with a
nonfunctional demo token in an appropriate sample and declare every real destination domain.
Do not paste a live access token or imply the portal-home sample reproduces the direct-link
producer. The current app chooses links dynamically; validate each brand's output.
Do not use public URL shorteners. A session link can remain under this practice's campaign.

### Step 6 — Review & Submit

- Confirm the selected brand is **Next Level Up**, with the exact verified legal entity behind it.
- Confirm each sample and domain represents the messages this program will actually send.
- Confirm consent proof and policies open without logging in and show this same brand.
- Confirm all required fields are populated, including at least two samples.
- Review the actual dashboard charges and subscription term before accepting its billing terms.
- Check the no-affiliate-marketing declaration only while that statement is true.
- Submit only after the evidence and configuration checks in this sheet are complete.
  Brand vetting alone does not approve the campaign; approval cannot be guaranteed.

### Step 7 — After campaign approval

Link this brand's sending numbers to this campaign. In the app's Texting Numbers
registration settings, record the real brand/campaign IDs, legal/client-facing names,
policy/proof URLs, support contact, keyword owner and verified approval/linking status.
Register purposes `care`, `reminders`, `workforce`. Provider numbers and employee notification numbers may share this campaign when all traffic fits this scope.
Use the same identity and keyword behavior on all numbers within the campaign.

Collect or verify the signed recipient choices, review signer authority, then activate
only accepted purposes. Enable the relevant tenant/user notification settings. Test with
consenting test recipients: correct brand, actual link destination, HELP, STOP across
campaign numbers, and rejection of sends after STOP. Test Y confirmation, N cancellation, R rescheduling, and staff versus client purpose separation.
A documentation update does not activate these settings or authorize sending before approval.

### Optional billing addition — complete before using billing samples

Routine updates to Next Level Up's own client accounts can fit the Account Notification portion of
this Mixed campaign. This recommendation does not cover lending, third-party debt collection,
or promotional offers. The app now supports a dedicated `billing` SMS consent purpose.
Do not use `account_security` as a shortcut for billing consent.

1. Include the `billing` purpose in the actual sender registration and use the versioned
   form with its separate billing choice. Append `&billing=1` to the client proof URL above
   and describe that separate choice in the message-flow field. Obtain new permission;
   existing reminder consent does not authorize billing texts.
2. Confirm the portal can actually display the statement/balance and that the billing producer
   uses the correct brand, sender, consent purpose, and STOP suppression.
3. Add this sentence to the campaign description and the matching message-flow explanation:

```text
Clients who separately accept billing-account notifications may also receive notices that their current balance or statement has been updated, with a link to review details after signing in.
```

4. Replace sample 3 with this sample, retaining five total:

```text
Next Level Up: Your billing account has been updated. Sign in at https://app.nextleveluplcc.com to review your current balance and statement. Reply STOP to opt out.
```

Keep amounts and sensitive details inside the authenticated portal. If the campaign has
already been submitted, update it through Vonage's campaign-update process before expanding
traffic; do not create a duplicate campaign merely to change sample wording.

## ITSCO Service Communications

**Use this for client service texts and this practice's employee notifications.**
Status of consent proof: ITSCO is supported by the same multi-brand example route. See release verification and inspect the exact choices for the registered purposes.

### Step 1 — Use case

| Field | Enter/select |
| --- | --- |
| Brand | ITSCO |
| Use case | Mixed |
| Sub-use cases | Customer Care; Account Notification |

Use the choices offered by this externally vetted brand's qualification screen. For ITSCO,
plan around the reported 500–2,000 outbound texts on a busy day; count SMS segments and
check carrier limits against the actual vetting result. NLU volume has not been separately
confirmed. Do not assume Low Volume Mixed gives the same capacity as Mixed.

### Step 2 — Campaign details

**My own campaign / Reseller campaign:** apply the ownership rule above.

**Campaign name:**

```text
ITSCO Service Communications
```

**Campaign description — base scope, without billing:**

```text
ITSCO, LLC, known to recipients as ITSCO, uses AuricWell to send nonpromotional service communications. Clients and authorized guardians who opt in receive appointment reminders, confirmations, rescheduling and cancellation notices, session-access or portal-login links, and two-way administrative support. Employees and contractors who separately opt in receive work schedule changes, supervision and team/video-session reminders, and session-access notifications. Messages may contain practice portal or meeting links and a practice callback number. Each recipient receives only the message types they accepted. Marketing and promotional offers are excluded.
```

### Step 3 — Message flow (Call to action)

On the prerequisites page, click Next. On the form, fill these fields:

| Field | Enter/select |
| --- | --- |
| Message frequency | Recurring |
| Brand name / DBA | ITSCO — use exactly this spelling in messages |
| Consent collected | Online (website, mobile app) |
| Text-to-join | Leave unchecked for the baseline `allowRestart=false` setup |
| Live operator / Point of Sale / Other | Leave unchecked unless actually used and separately evidenced |
| Online URL | https://app.itsco.health/sms-consent/example/itsco?program=operations&audience=client |
| Privacy Policy Link | https://www.itsco.health/itsco/privacypolicy |
| Terms & Conditions Link | https://www.itsco.health/itsco/terms |
| Policy compliance acknowledgment | Check only after inspecting the actual published policies |
| Add Carrier Disclaimer | Check; keep the same disclaimer on the form and in the flow |

**Online URL status:** ITSCO is supported by the same multi-brand example route. See release verification and inspect the exact choices for the registered purposes.

**How will you obtain consent from the subscriber?** Use this text only when the
published forms and configured activation process match it:

```text
ITSCO provides a private online SMS consent form during onboarding or by email or in person. Clients or authorized guardians choose Yes or No separately for care-team administrative messages and appointment reminders; staff receive a separate workforce-notifications choice. No answer is preselected, and all answers may be No without affecting access to services. The signer enters the covered phone number, confirms authority, and electronically signs. An authorized administrator reviews the signed evidence before activating only accepted message types. The exact disclosure, choices, signature and timestamp are retained. Subscription confirmations name the selected purpose: care-team messages, appointment reminders, or workforce notifications. Client reminder messages may include session-access links; workforce messages may include supervision, team/video-session and schedule notices. Client review copy: https://app.itsco.health/sms-consent/example/itsco?program=operations&audience=client Staff review copy: https://app.itsco.health/sms-consent/example/itsco?program=operations&audience=staff These review copies do not enroll visitors. Message frequency varies. Message and data rates may apply. Text HELP for help. Text STOP to opt-out. Carriers are not liable for delayed or undelivered messages. Support: support@itsco.health. Privacy: https://www.itsco.health/itsco/privacypolicy Terms: https://www.itsco.health/itsco/terms.
```

A recipient-initiated question permits a bounded reply about that request; it does not
activate recurring reminders or workforce subscriptions. Y/N/R appointment replies also
do not create recurring consent. Disclose any additional enrollment mechanism if used.

### Step 4 — Content attributes

**Opt-in keyword:** leave blank for this online-only enrollment setup. Do not list Y or
YES: those are appointment replies. Configure app `allowRestart=false` for this setup.
If START/UNSTOP reactivation is enabled instead, declare it as text-to-join/re-opt-in,
add those keywords and the real reactivation response; do not claim an online-only flow.

**Opt-in Message:**

```text
ITSCO: You subscribed to appointment reminders. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.
```

The app sends purpose-specific confirmations. Staff receive the same text with
“workforce notifications” instead of “appointment reminders”; care recipients receive
“care-team messages.” Include these variants in the message-flow explanation. Selecting
one purpose never grants the others.

**Opt-out keywords:** keep the dashboard defaults and add STOPALL and OPTOUT to match
the app. Full list: `STOP, END, QUIT, CANCEL, UNSUBSCRIBE, REVOKE, OPT OUT, STOPALL, OPTOUT`.
Exact CANCEL stops SMS. Use N for an appointment cancellation.

**Opt-out Message:**

```text
ITSCO: You are unsubscribed and will receive no further messages from this program. Reply HELP for help.
```

**Help keywords:** `HELP, INFO`.

**Help Message:**

```text
ITSCO: For help, contact support@itsco.health. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.
```

**Opt-Out Assist:** the baseline here uses the app's keyword handler (`keywordOwner=application`).
If you enable Vonage Opt-Out Assist, set `keywordOwner=vonage`, align response text,
and verify STOP reaches the app's suppression ledger. Use one response owner.

### Step 5 — Sample messages

Paste one message per field. These are proposed examples, not evidence that an automation
is enabled. Confirm the corresponding reminder/meeting workflow and destination before use.
Dates and times below are illustrative; never include a real client's information in the application.

**Sample 1 — appointment reminder and Y/N/R:**

```text
ITSCO: Your appointment is Tuesday at 3:00 PM. Reply Y to confirm, N to cancel, or R to request a new time. Reply STOP to opt out.
```

**Sample 2 — client session and portal login:**

```text
ITSCO: Your video appointment is Tuesday at 3:00 PM. Sign in at https://app.itsco.health to access your session. Reply STOP to opt out.
```

**Sample 3 — provider schedule change:**

```text
ITSCO: Your provider needs to reschedule your upcoming appointment. Reply R to request a new time, or reply with a question for our team. Reply STOP to opt out.
```

**Sample 4 — cancellation and callback:**

```text
ITSCO: Your Tuesday 3:00 PM appointment has been canceled. Reply or call 833-444-8726 for help arranging another appointment. Reply STOP to opt out.
```

**Sample 5 — employee video/session notification:**

```text
ITSCO: Your staff video session begins at 2:00 PM. Sign in at https://app.itsco.health to open your session. Reply STOP to opt out.
```

| Checkbox | Select |
| --- | --- |
| Embedded links | Yes |
| Embedded phone number | Yes — sample 4 contains a callback number |
| Age gated | No for this described administrative program |
| Direct lending | No for this described program |

Y confirms; N attempts cancellation and routes failures to staff; R records a request and
notifies staff to arrange another time. R does not book a replacement slot. An automated
cancellation notice is not an invitation to confirm the canceled appointment.

The five-message limit means you do not need one sample for every notification subtype.
Include at least one for each selected sub-use case and represent both client and staff
traffic. The description and consent still need to match the full scope.

**Other employee wording** (replace sample 5 only if more representative; do not add a sixth field):

```text
ITSCO: Your work schedule has changed. Sign in at https://app.itsco.health to review the update. Reply STOP to opt out.
```

**Assigned training videos — optional scope, not verified as an enabled SMS producer:**

```text
ITSCO: A new employee training video is assigned to you. Sign in at https://app.itsco.health to review your assigned training. Reply STOP to opt out.
```

Before using that training example, add assigned-training notifications to the description,
make them explicit in staff consent, and verify the actual training notification sends SMS.
Promotional videos sent to clients are marketing, even if the content is educational.

**Direct session links versus the portal-home examples:** the app can generate personal
meeting/join/Quick View links. If enabled, include an actual generated URL structure with a
nonfunctional demo token in an appropriate sample and declare every real destination domain.
Do not paste a live access token or imply the portal-home sample reproduces the direct-link
producer. The current app chooses links dynamically; validate each brand's output.
Do not use public URL shorteners. A session link can remain under this practice's campaign.

### Step 6 — Review & Submit

- Confirm the selected brand is **ITSCO**, with the exact verified legal entity behind it.
- Confirm each sample and domain represents the messages this program will actually send.
- Confirm consent proof and policies open without logging in and show this same brand.
- Confirm all required fields are populated, including at least two samples.
- Review the actual dashboard charges and subscription term before accepting its billing terms.
- Check the no-affiliate-marketing declaration only while that statement is true.
- Submit only after the evidence and configuration checks in this sheet are complete.
  Brand vetting alone does not approve the campaign; approval cannot be guaranteed.

### Step 7 — After campaign approval

Link this brand's sending numbers to this campaign. In the app's Texting Numbers
registration settings, record the real brand/campaign IDs, legal/client-facing names,
policy/proof URLs, support contact, keyword owner and verified approval/linking status.
Register purposes `care`, `reminders`, `workforce`. Provider numbers and employee notification numbers may share this campaign when all traffic fits this scope.
Use the same identity and keyword behavior on all numbers within the campaign.

Collect or verify the signed recipient choices, review signer authority, then activate
only accepted purposes. Enable the relevant tenant/user notification settings. Test with
consenting test recipients: correct brand, actual link destination, HELP, STOP across
campaign numbers, and rejection of sends after STOP. Test Y confirmation, N cancellation, R rescheduling, and staff versus client purpose separation.
A documentation update does not activate these settings or authorize sending before approval.

### Optional billing addition — complete before using billing samples

Routine updates to ITSCO's own client accounts can fit the Account Notification portion of
this Mixed campaign. This recommendation does not cover lending, third-party debt collection,
or promotional offers. The app now supports a dedicated `billing` SMS consent purpose.
Do not use `account_security` as a shortcut for billing consent.

1. Include the `billing` purpose in the actual sender registration and use the versioned
   form with its separate billing choice. Append `&billing=1` to the client proof URL above
   and describe that separate choice in the message-flow field. Obtain new permission;
   existing reminder consent does not authorize billing texts.
2. Confirm the portal can actually display the statement/balance and that the billing producer
   uses the correct brand, sender, consent purpose, and STOP suppression.
3. Add this sentence to the campaign description and the matching message-flow explanation:

```text
Clients who separately accept billing-account notifications may also receive notices that their current balance or statement has been updated, with a link to review details after signing in.
```

4. Replace sample 3 with this sample, retaining five total:

```text
ITSCO: Your billing account has been updated. Sign in at https://app.itsco.health to review your current balance and statement. Reply STOP to opt out.
```

Keep amounts and sensitive details inside the authenticated portal. If the campaign has
already been submitted, update it through Vonage's campaign-update process before expanding
traffic; do not create a duplicate campaign merely to change sample wording.

## The Inner Strength Institute Service Communications

**Use this for client service texts and this practice's employee notifications.**
Status: multi-brand proof is deployed; anonymous rendering verified October 5. The owner confirms this is a separately formed company wholly owned by PlotTwistCo.

### Step 0 — Register the Inner Strength brand

The owner confirms Inner Strength is a separately formed company, 100% owned by
PlotTwistCo. Register that subsidiary using its own legal identity and EIN. The existing
practice record in migration `1406_office_practice_pos_medicaid_override.sql` identifies
it as **The Inner Strength Institute LLC**; match spelling to its IRS record when submitting.
Vonage permits the customer-brand path for an owned entity.

| Brand-registration field | Enter |
| --- | --- |
| Customer brand / Reseller brand | Customer brand for this wholly owned business, assuming the registrant is its owner |
| Organization type | Private profit, for this privately held for-profit LLC |
| Legal company name | The Inner Strength Institute LLC — match its IRS record exactly |
| DBA or Brand name | The Inner Strength Institute |
| Tax number / EIN | Inner Strength's own EIN, not PlotTwistCo's; enter privately in Vonage |
| Country, address, city, state, ZIP | That legal entity's matching registration/tax records |
| Website | https://theinnerstrengthinstitute.com |
| Vertical | Healthcare services if that accurately describes the registered business's services |
| Contact email | support@innerstrengthin.com, if monitored by the authorized registration contact |
| Contact phone | 719-657-1381, if this is the correct registration/support contact |
| Stock fields / alternate ID | Only when applicable; do not invent values |

Use Standard external vetting for the planned Mixed campaign once the brand is verified.
The consent example and policies identify The Inner Strength Institute LLC. Keep the
sender registration consistent with this identity. Common ownership does not turn Inner
Strength clinical records into AuricWell platform data.

Source: [Vonage owned-entity and DBA guidance](https://api.support.vonage.com/hc/en-us/articles/16376606152988-10DLC-Update-Reseller-ID-requirements-Jan-2025).

### Step 1 — Use case

| Field | Enter/select |
| --- | --- |
| Brand | The Inner Strength Institute |
| Use case | Mixed |
| Sub-use cases | Customer Care; Account Notification |

Use the choices offered by this externally vetted brand's qualification screen. For ITSCO,
plan around the reported 500–2,000 outbound texts on a busy day; count SMS segments and
check carrier limits against the actual vetting result. Inner Strength volume has not been separately
confirmed. Do not assume Low Volume Mixed gives the same capacity as Mixed.

### Step 2 — Campaign details

**My own campaign / Reseller campaign:** apply the ownership rule above.

**Campaign name:**

```text
The Inner Strength Institute Service Communications
```

**Campaign description — base scope, without billing:**

```text
The Inner Strength Institute uses AuricWell to send nonpromotional service communications. Clients and authorized guardians who opt in receive appointment reminders, confirmations, rescheduling and cancellation notices, session-access or portal-login links, and two-way administrative support. Employees and contractors who separately opt in receive work schedule changes, supervision and team/video-session reminders, and session-access notifications. Messages may contain practice portal or meeting links and a practice callback number. Each recipient receives only the message types they accepted. Marketing and promotional offers are excluded.
```

### Step 3 — Message flow (Call to action)

On the prerequisites page, click Next. On the form, fill these fields:

| Field | Enter/select |
| --- | --- |
| Message frequency | Recurring |
| Brand name / DBA | The Inner Strength Institute — use exactly this spelling in messages |
| Consent collected | Online (website, mobile app) |
| Text-to-join | Leave unchecked for the baseline `allowRestart=false` setup |
| Live operator / Point of Sale / Other | Leave unchecked unless actually used and separately evidenced |
| Online URL | https://app.theinnerstrengthinstitute.com/sms-consent/example/tisi?program=operations&audience=client |
| Privacy Policy Link | https://theinnerstrengthinstitute.com/tisi/privacypolicy |
| Terms & Conditions Link | https://theinnerstrengthinstitute.com/tisi/terms |
| Policy compliance acknowledgment | Check only after inspecting the actual published policies |
| Add Carrier Disclaimer | Check; keep the same disclaimer on the form and in the flow |

**Online URL status:** implemented for Inner Strength; confirm the legal identity in Step 0 and see release verification.

**How will you obtain consent from the subscriber?** Use this text only when the
published forms and configured activation process match it:

```text
The Inner Strength Institute provides a private online SMS consent form during onboarding or by email or in person. Clients or authorized guardians choose Yes or No separately for care-team administrative messages and appointment reminders; staff receive a separate workforce-notifications choice. No answer is preselected, and all answers may be No without affecting access to services. The signer enters the covered phone number, confirms authority, and electronically signs. An authorized administrator reviews the signed evidence before activating only accepted message types. The exact disclosure, choices, signature and timestamp are retained. Subscription confirmations name the selected purpose: care-team messages, appointment reminders, or workforce notifications. Client reminder messages may include session-access links; workforce messages may include supervision, team/video-session and schedule notices. Client review copy: https://app.theinnerstrengthinstitute.com/sms-consent/example/tisi?program=operations&audience=client Staff review copy: https://app.theinnerstrengthinstitute.com/sms-consent/example/tisi?program=operations&audience=staff These review copies do not enroll visitors. Message frequency varies. Message and data rates may apply. Text HELP for help. Text STOP to opt-out. Carriers are not liable for delayed or undelivered messages. Support: support@innerstrengthin.com. Privacy: https://theinnerstrengthinstitute.com/tisi/privacypolicy Terms: https://theinnerstrengthinstitute.com/tisi/terms.
```

A recipient-initiated question permits a bounded reply about that request; it does not
activate recurring reminders or workforce subscriptions. Y/N/R appointment replies also
do not create recurring consent. Disclose any additional enrollment mechanism if used.

### Step 4 — Content attributes

**Opt-in keyword:** leave blank for this online-only enrollment setup. Do not list Y or
YES: those are appointment replies. Configure app `allowRestart=false` for this setup.
If START/UNSTOP reactivation is enabled instead, declare it as text-to-join/re-opt-in,
add those keywords and the real reactivation response; do not claim an online-only flow.

**Opt-in Message:**

```text
The Inner Strength Institute: You subscribed to appointment reminders. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.
```

The app sends purpose-specific confirmations. Staff receive the same text with
“workforce notifications” instead of “appointment reminders”; care recipients receive
“care-team messages.” Include these variants in the message-flow explanation. Selecting
one purpose never grants the others.

**Opt-out keywords:** keep the dashboard defaults and add STOPALL and OPTOUT to match
the app. Full list: `STOP, END, QUIT, CANCEL, UNSUBSCRIBE, REVOKE, OPT OUT, STOPALL, OPTOUT`.
Exact CANCEL stops SMS. Use N for an appointment cancellation.

**Opt-out Message:**

```text
The Inner Strength Institute: You are unsubscribed and will receive no further messages from this program. Reply HELP for help.
```

**Help keywords:** `HELP, INFO`.

**Help Message:**

```text
The Inner Strength Institute: For help, contact support@innerstrengthin.com. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.
```

**Opt-Out Assist:** the baseline here uses the app's keyword handler (`keywordOwner=application`).
If you enable Vonage Opt-Out Assist, set `keywordOwner=vonage`, align response text,
and verify STOP reaches the app's suppression ledger. Use one response owner.

### Step 5 — Sample messages

Paste one message per field. These are proposed examples, not evidence that an automation
is enabled. Confirm the corresponding reminder/meeting workflow and destination before use.
Dates and times below are illustrative; never include a real client's information in the application.

**Sample 1 — appointment reminder and Y/N/R:**

```text
The Inner Strength Institute: Your appointment is Tuesday at 3:00 PM. Reply Y to confirm, N to cancel, or R to request a new time. Reply STOP to opt out.
```

**Sample 2 — client session and portal login:**

```text
The Inner Strength Institute: Your video appointment is Tuesday at 3:00 PM. Sign in at https://app.theinnerstrengthinstitute.com to access your session. Reply STOP to opt out.
```

**Sample 3 — provider schedule change:**

```text
The Inner Strength Institute: Your provider needs to reschedule your upcoming appointment. Reply R to request a new time, or reply with a question for our team. Reply STOP to opt out.
```

**Sample 4 — cancellation and callback:**

```text
The Inner Strength Institute: Your Tuesday 3:00 PM appointment has been canceled. Reply or call 719-657-1381 for help arranging another appointment. Reply STOP to opt out.
```

**Sample 5 — employee video/session notification:**

```text
The Inner Strength Institute: Your staff video session begins at 2:00 PM. Sign in at https://app.theinnerstrengthinstitute.com to open your session. Reply STOP to opt out.
```

| Checkbox | Select |
| --- | --- |
| Embedded links | Yes |
| Embedded phone number | Yes — sample 4 contains a callback number |
| Age gated | No for this described administrative program |
| Direct lending | No for this described program |

Y confirms; N attempts cancellation and routes failures to staff; R records a request and
notifies staff to arrange another time. R does not book a replacement slot. An automated
cancellation notice is not an invitation to confirm the canceled appointment.

The five-message limit means you do not need one sample for every notification subtype.
Include at least one for each selected sub-use case and represent both client and staff
traffic. The description and consent still need to match the full scope.

**Other employee wording** (replace sample 5 only if more representative; do not add a sixth field):

```text
The Inner Strength Institute: Your work schedule has changed. Sign in at https://app.theinnerstrengthinstitute.com to review the update. Reply STOP to opt out.
```

**Assigned training videos — optional scope, not verified as an enabled SMS producer:**

```text
The Inner Strength Institute: A new employee training video is assigned to you. Sign in at https://app.theinnerstrengthinstitute.com to review your assigned training. Reply STOP to opt out.
```

Before using that training example, add assigned-training notifications to the description,
make them explicit in staff consent, and verify the actual training notification sends SMS.
Promotional videos sent to clients are marketing, even if the content is educational.

**Direct session links versus the portal-home examples:** the app can generate personal
meeting/join/Quick View links. If enabled, include an actual generated URL structure with a
nonfunctional demo token in an appropriate sample and declare every real destination domain.
Do not paste a live access token or imply the portal-home sample reproduces the direct-link
producer. The current app chooses links dynamically; validate each brand's output.
Do not use public URL shorteners. A session link can remain under this practice's campaign.

### Step 6 — Review & Submit

- Confirm the selected brand is **The Inner Strength Institute**, with the exact verified legal entity behind it.
- Confirm each sample and domain represents the messages this program will actually send.
- Confirm consent proof and policies open without logging in and show this same brand.
- Confirm all required fields are populated, including at least two samples.
- Review the actual dashboard charges and subscription term before accepting its billing terms.
- Check the no-affiliate-marketing declaration only while that statement is true.
- Submit only after the evidence and configuration checks in this sheet are complete.
  Brand vetting alone does not approve the campaign; approval cannot be guaranteed.

### Step 7 — After campaign approval

Link this brand's sending numbers to this campaign. In the app's Texting Numbers
registration settings, record the real brand/campaign IDs, legal/client-facing names,
policy/proof URLs, support contact, keyword owner and verified approval/linking status.
Register purposes `care`, `reminders`, `workforce`. Provider numbers and employee notification numbers may share this campaign when all traffic fits this scope.
Use the same identity and keyword behavior on all numbers within the campaign.

Collect or verify the signed recipient choices, review signer authority, then activate
only accepted purposes. Enable the relevant tenant/user notification settings. Test with
consenting test recipients: correct brand, actual link destination, HELP, STOP across
campaign numbers, and rejection of sends after STOP. Test Y confirmation, N cancellation, R rescheduling, and staff versus client purpose separation.
A documentation update does not activate these settings or authorize sending before approval.

### Optional billing addition — complete before using billing samples

Routine updates to The Inner Strength Institute's own client accounts can fit the Account Notification portion of
this Mixed campaign. This recommendation does not cover lending, third-party debt collection,
or promotional offers. The app now supports a dedicated `billing` SMS consent purpose.
Do not use `account_security` as a shortcut for billing consent.

1. Include the `billing` purpose in the actual sender registration and use the versioned
   form with its separate billing choice. Append `&billing=1` to the client proof URL above
   and describe that separate choice in the message-flow field. Obtain new permission;
   existing reminder consent does not authorize billing texts.
2. Confirm the portal can actually display the statement/balance and that the billing producer
   uses the correct brand, sender, consent purpose, and STOP suppression.
3. Add this sentence to the campaign description and the matching message-flow explanation:

```text
Clients who separately accept billing-account notifications may also receive notices that their current balance or statement has been updated, with a link to review details after signing in.
```

4. Replace sample 3 with this sample, retaining five total:

```text
The Inner Strength Institute: Your billing account has been updated. Sign in at https://app.theinnerstrengthinstitute.com to review your current balance and statement. Reply STOP to opt out.
```

Keep amounts and sensitive details inside the authenticated portal. If the campaign has
already been submitted, update it through Vonage's campaign-update process before expanding
traffic; do not create a duplicate campaign merely to change sample wording.

## Next Level Up Program Announcements

Optional. Register when ready to send the practice's own promotions. Keep the marketing
number and consent separate from Service Communications under the current app design.
Proof status: Implemented in the October 5 follow-up; see release verification.

### Step 1 — Use case

Brand: **Next Level Up**. Use case: **Marketing**. No Mixed sub-use cases for this sheet.

### Step 2 — Campaign details

Ownership: use the ownership rule at the top of this guide.

**Campaign name:**

```text
Next Level Up Program Announcements
```

**Campaign description:**

```text
NEXTLEVELUP, LLC, known as Next Level Up, sends occasional announcements about its own programs, enrollment openings and service availability to recipients who separately opted in to promotional texts. Marketing permission is optional and is not a condition of services or purchase. Appointment or employee-notification permission is not reused for marketing. This campaign excludes purchased lists and affiliate promotions.
```

### Step 3 — Message flow (Call to action)

| Field | Enter/select |
| --- | --- |
| Frequency | Recurring |
| Brand name | Next Level Up |
| Consent mechanism | Online only for the baseline setup |
| Online URL | https://app.nextleveluplcc.com/sms-consent/example/nlu?program=marketing&audience=client — verify before submission |
| Privacy Policy Link | https://nextleveluplcc.com/nlu/privacypolicy |
| Terms & Conditions Link | https://nextleveluplcc.com/nlu/terms |
| Policy acknowledgment | Only after reviewing the published documents |
| Carrier disclaimer | Check |
| Other consent mechanisms | Unchecked unless actually implemented and evidenced |

**How will you obtain consent from the subscriber?**

```text
Next Level Up offers a private online consent form with a separate Yes or No choice for optional announcements about its programs and services. Neither choice is preselected; No does not affect services or purchases. The recipient or authorized guardian provides the phone number, confirms authority and electronically signs. An administrator reviews the evidence before activating marketing consent. The system retains the exact disclosure, choice, signature and timestamp and sends a subscription confirmation. Review copy: https://app.nextleveluplcc.com/sms-consent/example/nlu?program=marketing&audience=client. This copy does not enroll visitors. Message frequency varies. Message and data rates may apply. Text HELP for help. Text STOP to opt-out. Carriers are not liable for delayed or undelivered messages. Support: 719-377-6577. Privacy: https://nextleveluplcc.com/nlu/privacypolicy Terms: https://nextleveluplcc.com/nlu/terms.
```

### Step 4 — Content attributes

**Opt-in keyword:** leave blank for this online-only enrollment setup. Do not list Y or
YES: those are appointment replies. Configure app `allowRestart=false` for this setup.
If START/UNSTOP reactivation is enabled instead, declare it as text-to-join/re-opt-in,
add those keywords and the real reactivation response; do not claim an online-only flow.

**Opt-in Message:**

```text
Next Level Up: You subscribed to optional program offers. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.
```

**Opt-out keywords:** keep the dashboard defaults and add STOPALL and OPTOUT to match
the app. Full list: `STOP, END, QUIT, CANCEL, UNSUBSCRIBE, REVOKE, OPT OUT, STOPALL, OPTOUT`.
Exact CANCEL stops SMS. Use N for an appointment cancellation.

**Opt-out Message:**

```text
Next Level Up: You are unsubscribed and will receive no further messages from this program. Reply HELP for help.
```

**Help keywords:** `HELP, INFO`.

**Help Message:**

```text
Next Level Up: For help, contact 719-377-6577. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.
```

**Opt-Out Assist:** the baseline here uses the app's keyword handler (`keywordOwner=application`).
If you enable Vonage Opt-Out Assist, set `keywordOwner=vonage`, align response text,
and verify STOP reaches the app's suppression ledger. Use one response owner.

### Step 5 — Sample messages

**Sample 1:**

```text
Next Level Up: Enrollment is open for our upcoming programs. Visit https://nextleveluplcc.com to learn more. Reply STOP to opt out.
```

**Sample 2:**

```text
Next Level Up: New program openings are available this season. Call 719-377-6577 for information. Reply STOP to opt out.
```

Embedded links: **Yes**. Embedded phone number: **Yes**. Age gated: **No** for these
program announcements. Direct lending: **No**. Use real offerings only; these draft samples
do not establish that a particular program is open today.

### Step 6 — Review & Submit

- Confirm the selected brand is **Next Level Up**, with the exact verified legal entity behind it.
- Confirm each sample and domain represents the messages this program will actually send.
- Confirm consent proof and policies open without logging in and show this same brand.
- Confirm all required fields are populated, including at least two samples.
- Review the actual dashboard charges and subscription term before accepting its billing terms.
- Check the no-affiliate-marketing declaration only while that statement is true.
- Submit only after the evidence and configuration checks in this sheet are complete.
  Brand vetting alone does not approve the campaign; approval cannot be guaranteed.

### Step 7 — After campaign approval

Link this brand's sending numbers to this campaign. In the app's Texting Numbers
registration settings, record the real brand/campaign IDs, legal/client-facing names,
policy/proof URLs, support contact, keyword owner and verified approval/linking status.
Register purposes `marketing`. Use a separate marketing number, following the app design.
Use the same identity and keyword behavior on all numbers within the campaign.

Collect or verify the signed recipient choices, review signer authority, then activate
only accepted purposes. Enable the relevant tenant/user notification settings. Test with
consenting test recipients: correct brand, actual link destination, HELP, STOP across
campaign numbers, and rejection of sends after STOP. Verify that service consent alone cannot receive promotions.
A documentation update does not activate these settings or authorize sending before approval.

## ITSCO Program Announcements

Optional. Register when ready to send the practice's own promotions. Keep the marketing
number and consent separate from Service Communications under the current app design.
Proof status: ITSCO is supported by the same multi-brand example route. See release verification and inspect the exact choices for the registered purposes.

### Step 1 — Use case

Brand: **ITSCO**. Use case: **Marketing**. No Mixed sub-use cases for this sheet.

### Step 2 — Campaign details

Ownership: use the ownership rule at the top of this guide.

**Campaign name:**

```text
ITSCO Program Announcements
```

**Campaign description:**

```text
ITSCO, LLC, known as ITSCO, sends occasional announcements about its own programs, enrollment openings and service availability to recipients who separately opted in to promotional texts. Marketing permission is optional and is not a condition of services or purchase. Appointment or employee-notification permission is not reused for marketing. This campaign excludes purchased lists and affiliate promotions.
```

### Step 3 — Message flow (Call to action)

| Field | Enter/select |
| --- | --- |
| Frequency | Recurring |
| Brand name | ITSCO |
| Consent mechanism | Online only for the baseline setup |
| Online URL | https://app.itsco.health/sms-consent/example/itsco?program=marketing&audience=client — verify before submission |
| Privacy Policy Link | https://www.itsco.health/itsco/privacypolicy |
| Terms & Conditions Link | https://www.itsco.health/itsco/terms |
| Policy acknowledgment | Only after reviewing the published documents |
| Carrier disclaimer | Check |
| Other consent mechanisms | Unchecked unless actually implemented and evidenced |

**How will you obtain consent from the subscriber?**

```text
ITSCO offers a private online consent form with a separate Yes or No choice for optional announcements about its programs and services. Neither choice is preselected; No does not affect services or purchases. The recipient or authorized guardian provides the phone number, confirms authority and electronically signs. An administrator reviews the evidence before activating marketing consent. The system retains the exact disclosure, choice, signature and timestamp and sends a subscription confirmation. Review copy: https://app.itsco.health/sms-consent/example/itsco?program=marketing&audience=client. This copy does not enroll visitors. Message frequency varies. Message and data rates may apply. Text HELP for help. Text STOP to opt-out. Carriers are not liable for delayed or undelivered messages. Support: support@itsco.health. Privacy: https://www.itsco.health/itsco/privacypolicy Terms: https://www.itsco.health/itsco/terms.
```

### Step 4 — Content attributes

**Opt-in keyword:** leave blank for this online-only enrollment setup. Do not list Y or
YES: those are appointment replies. Configure app `allowRestart=false` for this setup.
If START/UNSTOP reactivation is enabled instead, declare it as text-to-join/re-opt-in,
add those keywords and the real reactivation response; do not claim an online-only flow.

**Opt-in Message:**

```text
ITSCO: You subscribed to optional program offers. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.
```

**Opt-out keywords:** keep the dashboard defaults and add STOPALL and OPTOUT to match
the app. Full list: `STOP, END, QUIT, CANCEL, UNSUBSCRIBE, REVOKE, OPT OUT, STOPALL, OPTOUT`.
Exact CANCEL stops SMS. Use N for an appointment cancellation.

**Opt-out Message:**

```text
ITSCO: You are unsubscribed and will receive no further messages from this program. Reply HELP for help.
```

**Help keywords:** `HELP, INFO`.

**Help Message:**

```text
ITSCO: For help, contact support@itsco.health. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.
```

**Opt-Out Assist:** the baseline here uses the app's keyword handler (`keywordOwner=application`).
If you enable Vonage Opt-Out Assist, set `keywordOwner=vonage`, align response text,
and verify STOP reaches the app's suppression ledger. Use one response owner.

### Step 5 — Sample messages

**Sample 1:**

```text
ITSCO: Enrollment is open for our upcoming programs. Visit https://www.itsco.health to learn more. Reply STOP to opt out.
```

**Sample 2:**

```text
ITSCO: New program openings are available this season. Call 833-444-8726 for information. Reply STOP to opt out.
```

Embedded links: **Yes**. Embedded phone number: **Yes**. Age gated: **No** for these
program announcements. Direct lending: **No**. Use real offerings only; these draft samples
do not establish that a particular program is open today.

### Step 6 — Review & Submit

- Confirm the selected brand is **ITSCO**, with the exact verified legal entity behind it.
- Confirm each sample and domain represents the messages this program will actually send.
- Confirm consent proof and policies open without logging in and show this same brand.
- Confirm all required fields are populated, including at least two samples.
- Review the actual dashboard charges and subscription term before accepting its billing terms.
- Check the no-affiliate-marketing declaration only while that statement is true.
- Submit only after the evidence and configuration checks in this sheet are complete.
  Brand vetting alone does not approve the campaign; approval cannot be guaranteed.

### Step 7 — After campaign approval

Link this brand's sending numbers to this campaign. In the app's Texting Numbers
registration settings, record the real brand/campaign IDs, legal/client-facing names,
policy/proof URLs, support contact, keyword owner and verified approval/linking status.
Register purposes `marketing`. Use a separate marketing number, following the app design.
Use the same identity and keyword behavior on all numbers within the campaign.

Collect or verify the signed recipient choices, review signer authority, then activate
only accepted purposes. Enable the relevant tenant/user notification settings. Test with
consenting test recipients: correct brand, actual link destination, HELP, STOP across
campaign numbers, and rejection of sends after STOP. Verify that service consent alone cannot receive promotions.
A documentation update does not activate these settings or authorize sending before approval.

## The Inner Strength Institute Program Announcements

Optional. Register when ready to send the practice's own promotions. Keep the marketing
number and consent separate from Service Communications under the current app design.
Proof status: Implemented in the October 5 follow-up; see release verification.

### Step 1 — Use case

Brand: **The Inner Strength Institute**. Use case: **Marketing**. No Mixed sub-use cases for this sheet.

### Step 2 — Campaign details

Ownership: My own campaign for the wholly owned business; use the confirmed legal record from Inner Strength Step 0.

**Campaign name:**

```text
The Inner Strength Institute Program Announcements
```

**Campaign description:**

```text
The Inner Strength Institute, known as The Inner Strength Institute, sends occasional announcements about its own programs, enrollment openings and service availability to recipients who separately opted in to promotional texts. Marketing permission is optional and is not a condition of services or purchase. Appointment or employee-notification permission is not reused for marketing. This campaign excludes purchased lists and affiliate promotions.
```

### Step 3 — Message flow (Call to action)

| Field | Enter/select |
| --- | --- |
| Frequency | Recurring |
| Brand name | The Inner Strength Institute |
| Consent mechanism | Online only for the baseline setup |
| Online URL | https://app.theinnerstrengthinstitute.com/sms-consent/example/tisi?program=marketing&audience=client — verify before submission |
| Privacy Policy Link | https://theinnerstrengthinstitute.com/tisi/privacypolicy |
| Terms & Conditions Link | https://theinnerstrengthinstitute.com/tisi/terms |
| Policy acknowledgment | Only after reviewing the published documents |
| Carrier disclaimer | Check |
| Other consent mechanisms | Unchecked unless actually implemented and evidenced |

**How will you obtain consent from the subscriber?**

```text
The Inner Strength Institute offers a private online consent form with a separate Yes or No choice for optional announcements about its programs and services. Neither choice is preselected; No does not affect services or purchases. The recipient or authorized guardian provides the phone number, confirms authority and electronically signs. An administrator reviews the evidence before activating marketing consent. The system retains the exact disclosure, choice, signature and timestamp and sends a subscription confirmation. Review copy: https://app.theinnerstrengthinstitute.com/sms-consent/example/tisi?program=marketing&audience=client. This copy does not enroll visitors. Message frequency varies. Message and data rates may apply. Text HELP for help. Text STOP to opt-out. Carriers are not liable for delayed or undelivered messages. Support: support@innerstrengthin.com. Privacy: https://theinnerstrengthinstitute.com/tisi/privacypolicy Terms: https://theinnerstrengthinstitute.com/tisi/terms.
```

### Step 4 — Content attributes

**Opt-in keyword:** leave blank for this online-only enrollment setup. Do not list Y or
YES: those are appointment replies. Configure app `allowRestart=false` for this setup.
If START/UNSTOP reactivation is enabled instead, declare it as text-to-join/re-opt-in,
add those keywords and the real reactivation response; do not claim an online-only flow.

**Opt-in Message:**

```text
The Inner Strength Institute: You subscribed to optional program offers. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.
```

**Opt-out keywords:** keep the dashboard defaults and add STOPALL and OPTOUT to match
the app. Full list: `STOP, END, QUIT, CANCEL, UNSUBSCRIBE, REVOKE, OPT OUT, STOPALL, OPTOUT`.
Exact CANCEL stops SMS. Use N for an appointment cancellation.

**Opt-out Message:**

```text
The Inner Strength Institute: You are unsubscribed and will receive no further messages from this program. Reply HELP for help.
```

**Help keywords:** `HELP, INFO`.

**Help Message:**

```text
The Inner Strength Institute: For help, contact support@innerstrengthin.com. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.
```

**Opt-Out Assist:** the baseline here uses the app's keyword handler (`keywordOwner=application`).
If you enable Vonage Opt-Out Assist, set `keywordOwner=vonage`, align response text,
and verify STOP reaches the app's suppression ledger. Use one response owner.

### Step 5 — Sample messages

**Sample 1:**

```text
The Inner Strength Institute: Enrollment is open for our upcoming programs. Visit https://theinnerstrengthinstitute.com to learn more. Reply STOP to opt out.
```

**Sample 2:**

```text
The Inner Strength Institute: New program openings are available this season. Call 719-657-1381 for information. Reply STOP to opt out.
```

Embedded links: **Yes**. Embedded phone number: **Yes**. Age gated: **No** for these
program announcements. Direct lending: **No**. Use real offerings only; these draft samples
do not establish that a particular program is open today.

### Step 6 — Review & Submit

- Confirm the selected brand is **The Inner Strength Institute**, with the exact verified legal entity behind it.
- Confirm each sample and domain represents the messages this program will actually send.
- Confirm consent proof and policies open without logging in and show this same brand.
- Confirm all required fields are populated, including at least two samples.
- Review the actual dashboard charges and subscription term before accepting its billing terms.
- Check the no-affiliate-marketing declaration only while that statement is true.
- Submit only after the evidence and configuration checks in this sheet are complete.
  Brand vetting alone does not approve the campaign; approval cannot be guaranteed.

### Step 7 — After campaign approval

Link this brand's sending numbers to this campaign. In the app's Texting Numbers
registration settings, record the real brand/campaign IDs, legal/client-facing names,
policy/proof URLs, support contact, keyword owner and verified approval/linking status.
Register purposes `marketing`. Use a separate marketing number, following the app design.
Use the same identity and keyword behavior on all numbers within the campaign.

Collect or verify the signed recipient choices, review signer authority, then activate
only accepted purposes. Enable the relevant tenant/user notification settings. Test with
consenting test recipients: correct brand, actual link destination, HELP, STOP across
campaign numbers, and rejection of sends after STOP. Verify that service consent alone cannot receive promotions.
A documentation update does not activate these settings or authorize sending before approval.

## AuricWell Account Access

**Conditional — not the campaign for a practice's employees merely logging into their
work sessions.** ITSCO and Next Level Up session notices belong in their service programs.
Register AuricWell's own account-access SMS only when that sender and flow are enabled.

### Step 1 — Use case

Brand: **AuricWell**, backed by the exact verified PlotTwistCo legal record.
Use case: **Account Notification** for the account-access/reset-link flow described here.
Do not add OTP/2FA samples unless that SMS flow actually exists; OTP traffic requires the
appropriate 2FA classification. No patient reminder or tenant workforce traffic here.

### Step 2 — Campaign details

Campaign ownership: **My own campaign** for the operator's own platform communications.
Campaign name:

```text
AuricWell Account Access
```

Description draft — confirm the actual sender before using:

```text
AuricWell, operated by Plot Twist Co, sends requested account-access messages to registered platform users who have explicitly consented to account-security texts. Messages may include administrator-assisted password-reset links for their platform account. This campaign excludes practice appointment reminders, practice employee-session notifications and promotional messages.
```

The app profile uses “Plot Twist Co”; retain the exact legal spelling in the vetted
Vonage record if it differs. Do not invent a corporate suffix.

### Step 3 — Message flow (Call to action)

| Field | Entry / status |
| --- | --- |
| Frequency | Recurring for the current signed-subscription model |
| Brand name | AuricWell |
| Consent mechanism | Online; signed explicit Yes/No for account-security texts |
| Online URL | https://app.itsco.health/sms-consent/example/auricwell?program=account — AuricWell-branded public review copy hosted on the shared portal; declare that hosting relationship |
| Privacy URL | https://plottwisthq.com/auricwell/privacypolicy — verified public branded policy |
| Terms URL | https://plottwisthq.com/auricwell/terms — verified public branded policy |
| Support | support@plottwistco.com |
| Carrier disclaimer | Include, matching the actual disclosure |

Describe the real enrollment screen, when it is presented, what message the user requests,
how evidence is recorded, and how activation works. Include the evidence URL, frequency,
rates, STOP/HELP and support. This flow cannot be finalized from brand vetting alone.
The shared public route now serves a distinct AuricWell account-security example. It does
not enable the standalone AuricWell SMS sender or prove that a reset-link producer is live.

### Step 4 — Content attributes

Online-only baseline: no opt-in keyword, no text-to-join, `allowRestart=false`.
If enabling restart, declare START/UNSTOP and the actual reactivation mechanism instead.
STOP keywords: STOP, END, QUIT, CANCEL, UNSUBSCRIBE, REVOKE, OPT OUT, STOPALL, OPTOUT.
HELP keywords: HELP, INFO. Use one keyword-response owner, aligned with app configuration.

**Opt-in Message:**

```text
AuricWell: You subscribed to account security messages. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.
```

**Opt-out Message:**

```text
AuricWell: You are unsubscribed and will receive no further messages from this program. Reply HELP for help.
```

**Help Message:**

```text
AuricWell: For help, contact support@plottwistco.com. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.
```

### Step 5 — Sample messages

1. Capture the actual enabled account-access/reset SMS and replace its live token with a
   nonfunctional demonstration value. Preserve the actual URL domain/path and brand.
   This is pending: the legacy password-reset producer can use a tenant domain, and that
   does not establish an enabled AuricWell-branded SMS program.
2. Use the subscription confirmation from Step 4 as a second sample only if actually sent
   by this program. At least two representative samples are needed for Account Notification.

Embedded links: **Yes** for actual reset links. Embedded phone number: **No** for the
email-help/reset-only scope; change to Yes if ordinary messages include a callback number.
Age gated / direct lending: **No / No**. No fake OTP, join token, or unverified endpoint.

### Step 6 — Review & Submit

Hold until the public proof, enabled sender, actual reset example and policies have been
verified. Review fees and declarations as displayed. Verify the selected brand is AuricWell,
not a tenant practice. No assertion here that this campaign is ready for submission.

### Step 7 — After approval

Link only the platform's appropriately registered number(s). Configure `account_security`,
the correct agency/operator identity, campaign IDs, policies and keyword behavior. Confirm
account-security consent before sending. Test actual links and STOP/HELP on consenting
recipients. Do not reuse this campaign for the practices' meetings or billing notifications.

## Evidence and implementation status

### What was checked for this documentation update

| Item | October 5 finding |
| --- | --- |
| NLU legal name | `tenantLegalProfiles.js` says NEXTLEVELUP, LLC; confirm against vetted Vonage record |
| NLU support | Current legal profile supplies 719-377-6577; use this consistently in this guide |
| NLU privacy page | Anonymous HTTP 200; full branded Privacy Policy HTML, not just a portal shell |
| NLU terms page | Anonymous HTTP 200; full branded Terms of Service & SMS Terms HTML, frequency disclosure present |
| NLU client/staff example routes | Original 401 fixed by a public parameterized route and brand allowlist; see release verification |
| ITSCO / Inner Strength / AuricWell examples | Explicit brand-specific profiles, policies and allowed programs; see release verification |
| Y / N / R | Existing appointment handler and Vonage inbound integration; no live handset test in this update |
| Client reminder SMS | `sessionNotification.service.js` uses `reminders` and `agencyId`; channel preference and central consent gates apply |
| Employee meeting/join SMS | `joinReminder.service.js` uses `workforce` and `agencyId`; generates actual personal/tenant meeting URLs |
| Employee notification SMS | `notificationDispatcher.service.js` uses an approved workforce sender and `workforce`; notification types and user settings still control delivery |
| Assigned training-video SMS | Proposed scope only; no complete producer-to-handset test performed |
| Billing SMS | Separate optional billing purpose, disclosure, registration selection and enrollment confirmation implemented; automated billing-event producer is not added |
| Public consent rendering/signatures | Required Yes/No without preselection, all No permitted; signing and admin review are separate |
| Deployment / carrier submission | Application release status below; no carrier registration submitted |

The employee and client proof routes are required separately because their choices differ.
For NLU the intended staff URL is:
`https://app.nextleveluplcc.com/sms-consent/example/nlu?program=operations&audience=staff`.
Do not treat an HTTP 200 SPA shell as proof that the form loaded; inspect the actual form
and its anonymous data request. The original NLU HTTP 401 was the defect fixed in this release.

Disclosure labels implemented in version 2026-10-05.1:

- Reminders: appointment reminders, schedule changes, cancellations and session-access links.
- Workforce: staff schedule, team/video meeting, supervision, session-access and (if enabled)
  assigned-training notifications.
- Billing: optional routine billing-account and statement-update notifications, with their own
  enforced purpose or a deliberately versioned service permission that clearly includes them.

These labels are now implemented. Older signed snapshots
remain evidence of what that person actually accepted; do not rewrite them. Notification
settings, staff employment, an unrelated waiver, and possession of a phone number do not
substitute for recorded SMS permission.

### ITSCO campaign already started: what to change

1. Keep **ITSCO Service Communications** under ITSCO, Mixed / Customer Care + Account Notification.
2. Include session/portal links and employee video/session notices in the description and flow.
3. Use ITSCO's five samples above; sample 2 explicitly covers client session access, sample 5 staff.
4. Select both Embedded links and Embedded phone number for those samples.
5. Include both the client and staff consent evidence. If adding billing, complete the billing
   addition before representing it as part of the program.
6. If still a draft, edit it before submission. If submitted/approved, use Vonage's campaign
   update/review process; keep traffic within the approved scope while a change is pending.

### Practical review evidence

Supply public, brand-specific blank/example forms, not real signatures or patient records.
The example should accurately show the actual enrollment disclosure and unselected choices.
Keep both policies public and brand-specific. Screenshots or a review copy should show the
brand, purposes, frequency/rates, STOP/HELP, support, policy links, and signature/authority
steps, with an explanation of how the live private form is delivered and activated.
A HIPAA notice is a separate document; it does not replace the SMS privacy policy or SMS terms.

Verify the actual outbound template, link domains, permissions, and HELP/STOP behavior before
sending. Documentation and brand vetting cannot guarantee carrier approval or prove an
end-to-end workflow has been tested.

### Sources and repository evidence

Checked October 5, 2026:

- [Vonage campaign use cases](https://api.support.vonage.com/hc/en-us/articles/8032668573724-10DLC-Campaign-use-cases): Account Notification, Customer Care, Mixed and 2FA classifications. The mapping above is our recommendation for the described traffic.
- [Vonage campaign requirements](https://api.support.vonage.com/hc/en-us/articles/12132309081500-10DLC-Campaign-requirements): message flow, proof, policies, keywords and representative samples. Dashboard screenshots supplied by the user provide the six-step field layout.
- [Vonage guide of guides](https://api.support.vonage.com/hc/en-us/articles/7990660170908-10DLC-Guide-of-guides): brand/campaign/number sequence and reseller context.
- [NLU terms](https://nextleveluplcc.com/nlu/terms) and [NLU privacy](https://nextleveluplcc.com/nlu/privacypolicy): anonymous retrieval and branded content verified in this update.
- [ITSCO contact](https://www.itsco.health/contact): 833-444-8726 callback contact verified during the preceding sample-message review.
- `frontend/src/content/tenantLegalProfiles.js`, `frontend/src/content/tenantLegalDocuments.js`
- `backend/src/utils/smsConsentDisclosure.js`, `backend/src/services/smsEnrollment.service.js`
- `backend/src/routes/smsConsent.routes.js`, `frontend/src/views/public/SmsConsentView.vue`, `frontend/src/router/index.js`
- `backend/src/services/appointmentReply.service.js`, `backend/src/controllers/vonageWebhook.controller.js`
- `backend/src/services/joinReminder.service.js`, `backend/src/services/sessionNotification.service.js`, `backend/src/services/notificationDispatcher.service.js`
- `backend/src/services/smsCompliance.service.js`, `backend/src/utils/smsCompliancePolicy.js`

## Release verification — October 5 implementation follow-up

Backend and frontend deployment of `84aa972a7` succeeded. Anonymous browser checks passed
for NLU client/staff, Inner Strength client, and ITSCO billing examples: correct purposes,
no preselected choices, and review-only signing disabled. The follow-up updates Inner
Strength legal identity and working policy destinations. SchoolCareBridge policies are
served at `https://mh4kidz.org/schoolcarebridge/terms` and `/schoolcarebridge/privacypolicy`;
AuricWell policies are served at `https://plottwisthq.com/auricwell/terms` and
`/auricwell/privacypolicy`. The separate AuricWell EHR app has local legal-page changes
but is not included in the shared-app deployment.
The owner confirmed Inner Strength is a separately formed, wholly owned company; its
legal name is sourced from the existing practice record.
The SchoolCareBridge agreement packet is a draft for authorized organizational signatures.
