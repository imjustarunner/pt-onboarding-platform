# Texting Readiness Assessment

## 1. How Close: New Number → User Profile → Texting in a Great App

### What Exists Today

| Step | Status | Where |
|------|--------|-------|
| **Get new number** | ✅ In-app | Settings → Texting Numbers: Search Twilio by area code, Buy |
| **Add number to agency** | ✅ In-app | Same screen: Add number (manual) or Buy (via Twilio API) |
| **Assign to user** | ✅ In-app | Same screen: dropdown "Assign to…" → select user → Assign |
| **User texts from it** | ✅ Works | SMS Inbox, ProviderMobileCommunicationsView, Communications feed |

### Gaps to "Great Looking"

- **SMS Inbox / Comms UI:** Functional but utilitarian. Thread list, conversation bubbles, composer. No chat-style polish (e.g. iMessage-like bubbles, avatars, read receipts).
- **Number assignment:** Admin-only. No self-service "add my number" from user profile.
- **User profile:** No direct "My texting number" display or edit in the user profile card; admin does it in Settings → Texting Numbers.

### Closeness: **~80%**

Core flow works. Polish and UX upgrades would bring it to "great."

---

## 2. How Close: Mobile Login + Great Interface on Phone

### What Exists Today

| Feature | Status | Notes |
|---------|--------|------|
| **Provider mobile shell** | ✅ | `/provider-mobile` with tab nav: Schedule, Payroll, Note Aid, **Comms** |
| **PWA support** | ✅ | `isStandalonePwa()` – installs as app on phone |
| **Mobile auto-redirect** | ✅ | PWA + mobile viewport → redirect to provider-mobile |
| **Comms on mobile** | ✅ | ProviderMobileCommunicationsView: threads, conversation, send/reply |
| **Adding contacts** | ⚠️ | Clients are pre-existing (agency assignments). No "add contact" in comms UI; clients come from agency/client management. |

### Gaps for "Great Mobile UX"

- **Comms UI:** Basic layout. No mobile-first chat design (e.g. full-screen thread, swipe gestures, keyboard-aware composer).
- **Contacts:** No "add contact" in the texting flow. Clients are assigned via agency; you can't add a new contact from the comms screen.
- **Discoverability:** Provider mobile is under "Comms" tab – not obvious as "primary texting" experience.
- **Push notifications:** Browser push exists; no native push for SMS.

### Closeness: **~70%**

Works on phone. Mobile-first chat UX and contact management would make it "great."

---

## 3. Can the App Add Numbers Without Going to Twilio?

### Yes – In-App Number Purchase

- **Search Twilio:** `POST /sms-numbers/agency/:agencyId/search` – area code
- **Buy:** `POST /sms-numbers/agency/:agencyId/buy` – purchases via Twilio API, assigns webhooks
- **Add manual:** `POST /sms-numbers/agency/:agencyId/add` – for numbers you already own

All of this is in the app. Admin does not need to leave for Twilio Console for basic number acquisition.

### Auto-Provision (Optional)

- **Feature flag:** `smsAutoProvisionOnPrehire` in agency settings
- **When:** On pre-hire completion → auto-provisions a number for that user
- **Flow:** Search → Buy → Assign → Update `system_phone_number`

So numbers can be added **fully in-app**, including automatically.

---

## 4. A2P 10DLC Regulation – "The One Document Thing"

### What It Is

US carriers require **A2P 10DLC** registration for 10-digit long code (10DLC) numbers used for business SMS:

1. **Brand registration** – Business verification (EIN, address, etc.)
2. **Campaign registration** – Use case (e.g. "Healthcare appointment reminders")
3. **Authentication+** – Brand representative email verification (2FA)

### Does It Apply to You?

- **Yes** if you use US 10DLC numbers for SMS to US recipients.
- **Applies to:** 1:1 and low-volume messaging alike.
- **Low-volume standard:** Under 6,000 segments/day – simpler registration path.

### "One Document" / Per-Number

- **Registration is per brand, not per number.** One brand = one registration. Campaigns describe use cases.
- **Per-number:** Each number is linked to a campaign. You typically have one campaign per use case (e.g. "Healthcare appointment reminders and 1:1 patient communication").
- **New numbers:** If you add numbers under the same brand/campaign, you typically **don’t** re-submit documents. You add the number to the existing campaign.

### What the App Does Not Do Today

- **No A2P 10DLC registration flow.** Twilio handles this in Twilio Console.
- **First-time setup:** Brand + campaign registration is done once in Twilio (or via Twilio API, which the app does not currently use).
- **Post-registration:** Buying numbers in-app works; Twilio associates them with your registered brand/campaign if configured.

### Practical Path

1. **One-time:** Brand + campaign registration in Twilio Console (or via Twilio’s APIs).
2. **Ongoing:** Add numbers in-app via Buy/Search. No new document submission per number if the campaign is already approved.
3. **Low-volume:** Use "Low-Volume Standard" if under 6,000 segments/day – simpler and faster.

### Summary

- You **do** need A2P 10DLC registration for US 10DLC SMS.
- It’s **one-time per brand/campaign**, not per number.
- The app can add numbers in-app; registration stays in Twilio.
- No bulk texting simplifies the campaign description – you can describe it as 1:1 healthcare communication.

---

## 5. Recommended Next Steps

| Priority | Task | Effort |
|----------|------|--------|
| 1 | Polish SMS Inbox UI (chat-style bubbles, cleaner layout) | Medium |
| 2 | Polish ProviderMobileCommunicationsView for mobile-first | Medium |
| 3 | Add "My texting number" to user profile (admin view) | Low |
| 4 | Document A2P 10DLC one-time setup in TWILIO_SETUP.md | Low |
| 5 | "Add contact" in comms – link to create client or add to agency | Medium |
| 6 | Optional: Twilio API for brand/campaign registration (advanced) | High |
