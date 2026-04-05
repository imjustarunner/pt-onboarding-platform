# Summit Stats Team Challenge — Club Store Spec

## Overview

Each **Club** (affiliation) has its own **Club Store**. Clubs can offer merchandise, rewards, or items to their participants.

---

## Terminology

| Term | Description |
|------|-------------|
| **Club** | `organization_type: affiliation` — The organization that signs up to Summit Stats |
| **Season** | A competitive period (challenge / learning_program_class) |
| **Club Store** | Per-club storefront for merchandise, rewards, etc. |

---

## Club Store Features (Proposed)

- **Per-club inventory** — Each club manages its own products
- **Program Manager** — Creates products, sets prices, manages fulfillment
- **Participants** — Browse and purchase from their club's store
- **Points integration** (optional) — Redeem season points for store items
- **Direct purchase** — Standard e-commerce flow

---

## Open Questions

- Payment processing (Stripe, etc.)?
- Physical vs. digital items?
- Points-only vs. cash vs. hybrid?
- Fulfillment (club handles vs. platform)?
