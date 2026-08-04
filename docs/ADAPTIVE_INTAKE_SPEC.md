# Adaptive Intake, Interest Form, Provider Matching, and Public Booking

**Product:** PlotTwistHQ  
**Status:** Implementation in progress (presentation layer over existing backends)  
**Mockups:** [`docs/intake-mockups/`](./intake-mockups/README.md)

## Related docs

- [`DIGITAL_FORMS_INTAKE_CONTRACT.md`](./DIGITAL_FORMS_INTAKE_CONTRACT.md) — public packet finalize acceptance tests (must not regress)
- [`CLIENT_EXCHANGE_AND_OFFICE_INTAKE.md`](./CLIENT_EXCHANGE_AND_OFFICE_INTAKE.md) — office minimal intake + assignment queue
- [`INDIVIDUAL_PRACTITIONER_TENANTS_PLAN.md`](./INDIVIDUAL_PRACTITIONER_TENANTS_PLAN.md) — prospective → screener → packet → current funnel
- [`UNIFIED_BOOKING_ARCHITECTURE.md`](./UNIFIED_BOOKING_ARCHITECTURE.md) — shared booking / availability
- [`REGISTRATION_AND_GUARDIAN.md`](./REGISTRATION_AND_GUARDIAN.md) — guardian account creation

## Locked decisions

1. **Shell first, then Quick Prospective** on that shell; full clinical packet follows via adapters.
2. **Cross-vertical:** clinical reuses existing `intake_links`; life coach / consultant / tutoring get framed basic templates.
3. **Signatures upgraded early** — same e-sign backend, new consent-card UX.
4. **No parallel engines** — orchestrate digital forms, questionnaires, documents, clients, and scheduling already in the platform.

## Pathways

| Pathway | Creates | Entry |
|---------|---------|-------|
| Quick Prospective Interest | `clients` at `prospective` + `intake_preferences_json` / inquiry meta | `/join/:agencySlug` → Quick |
| Full Intake Packet | Existing public-intake finalize (`packet`) | `/join/:agencySlug` → Full → configured `intake_links` public key |
| Resume | Existing session token / portal | Secure link |

## Architecture

```
Public /join/:agencySlug  (also /:organizationSlug/join and /:organizationSlug/join-intake)
  → AdaptiveIntakeShell (progress sidebar, help panel, design tokens)
  → Pathway: quick | full | resume
  → Backend: /api/public/adaptive-intake/*
       GET  /:agencySlug              → vertical-aware config + branding
       GET  /:agencySlug/providers    → optional provider preview
       POST /:agencySlug/quick        → prospective client + preferences + meta
  → Staff: /api/client-exchange/adaptive-convert
           /api/client-exchange/adaptive-templates
           /api/client-exchange/adaptive-bootstrap-frame
  → Full path → existing /intake/:publicKey (consent cards + AdaptiveSignatureCapture)
```

### Embed / marketing link

Use `https://{app-host}/join/{agencySlug}` on the organization website. Families choose Quick Prospective or Full Intake without contacting staff first.

## Implementation phases

| Phase | Deliverable |
|-------|-------------|
| 0 | This spec + mockup folder |
| 1 | Adaptive shell components + design tokens |
| 2 | Consent cards + signature capture UX |
| 3 | Quick Prospective pathway + staff visibility |
| 4 | Clinical field adapter into shell patterns |
| 5 | Practitioner basic intake field templates |
| 6 | Optional provider preview (shared availability) |
| 7 | Notifications + prospective→full conversion |

## Acceptance (v1)

- One public link supports Quick vs Full with vertical-aware copy.
- Quick prospective lands in staff follow-up as `prospective`.
- Existing clinical forms run with upgraded signature UI.
- Practitioner verticals have framed basic intake templates.
- Mobile remains usable; desktop uses guided sidebar layout.
- No regression against the digital forms intake contract.

## Life Balance Wheel

Deferred (see Phase 4 note in Individual Practitioner plan). Do not build unless explicitly requested.
