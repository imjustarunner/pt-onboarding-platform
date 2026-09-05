# Messages & Communications Center

## Product model

### Messages (everyone who can message)

**One Messages experience**, reached from:
- My Dashboard → Messages
- Side chat → **Messages hub**
- Communications Center → **Messages** tab

**Route:** `/messages` (and `/:slug/messages`)

**Job:** People-first **Messages hub** — browse **My clients** / **Recent** or search by name, initials, code, email, or phone **across every agency you belong to**; each person is labeled with their agency; see available methods (Secure / SMS / Email / Internal); send from one composer; one chronological timeline labeled by channel. Team chat workspace (`?view=workspace`) and Communications Center shared inboxes are separate tools — not parallel “message systems” inside the hub.

Admins/support use this same Messages UI when they select **Messages** in the Communications Center — not a separate ops-only variant.

**Hub APIs** (orchestration over existing chat / SMS / App inbox backends):

| Endpoint | Purpose |
|----------|---------|
| `GET /api/messages/hub/people?q=&agencyId=` | Universal people search + method availability |
| `GET /api/messages/hub/people/:personKey` | Hydrate one person + methods |
| `GET /api/messages/hub/people/:personKey/timeline` | Merge-on-read Secure / SMS / Email / Internal history |
| `POST /api/messages/hub/send` | Dispatch send (`method`: secure \| sms \| email \| internal) |

Communications Center remains the admin shared-inbox tool; Hub personal Email uses App inbox only.

### Communications Center (admin, support, super_admin + eligible staff mailbox roles)

**Route:** `/admin/communications` (`?mode=home|messages|support`)

| Section | Purpose |
|---------|---------|
| **Home** (default) | **Unified Inbox** — App inbox + shared team inboxes, attention KPIs, email threads, status/snooze/owner, Linked To, directory compose, send warnings |
| **Messages** | Embeds the **same** Messages hub as My Dashboard |
| **Support Hub** | Tickets, engagement/delivery queue, analytics, management tools |

Top-nav **Communications** opens Center **Home** (Unified Inbox). Engagement Feed archive remains at `/admin/communications/feed` (linked from Support Hub tools), not a separate top-nav item.

### App inbox vs shared team inboxes vs Google seats

| Concept | What it is |
|---------|------------|
| **App inbox** | Personal alias (e.g. `bobbyi@itsco.health`) the app sends/receives through because it has **alias rights on the org Google Group** (group_password hire path). Labeled **App inbox · address**. Not a Google Workspace user seat. |
| **Shared team inboxes** | Ops addresses like `PO@itsco.health`, `Technology@itsco.health` from `email_sender_identities` → shared `communication_inboxes`. |
| **Domain** | Uses agency `feature_flags.workspaceEmailDomain` (or inferred from shared identities). `@plottwisthq.com` is only for PlotTwist HQ / unset platform contexts — not a silent default for ITSCO staff. |

Provisioning: `POST /communications/inboxes/personal/ensure` → `ensurePersonalMailbox` in `personalMailbox.service.js`.

## Roadmap

Full product plan:

→ [`UNIFIED_COMMUNICATIONS_CENTER_PLAN.md`](./UNIFIED_COMMUNICATIONS_CENTER_PLAN.md)

**Phase 1:** Unified Inbox shell, `communication_*` (1310), ticket-email adapter, Reply/Reply all/Forward, shared inboxes, workflow + Linked To.

**Phase 2:** Personal app mailboxes (1311), membership ACL, personal-email digest opt-in (24/48h), directory typeahead, external/PHI send preflight.

**Phase 3:** Thread actions (attach client/school, task/ticket/referral, school note), SMS/calls/voicemail in unified list (1312), print/download, spam/block, scheduled send + undo delay.

**Phase 4:** Composer AI draft + thread summary/next action (1313), full search (sender/subject/body/attachment/date), Response Time (7d) KPI.

**Phase 5:** SMS reply from unified Home; legacy SMS URLs redirect to Center; Full SMS tools → Messages workspace. Workspace seat removal is an org/IT policy step (not app code).

**Expansion (Availability Hours + Quick View):** Tenant email policy, sender trust / Unknown Sender box, client OOO + SUPPORT → ticket, cancellation intent review tickets, 24 Availability-Hour personal digests with Quick View CTA, Account Info → Privacy credentials, mobile `/quick-view/:token` (and delivery `/quick-view/d/:token`), secure client notification emails, meeting reminders via Quick View. See expansion section in [`UNIFIED_COMMUNICATIONS_CENTER_PLAN.md`](./UNIFIED_COMMUNICATIONS_CENTER_PLAN.md).

Later: optional further chat/secure channel unification.

## Role matrix

| Capability | Roles |
|------------|--------|
| Messages | Messaging-capable staff (incl. admin/support as employees) |
| Communications Center / Unified Inbox | admin, support, super_admin (+ eligible staff for personal mailbox APIs) |
| Standalone `/tickets` | CPA, staff, school_staff (+ admins via Support Hub) |
| Quick View (scoped session) | Non-SSO employees with tenant `quick_view_enabled` + passcode set |
| Quick View credential reset | Account Info → Privacy (password confirm; values shown once) |

## APIs

| Endpoint | Used by |
|----------|---------|
| `GET /api/messages/dashboard-summary` | Messages + legacy Center summaries |
| `GET /api/messages/hub/people` | Messages Hub people search **or** browse (`browse=caseload\|recent\|suggested`; empty `q` browses) |
| `GET /api/messages/hub/people/:personKey` | Messages Hub person detail |
| `GET /api/messages/hub/people/:personKey/timeline` | Messages Hub merged timeline |
| `POST /api/messages/hub/send` | Messages Hub unified send |
| `GET /api/communications/center-summary` | Support Hub (org) |
| `GET /api/communications/inboxes` | Unified Inbox selector |
| `POST /api/communications/inboxes/personal/ensure` | Provision personal My Inbox |
| `GET/PATCH /api/communications/prefs` | Personal email digest / Availability prefs |
| `GET /api/communications/directory` | Compose recipient typeahead |
| `POST /api/communications/send-preflight` | External / PHI warnings |
| `POST /api/communications/secure-notify` | Secure client notification email |
| `GET/POST /api/communications/contacts*` | Trusted / blocked contacts |
| `POST /api/communications/conversations/:id/mark-known` | Unknown Sender → known |
| `GET /api/communications/attention-summary` | Unified Inbox KPIs (incl. Unknown Senders) |
| `GET/PATCH /api/communications/conversations` | Unified Inbox list / workflow |
| `GET/POST /api/communications/conversations/:id` | Thread detail / compose |
| `POST /api/communications/conversations/:id/reply` | Reply / internal note / schedule |
| `POST /api/communications/conversations/:id/links` | Attach client/school |
| `POST /api/communications/conversations/:id/actions/*` | Task / ticket / referral / school note |
| `GET /api/communications/conversations/:id/export` | Print / download |
| `POST /api/communications/conversations/:id/spam` | Spam + block sender |
| `POST /api/communications/conversations/:id/ai/draft` | Composer AI assist |
| `POST /api/communications/conversations/:id/ai/insight` | Thread summary + next action |
| `GET/POST /api/quick-view/me/*` | Credential status / regen / passcode reset |
| `GET/POST /api/quick-view/t|d/:token*` | Public unlock (persistent or delivery) |
| `GET /api/quick-view/home|tasks|calendar|office|contacts|conversations/*` | Scoped Quick View data |

## Related

- [VONAGE_SMS_IMPLEMENTATION.md](../VONAGE_SMS_IMPLEMENTATION.md)
- [VONAGE_10DLC_PROVIDER_NUMBER_PLAN.md](./VONAGE_10DLC_PROVIDER_NUMBER_PLAN.md) — 10DLC campaigns, per-provider numbers, screenshot evidence pack
- [PLATFORM_EMAIL_SETUP.md](./PLATFORM_EMAIL_SETUP.md)
- [UNIFIED_COMMUNICATIONS_CENTER_PLAN.md](./UNIFIED_COMMUNICATIONS_CENTER_PLAN.md)
