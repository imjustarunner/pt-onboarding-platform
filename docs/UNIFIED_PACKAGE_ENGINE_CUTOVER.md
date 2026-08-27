# Unified Package Engine — Legacy Cutover

## What is canonical now

New package sales use **`booking_packages`** + **`booking_package_entitlements`** + **`booking_package_ledger`** + **`booking_package_payments`**.

Admin UI: `/:organizationSlug/admin/package-catalog`

Guardian buy: Tutoring dashboard → **Buy a package**

Staff activate: `POST /api/tenant-booking/agencies/:agencyId/entitlements`

## Program vs tenant-wide

| Scope | `learning_program_class_id` | Typical use |
|-------|----------------------------|-------------|
| Tenant-wide | `NULL` | Coaching tenants; individual tutoring packages |
| Program | set to program id | Summer Reading, small-group program packages |

## Legacy systems (still readable)

### Practitioner session packages (`practitioner_session_packages`)

- Packet checkout flows remain for existing coach clients.
- Admin path `admin/session-packages` is **legacy / historical**.
- New coach packages should be created in the unified catalog.
- Optional: copy active practitioner rows into `booking_packages` with `business_type = coaching` and `learning_program_class_id = NULL` (no automated wipe).

### Learning token ledgers (`learning_token_ledgers`)

- Existing token balances remain honored by learning billing session debit.
- Guardian package entitlements API returns `legacyTokenBalance` for UI banners.
- **New purchases** should use unified booking packages, not `/api/learning-billing/packages/buy`.

## Payment

- Stripe Connect PaymentIntent → client confirm (same pattern as practitioner packets).
- Webhook `payment_intent.succeeded` with `metadata.source = unified_booking_package` also activates (idempotent).
- Staff offline sales write `booking_package_payments` with `processor = MANUAL`.

## Do not delete yet

- Practitioner package tables and learning token ledgers until balances are drained and packet flows are retired.
