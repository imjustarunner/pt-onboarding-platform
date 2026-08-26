# Vonage 10DLC + Per-Provider Number Plan

Living plan for **Vonage-only** US SMS: one brand, a small set of TCR campaigns, one dedicated `clinical_care` number per provider, and proof screenshots for carrier registration.

**Not** the in-app `agency_campaigns` broadcast feature. This is **carrier registration** (Vonage Dashboard → Build → Messaging → 10DLC).

## Related docs

- [VONAGE_SMS_IMPLEMENTATION.md](../VONAGE_SMS_IMPLEMENTATION.md) — runtime routing, care threads, webhooks
- [TEXTING_READINESS_ASSESSMENT.md](./TEXTING_READINESS_ASSESSMENT.md) — A2P basics
- [MESSAGES_AND_COMMUNICATIONS_CENTER.md](./MESSAGES_AND_COMMUNICATIONS_CENTER.md) — unified inbox + SMS reply

---

## 1. Two “campaign” meanings (do not mix)

| Name in app | What it is | Vonage/TCR equivalent |
|-------------|------------|------------------------|
| **Intake Campaign 1–4** | Consent sections on intake / preferences forms | **Evidence** you upload when registering TCR campaigns |
| **`agency_campaigns`** | Broadcast / engagement feature | Separate product — **not** clinical 1:1 SMS |
| **Vonage 10DLC campaign** | Carrier-approved use case | What you register in Vonage Dashboard |

### Mapping: Intake campaigns → Vonage TCR campaigns

| Intake / prefs label | Vonage use case | `number_purpose` in app | Who opts in |
|----------------------|-----------------|-------------------------|-------------|
| **Campaign 1** — Scheduling + reminders | **Account notifications** | `notification` | Client / guardian |
| **Campaign 2** — Provider ↔ client texting | **Healthcare** | `clinical_care` (per-provider DID) | Client / guardian |
| **Campaign 3** — Program / service updates | **Marketing** (or Low Volume Mixed sub-use) | Usually shared ops number | Client / guardian (separate consent) |
| **Campaign 4** — Workforce / school staff | **Customer care** (internal ops) | `provider_contact`, `tenant_contact` | Employee / school staff |

---

## 2. Architecture (client never sees personal cell)

```
Client phone  →  texts provider's Vonage DID (clinical_care)
       ↓
Vonage inbound webhook  →  PlotTwistHQ (message_logs, care thread, unified inbox)
       ↓
Provider sees thread in Messages / Communications Center
       ↓ (optional)
SMS notify/forward to provider personal_phone (user pref + rules)
       ↓
Provider replies from platform/app  →  Vonage  →  Client (same DID)
```

**Rules**

- Public number = **platform Vonage DID** assigned to the provider.
- `personal_phone` = **notify/forward lane only**, never printed on client materials.
- Every US 10DLC links to **exactly one** Vonage campaign.
- App `number_purpose` must match the campaign you linked in Vonage.

---

## 3. Vonage setup sequence (do once, then scale)

### Step 1 — Brand

Register in [Vonage API Dashboard → 10DLC](https://developer.vonage.com/en/dashboard/build/messaging/10dlc).

| Field | Suggested value |
|-------|-----------------|
| Legal entity | ITSCO / your registered org name |
| EIN | Your real EIN (must match IRS) |
| Website | `https://plottwisthq.com` |
| Support email | Agency support or `support@plottwisthq.com` |
| Support phone | Agency main line or platform support |

**Recommendation:** Complete **Standard brand vetting** before filing Healthcare — unlocks use cases and throughput beyond “Low Volume Mixed only.”

### Step 2 — Register TCR campaigns (copy-paste below)

Submit **Campaign 2 (Healthcare) first** — it is the foundation for per-provider numbers.

### Step 3 — Link numbers

After each campaign is approved:

1. Vonage Dashboard → campaign → **Link numbers**
2. Attach every DID with matching purpose (see §5)

The app does **not** sync TCR campaign IDs today — linking is manual in Vonage.

### Step 4 — Per-provider provisioning

For each provider (see §6 runbook):

1. Buy/provision US 10DLC in Vonage (or in-app buy if configured).
2. Add in app: Settings → **Texting Numbers** → purpose `clinical_care`.
3. Assign to provider (primary).
4. Link DID to **Healthcare** campaign in Vonage.
5. Confirm webhook: `VONAGE_SMS_WEBHOOK_URL` → `https://plottwisthq.com/api/vonage/inbound`.

---

## 4. Copy-paste Vonage campaign registration text

Use these in Vonage **Step 2 Use case** + description fields. Adjust `[Agency Name]` / tenant name where noted.

### Required legal line (all client-facing consent)

Include in every form, flyer, and intake step:

> Message and data rates may apply. Message frequency varies. Text HELP for help. Text STOP to opt-out.

For appointment-only flows you may add: *One message per request.*  
When carriers ask for carrier disclaimer: *Carriers are not liable for delayed or undelivered messages.*

(This matches Settings → Texting Numbers → Agency SMS Settings compliance note in the app.)

---

### TCR Campaign A — Healthcare (Intake Campaign 2 + per-provider lines)

**Vonage use case:** Healthcare  
**Consent method:** Online forms, point of sale (paper intake), inbound message to care number  
**Numbers to link:** All `clinical_care` DIDs (one per provider)

**Campaign description**

> Two-way healthcare coordination between credentialed providers and clients or guardians with an established care relationship at [Agency Name]. Messages include care coordination, session follow-up, scheduling back-and-forth, and responses to client-initiated texts. No purchased lists. No third-party marketing. Messages are sent through PlotTwistHQ on behalf of the care organization.

**Sample message 1**

> Hi, this is [Agency Name]. Your care team is confirming your upcoming session. Reply here with any questions about scheduling.

**Sample message 2**

> Thanks for your message. Your provider will respond during business hours. Text STOP to opt out. Text HELP for help. Message and data rates may apply.

**Opt-in keywords (if asked):** START, YES (re-opt-in after STOP)  
**Opt-out keywords:** STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT  
**Help keywords:** HELP, INFO

**Opt-in proof URL:** Live intake communications step (see §7) or guardian preferences URL.

---

### TCR Campaign B — Account notifications (Intake Campaign 1)

**Vonage use case:** Account notifications  
**Consent method:** Online forms  
**Numbers to link:** All `notification` DIDs

**Campaign description**

> Appointment scheduling reminders and confirmations for clients and guardians of [Agency Name]. Messages may ask the recipient to confirm or decline attendance (for example reply Y or N). Frequency is typically limited to reminders before scheduled appointments. No marketing content.

**Sample message 1**

> [Agency Name]: Reminder — you have an appointment on Tuesday at 3:00 PM. Reply Y to confirm or N to cancel. Text STOP to opt out.

**Sample message 2**

> [Agency Name]: Your appointment is tomorrow. Reply HELP for help or STOP to opt out. Msg & data rates may apply.

---

### TCR Campaign C — Marketing / program updates (Intake Campaign 3)

**Vonage use case:** Marketing (only if you send optional program promos via SMS)  
**If volume is low and mixed:** Low Volume Mixed with Marketing sub-use — confirm with Vonage support  
**Numbers to link:** Dedicated ops/marketing DID if used; **do not** use clinical_care DIDs

**Campaign description**

> Optional program and service updates for individuals who separately opted in at [Agency Name]. Examples: enrollment openings, program availability, and non-clinical service information. Frequency no more than twice per month. Not combined with clinical care threads.

**Sample message 1**

> [Agency Name]: A new after-school group has openings this semester. Reply STOP to opt out. Msg & data rates may apply.

**Sample message 2**

> [Agency Name]: Summer program registration is open. Visit our website for details. Text STOP to unsubscribe.

**Important:** Campaign 3 must stay **opt-in separate** from Campaign 2. Do not send program promos from provider clinical lines.

---

### TCR Campaign D — Customer care / workforce (Intake Campaign 4)

**Vonage use case:** Customer care (internal / operational)  
**Consent method:** Online forms (employee onboarding), employee preference center  
**Numbers to link:** `provider_contact`, `tenant_contact`, ops notification senders to staff

**Campaign description**

> Operational SMS to employees, contractors, and authorized school staff of [Agency Name] who opted in through onboarding or the employee preference center. Examples: schedule changes, internal announcements, operational reminders, and optional participation polls. Not client clinical care.

**Sample message 1**

> [Agency Name] ops: Staff meeting moved to 4 PM today. Reply STOP to opt out of workforce SMS.

**Sample message 2**

> PlotTwistHQ: You have a new platform notification. Log in to review. Text HELP for help or STOP to opt out.

---

## 5. Number purpose ↔ campaign linking matrix

| `number_purpose` | Assigned to | Vonage campaign | Client/staff sees |
|------------------|-------------|-----------------|-------------------|
| `clinical_care` | Provider (primary) | Healthcare | “Text my provider / care team” |
| `notification` | Agency pool | Account notifications | Reminder sender |
| `tenant_contact` | Agency (IVR) | Customer care | Main org line |
| `provider_contact` | Provider (staff-facing) | Customer care | Staff/program → provider |
| `platform_contact` | Platform | Customer care | Plot Twist HQ support |

---

## 6. Per-provider provisioning runbook

Repeat for each clinician:

| # | Task | Where |
|---|------|--------|
| 1 | Provision US 10DLC | Vonage Dashboard or Settings → Texting Numbers → Search & buy |
| 2 | Set purpose **Clinical care (inbox)** | Texting Numbers → purpose dropdown |
| 3 | Assign to provider | Texting Numbers → Assign to… |
| 4 | Link DID to **Healthcare** campaign | Vonage Dashboard only |
| 5 | (Optional) Forward inbound to personal | Texting Numbers → rules → Forward inbound; provider enables SMS forwarding in preferences |
| 6 | Give clients **only the Vonage DID** | Marketing materials, signature, portal — never `personal_phone` |
| 7 | Pilot test | Client texts DID → appears in Messages SMS + Unified Inbox; provider replies |

**Agency settings to verify**

- `smsNumbersEnabled` = Enabled  
- `smsComplianceMode` = Opt-in required (until you have intake proof on file)  
- `smsReminderSenderMode` = Agency default until Healthcare approved; then optional provider line  

---

## 7. Screenshot evidence pack (for employees)

Carriers want **visual proof** that subscribers see brand name, what they are opting into, frequency, STOP/HELP, and Terms/Privacy links **before** messages are sent.

### How to capture (all screenshots)

- **Full browser width** — not a tiny phone crop unless the live flow is mobile-only.
- **URL bar visible** (or annotate filename with exact URL).
- **No PHI** in screenshots — use demo/test intake links and fake names.
- **PNG or PDF**, readable text; one campaign per folder.
- Filename pattern: `campaign-{N}-{surface}-{agency}-{date}.png`

**Deliver to:** whoever files Vonage campaigns (default: Michael / IT admin).  
**Upload to:** Vonage campaign registration → Consent / opt-in evidence.

---

### Assignment table — who screenshots what

| Owner | Campaign | What to capture | App location |
|-------|----------|-----------------|--------------|
| **Intake / CPA admin** | 1 + 2 + 3 | Live **public intake** communications step (full sections) | Public intake link → communications preferences step (`PublicIntakeSigningView`) |
| **Intake / CPA admin** | 1 + 2 + 3 | **Intake Links** builder preview (same text as production) | `https://plottwisthq.com/{slug}/admin/intake-links` → open step → Preview communications |
| **Support / guardian ops** | 1 + 2 + 3 | **Guardian/client preferences** showing opt-in status rows | Client/guardian dashboard → My → Preferences (communications section) |
| **HR / onboarding** | 4 | Workforce intake **Campaign 4** section OR employee preferences checkbox | Workforce intake link **or** `https://plottwisthq.com/dashboard?tab=my&my=preferences` (logged in as employee) |
| **HR / onboarding** | 4 | **Public preferences form** (no-login staff link) | `https://plottwisthq.com/preferences-form/{publicKey}` (from Intake Links → staff preferences link) |
| **Comms / IT admin** | All | **Agency SMS compliance note** (STOP/HELP boilerplate) | Agency Settings → Texting Numbers → Agency SMS Settings (top card) |
| **Comms / IT admin** | 2 | **Number purpose** on a provider line | Texting Numbers → row showing `Clinical care (inbox)` + assignment |
| **Comms / IT admin** | All | **STOP / HELP / START** handling (optional but strong) | Texting Numbers → per-number rules (opt-out, help, opt-in confirmation text) |
| **Comms / IT admin** | 4 | **A2P proof examples** (reference layouts) | `https://plottwisthq.com/{slug}/admin/communications/feed` → A2P / proof section |

---

### Minimum screenshots per Vonage campaign

#### Campaign A — Healthcare (provider ↔ client) — **5 screenshots**

1. **Intake Campaign 2 — full section**  
   Must show: section title (“SMS With Your Provider/Care Team”), intro consent paragraph, bullet terms (emergency/911, business hours, confidentiality), closing line with **STOP / HELP / rates**, **Terms + Privacy links**, **Yes** and **No** radio options.

2. **Intake Campaign 2 — Yes selected**  
   Same screen with **Yes** selected (proves affirmative action).

3. **Preferences — Provider/Care Team SMS = Opted in**  
   Guardian/client preferences showing status badge for provider texting.

4. **Texting Numbers — clinical line**  
   Admin view: one number with purpose **Clinical care (inbox)** assigned to a named provider.

5. **Compliance boilerplate** (can reuse across campaigns)  
   Agency SMS Settings compliance reminder box.

#### Campaign B — Account notifications — **3 screenshots**

1. **Intake Campaign 1 — SMS section**  
   SMS disclosure (PlotTwistHQ scheduling/reminders), **Yes** option label, STOP/HELP language.

2. **Intake Campaign 1 — Yes selected**

3. **Preferences — SMS Scheduling = Opted in**

#### Campaign C — Program updates — **3 screenshots** (skip if not registering Marketing)

1. **Intake Campaign 3 — full section** (optional updates, frequency cap language, STOP/HELP).

2. **Yes selected** on Campaign 3.

3. **Preferences — Program/Service Updates** row (on or off).

#### Campaign D — Workforce / school staff — **3 screenshots**

1. **Intake Campaign 4** on workforce intake **or** employee **Preferences** → “Campaign 4 (Employee): Internal workforce SMS notifications” checkbox visible with surrounding disclosure.

2. **Checkbox checked** (opt-in state).

3. **Public preferences form** for staff (`/preferences-form/...`) if you use no-login workforce links.

#### Subscriber management (attach to any campaign) — **2 screenshots**

1. **Opt-out confirmation** rule text on Texting Numbers (STOP reply).

2. **Help** rule text (HELP reply).

---

### What must be visible in every client-facing screenshot

Checklist for whoever reviews before upload:

- [ ] **Brand / agency name** visible ([Agency Name] or tenant name in text)
- [ ] **PlotTwistHQ** named as platform (where disclosure says it)
- [ ] **What messages are about** (scheduling vs provider texting vs program updates)
- [ ] **Message frequency** (“varies”, “typically before appointments”, or “no more than twice per month”)
- [ ] **Msg & data rates may apply**
- [ ] **STOP** to opt out
- [ ] **HELP** for help
- [ ] **Terms** and **Privacy** links (URLs visible or linked text visible)
- [ ] **Affirmative opt-in** (radio/checkbox — not pre-checked if carrier asks; note if your form pre-selects)

---

### Optional strong evidence (if Vonage rejects first submission)

- Paper intake photo (point of sale) with same STOP/HELP language + signature line  
- Screenshot of **STOP** auto-reply received on a test phone (test thread only)  
- Screenshot of **HELP** auto-reply  
- Vonage Dashboard showing number linked to approved campaign  

---

## 8. Message flows (reference)

| Flow | From | To | Campaign | App path |
|------|------|-----|----------|----------|
| Client → provider | Client cell | Provider inbox | Healthcare | `vonageWebhook` → `resolveInboundRoute` → unified inbox |
| Provider → client | Provider `clinical_care` DID | Client | Healthcare | Unified reply / `clinicalSmsSend` |
| Program → client reminder | `notification` DID | Client | Account notifications | `appointmentReminder.service` |
| Program → provider | Ops / `provider_contact` | Provider | Customer care | Notifications / dispatcher |
| Provider ↔ provider | Prefer in-app chat | — | — | Avoid client Healthcare campaign |
| App → provider | Push; SMS fallback | Provider personal or staff DID | Customer care | Employee opt-in only |

---

## 9. Compliance guardrails

1. **One DID → one Vonage campaign** — never double-link.
2. **No PHI in TCR sample messages** or evidence screenshots.
3. **BAA with Vonage** for clinical SMS; `sms_profile_audit` is the compliance ledger.
4. **`smsComplianceMode = opt_in_required`** until intake evidence is live for that agency.
5. **Do not** send Campaign 3 marketing from `clinical_care` numbers.
6. **Do not** use `agency_campaigns` for 1:1 clinical texting.
7. **Do not** register clinical traffic under Marketing without separate marketing consent.

---

## 10. Rollout phases

| Phase | Scope |
|-------|--------|
| **A** | Brand + Standard vetting; Healthcare campaign; 1 pilot provider `clinical_care` DID |
| **B** | Account notifications campaign; reminder pool linked |
| **C** | All providers get DIDs on Healthcare |
| **D** | Customer care campaign for workforce + tenant lines |
| **E** | Marketing campaign only if Campaign 3 SMS is active |
| **F** | Native app uses same send/reply APIs as web |

---

## 11. Evidence folder template (for your team)

Create a shared drive folder:

```
Vonage-10DLC-Evidence/
  00-brand-EIN-IRS-letter/          # admin only — not from app
  01-healthcare-campaign-2/
    intake-provider-texting-full.png
    intake-provider-texting-yes-selected.png
    preferences-provider-sms-opted-in.png
    texting-numbers-clinical-care-assigned.png
  02-account-notifications-campaign-1/
    ...
  03-program-updates-campaign-3/   # optional
  04-workforce-campaign-4/
  05-stop-help-subscriber-mgmt/
  06-vonage-number-linked/         # Vonage Dashboard screenshots
```

---

*Last updated: 2026-08-26 — Vonage-only, aligned with Intake Campaigns 1–4 in `IntakeLinksView.vue`.*
