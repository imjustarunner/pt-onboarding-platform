# Client and guardian portals

Implemented from the supplied counseling, coaching, consulting, tutoring, insurance and receipt references. The existing authenticated APIs remain the source of truth.

## Interface

- Shared tenant logo/name and color treatment, with readable accent colors, persistent desktop navigation and an expandable mobile menu. Missing photos use initials; missing logos use the tenant name.
- Guardian/client dashboard with selected-client and program controls, permission-aware care-plan overview, real payment tasks, program/session links, secure messaging and billing destinations.
- Coaching and consulting use the same portal shell with distinct working views for sessions, packages, goals/reflections, shared documents, messages, receipts and account security. Client selection stays within the current tenant.
- Tutoring retains actual practice completion, session entry and package checkout, with a responsive progress/session/assignment layout and no duplicated welcome banner.
- Insurance and payment methods have separate cards for responsible-payer assignments, privately owned saved cards and submitted policies. Existing verification/consent behavior is preserved.
- Receipts have actual payment amounts, refunds, search, date filters and PDF download/printing. Clinical permissions belong under Account, separately from payment responsibility.

## Data and privacy

The treatment-plan component previously checked a nonexistent `props.value`, which prevented loading. It now fetches permitted data and discards late responses after a client/tenant change. Goals show actual recorded current and target values, with directional labels; trends need at least two recorded ratings. There is no invented overall mental-health progress percentage.

Client-role accounts now land in the appropriate family/practitioner portal. Server-side linked-client and clinical grant checks still govern records. Clinical panels stay hidden until permission is known. Restricted guardians retain their authorized billing experience. Prototype benefit amounts, provider portraits/quotes, client selfies, business metrics and wellness check-ins are not fabricated.

The references also contain features with no verified backing data in these screens, including deductible accumulation, payer adjudication summaries and confidence check-ins. Those are not represented as working controls. Care-team information and clinical scheduling still depend on the existing services and disclosure permissions; this UI change does not add a new appointment or clinical-outcomes backend.

## Validation

- 19 component tests: branding/navigation, contrast fallback, plan loading and stale-response isolation, preview privacy, receipt filtering and prior payment/insurance behavior.
- Actual Vue screens reviewed with synthetic API fixtures for counseling/guardian, coaching, consulting and tutoring at 320, 390, 768, 1024 and 1440 pixels. No page overflow or browser exceptions. Receipt filtering, account navigation, and restricted clinical navigation were exercised.
- Production frontend build passes with the existing large-chunk advisory.
- No production accounts, payments, messages or clinical records were changed. The local browser harness is removed before commit.
